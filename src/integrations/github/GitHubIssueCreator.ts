/**
 * GitHubIssueCreator - Creates GitHub issues from MarkuprX feedback reports
 *
 * Parses a MarkuprX markdown report, extracts feedback items, and creates
 * individual GitHub issues with appropriate labels and formatting.
 *
 * Uses native fetch (Node 18+) — no external dependencies.
 */

import { readFile } from 'fs/promises';
import type {
  GitHubAuth,
  GitHubRepo,
  GitHubIssueInput,
  GitHubIssueResult,
  GitHubLabelInput,
  ParsedFeedbackItem,
  PushToGitHubOptions,
  PushToGitHubResult,
} from './types';
import {
  CATEGORY_LABELS,
  SEVERITY_LABELS,
  MARKUPRX_LABEL,
} from './types';
import type { FeedbackCategory, FeedbackSeverity } from '../../main/output/MarkdownGenerator';
import { PUBLIC_BRAND_NAME, PUBLIC_WEBSITE_URL } from '../../shared/publicBrand';

const GITHUB_API = 'https://api.github.com';

// ============================================================================
// Auth resolution
// ============================================================================

/**
 * Resolve a GitHub token from multiple sources in priority order:
 * 1. Explicit token (--token flag)
 * 2. GITHUB_TOKEN environment variable
 * 3. `gh auth token` CLI command
 */
export async function resolveAuth(explicitToken?: string): Promise<GitHubAuth> {
  if (explicitToken) {
    return { token: explicitToken, source: 'flag' };
  }

  const envToken = process.env.GITHUB_TOKEN;
  if (envToken) {
    return { token: envToken, source: 'env' };
  }

  // Try gh CLI
  try {
    const { execSync } = await import('child_process');
    const ghToken = execSync('gh auth token', { encoding: 'utf-8', timeout: 5000 }).trim();
    if (ghToken) {
      return { token: ghToken, source: 'gh-cli' };
    }
  } catch {
    // gh CLI not available or not authenticated
  }

  throw new Error(
    'No GitHub token found. Provide one via:\n' +
    '  --token <token>\n' +
    '  GITHUB_TOKEN environment variable\n' +
    '  gh auth login (GitHub CLI)'
  );
}

// ============================================================================
// Markdown report parser
// ============================================================================

/**
 * Parse a MarkuprX markdown report into structured feedback items.
 * Extracts FB-XXX items with their metadata from the standard report format.
 */
