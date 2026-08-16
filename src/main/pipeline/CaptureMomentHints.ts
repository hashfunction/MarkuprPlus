import type { CaptureContextSnapshot, MarkedIssuePayload } from '../../shared/types';
import type { KeyMoment } from './TranscriptAnalyzer';
import { basename } from 'node:path';

interface MarkedIssueFrame {
  path: string;
  markedIssueId?: string;
}

export function attachFallbackFramesToMarkedIssues(
  issues: MarkedIssuePayload[],
  frames: MarkedIssueFrame[],
): MarkedIssuePayload[] {
  const frameByIssueId = new Map(
    frames
      .filter((frame): frame is MarkedIssueFrame & { markedIssueId: string } =>
        Boolean(frame.markedIssueId))
      .map((frame) => [frame.markedIssueId, frame]),
  );

  return structuredClone(issues).map((issue) => {
    if (issue.screenshotPath) return issue;
    const fallback = frameByIssueId.get(issue.id);
    if (fallback) {
      issue.screenshotPath = `screenshots/${basename(fallback.path)}`;
      delete issue.evidenceWarning;
      return issue;
    }
    issue.evidenceWarning = 'No marked screenshot could be recovered for this issue.';
    return issue;
  });
}

export function captureContextsToKeyMoments(
  _contexts: CaptureContextSnapshot[],
  videoStartTime: number,
  markedIssues: MarkedIssuePayload[] = [],
): KeyMoment[] {
  if (!Number.isFinite(videoStartTime)) return [];
  return markedIssues
    .filter((issue) => !issue.screenshotPath && Number.isFinite(issue.fallbackVideoTimestamp))
    .map((issue): KeyMoment => ({
      timestamp: Math.max(0, issue.fallbackVideoTimestamp),
      reason: `Marked issue MX-${String(issue.ordinal).padStart(3, '0')}`,
      confidence: 1,
      markedIssueId: issue.id,
    }))
    .sort((left, right) => left.timestamp - right.timestamp);
}

export function nearestCaptureContext(
  frameTimestampSeconds: number,
  videoStartTime: number,
  contexts: CaptureContextSnapshot[],
  maxDistanceMs = 5_000,
): CaptureContextSnapshot | undefined {
  if (!Number.isFinite(frameTimestampSeconds) || !Number.isFinite(videoStartTime)) return undefined;
  const frameAt = videoStartTime + frameTimestampSeconds * 1000;
  let nearest: CaptureContextSnapshot | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const context of contexts) {
    if (!Number.isFinite(context.recordedAt)) continue;
    const distance = Math.abs(frameAt - context.recordedAt);
    if (distance < nearestDistance) {
      nearest = context;
      nearestDistance = distance;
    }
  }
  return nearest && nearestDistance <= maxDistanceMs ? nearest : undefined;
}
