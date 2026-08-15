import { describe, expect, it } from 'vitest';
import type { AnnotationEvent } from '../../src/shared/types';
import { appendCoalescedAnnotationEvents } from '../../src/renderer/overlays/annotationEventQueue';

describe('appendCoalescedAnnotationEvents', () => {
  it('coalesces rapid pointer points into bounded IPC batches without crossing stroke boundaries', () => {
    const queue: AnnotationEvent[] = [{
      type: 'stroke-points', sessionId: 'session-1', strokeId: 'one',
      points: Array.from({ length: 255 }, () => ({ x: 0.2, y: 0.3 })),
    }];
    const next = appendCoalescedAnnotationEvents(queue, [{
      type: 'stroke-points', sessionId: 'session-1', strokeId: 'one',
      points: [{ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.7 }],
    }, {
      type: 'stroke-end', sessionId: 'session-1', strokeId: 'one',
    }]);

    expect(next).toHaveLength(3);
    expect(next[0].type === 'stroke-points' && next[0].points).toHaveLength(256);
    expect(next[1]).toMatchObject({ type: 'stroke-points', strokeId: 'one', points: [{ x: 0.6, y: 0.7 }] });
    expect(next[2]).toMatchObject({ type: 'stroke-end', strokeId: 'one' });
  });
});