export function parseMarkuprXReport(markdown: string): ParsedFeedbackItem[] {
  const items: ParsedFeedbackItem[] = [];

  // Match each feedback item section: ### FB-XXX: Title
  const itemPattern = /### (FB-\d{3}): (.+?)(?=\n)/g;
  let match: RegExpExecArray | null;

  while ((match = itemPattern.exec(markdown)) !== null) {
    const id = match[1];
    const title = match[2].trim();
    const startIndex = match.index;

    // Find the end of this item (next ### or ## or end of string)
    const rest = markdown.slice(startIndex + match[0].length);
    const nextSectionMatch = rest.match(/\n### FB-\d{3}:|(?=\n## [A-Z])/);
    const itemBlock = nextSectionMatch
      ? rest.slice(0, nextSectionMatch.index!)
      : rest;

    // Extract metadata
    const severity = extractField(itemBlock, 'Severity') as FeedbackSeverity || 'Medium';
    const category = extractField(itemBlock, 'Type') as FeedbackCategory || 'General';
    const timestamp = extractField(itemBlock, 'Timestamp') || '00:00';

    // Extract transcription (blockquote after "What Happened")
    const transcription = extractTranscription(itemBlock);

    // Extract screenshot paths
    const screenshotPaths = extractScreenshots(itemBlock);

    // Extract suggested action
    const suggestedAction = extractSuggestedAction(itemBlock);

    items.push({
      id,
      title,
      category,
      severity,
      timestamp,
      transcription,
      screenshotPaths,
      suggestedAction,
    });
  }

  return items;
}

function extractField(block: string, fieldName: string): string | undefined {
  const pattern = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`);
  const match = block.match(pattern);
  return match ? match[1].trim() : undefined;
}

function extractTranscription(block: string): string {
  const whatHappenedIdx = block.indexOf('#### What Happened');
  if (whatHappenedIdx === -1) return '';

  const afterHeading = block.slice(whatHappenedIdx);
  // Find the next #### heading to bound the section
  const nextHeading = afterHeading.indexOf('\n####', 5);
  const section = nextHeading !== -1
    ? afterHeading.slice(0, nextHeading)
    : afterHeading;

  // Extract blockquote lines
  const lines = section.split('\n');
  const quotedLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('> ')) {
      quotedLines.push(trimmed.slice(2));
    } else if (trimmed === '>' ) {
      quotedLines.push('');
    }
  }

  return quotedLines.join(' ').trim();
}

function extractScreenshots(block: string): string[] {
  const paths: string[] = [];
  const pattern = /!\[.*?\]\((.+?)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(block)) !== null) {
    paths.push(match[1]);
  }
  return paths;
}

function extractSuggestedAction(block: string): string {
  const idx = block.indexOf('#### Suggested Next Step');
  if (idx === -1) return '';

  const afterHeading = block.slice(idx + '#### Suggested Next Step'.length);
  const nextSection = afterHeading.indexOf('\n---');
  const section = nextSection !== -1 ? afterHeading.slice(0, nextSection) : afterHeading;

  const lines = section.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      return trimmed.slice(2);
    }
  }
  return '';
}

// ============================================================================
// Issue formatting
// ============================================================================

/**
 * Format a parsed feedback item as a GitHub issue body.
 */
export function formatIssueBody(item: ParsedFeedbackItem, reportPath?: string): string {
  let body = `## ${item.id}: ${item.title}\n\n`;
  body += `| Field | Value |\n|-------|-------|\n`;
  body += `| **Severity** | ${item.severity} |\n`;
  body += `| **Category** | ${item.category} |\n`;
  body += `| **Timestamp** | ${item.timestamp} |\n\n`;

  body += `### What Happened\n\n`;
  body += `> ${item.transcription}\n\n`;

  if (item.screenshotPaths.length > 0) {
    body += `### Screenshots\n\n`;
    body += `_${item.screenshotPaths.length} screenshot(s) captured — see the ${PUBLIC_BRAND_NAME} report for images._\n\n`;
  }

  if (item.suggestedAction) {
    body += `### Suggested Action\n\n`;
    body += `${item.suggestedAction}\n\n`;
  }

  body += `---\n`;
  if (reportPath) {
    body += `_Source: \`${reportPath}\`_\n`;
  }
  body += `_Created by [${PUBLIC_BRAND_NAME}](${PUBLIC_WEBSITE_URL})_\n`;

  return body;
}

/**
 * Build the labels array for a feedback item.
 */
export function getLabelsForItem(item: ParsedFeedbackItem): string[] {
  const labels: string[] = [MARKUPRX_LABEL.name];

  const categoryLabel = CATEGORY_LABELS[item.category];
  if (categoryLabel) {
    labels.push(categoryLabel.name);
  }

  const severityLabel = SEVERITY_LABELS[item.severity];
  if (severityLabel) {
    labels.push(severityLabel.name);
  }

  return labels;
}

/**
 * Collect all unique labels needed for a set of feedback items.
 */
export function collectRequiredLabels(items: ParsedFeedbackItem[]): GitHubLabelInput[] {
  const seen = new Set<string>();
  const labels: GitHubLabelInput[] = [];

  // Always include MarkuprX label
  seen.add(MARKUPRX_LABEL.name);
  labels.push(MARKUPRX_LABEL);

  for (const item of items) {
    const catLabel = CATEGORY_LABELS[item.category];
    if (catLabel && !seen.has(catLabel.name)) {
      seen.add(catLabel.name);
      labels.push(catLabel);
    }

    const sevLabel = SEVERITY_LABELS[item.severity];
    if (sevLabel && !seen.has(sevLabel.name)) {
      seen.add(sevLabel.name);
      labels.push(sevLabel);
    }
  }

  return labels;
}

// ============================================================================
// GitHub API client (fetch-based)
// ============================================================================

export class GitHubAPIClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(auth: GitHubAuth, baseUrl = GITHUB_API) {
    this.baseUrl = baseUrl;
    this.headers = {
      Authorization: `Bearer ${auth.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'markuprx-github-integration',
    };
  }

  async createIssue(repo: GitHubRepo, input: GitHubIssueInput): Promise<GitHubIssueResult> {
    const url = `${this.baseUrl}/repos/${repo.owner}/${repo.repo}/issues`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        labels: input.labels,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${text}`);
    }

    const data = await response.json() as { number: number; html_url: string; title: string };
    return {
      number: data.number,
      url: data.html_url,
      title: data.title,
    };
  }

  async ensureLabel(repo: GitHubRepo, label: GitHubLabelInput): Promise<boolean> {
    const url = `${this.baseUrl}/repos/${repo.owner}/${repo.repo}/labels`;

    // Check if label exists
    const checkUrl = `${url}/${encodeURIComponent(label.name)}`;
    const checkResponse = await fetch(checkUrl, {
      method: 'GET',
      headers: this.headers,
    });

    if (checkResponse.ok) {
      return false; // already exists
    }

    // Create the label
    const createResponse = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        name: label.name,
        color: label.color,
        description: label.description,
      }),
    });

    if (!createResponse.ok) {
      // 422 = label already exists (race condition), that's fine
      if (createResponse.status === 422) {
        return false;
      }
      const text = await createResponse.text();
      throw new Error(`Failed to create label "${label.name}": ${text}`);
    }

    return true; // created
  }

  async verifyAccess(repo: GitHubRepo): Promise<void> {
    const url = `${this.baseUrl}/repos/${repo.owner}/${repo.repo}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.headers,
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Repository ${repo.owner}/${repo.repo} not found (or no access)`);
      }
      if (response.status === 401) {
        throw new Error('GitHub token is invalid or expired');
      }
      throw new Error(`Failed to access repository (${response.status})`);
    }
  }
}

