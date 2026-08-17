/**
 * LinearIssueCreator - Creates Linear issues from MarkuprX feedback reports
 *
 * Uses Linear's GraphQL API directly (no SDK dependency).
 * Parses a MarkuprX markdown report, maps categories/severities to Linear
 * priorities and labels, and creates one issue per feedback item.
 */

import { readFile } from 'fs/promises';
import type {
  LinearIssueInput,
  LinearIssueResult,
  LinearPushOptions,
  LinearPushResult,
  LinearTeam,
  LinearLabel,
  ParsedFeedbackItem,
} from './types';
import { SEVERITY_TO_PRIORITY, CATEGORY_TO_LABEL } from './types';
import { PUBLIC_BRAND_NAME, PUBLIC_WEBSITE_URL } from '../../shared/publicBrand';

const LINEAR_API_URL = 'https://api.linear.app/graphql';

export class LinearIssueCreator {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  /**
   * Push a MarkuprX report to Linear, creating one issue per feedback item.
   */
  async pushReport(
    reportPath: string,
    options: LinearPushOptions,
  ): Promise<LinearPushResult> {
    const markdown = await readFile(reportPath, 'utf-8');
    const items = parseMarkdownReport(markdown);

    const team = await this.resolveTeam(options.teamKey);
    const labels = await this.getTeamLabels(team.id);

    const result: LinearPushResult = {
      teamKey: options.teamKey,
      totalItems: items.length,
      created: 0,
      failed: 0,
      issues: [],
      dryRun: options.dryRun ?? false,
    };

    for (const item of items) {
      const labelName = CATEGORY_TO_LABEL[item.category] ?? 'Feature';
      const matchingLabel = labels.find(
        (l) => l.name.toLowerCase() === labelName.toLowerCase(),
      );

      const issueInput: LinearIssueInput = {
        title: `[${item.id}] ${item.title}`,
        description: this.buildIssueDescription(item),
        teamId: team.id,
        priority: SEVERITY_TO_PRIORITY[item.severity] ?? 3,
        labelIds: matchingLabel ? [matchingLabel.id] : undefined,
        projectId: options.projectName
          ? await this.resolveProjectId(team.id, options.projectName)
          : undefined,
      };

      if (options.dryRun) {
        result.issues.push({
          success: true,
          issueId: `dry-run-${item.id}`,
          identifier: `DRY-${item.id}`,
          issueUrl: `https://linear.app/dry-run/${item.id}`,
        });
        result.created++;
        continue;
      }

      const issueResult = await this.createIssue(issueInput);
      result.issues.push(issueResult);

      if (issueResult.success) {
        result.created++;
      } else {
        result.failed++;
      }
    }

    return result;
  }

