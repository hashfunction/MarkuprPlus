import type {
  AnnotationColor,
  AnnotationEvent,
  AnnotationMode,
  AnnotationTool,
  NormalizedPoint,
} from '../../shared/types';

export interface AnnotationOverlayModel {
  sessionId: string;
  mode: AnnotationMode;
  tool: AnnotationTool;
  color: AnnotationColor;
  activeStrokeId: string | null;
  lastPoint: NormalizedPoint | null;
}

export type AnnotationOverlayAction =
  | { type: 'set-mode'; mode: AnnotationMode }
  | { type: 'set-tool'; tool: AnnotationTool }
  | { type: 'set-color'; color: AnnotationColor }
  | { type: 'pointer-down'; strokeId: string; point: NormalizedPoint }
  | { type: 'pointer-move'; point: NormalizedPoint }
  | { type: 'pointer-up'; point: NormalizedPoint }
  | { type: 'pointer-cancel' }
  | { type: 'undo' }
  | { type: 'clear' };

export interface AnnotationOverlayResult {
  model: AnnotationOverlayModel;
  events: AnnotationEvent[];
}

export function normalizeOverlayPoint(
  x: number,
  y: number,
  width: number,
  height: number,
): NormalizedPoint | null {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return {
    x: Math.max(0, Math.min(1, x / width)),
    y: Math.max(0, Math.min(1, y / height)),
  };
}

export function createAnnotationOverlayModel(sessionId: string): AnnotationOverlayModel {
  return {
    sessionId,
    mode: 'interact',
    tool: 'freehand',
    color: '#ff3b30',
    activeStrokeId: null,
    lastPoint: null,
  };
}

function strokeWidth(tool: AnnotationTool): number {
  if (tool === 'highlight') return 0.025;
  if (tool === 'circle') return 0.007;
  return 0.008;
}

function samePoint(left: NormalizedPoint | null, right: NormalizedPoint): boolean {
  return Boolean(left && left.x === right.x && left.y === right.y);
}

export function reduceAnnotationOverlay(
  model: AnnotationOverlayModel,
  action: AnnotationOverlayAction,
): AnnotationOverlayResult {
  if (action.type === 'set-mode') {
    return {
      model: {
        ...model,
        mode: action.mode,
        activeStrokeId: action.mode === 'interact' ? null : model.activeStrokeId,
        lastPoint: action.mode === 'interact' ? null : model.lastPoint,
      },
      events: [],
    };
  }
  if (action.type === 'set-tool') {
    return { model: { ...model, tool: action.tool }, events: [] };
  }
  if (action.type === 'set-color') {
    return { model: { ...model, color: action.color }, events: [] };
  }
  if (action.type === 'undo' || action.type === 'clear') {
    return {
      model: { ...model, activeStrokeId: null, lastPoint: null },
      events: [{ type: action.type, sessionId: model.sessionId }],
    };
  }
  if (action.type === 'pointer-cancel') {
    return {
      model: { ...model, activeStrokeId: null, lastPoint: null },
      events: model.activeStrokeId
        ? [{ type: 'stroke-end', sessionId: model.sessionId, strokeId: model.activeStrokeId }]
        : [],
    };
  }
  if (model.mode !== 'draw') return { model, events: [] };

  if (action.type === 'pointer-down') {
    if (model.activeStrokeId) return { model, events: [] };
    return {
      model: { ...model, activeStrokeId: action.strokeId, lastPoint: action.point },
      events: [{
        type: 'stroke-start',
        sessionId: model.sessionId,
        stroke: {
          id: action.strokeId,
          tool: model.tool,
          color: model.color,
          width: strokeWidth(model.tool),
          points: [action.point],
        },
      }],
    };
  }

  if (!model.activeStrokeId) return { model, events: [] };
  if (action.type === 'pointer-move') {
    if (samePoint(model.lastPoint, action.point)) return { model, events: [] };
    return {
      model: { ...model, lastPoint: action.point },
      events: [{
        type: 'stroke-points',
        sessionId: model.sessionId,
        strokeId: model.activeStrokeId,
        points: [action.point],
      }],
    };
  }

  const points: AnnotationEvent[] = samePoint(model.lastPoint, action.point) ? [] : [{
    type: 'stroke-points',
    sessionId: model.sessionId,
    strokeId: model.activeStrokeId,
    points: [action.point],
  }];
  return {
    model: { ...model, activeStrokeId: null, lastPoint: null },
    events: [
      ...points,
      { type: 'stroke-end', sessionId: model.sessionId, strokeId: model.activeStrokeId },
    ],
  };
}
