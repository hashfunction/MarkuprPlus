import { describe, expect, it, vi } from 'vitest';
import type { AnnotationEvent, CaptureTarget } from '../../src/shared/types';
import {
  AnnotationCueTracker,
  captureSourceType,
  resolveCaptureTarget,
} from '../../src/main/capture/CaptureSessionLifecycle';

const regionTarget: CaptureTarget = {
  kind: 'region',
  sourceId: 'screen:0:0',
  sourceName: 'Primary Display',
  displayId: '1',
  displayBounds: { x: 0, y: 0, width: 1920, height: 1080 },
  scaleFactor: 2,
  region: { x: 100, y: 120, width: 800, height: 500 },
};

describe('CaptureSessionLifecycle', () => {
  it('uses the explicit target without opening a selector', async () => {
    const selectTarget = vi.fn();

    await expect(resolveCaptureTarget(regionTarget, selectTarget)).resolves.toBe(regionTarget);
    expect(selectTarget).not.toHaveBeenCalled();
  });

  it('opens the selector when start has no explicit target and preserves cancellation', async () => {
    const selectTarget = vi.fn(() => Promise.resolve(null));

    await expect(resolveCaptureTarget(undefined, selectTarget)).resolves.toBeNull();
    expect(selectTarget).toHaveBeenCalledOnce();
  });

  it('reports region as its own source type', () => {
    expect(captureSourceType(regionTarget)).toBe('region');
    expect(captureSourceType({ ...regionTarget, kind: 'screen' } as CaptureTarget)).toBe('screen');
  });

  it('turns a completed annotation stroke into a report cue', () => {
    const tracker = new AnnotationCueTracker();
    const start: AnnotationEvent = {
      type: 'stroke-start',
      sessionId: 'session-1',
      stroke: {
        id: 'stroke-1',
        tool: 'circle',
        color: '#ff3b30',
        width: 0.01,
        points: [{ x: 0.2, y: 0.3 }],
      },
    };

    expect(tracker.consume(start, 1_000)).toBeNull();
    expect(tracker.consume({
      type: 'stroke-end',
      sessionId: 'session-1',
      strokeId: 'stroke-1',
    }, 1_250)).toEqual({
      recordedAt: 1_250,
      trigger: 'annotation',
      annotation: { strokeId: 'stroke-1', tool: 'circle', color: '#ff3b30' },
    });
  });

  it('does not create cues for mismatched, invalidated, or duplicate stroke ends', () => {
    const tracker = new AnnotationCueTracker();
    tracker.consume({
      type: 'stroke-start',
      sessionId: 'session-1',
      stroke: {
        id: 'stroke-1', tool: 'highlight', color: '#ffcc00', width: 0.02,
        points: [{ x: 0.1, y: 0.1 }],
      },
    }, 10);

    expect(tracker.consume({
      type: 'stroke-end', sessionId: 'session-2', strokeId: 'stroke-1',
    }, 20)).toBeNull();
    tracker.consume({ type: 'clear', sessionId: 'session-1' }, 30);
    expect(tracker.consume({
      type: 'stroke-end', sessionId: 'session-1', strokeId: 'stroke-1',
    }, 40)).toBeNull();
  });
});
