import { describe, expect, it } from 'vitest';
import {
  createAnnotationOverlayModel,
  normalizeOverlayPoint,
  reduceAnnotationOverlay,
} from '../../src/renderer/overlays/annotationOverlayModel';

describe('annotationOverlayModel', () => {
  it('normalizes and clamps pointer positions to the selected area', () => {
    expect(normalizeOverlayPoint(50, 25, 200, 100)).toEqual({ x: 0.25, y: 0.25 });
    expect(normalizeOverlayPoint(-4, 150, 200, 100)).toEqual({ x: 0, y: 1 });
    expect(normalizeOverlayPoint(1, 1, 0, 0)).toBeNull();
  });

  it('does not emit drawing events in interact mode', () => {
    const model = createAnnotationOverlayModel('session-1');
    const result = reduceAnnotationOverlay(model, {
      type: 'pointer-down', strokeId: 'stroke-1', point: { x: 0.1, y: 0.2 },
    });

    expect(result.events).toEqual([]);
    expect(result.model.activeStrokeId).toBeNull();
  });

  it('emits a complete freehand stroke in draw mode', () => {
    let model = reduceAnnotationOverlay(createAnnotationOverlayModel('session-1'), {
      type: 'set-mode', mode: 'draw',
    }).model;
    let result = reduceAnnotationOverlay(model, {
      type: 'pointer-down', strokeId: 'stroke-1', point: { x: 0.1, y: 0.2 },
    });
    model = result.model;
    expect(result.events[0]).toMatchObject({
      type: 'stroke-start', sessionId: 'session-1',
      stroke: { id: 'stroke-1', tool: 'freehand', color: '#ff3b30' },
    });

    result = reduceAnnotationOverlay(model, {
      type: 'pointer-move', point: { x: 0.3, y: 0.4 },
    });
    model = result.model;
    expect(result.events).toEqual([{
      type: 'stroke-points', sessionId: 'session-1', strokeId: 'stroke-1',
      points: [{ x: 0.3, y: 0.4 }],
    }]);

    result = reduceAnnotationOverlay(model, {
      type: 'pointer-up', point: { x: 0.5, y: 0.6 },
    });
    expect(result.events).toEqual([
      {
        type: 'stroke-points', sessionId: 'session-1', strokeId: 'stroke-1',
        points: [{ x: 0.5, y: 0.6 }],
      },
      { type: 'stroke-end', sessionId: 'session-1', strokeId: 'stroke-1' },
    ]);
    expect(result.model.activeStrokeId).toBeNull();
  });

  it('uses selected tools and colors for new strokes', () => {
    let model = createAnnotationOverlayModel('session-1');
    model = reduceAnnotationOverlay(model, { type: 'set-mode', mode: 'draw' }).model;
    model = reduceAnnotationOverlay(model, { type: 'set-tool', tool: 'circle' }).model;
    model = reduceAnnotationOverlay(model, { type: 'set-color', color: '#0a84ff' }).model;
    const result = reduceAnnotationOverlay(model, {
      type: 'pointer-down', strokeId: 'circle-1', point: { x: 0.2, y: 0.2 },
    });

    expect(result.events[0]).toMatchObject({
      stroke: { id: 'circle-1', tool: 'circle', color: '#0a84ff' },
    });
  });

  it('emits undo and clear commands and cancels an active stroke on interact', () => {
    let model = reduceAnnotationOverlay(createAnnotationOverlayModel('session-1'), {
      type: 'set-mode', mode: 'draw',
    }).model;
    model = reduceAnnotationOverlay(model, {
      type: 'pointer-down', strokeId: 'stroke-1', point: { x: 0.1, y: 0.1 },
    }).model;

    const interact = reduceAnnotationOverlay(model, { type: 'set-mode', mode: 'interact' });
    expect(interact.model.activeStrokeId).toBeNull();
    expect(reduceAnnotationOverlay(interact.model, { type: 'undo' }).events)
      .toEqual([{ type: 'undo', sessionId: 'session-1' }]);
    expect(reduceAnnotationOverlay(interact.model, { type: 'clear' }).events)
      .toEqual([{ type: 'clear', sessionId: 'session-1' }]);
  });
});
