import * as fs from 'node:fs/promises';
import type { SaveResult, MarkdownDocument } from '../output/FileManager';
import {
  adaptSessionForMarkdown,
  generateDocumentForFileManager,
} from '../output';
import {
  syncExtractedFrameSummary,
  syncMarkedIssueMetadata,
  syncReportScreenshotSummary,
} from '../output/MarkdownPatcher';
import { assignMarkedIssueComments } from '../output/MarkedIssueReportBuilder';
import type { Session } from '../SessionController';
import type { TranscriptEvent } from '../transcription/types';
import type { MarkedIssuePayload, ReviewSession } from '../../shared/types';
import type { RecoverableSession } from '../CrashRecovery';

export interface RecoveredSessionSaveDependencies {
  saveSession(session: Session, document: MarkdownDocument): Promise<SaveResult>;
  promoteIssues(
    sessionId: string,
    issues: MarkedIssuePayload[],
    sessionDir: string,
  ): Promise<MarkedIssuePayload[]>;
  cleanupSession(sessionId: string): Promise<void>;
}

export interface RecoveredSessionSaveResult {
  session: Session;
  reviewSession: ReviewSession;
  reportPath: string;
  sessionDir: string;
}

function validTranscriptEvents(session: RecoverableSession): TranscriptEvent[] {
  const events = Array.isArray(session.transcriptEvents)
    ? session.transcriptEvents
    : [];
  const valid = events
    .filter((event) => event
      && typeof event.text === 'string'
      && event.text.trim().length > 0
      && Number.isFinite(event.timestamp)
      && Number.isFinite(event.confidence))
    .slice(-2_000)
    .map((event) => ({
      text: event.text.trim(),
      isFinal: event.isFinal !== false,
      confidence: Math.max(0, Math.min(1, event.confidence)),
      timestamp: event.timestamp,
      tier: event.tier === 'whisper' ? 'whisper' as const : 'timer-only' as const,
    }));

  if (valid.length > 0 || !session.transcriptionBuffer.trim()) {
    return valid;
  }

  return [{
    text: session.transcriptionBuffer.trim(),
    isFinal: true,
    confidence: 0,
    timestamp: session.lastSaveTime / 1_000,
    tier: 'timer-only',
  }];
}

function transcriptSegments(session: RecoverableSession, events: TranscriptEvent[]) {
  const startSeconds = session.startTime / 1_000;
  const finalEvents = events
    .filter((event) => event.isFinal)
    .slice()
    .sort((left, right) => left.timestamp - right.timestamp);

  return finalEvents.map((event, index) => {
    const startTime = Math.max(0, event.timestamp - startSeconds);
    const estimatedDuration = Math.min(
      3,
      Math.max(1, event.text.split(/\s+/).length * 0.35),
    );
    const nextStart = finalEvents[index + 1]
      ? Math.max(startTime + 0.35, finalEvents[index + 1].timestamp - startSeconds)
      : startTime + estimatedDuration;
    return {
      text: event.text,
      startTime,
      endTime: Math.max(startTime + 0.35, nextStart),
      confidence: event.confidence,
    };
  });
}

/** Rebuild a renderer/report-safe completed session from the crash snapshot. */
export function buildRecoveredSession(recoverable: RecoverableSession): Session {
  const events = validTranscriptEvents(recoverable);
  const markedIssues = assignMarkedIssueComments(
    recoverable.markedIssues ?? [],
    transcriptSegments(recoverable, events),
    {
      videoStartTime: recoverable.startTime,
      hasAudio: events.length > 0,
    },
  );

  return {
    id: recoverable.id,
    startTime: recoverable.startTime,
    endTime: Math.max(recoverable.startTime, recoverable.lastSaveTime),
    state: 'complete',
    sourceId: recoverable.sourceId,
    feedbackItems: recoverable.feedbackItems.map((item) => ({
      id: item.id,
      timestamp: item.timestamp,
      text: item.text,
      confidence: item.confidence,
    })),
    transcriptBuffer: events,
    screenshotBuffer: [],
    metadata: {
      sourceId: recoverable.sourceId,
      sourceName: recoverable.sourceName,
      sourceType: recoverable.sourceId.startsWith('screen') ? 'screen' : 'window',
      videoStartTime: recoverable.startTime,
      markedIssues,
    },
  };
}

/** Save the recoverable report before clearing crash state, including marked PNGs. */
export async function saveRecoveredSession(
  recoverable: RecoverableSession,
  dependencies: RecoveredSessionSaveDependencies,
): Promise<RecoveredSessionSaveResult> {
  const session = buildRecoveredSession(recoverable);
  const initialDocument = generateDocumentForFileManager(session, {
    projectName: `${recoverable.sourceName || 'Feedback Session'} (Recovered)`,
    screenshotDir: './screenshots',
  });
  const saved = await dependencies.saveSession(session, initialDocument);
  if (!saved.success || !saved.sessionDir || !saved.markdownPath) {
    throw new Error(saved.error || 'Unable to save recovered session report.');
  }

  let finalizedIssues = structuredClone(session.metadata.markedIssues ?? []);
  if (finalizedIssues.length > 0) {
    try {
      finalizedIssues = await dependencies.promoteIssues(
        session.id,
        finalizedIssues,
        saved.sessionDir,
      );
    } catch (error) {
      finalizedIssues = finalizedIssues.map((issue) => ({
        ...issue,
        evidenceWarning: 'Direct marked screenshot could not be restored after the crash.',
      }));
      await dependencies.cleanupSession(session.id).catch(() => undefined);
      console.warn('[Recovery] Failed to restore marked screenshots:', error);
    }
  } else {
    await dependencies.cleanupSession(session.id).catch(() => undefined);
  }

  session.metadata.markedIssues = finalizedIssues;
  const finalizedDocument = generateDocumentForFileManager(session, {
    projectName: `${recoverable.sourceName || 'Feedback Session'} (Recovered)`,
    screenshotDir: './screenshots',
  });
  await fs.writeFile(saved.markdownPath, finalizedDocument.content, 'utf8');
  const screenshotCount = finalizedIssues.filter((issue) => Boolean(issue.screenshotPath)).length;
  await Promise.all([
    syncMarkedIssueMetadata(saved.sessionDir, finalizedIssues, screenshotCount),
    syncExtractedFrameSummary(saved.sessionDir, screenshotCount),
    syncReportScreenshotSummary(saved.markdownPath, screenshotCount),
  ]);

  return {
    session,
    reviewSession: adaptSessionForMarkdown(session),
    reportPath: saved.markdownPath,
    sessionDir: saved.sessionDir,
  };
}
