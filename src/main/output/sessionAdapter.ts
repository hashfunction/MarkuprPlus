/**
 * Session Adapter
 *
 * Converts between different session types used across the codebase.
 * This is needed because:
 * - SessionController uses its own Session/FeedbackItem types
 * - MarkdownGenerator uses enhanced Session/FeedbackItem types
 * - FileManager uses its own MarkdownDocument type
 */

import type { Session as ControllerSession, FeedbackItem as ControllerFeedbackItem } from '../SessionController';
import type { TranscriptEvent } from '../transcription/types';
import type {
  Session as MarkdownSession,
  FeedbackItem as MarkdownFeedbackItem,
  FeedbackCategory,
  FeedbackSeverity,
  GenerateOptions,
} from './MarkdownGenerator';
import type { MarkdownDocument as FileManagerDocument } from './FileManager';
import { markdownGenerator } from './MarkdownGenerator';
import { feedbackAnalyzer } from '../analysis';

const NO_TRANSCRIPTION_PLACEHOLDER =
  '[Narration was recorded but not transcribed. Add an OpenAI API key, or download a Tiny Whisper model for local fallback.]';

/**
 * Map analyzer category labels to markdown report labels
 */
function mapCategory(category: ReturnType<typeof feedbackAnalyzer.analyze>['category']): FeedbackCategory {
  switch (category) {
    case 'bug':
      return 'Bug';
    case 'ux-issue':
      return 'UX Issue';
    case 'suggestion':
      return 'Suggestion';
    case 'performance':
      return 'Performance';
    case 'question':
      return 'Question';
    default:
      return 'General';
  }
}

function mapSeverity(severity: ReturnType<typeof feedbackAnalyzer.analyze>['severity']): FeedbackSeverity {
  switch (severity) {
    case 'critical':
      return 'Critical';
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    default:
      return 'Low';
  }
}

/**
 * Convert SessionController.FeedbackItem to MarkdownGenerator.FeedbackItem
 */
function adaptFeedbackItem(item: ControllerFeedbackItem, index: number): MarkdownFeedbackItem {
  const transcription = item.text.trim() || NO_TRANSCRIPTION_PLACEHOLDER;
  const analysis = feedbackAnalyzer.analyze(transcription);

  return {
    id: item.id || `item-${index + 1}`,
    transcription,
    timestamp: item.timestamp,
    category: mapCategory(analysis.category),
    severity: mapSeverity(analysis.severity),
    title: analysis.suggestedTitle,
    keywords: analysis.keywords,
    screenshots: item.screenshot ? [{
      id: item.screenshot.id,
      timestamp: item.screenshot.timestamp,
      width: item.screenshot.width,
      height: item.screenshot.height,
      imagePath: '', // Filled in by FileManager when saving
      base64: item.screenshot.base64,
    }] : [],
  };
}

function buildTranscriptOnlyItems(session: ControllerSession): MarkdownFeedbackItem[] {
  const finalTranscripts = session.transcriptBuffer
    .filter((event) => event.isFinal && event.text.trim().length > 0)
    .sort((a, b) => a.timestamp - b.timestamp);

  const usableTranscripts = finalTranscripts.length > 0
    ? finalTranscripts
    : session.transcriptBuffer
        .filter((event) => event.text.trim().length > 0)
        .sort((a, b) => a.timestamp - b.timestamp);

  if (usableTranscripts.length === 0) {
    return [];
  }

  const grouped: Array<{ timestampMs: number; transcripts: TranscriptEvent[] }> = [];
  const GROUP_GAP_MS = 2200;

  for (const transcript of usableTranscripts) {
    const timestampMs = Math.round(transcript.timestamp * 1000);
    const previousGroup = grouped[grouped.length - 1];

    if (!previousGroup || timestampMs - previousGroup.timestampMs > GROUP_GAP_MS) {
      grouped.push({
        timestampMs,
        transcripts: [transcript],
      });
      continue;
    }

    previousGroup.transcripts.push(transcript);
    previousGroup.timestampMs = timestampMs;
  }

  return grouped.map((group, index) => {
    const transcription = group.transcripts
      .map((transcript) => transcript.text.trim())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    const analysis = feedbackAnalyzer.analyze(transcription);

    return {
      id: `transcript-only-${index + 1}`,
      transcription,
      timestamp: group.timestampMs,
      category: mapCategory(analysis.category),
      severity: mapSeverity(analysis.severity),
      title: analysis.suggestedTitle,
      keywords: analysis.keywords,
      screenshots: [],
    };
  });
}

/**
 * Convert SessionController.Session to MarkdownGenerator.Session
 */
export function adaptSessionForMarkdown(session: ControllerSession): MarkdownSession {
  const adaptedFromScreenshots = session.feedbackItems.map((item, index) => adaptFeedbackItem(item, index));
  const transcriptOnlyItems = buildTranscriptOnlyItems(session);
  const hasNarratedScreenshotItems = adaptedFromScreenshots.some(
    (item) => item.transcription !== NO_TRANSCRIPTION_PLACEHOLDER
  );

  const adaptedItems =
    adaptedFromScreenshots.length === 0
      ? transcriptOnlyItems
      : hasNarratedScreenshotItems || transcriptOnlyItems.length === 0
        ? adaptedFromScreenshots
        : [...adaptedFromScreenshots, ...transcriptOnlyItems];

  return {
    id: session.id,
    startTime: session.startTime,
    endTime: session.endTime,
    feedbackItems: adaptedItems,
    metadata: {
      os: process.platform,
      sourceName: session.metadata?.sourceName || 'Screen',
      sourceType: session.metadata?.sourceType
        || (session.sourceId.startsWith('screen') ? 'screen' : 'window'),
      captureContexts: session.metadata?.captureContexts,
    },
  };
}

/**
 * Generate a FileManager-compatible MarkdownDocument from a SessionController session
 */
export function generateDocumentForFileManager(
  session: ControllerSession,
  options?: Partial<GenerateOptions>
): FileManagerDocument {
  const adaptedSession = adaptSessionForMarkdown(session);
  const fullOptions: GenerateOptions = {
    projectName: options?.projectName || session.metadata?.sourceName || 'Feedback Session',
    screenshotDir: options?.screenshotDir || './screenshots',
  };

  const generatedDoc = markdownGenerator.generateFullDocument(adaptedSession, fullOptions);

  // Convert MarkdownGenerator.MarkdownDocument to FileManager.MarkdownDocument
  return {
    content: generatedDoc.content,
    metadata: {
      itemCount: generatedDoc.metadata.itemCount,
      screenshotCount: generatedDoc.metadata.screenshotCount,
      types: Object.keys(generatedDoc.metadata.types),
    },
  };
}

/**
 * Generate clipboard summary from a SessionController session
 */
export function generateClipboardSummary(session: ControllerSession, projectName?: string): string {
  const adaptedSession = adaptSessionForMarkdown(session);
  return markdownGenerator.generateClipboardSummary(
    adaptedSession,
    projectName || session.metadata?.sourceName || 'Feedback Session'
  );
}
