import { basename } from 'node:path';
import type {
  MarkedIssuePayload,
  TranscriptionFailure,
} from '../../shared/types';
import type { TranscriptSegment } from '../pipeline/PostProcessor';
import type { FeedbackItem as MarkdownFeedbackItem } from './MarkdownGenerator';

const COMMENT_LOOKBACK_MS = 30_000;
const PRECEDING_FALLBACK_MS = 12_000;

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

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
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
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === '## Marked Issues');
  if (start < 0) return markdown;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index]) || lines[index].trim() === '---') {
      end = index;
      break;
    }
  }
  lines.splice(start, end - start);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

export function insertMarkedIssuesSection(
  markdown: string,
  issues: MarkedIssuePayload[],
  screenshotDir = './screenshots',
): string {
  const withoutExisting = removeExistingMarkedSection(markdown);
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
