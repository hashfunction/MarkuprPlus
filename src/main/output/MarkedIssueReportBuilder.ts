import { basename } from 'node:path';
import type {
  MarkedIssuePayload,
  TranscriptionFailure,
} from '../../shared/types';
import type { TranscriptSegment } from '../pipeline/PostProcessor';
import type { FeedbackItem as MarkdownFeedbackItem } from './MarkdownGenerator';

const COMMENT_LOOKBACK_MS = 30_000;
const PRECEDING_FALLBACK_MS = 12_000;
const INLINE_TIMESTAMP_FALLBACK_MS = 30_000;
const INLINE_EVIDENCE_BLOCK = /\n?<!-- markuprplus:marked-evidence:(MX-\d{3}):start -->\n[\s\S]*?<!-- markuprplus:marked-evidence:\1:end -->\n?/g;
const MATCH_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'for', 'from', 'had', 'has', 'have',
  'i', 'if', 'in', 'is', 'it', 'll', 'm', 'of', 'on', 'or', 're', 's',
  'should', 'that', 'the', 'this', 'to', 've', 'very', 'was', 'we', 'were',
  'will', 'with', 'would', 'you', 'your',
]);

export interface MarkedIssueCommentContext {
  videoStartTime: number;
  hasAudio: boolean;
  transcriptionFailure?: TranscriptionFailure;
}

interface IndexedSegment {
  id: string;
  text: string;
  startAt: number;
  endAt: number;
  midpointAt: number;
}