  /**
   * Create a single Linear issue via GraphQL.
   */
  async createIssue(input: LinearIssueInput): Promise<LinearIssueResult> {
    const mutation = `
      mutation IssueCreate($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            url
            identifier
          }
        }
      }
    `;

    const variables: Record<string, unknown> = {
      input: {
        title: input.title,
        description: input.description,
        teamId: input.teamId,
        priority: input.priority,
        ...(input.labelIds && { labelIds: input.labelIds }),
        ...(input.projectId && { projectId: input.projectId }),
      },
    };

    try {
      const data = await this.graphql<{
        issueCreate: {
          success: boolean;
          issue: { id: string; url: string; identifier: string };
        };
      }>(mutation, variables);

      if (data.issueCreate.success) {
        return {
          success: true,
          issueId: data.issueCreate.issue.id,
          issueUrl: data.issueCreate.issue.url,
          identifier: data.issueCreate.issue.identifier,
        };
      }

      return { success: false, error: 'Linear API returned success: false' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Resolve a team key (e.g., "ENG") to a team ID.
   */
  async resolveTeam(teamKey: string): Promise<LinearTeam> {
    const query = `
      query Teams {
        teams {
          nodes {
            id
            key
            name
          }
        }
      }
    `;

    const data = await this.graphql<{
      teams: { nodes: LinearTeam[] };
    }>(query);

    const team = data.teams.nodes.find(
      (t) => t.key.toLowerCase() === teamKey.toLowerCase(),
    );

    if (!team) {
      const available = data.teams.nodes.map((t) => t.key).join(', ');
      throw new Error(
        `Team "${teamKey}" not found. Available teams: ${available}`,
      );
    }

    return team;
  }

  /**
   * Get all labels for a team.
   */
  async getTeamLabels(teamId: string): Promise<LinearLabel[]> {
    const query = `
      query TeamLabels($teamId: String!) {
        team(id: $teamId) {
          labels {
            nodes {
              id
              name
            }
          }
        }
      }
    `;

    const data = await this.graphql<{
      team: { labels: { nodes: LinearLabel[] } };
    }>(query, { teamId });

    return data.team.labels.nodes;
  }

  /**
   * Resolve a project name to a project ID within a team.
   */
  private async resolveProjectId(
    teamId: string,
    projectName: string,
  ): Promise<string | undefined> {
    const query = `
      query Projects($teamId: String!) {
        team(id: $teamId) {
          projects {
            nodes {
              id
              name
            }
          }
        }
      }
    `;

    const data = await this.graphql<{
      team: { projects: { nodes: { id: string; name: string }[] } };
    }>(query, { teamId });

    const project = data.team.projects.nodes.find(
      (p) => p.name.toLowerCase() === projectName.toLowerCase(),
    );

    return project?.id;
  }

  /**
   * Build markdown description for a Linear issue from a feedback item.
   */
  private buildIssueDescription(item: ParsedFeedbackItem): string {
    let desc = `## ${PUBLIC_BRAND_NAME} Feedback: ${item.id}\n\n`;
    desc += `**Severity:** ${item.severity}\n`;
    desc += `**Category:** ${item.category}\n`;
    desc += `**Timestamp:** ${item.timestamp}\n\n`;
    desc += `### Description\n\n${item.description}\n\n`;

    if (item.suggestedAction) {
      desc += `### Suggested Action\n\n${item.suggestedAction}\n\n`;
    }

    if (item.screenshotPaths.length > 0) {
      desc += `### Screenshots\n\n`;
      desc += `_${item.screenshotPaths.length} screenshot(s) captured during session._\n`;
      for (const path of item.screenshotPaths) {
        desc += `- \`${path}\`\n`;
      }
    }

    desc += `\n---\n*Created by [${PUBLIC_BRAND_NAME}](${PUBLIC_WEBSITE_URL})*`;
    return desc;
  }

  /**
   * Execute a GraphQL request against the Linear API.
   */
  private async graphql<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(LINEAR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.token,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(
        `Linear API error: ${response.status} ${response.statusText}`,
      );
    }

    const json = (await response.json()) as { data?: T; errors?: { message: string }[] };

    if (json.errors && json.errors.length > 0) {
      throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
    }

    if (!json.data) {
      throw new Error('Linear API returned no data');
    }

    return json.data;
  }
}

// ============================================================================
// Markdown Report Parser
// ============================================================================

/**
 * Parse a MarkuprX markdown report back into structured feedback items.
 *
 * Expects the format generated by MarkdownGenerator:
 *   ### FB-001: Title
 *   - **Severity:** High
 *   - **Type:** Bug
 *   - **Timestamp:** 00:15
 *   #### What Happened
 *   > transcription text
 *   #### Evidence
 *   ![FB-001](screenshots/fb-001.png)
 *   #### Suggested Next Step
 *   - action text
 */
export function parseMarkdownReport(markdown: string): ParsedFeedbackItem[] {
  const items: ParsedFeedbackItem[] = [];

  // Split on feedback item headers: ### FB-XXX: Title
  const itemPattern = /^### (FB-\d+): (.+)$/gm;
  const matches: { index: number; id: string; title: string }[] = [];

  let match: RegExpExecArray | null;
  while ((match = itemPattern.exec(markdown)) !== null) {
    matches.push({ index: match.index, id: match[1], title: match[2] });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : markdown.length;
    const section = markdown.slice(start, end);

    const severity = extractField(section, 'Severity') as ParsedFeedbackItem['severity'] || 'Medium';
    const category = extractField(section, 'Type') as ParsedFeedbackItem['category'] || 'General';
    const timestamp = extractField(section, 'Timestamp') || '00:00';

    const description = extractBlockquote(section);
    const screenshotPaths = extractScreenshots(section);
    const suggestedAction = extractSuggestedAction(section);

    items.push({
      id: matches[i].id,
      title: matches[i].title,
      severity,
      category,
      timestamp,
      description,
      screenshotPaths,
      suggestedAction,
    });
  }

  return items;
}

function extractField(section: string, fieldName: string): string {
  const pattern = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`, 'm');
  const match = section.match(pattern);
  return match ? match[1].trim() : '';
}

function extractBlockquote(section: string): string {
  const whatHappened = section.match(/#### What Happened\s*\n([\s\S]*?)(?=\n####|\n---)/);
  if (!whatHappened) return '';

  const lines = whatHappened[1]
    .split('\n')
    .filter((line) => line.startsWith('>'))
    .map((line) => line.replace(/^>\s*/, '').trim());

  return lines.join(' ').trim();
}

function extractScreenshots(section: string): string[] {
  const paths: string[] = [];
  const pattern = /!\[.*?\]\((.+?)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(section)) !== null) {
    paths.push(match[1]);
  }
  return paths;
}

function extractSuggestedAction(section: string): string {
  const actionSection = section.match(/#### Suggested Next Step\s*\n-\s*(.+)/);
  return actionSection ? actionSection[1].trim() : '';
}
