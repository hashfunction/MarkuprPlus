import { describe, expect, it } from 'vitest';
import type { AnnotationEvent, AnnotationStroke } from '../../src/shared/types';
import {
  createAnnotationScene,
  drawAnnotationScene,
  reduceAnnotationEvent,
} from '../../src/renderer/capture/annotationScene';

const stroke: AnnotationStroke = {
  id: 'stroke-1',
  tool: 'freehand',
  color: '#ff3b30',
  width: 0.01,
  points: [{ x: 0.1, y: 0.2 }],
};

function event(value: Omit<AnnotationEvent, 'sessionId'>): AnnotationEvent {
  return { ...value, sessionId: 'session-1' } as AnnotationEvent;
}

describe('annotation scene reducer', () => {
  it('starts, appends, and completes a freehand stroke', () => {
    let scene = createAnnotationScene();
    scene = reduceAnnotationEvent(scene, event({ type: 'stroke-start', stroke }));
    scene = reduceAnnotationEvent(scene, event({
      type: 'stroke-points',
      strokeId: stroke.id,
      points: [{ x: 0.4, y: 0.5 }],
    }));
    scene = reduceAnnotationEvent(scene, event({ type: 'stroke-end', strokeId: stroke.id }));

    expect(scene.activeStroke).toBeNull();
    expect(scene.completedStrokes).toEqual([{
      ...stroke,
      points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }],
    }]);
  });

  it('rejects out-of-range points instead of drawing outside the selected source', () => {
    let scene = reduceAnnotationEvent(createAnnotationScene(), event({ type: 'stroke-start', stroke }));
    scene = reduceAnnotationEvent(scene, event({
      type: 'stroke-points',
      strokeId: stroke.id,
      points: [{ x: -0.1, y: 0.5 }, { x: 0.5, y: 1.1 }],
    }));

    expect(scene.activeStroke?.points).toEqual([{ x: 0.1, y: 0.2 }]);
  });

  it('caps long strokes at 2,000 points while preserving the first and final endpoints', () => {
    const points = Array.from({ length: 2_100 }, (_, index) => ({
      x: index / 2_100,
      y: 0.5,
    }));
    let scene = reduceAnnotationEvent(createAnnotationScene(), event({ type: 'stroke-start', stroke }));
    scene = reduceAnnotationEvent(scene, event({ type: 'stroke-points', strokeId: stroke.id, points }));

    expect(scene.activeStroke?.points).toHaveLength(2_000);
    expect(scene.activeStroke?.points[0]).toEqual(stroke.points[0]);
    expect(scene.activeStroke?.points.at(-1)).toEqual(points.at(-1));
  });

  it('requires two points before completing a circle', () => {
    const circle = { ...stroke, tool: 'circle' as const };
    let scene = reduceAnnotationEvent(createAnnotationScene(), event({ type: 'stroke-start', stroke: circle }));
    scene = reduceAnnotationEvent(scene, event({ type: 'stroke-end', strokeId: circle.id }));

    expect(scene.completedStrokes).toEqual([]);
  });

  it('undo removes only the newest completed stroke and clear resets all drawing state', () => {
    let scene = createAnnotationScene();
    for (const id of ['one', 'two']) {
      const next = { ...stroke, id };
      scene = reduceAnnotationEvent(scene, event({ type: 'stroke-start', stroke: next }));
      scene = reduceAnnotationEvent(scene, event({ type: 'stroke-points', strokeId: id, points: [{ x: 0.8, y: 0.8 }] }));
      scene = reduceAnnotationEvent(scene, event({ type: 'stroke-end', strokeId: id }));
    }

    scene = reduceAnnotationEvent(scene, event({ type: 'undo' }));
    expect(scene.completedStrokes.map((item) => item.id)).toEqual(['one']);
    scene = reduceAnnotationEvent(scene, event({ type: 'clear' }));
    expect(scene).toEqual(createAnnotationScene());
  });

  it('caps retained completed strokes to the newest 250', () => {
    let scene = createAnnotationScene();
    for (let index = 0; index < 260; index += 1) {
      const id = `stroke-${index}`;
      scene = reduceAnnotationEvent(scene, event({
        type: 'stroke-start',
        stroke: { ...stroke, id },
      }));
      scene = reduceAnnotationEvent(scene, event({
        type: 'stroke-points', strokeId: id, points: [{ x: 0.8, y: 0.8 }],
      }));
      scene = reduceAnnotationEvent(scene, event({ type: 'stroke-end', strokeId: id }));
    }

    expect(scene.completedStrokes).toHaveLength(250);
    expect(scene.completedStrokes[0].id).toBe('stroke-10');
    expect(scene.completedStrokes.at(-1)?.id).toBe('stroke-259');
  });

  it('coalesces marker updates to the latest normalized cursor point', () => {
    let scene = reduceAnnotationEvent(createAnnotationScene(), event({ type: 'cursor', point: { x: 0.2, y: 0.3 } }));
    scene = reduceAnnotationEvent(scene, event({ type: 'cursor', point: { x: 0.7, y: 0.8 } }));

    expect(scene.cursor).toEqual({ x: 0.7, y: 0.8 });
  });
});

describe('annotation scene rendering', () => {
  it('renders translucent highlights before the marker halo', () => {
    const operations: string[] = [];
    const context = {
      save: () => operations.push('save'),
      restore: () => operations.push('restore'),
      beginPath: () => operations.push('begin'),
      moveTo: () => operations.push('move'),
      lineTo: () => operations.push('line'),
      stroke: () => operations.push('stroke'),
      arc: () => operations.push('arc'),
      ellipse: () => operations.push('ellipse'),
      fill: () => operations.push('fill'),
      set strokeStyle(value: string) { operations.push(`strokeStyle:${value}`); },
      set fillStyle(value: string) { operations.push(`fillStyle:${value}`); },
      set lineWidth(value: number) { operations.push(`lineWidth:${value}`); },
      set lineCap(value: string) { operations.push(`lineCap:${value}`); },
      set lineJoin(value: string) { operations.push(`lineJoin:${value}`); },
      set globalAlpha(value: number) { operations.push(`alpha:${value}`); },
    } as unknown as CanvasRenderingContext2D;
    const highlight: AnnotationStroke = {
      id: 'highlight', tool: 'highlight', color: '#ffcc00', width: 0.04,
      points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }],
    };
    const scene = {
      completedStrokes: [highlight],
      activeStroke: null,
      cursor: { x: 0.5, y: 0.5 },
    };

    drawAnnotationScene(context, scene, { width: 1000, height: 500 });

    expect(operations).toContain('alpha:0.32');
    expect(operations.indexOf('strokeStyle:#ffcc00')).toBeLessThan(operations.lastIndexOf('strokeStyle:#ff3b30'));
    expect(operations.at(-1)).toBe('restore');
  });
});
