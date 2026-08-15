import type { AnnotationEvent, NormalizedPoint } from '../../shared/types';

const MAX_POINTS_PER_EVENT = 256;

/** Merge dense pointer moves into bounded stroke-point messages for one frame. */
export function appendCoalescedAnnotationEvents(
  queued: AnnotationEvent[],
  incoming: AnnotationEvent[],
): AnnotationEvent[] {
  const next = [...queued];

  for (const event of incoming) {
    if (event.type !== 'stroke-points') {
      next.push(event);
      continue;
    }

    let remaining: NormalizedPoint[] = [...event.points];
    while (remaining.length > 0) {
      const last = next.at(-1);
      if (last?.type === 'stroke-points'
        && last.sessionId === event.sessionId
        && last.strokeId === event.strokeId
        && last.points.length < MAX_POINTS_PER_EVENT) {
        const available = MAX_POINTS_PER_EVENT - last.points.length;
        const appended = remaining.slice(0, available);
        next[next.length - 1] = { ...last, points: [...last.points, ...appended] };
        remaining = remaining.slice(available);
        continue;
      }

      next.push({ ...event, points: remaining.slice(0, MAX_POINTS_PER_EVENT) });
      remaining = remaining.slice(MAX_POINTS_PER_EVENT);
    }
  }

  return next;
}