// ============================================================================
// Main push function
// ============================================================================

/**
 * Parse a MarkuprX report and create GitHub issues for each feedback item.
 */
export async function pushToGitHub(options: PushToGitHubOptions): Promise<PushToGitHubResult> {
  const { repo, auth, reportPath, dryRun = false, items: filterIds } = options;

  // Read and parse the report
  const markdown = await readFile(reportPath, 'utf-8');
  let items = parseMarkuprXReport(markdown);

  if (items.length === 0) {
    throw new Error(`No feedback items found in the report. Is this a valid ${PUBLIC_BRAND_NAME} report?`);
  }

  // Filter to specific items if requested
  if (filterIds && filterIds.length > 0) {
    const filterSet = new Set(filterIds.map(id => id.toUpperCase()));
    items = items.filter(item => filterSet.has(item.id));
    if (items.length === 0) {
      throw new Error(`None of the specified items (${filterIds.join(', ')}) found in the report`);
    }
  }

  const result: PushToGitHubResult = {
    created: [],
    labelsCreated: [],
    errors: [],
    dryRun,
  };

  if (dryRun) {
    // Dry run: show what would be created
    for (const item of items) {
      const labels = getLabelsForItem(item);
      result.created.push({
        number: 0,
        url: '',
        title: `[${item.id}] ${item.title}`,
      });
    }
    result.labelsCreated = collectRequiredLabels(items).map(l => l.name);
    return result;
  }

  // Real execution
  const client = new GitHubAPIClient(auth);

  // Verify repository access
  await client.verifyAccess(repo);

  // Ensure all required labels exist
  const requiredLabels = collectRequiredLabels(items);
  for (const label of requiredLabels) {
    try {
      const created = await client.ensureLabel(repo, label);
      if (created) {
        result.labelsCreated.push(label.name);
      }
    } catch (err) {
      // Non-fatal: continue without the label
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({ itemId: 'labels', error: message });
    }
  }

  // Create issues
  for (const item of items) {
    try {
      const labels = getLabelsForItem(item);
      const body = formatIssueBody(item, reportPath);
      const issueResult = await client.createIssue(repo, {
        title: `[${item.id}] ${item.title}`,
        body,
        labels,
      });
      result.created.push(issueResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({ itemId: item.id, error: message });
    }
  }

  return result;
}

// ============================================================================
// Repo string parser
// ============================================================================

/**
 * Parse an "owner/repo" string into a GitHubRepo object.
 */
export function parseRepoString(repoStr: string): GitHubRepo {
  const parts = repoStr.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repository format: "${repoStr}". Expected "owner/repo".`);
  }
  return { owner: parts[0], repo: parts[1] };
}