interface FeedbackMarkdownBlock {
  start: number;
  end: number;
  quote: string;
  timestampSeconds?: number;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeForEvidenceMatch(value: string): string {
  return value
    .replace(/\\([\\`*_[\]{}()|])/g, '$1')
    .replace(/\[[^\]]*(?:audio|music|bell)[^\]]*\]/gi, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function meaningfulTokens(value: string): Set<string> {
  return new Set(normalizeForEvidenceMatch(value)
    .split(' ')
    .filter((token) => token.length >= 2 && !MATCH_STOP_WORDS.has(token)));
}

function evidenceTextScore(quote: string, comment: string | undefined): number {
  const normalizedQuote = normalizeForEvidenceMatch(quote);
  const normalizedComment = normalizeForEvidenceMatch(comment || '');
  if (!normalizedQuote || !normalizedComment) return 0;
  if (normalizedComment.includes(normalizedQuote)) return 1;
  if (normalizedComment.length >= 8 && normalizedQuote.includes(normalizedComment)) return 0.95;

  const quoteTokens = meaningfulTokens(normalizedQuote);
  const commentTokens = meaningfulTokens(normalizedComment);
  if (quoteTokens.size === 0 || commentTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of quoteTokens) {
    if (commentTokens.has(token)) overlap += 1;
  }
  if (overlap < 2) return 0;
  return overlap / quoteTokens.size;
}

function parseTimestampSeconds(block: string): number | undefined {
  const match = block.match(/\*\*Timestamp:\*\*\s*(\d+):([0-5]\d)/);
  if (!match) return undefined;
  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
}

function findFeedbackMarkdownBlocks(markdown: string): FeedbackMarkdownBlock[] {
  const headings = Array.from(markdown.matchAll(/^(?:##|###)\s+[^\n]+$/gm));
  const blocks: FeedbackMarkdownBlock[] = [];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (!/^### FB-\d{3}:/.test(heading[0])) continue;
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? markdown.length;
    const block = markdown.slice(start, end);
    const timestampSeconds = parseTimestampSeconds(block);
    const quote = block.match(/^>\s+(.+)$/m)?.[1]
      ?.replace(/^(["“])|(["”])$/g, '')
      .trim() || '';
    blocks.push({
      start,
      end,
      quote,
      ...(timestampSeconds === undefined ? {} : { timestampSeconds }),
    });
  }
  return blocks;
}

function inlineEvidenceMarkdown(
  issue: MarkedIssuePayload,
  screenshotDir: string,
): string {
  const displayId = `MX-${String(issue.ordinal).padStart(3, '0')}`;
  const screenshot = screenshotReference(issue, screenshotDir);
  const evidence = screenshot
    ? `![Marked issue ${displayId}](${screenshot})`
    : `> **Evidence warning:** ${escapeMarkdown(
        issue.evidenceWarning || 'No marked screenshot could be recovered for this issue.',
      )}`;
  return [
    `<!-- markuprplus:marked-evidence:${displayId}:start -->`,
    `#### Marked Evidence (${displayId})`,
    '',
    evidence,
    `<!-- markuprplus:marked-evidence:${displayId}:end -->`,
  ].join('\n');
}

function insertEvidenceIntoFeedbackBlock(
  markdown: string,
  block: FeedbackMarkdownBlock,
  evidence: MarkedIssuePayload[],
  screenshotDir: string,
): string {
  const blockMarkdown = markdown.slice(block.start, block.end);
  const metadataOffset = blockMarkdown.search(/^-\s+\*\*[^\n]+$/m);
  const insertionAt = metadataOffset >= 0 ? block.start + metadataOffset : block.end;
  const rendered = evidence
    .map((issue) => inlineEvidenceMarkdown(issue, screenshotDir))
    .join('\n\n');
  const before = markdown.slice(0, insertionAt).trimEnd();
  const after = markdown.slice(insertionAt).trimStart();
  return `${before}\n\n${rendered}\n\n${after}`;
}

function unavailableNarrationMessage(context: MarkedIssueCommentContext): string {
  if (context.transcriptionFailure?.message) {
    return `Narration unavailable: ${normalizeText(context.transcriptionFailure.message)}`;
  }
  if (!context.hasAudio) {
    return 'No narration was recorded for this marked issue.';
  }
  return 'No narration was associated with this marked issue.';
}

export function assignMarkedIssueComments(
  issues: MarkedIssuePayload[],
  segments: TranscriptSegment[],
  context: MarkedIssueCommentContext,
): MarkedIssuePayload[] {
  const sortedIssues = structuredClone(issues)
    .sort((left, right) => left.completedAt - right.completedAt || left.ordinal - right.ordinal);
  const videoStartTime = Number.isFinite(context.videoStartTime)
    ? context.videoStartTime
    : Number.NaN;
  const indexedSegments: IndexedSegment[] = segments
    .map((segment, index): IndexedSegment | null => {
      const text = normalizeText(segment.text || '');
      if (!text || !Number.isFinite(segment.startTime) || !Number.isFinite(segment.endTime)
        || !Number.isFinite(videoStartTime)) return null;
      const startSeconds = Math.max(0, segment.startTime);
      const endSeconds = Math.max(startSeconds, segment.endTime);
      const startAt = videoStartTime + startSeconds * 1_000;
      const endAt = videoStartTime + endSeconds * 1_000;
      return {
        id: `transcript-segment-${String(index + 1).padStart(4, '0')}`,
        text,
        startAt,
        endAt,
        midpointAt: startAt + (endAt - startAt) / 2,
      };
    })
    .filter((segment): segment is IndexedSegment => Boolean(segment))
    .sort((left, right) => left.startAt - right.startAt || left.endAt - right.endAt);
  const assignedIds = new Set<string>();

  for (let index = 0; index < sortedIssues.length; index += 1) {
    const markedIssue = sortedIssues[index];
    const previousCompletion = index > 0
      ? sortedIssues[index - 1].completedAt
      : Number.NEGATIVE_INFINITY;
    const windowStart = Math.max(previousCompletion, markedIssue.startedAt - COMMENT_LOOKBACK_MS);
    const selected = indexedSegments.filter((segment) =>
      !assignedIds.has(segment.id)
      && segment.midpointAt >= windowStart
      && segment.midpointAt <= markedIssue.completedAt);

    if (selected.length === 0) {
      const preceding = indexedSegments
        .filter((segment) => !assignedIds.has(segment.id)
          && segment.endAt <= markedIssue.completedAt
          && markedIssue.completedAt - segment.endAt <= PRECEDING_FALLBACK_MS)
        .sort((left, right) => right.endAt - left.endAt)[0];
      if (preceding) selected.push(preceding);
    }

    if (selected.length > 0) {
      selected.forEach((segment) => assignedIds.add(segment.id));
      markedIssue.comment = selected.map((segment) => segment.text).join(' ');
      markedIssue.transcriptSegmentIds = selected.map((segment) => segment.id);
      markedIssue.transcriptionStatus = 'available';
      delete markedIssue.transcriptionWarning;
    } else {
      delete markedIssue.comment;
      markedIssue.transcriptSegmentIds = [];
      markedIssue.transcriptionStatus = 'unavailable';
      markedIssue.transcriptionWarning = unavailableNarrationMessage(context);
    }
  }

  return sortedIssues;
}

export function buildMarkedIssueFeedbackItems(
  issues: MarkedIssuePayload[],
): MarkdownFeedbackItem[] {
  return issues
    .slice()
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((issue) => ({
      id: issue.id,
      transcription: issue.comment
        || issue.transcriptionWarning
        || 'No narration was associated with this marked issue.',
      timestamp: issue.completedAt,
      title: `Marked issue MX-${String(issue.ordinal).padStart(3, '0')}`,
      category: 'UX Issue',
      severity: 'Medium',
      keywords: ['marked issue', ...issue.tools],
      screenshots: issue.screenshotPath ? [{
        id: `${issue.id}-evidence`,
        timestamp: issue.markedAt,
        imagePath: issue.screenshotPath,
        width: 0,
        height: 0,
      }] : [],
    }));
}

function escapeMarkdown(value: string): string {
  return normalizeText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([\\`*_[\]{}()|])/g, '\\$1');
}

function formatTimestamp(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function screenshotReference(issue: MarkedIssuePayload, screenshotDir: string): string | undefined {
  if (!issue.screenshotPath) return undefined;
  const filename = basename(issue.screenshotPath);
  if (!/^marked-issue-\d{3}\.png$/i.test(filename)) return undefined;
  const directory = screenshotDir.replace(/\\/g, '/').replace(/\/+$/, '') || '.';
  return `${directory}/${filename}`;
}

function issueContext(issue: MarkedIssuePayload): string | undefined {
  const activeWindow = issue.captureContext?.activeWindow;
  const focusedElement = issue.captureContext?.focusedElement;
  const app = activeWindow?.appName || activeWindow?.sourceName;
  const focus = focusedElement?.textPreview
    || focusedElement?.label
    || focusedElement?.name
    || focusedElement?.role;
  const cursor = issue.captureContext?.cursor
    ? `Cursor ${Math.round(issue.captureContext.cursor.x)}, ${Math.round(issue.captureContext.cursor.y)}`
    : undefined;
  const parts = [
    app ? `App: ${escapeMarkdown(app)}` : undefined,
    focus ? `Focus: ${escapeMarkdown(focus)}` : undefined,
    cursor ? escapeMarkdown(cursor) : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' | ') : undefined;
}

export function renderMarkedIssuesMarkdown(
  issues: MarkedIssuePayload[],
  screenshotDir = './screenshots',
): string {
  if (issues.length === 0) return '';
  let markdown = '## Marked Issues\n\n';
  const sorted = issues.slice().sort((left, right) => left.ordinal - right.ordinal);
  for (const issue of sorted) {
    const displayId = `MX-${String(issue.ordinal).padStart(3, '0')}`;
    markdown += `### ${displayId}\n\n`;
    markdown += `- **Timestamp:** ${formatTimestamp(issue.fallbackVideoTimestamp)}\n`;
    markdown += `- **Tools:** ${issue.tools.map(escapeMarkdown).join(', ') || 'Unknown'}\n`;
    markdown += `- **Colors:** ${issue.colors.map(escapeMarkdown).join(', ') || 'Unknown'}\n`;
    const context = issueContext(issue);
    if (context) markdown += `- **Context:** ${context}\n`;
    markdown += '\n#### User Comment\n\n';
    if (issue.comment) {
      markdown += `> ${escapeMarkdown(issue.comment)}\n\n`;
    } else {
      markdown += `> _${escapeMarkdown(
        issue.transcriptionWarning || 'No narration was associated with this marked issue.',
      )}_\n\n`;
    }
    markdown += '#### Marked Evidence\n\n';
    const screenshot = screenshotReference(issue, screenshotDir);
    if (screenshot) {
      markdown += `![Marked issue ${displayId}](${screenshot})\n\n`;
    } else {
      markdown += `> **Evidence warning:** ${escapeMarkdown(
        issue.evidenceWarning || 'No marked screenshot could be recovered for this issue.',
      )}\n\n`;
    }
  }
  return markdown;
}

function escapeJira(value: string): string {
  return normalizeText(value)
    .replace(/[\\|{}[\]]/g, '\\$&');
}

export function renderMarkedIssuesJira(
  issues: MarkedIssuePayload[],
): string {
  if (issues.length === 0) return '';
  let output = 'h2. Marked Issues\n\n';
  for (const issue of issues.slice().sort((left, right) => left.ordinal - right.ordinal)) {
    const displayId = `MX-${String(issue.ordinal).padStart(3, '0')}`;
    output += `h3. ${displayId}\n\n`;
    output += `*Timestamp:* ${formatTimestamp(issue.fallbackVideoTimestamp)}\n`;
    output += `*Tools:* ${issue.tools.map(escapeJira).join(', ') || 'Unknown'}\n`;
    output += `*Colors:* ${issue.colors.map(escapeJira).join(', ') || 'Unknown'}\n\n`;
    output += `{quote}\n${escapeJira(
      issue.comment
        || issue.transcriptionWarning
        || 'No narration was associated with this marked issue.',
    )}\n{quote}\n\n`;
    const screenshot = screenshotReference(issue, 'screenshots');
    if (screenshot) {
      output += `!${screenshot}|thumbnail!\n\n`;
    } else {
      output += `{warning}${escapeJira(
        issue.evidenceWarning || 'No marked screenshot could be recovered for this issue.',
      )}{warning}\n\n`;
    }
  }
  return output;
}

function removeExistingMarkedSection(markdown: string): string {
  const lines = markdown.replace(INLINE_EVIDENCE_BLOCK, '\n').split('\n');
  for (const heading of ['## Marked Issues', '## Unmatched Marked Evidence']) {
    const start = lines.findIndex((line) => line.trim() === heading);
    if (start < 0) continue;
    let end = lines.length;
    for (let index = start + 1; index < lines.length; index += 1) {
      if (/^##\s+/.test(lines[index]) || lines[index].trim() === '---') {
        end = index;
        break;
      }
    }
    lines.splice(start, end - start);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function matchEvidenceToFeedbackBlocks(
  blocks: FeedbackMarkdownBlock[],
  issues: MarkedIssuePayload[],
): { matches: Map<number, MarkedIssuePayload[]>; unmatched: MarkedIssuePayload[] } {
  const matches = new Map<number, MarkedIssuePayload[]>();
  const matchedIssueIds = new Set<string>();
  const unmatchedBlocks: FeedbackMarkdownBlock[] = [];

  for (const block of blocks) {
    const candidates = issues
      .map((issue) => ({ issue, score: evidenceTextScore(block.quote, issue.comment) }))
      .filter((candidate) => candidate.score >= 0.5)
      .sort((left, right) => right.score - left.score || left.issue.ordinal - right.issue.ordinal);
    const best = candidates[0];
    const nextBest = candidates[1];
    if (!best || (nextBest && best.score - nextBest.score < 0.15)) {
      unmatchedBlocks.push(block);
      continue;
    }
    matches.set(block.start, [best.issue]);
    matchedIssueIds.add(best.issue.id);
  }

  const unusedIssues = (): MarkedIssuePayload[] => issues
    .filter((issue) => !matchedIssueIds.has(issue.id));
  for (const block of unmatchedBlocks
    .filter((candidate) => candidate.timestampSeconds !== undefined)
    .sort((left, right) => Number(left.timestampSeconds) - Number(right.timestampSeconds))) {
    const candidates = unusedIssues()
      .filter((issue) => !normalizeForEvidenceMatch(issue.comment || ''))
      .map((issue) => ({
        issue,
        distance: Math.abs(
          Number(block.timestampSeconds) - Math.max(0, issue.fallbackVideoTimestamp),
        ),
      }))
      .filter((candidate) => candidate.distance <= INLINE_TIMESTAMP_FALLBACK_MS / 1_000)
      .sort((left, right) => left.distance - right.distance || left.issue.ordinal - right.issue.ordinal);
    const nearest = candidates[0];
    const nextNearest = candidates[1];
    if (!nearest || (nextNearest && nextNearest.distance - nearest.distance < 3)) continue;
    matches.set(block.start, [nearest.issue]);
    matchedIssueIds.add(nearest.issue.id);
  }

  return {
    matches,
    unmatched: issues.filter((issue) => !matchedIssueIds.has(issue.id)),
  };
}

function insertSectionBeforeReportDetails(markdown: string, section: string): string {
  const markerIndexes = [
    '## Session Recording',
    '## Session Info',
    '## Auto-Extracted Screenshots',
  ].map((marker) => markdown.indexOf(marker)).filter((index) => index >= 0);
  const markerIndex = markerIndexes.length > 0 ? Math.min(...markerIndexes) : -1;
  if (markerIndex < 0) {
    return `${markdown.trimEnd()}\n\n${section.trimEnd()}\n`;
  }
  const before = markdown.slice(0, markerIndex).trimEnd();
  const after = markdown.slice(markerIndex).trimStart();
  return `${before}\n\n${section.trimEnd()}\n\n${after}\n`.replace(/\n+$/, '\n');
}

export function insertMarkedIssuesSection(
  markdown: string,
  issues: MarkedIssuePayload[],
  screenshotDir = './screenshots',
): string {
  const withoutExisting = removeExistingMarkedSection(markdown);
  const feedbackBlocks = findFeedbackMarkdownBlocks(withoutExisting);
  const isAiAnalyzedReport = /^> AI-analyzed by\s+/m.test(withoutExisting);
  if (isAiAnalyzedReport && feedbackBlocks.length > 0 && issues.length > 0) {
    const { matches, unmatched } = matchEvidenceToFeedbackBlocks(feedbackBlocks, issues);
    let withInlineEvidence = withoutExisting;
    for (const block of feedbackBlocks.slice().reverse()) {
      const evidence = matches.get(block.start);
      if (!evidence) continue;
      withInlineEvidence = insertEvidenceIntoFeedbackBlock(
        withInlineEvidence,
        block,
        evidence,
        screenshotDir,
      );
    }
    if (unmatched.length === 0) {
      return withInlineEvidence.replace(/\n+$/, '\n');
    }
    const unmatchedSection = renderMarkedIssuesMarkdown(unmatched, screenshotDir)
      .replace(/^## Marked Issues/, '## Unmatched Marked Evidence');
    return insertSectionBeforeReportDetails(withInlineEvidence, unmatchedSection);
  }
  const section = renderMarkedIssuesMarkdown(issues, screenshotDir);
  if (!section) return withoutExisting;
  const markerIndex = [
    '## Auto-Extracted Screenshots',
    '## Summary',
    '## Session Recording',
  ].map((marker) => withoutExisting.indexOf(marker))
    .find((index) => index >= 0) ?? -1;
  if (markerIndex >= 0) {
    const before = withoutExisting.slice(0, markerIndex).trimEnd();
    const after = withoutExisting.slice(markerIndex).trimStart();
    return `${before}\n\n${section.trimEnd()}\n\n${after}\n`.replace(/\n+$/, '\n');
  }
  return `${withoutExisting.trimEnd()}\n\n${section}`.replace(/\n+$/, '\n');
}
