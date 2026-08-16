/**
 * MarkdownPatcher
 *
 * Post-processing utilities for patching generated markdown reports with
 * extracted frame links, metadata sync, and processing traces. Extracted
 * from index.ts for separation of concerns.
 */

import * as fs from 'fs/promises';
import { join, basename } from 'path';
import type { TranscriptSegment, KeyMoment } from '../pipeline';
import type {
  AnalysisConnection,
  AnalysisProvider,
  CaptureContextSnapshot,
  MarkedIssuePayload,
  TranscriptionFailure,
} from '../../shared/types';

// =============================================================================
// Text Normalization Helpers
// =============================================================================

export function formatSecondsAsTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`*_~[\]().,!?;:'"\\/|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTokenSet(value: string): Set<string> {
  const tokens = normalizeForMatch(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
  return new Set(tokens);
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.min(a.size, b.size);
}

// =============================================================================
// AI Frame Hint Extraction
// =============================================================================

/**
 * Parse AI-generated markdown to extract frame extraction hints.
 * Matches **Timestamp:** annotations and blockquote references back
 * to transcript segments for accurate frame timing.
 */
export function extractAiFrameHintsFromMarkdown(
  markdown: string,
  transcriptSegments: TranscriptSegment[]
): KeyMoment[] {
  if (!markdown) {
    return [];
  }

  const parseTimestampToSeconds = (value: string): number | null => {
    const trimmed = value.trim();
    const parts = trimmed.split(':').map((part) => Number.parseInt(part, 10));
    if (parts.some((part) => !Number.isFinite(part) || part < 0)) {
      return null;
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return null;
  };

  const timestampHints = Array.from(markdown.matchAll(/\*\*Timestamp:\*\*\s*([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)/g))
    .map((match) => parseTimestampToSeconds(match[1]))
    .filter((value): value is number => value !== null)
    .map((seconds) => ({
      timestamp: Math.max(0, seconds),
      reason: 'AI-timestamped issue context',
      confidence: 0.96,
    }));

  const quoteLines = Array.from(markdown.matchAll(/^\s*>\s+(.+)$/gm))
    .map((match) => match[1].trim())
    .filter((line) => line.length >= 10);
  if (quoteLines.length === 0 && timestampHints.length === 0) {
    return [];
  }

  const normalizedSegments = transcriptSegments.map((segment) => ({
    segment,
    normalized: normalizeForMatch(segment.text || ''),
    tokens: buildTokenSet(segment.text || ''),
  }));

  const hints: KeyMoment[] = [...timestampHints];
  const seenQuotes = new Set<string>();

  for (const quote of quoteLines) {
    const normalizedQuote = normalizeForMatch(quote);
    if (!normalizedQuote || seenQuotes.has(normalizedQuote)) {
      continue;
    }
    seenQuotes.add(normalizedQuote);

    const quoteTokens = buildTokenSet(quote);
    let bestMatch: { score: number; segment: TranscriptSegment } | null = null;

    for (const candidate of normalizedSegments) {
      if (!candidate.normalized) {
        continue;
      }

      let score = overlapScore(quoteTokens, candidate.tokens);
      if (
        normalizedQuote.length >= 16 &&
        (candidate.normalized.includes(normalizedQuote) || normalizedQuote.includes(candidate.normalized))
      ) {
        score = Math.max(score, 0.9);
      }

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { score, segment: candidate.segment };
      }
    }

    if (!bestMatch || bestMatch.score < 0.34) {
      continue;
    }

    const midpoint =
      bestMatch.segment.startTime +
      Math.max(0, (bestMatch.segment.endTime - bestMatch.segment.startTime) / 2);
    hints.push({
      timestamp: Math.max(0, midpoint),
      reason: 'AI-highlighted context',
      confidence: Math.min(0.98, 0.58 + bestMatch.score * 0.35),
    });
  }

  if (hints.length === 0) {
    return [];
  }

  const sorted = hints.sort((a, b) => a.timestamp - b.timestamp);
  const deduped: KeyMoment[] = [];
  for (const hint of sorted) {
    const previous = deduped[deduped.length - 1];
    if (!previous || Math.abs(previous.timestamp - hint.timestamp) >= 1.0) {
      deduped.push(hint);
      continue;
    }
    if (hint.confidence > previous.confidence) {
      deduped[deduped.length - 1] = hint;
    }
  }

  return deduped.slice(0, 12);
}

// =============================================================================
// Report Patching
// =============================================================================

/**
 * Append an actionable transcription failure without hiding or replacing the
 * report and captured artifacts. Safe to call more than once.
 */
export async function appendTranscriptionFailureToReport(
  markdownPath: string,
  failure: TranscriptionFailure,
): Promise<void> {
  const heading = '## Transcription Error';
  const markdown = await fs.readFile(markdownPath, 'utf-8');
  if (markdown.includes(heading)) {
    return;
  }

  const separator = markdown.endsWith('\n') ? '\n' : '\n\n';
  const notice = [
    heading,
    '',
    '> Narration was recorded, but markupR could not transcribe it. Your recording and audio were saved.',
    '',
    failure.message.trim(),
    '',
  ].join('\n');

  await fs.writeFile(markdownPath, `${markdown}${separator}${notice}`, 'utf-8');
}

/**
 * Append extracted video frames to the markdown report.
 * Verifies each frame path exists before linking to avoid broken images.
 */
export async function appendExtractedFramesToReport(
  markdownPath: string,
  extractedFrames: Array<{
    path: string;
    timestamp: number;
    reason: string;
    markedIssueId?: string;
    captureContext?: CaptureContextSnapshot;
  }>
): Promise<void> {
  if (!extractedFrames.length) {
    return;
  }

  const verifiedFrames: Array<{
    path: string;
    timestamp: number;
    reason: string;
    markedIssueId?: string;
    captureContext?: CaptureContextSnapshot;
  }> = [];
  for (const frame of extractedFrames) {
    if (frame.markedIssueId) continue;
    try {
      await fs.access(frame.path);
      verifiedFrames.push(frame);
    } catch {
      // Skip stale frame references so markdown never links missing files.
    }
  }
  if (!verifiedFrames.length) {
    return;
  }

  let markdown = await fs.readFile(markdownPath, 'utf-8');
  if (markdown.includes('## Auto-Extracted Screenshots')) {
    return;
  }

  const lines = verifiedFrames
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((frame, index) => {
      const filename = basename(frame.path) || `frame-${String(index + 1).padStart(3, '0')}.png`;
      const timestamp = formatSecondsAsTimestamp(frame.timestamp);
      const reason = frame.reason?.trim() || 'Auto-extracted frame';
      const cursor =
        frame.captureContext?.cursor
          ? `Cursor: ${Math.round(frame.captureContext.cursor.x)}, ${Math.round(frame.captureContext.cursor.y)}`
          : undefined;
      const app = frame.captureContext?.activeWindow?.appName || frame.captureContext?.activeWindow?.sourceName;
      const focused = frame.captureContext?.focusedElement?.textPreview
        || frame.captureContext?.focusedElement?.label
        || frame.captureContext?.focusedElement?.role;
      const annotation = frame.captureContext?.annotation
        ? `Annotation: ${frame.captureContext.annotation.tool} (${frame.captureContext.annotation.color})`
        : undefined;
      const contextLine = [annotation, cursor, app ? `App: ${app}` : undefined, focused ? `Focus: ${focused}` : undefined]
        .filter(Boolean)
        .join(' | ');

      return `### [${timestamp}] ${reason}\n\n![${reason}](./screenshots/${filename})${
        contextLine ? `\n\n> ${contextLine}` : ''
      }`;
    })
    .join('\n\n');

  markdown += `\n## Auto-Extracted Screenshots\n\n${lines}\n`;

  // Keep report header/session info counts aligned with the post-processed frame output.
  const screenshotCount = verifiedFrames.length;
  markdown = markdown.replace(
    /(\|\s*Duration:\s*[^|]+\|\s*)\d+\s+screenshots(\s*\|\s*\d+\s+items identified\s*\n)/,
    `$1${screenshotCount} screenshots$2`
  );
  markdown = markdown.replace(
    /(-\s*\*\*Screenshots:\*\*\s*)\d+/,
    `$1${screenshotCount}`
  );

  await fs.writeFile(markdownPath, markdown, 'utf-8');
}

