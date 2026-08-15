import type { CaptureContextSnapshot } from '../../shared/types';
import type { KeyMoment } from './TranscriptAnalyzer';

/** A short delay lets the compositor present the completed stroke before ffmpeg samples it. */
const ANNOTATION_SETTLE_SECONDS = 0.15;

export function captureContextsToKeyMoments(
  contexts: CaptureContextSnapshot[],
  videoStartTime: number,
): KeyMoment[] {
  if (!Number.isFinite(videoStartTime)) return [];
  return contexts
    .filter((context) => context.trigger === 'annotation'
      && Boolean(context.annotation)
      && Number.isFinite(context.recordedAt))
    .map((context): KeyMoment => ({
      timestamp: Math.max(0, (context.recordedAt - videoStartTime) / 1000)
        + ANNOTATION_SETTLE_SECONDS,
      reason: `Annotation completed: ${context.annotation!.tool}`,
      confidence: 1,
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