/**
 * Sync extracted frame count into session metadata.json.
 */
export async function syncExtractedFrameMetadata(
  sessionDir: string,
  screenshotCount: number
): Promise<void> {
  const metadataPath = join(sessionDir, 'metadata.json');
  try {
    const raw = await fs.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(raw) as { screenshotCount?: number };
    metadata.screenshotCount = Math.max(
      Number.isFinite(metadata.screenshotCount) ? Number(metadata.screenshotCount) : 0,
      screenshotCount
    );
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  } catch (error) {
    console.warn('[Main] Failed to sync extracted frame metadata:', error);
  }
}

/** Persist finalized, identity-bearing marked issues after evidence promotion/fallback. */
export async function syncMarkedIssueMetadata(
  sessionDir: string,
  markedIssues: MarkedIssuePayload[],
  screenshotCount: number,
): Promise<void> {
  const metadataPath = join(sessionDir, 'metadata.json');
  try {
    const raw = await fs.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(raw) as {
      markedIssues?: MarkedIssuePayload[];
      screenshotCount?: number;
    };
    metadata.markedIssues = structuredClone(markedIssues);
    metadata.screenshotCount = Math.max(
      Number.isFinite(metadata.screenshotCount) ? Number(metadata.screenshotCount) : 0,
      Math.max(0, screenshotCount),
    );
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  } catch (error) {
    console.warn('[Main] Failed to sync marked issue metadata:', error);
  }
}

/**
 * Sync extracted frame count into feedback-summary.md.
 */
export async function syncExtractedFrameSummary(
  sessionDir: string,
  screenshotCount: number
): Promise<void> {
  const summaryPath = join(sessionDir, 'feedback-summary.md');
  try {
    const raw = await fs.readFile(summaryPath, 'utf-8');
    const updated = raw.replace(/(\*\*Screenshots:\*\*\s*)\d+/, `$1${screenshotCount}`);
    if (updated !== raw) {
      await fs.writeFile(summaryPath, updated, 'utf-8');
    }
  } catch (error) {
    console.warn('[Main] Failed to sync extracted frame summary:', error);
  }
}

/**
 * Write a processing trace JSON file for debugging/diagnostics.
 */
export async function writeProcessingTrace(
  sessionDir: string,
  trace: {
    reportPath: string;
    totalMs: number;
    aiMs: number;
    saveMs: number;
    postProcessMs: number;
    audioBytes: number;
    recordingBytes: number;
    transcriptBufferEvents: number;
    providedTranscriptSegments: number;
    aiFrameHints: number;
    postProcessSegments: number;
    extractedFrames: number;
    aiTier: 'free' | 'byok' | 'premium';
    aiEnhanced: boolean;
    requestedProvider: AnalysisProvider;
    requestedModel: string | null;
    actualProvider: AnalysisProvider;
    actualModel: string | null;
    connection: AnalysisConnection;
    aiFallbackReason?: string;
    transcriptionFailure?: TranscriptionFailure;
    completedAt: string;
  }
): Promise<void> {
  const tracePath = join(sessionDir, 'processing-trace.json');
  await fs.writeFile(tracePath, JSON.stringify(trace, null, 2), 'utf-8');
}
