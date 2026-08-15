import type {
  AnnotationColor,
  AnnotationEvent,
  AnnotationStroke,
  NormalizedPoint,
} from '../../shared/types';

export interface AnnotationScene {
  completedStrokes: AnnotationStroke[];
  activeStroke: AnnotationStroke | null;
  cursor: NormalizedPoint | null;
}

const MAX_STROKE_POINTS = 2_000;
const ALLOWED_COLORS = new Set<AnnotationColor>(['#ff3b30', '#ffcc00', '#34c759', '#0a84ff']);
const ALLOWED_TOOLS = new Set(['freehand', 'circle', 'highlight']);

export function createAnnotationScene(): AnnotationScene {
  return { completedStrokes: [], activeStroke: null, cursor: null };
}

function validPoint(point: NormalizedPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

function validStroke(stroke: AnnotationStroke): boolean {
  return Boolean(stroke.id)
    && ALLOWED_TOOLS.has(stroke.tool)
    && ALLOWED_COLORS.has(stroke.color)
    && Number.isFinite(stroke.width)
    && stroke.width >= 0.001
    && stroke.width <= 0.1
    && stroke.points.length > 0
    && stroke.points.every(validPoint);
}

function capPoints(points: NormalizedPoint[]): NormalizedPoint[] {
  if (points.length <= MAX_STROKE_POINTS) return points;
  const first = points[0];
  const last = points[points.length - 1];
  const interior = points.slice(1, -1);
  const retained: NormalizedPoint[] = [first];
  const targetInterior = MAX_STROKE_POINTS - 2;
  const step = interior.length / targetInterior;
  for (let index = 0; index < targetInterior; index += 1) {
    retained.push(interior[Math.min(interior.length - 1, Math.floor(index * step))]);
  }
  retained.push(last);
  return retained;
}

function enoughPoints(stroke: AnnotationStroke): boolean {
  return stroke.points.length >= 2;
}

export function reduceAnnotationEvent(
  scene: AnnotationScene,
  event: AnnotationEvent,
): AnnotationScene {
  switch (event.type) {
    case 'cursor':
      return { ...scene, cursor: event.point && validPoint(event.point) ? event.point : null };
    case 'stroke-start':
      return validStroke(event.stroke)
        ? { ...scene, activeStroke: { ...event.stroke, points: [...event.stroke.points] } }
        : scene;
    case 'stroke-points': {
      if (!scene.activeStroke || scene.activeStroke.id !== event.strokeId) return scene;
      const validPoints = event.points.filter(validPoint);
      if (validPoints.length === 0) return scene;
      return {
        ...scene,
        activeStroke: {
          ...scene.activeStroke,
          points: capPoints([...scene.activeStroke.points, ...validPoints]),
        },
      };
    }
    case 'stroke-end': {
      if (!scene.activeStroke || scene.activeStroke.id !== event.strokeId) return scene;
      return {
        ...scene,
        completedStrokes: enoughPoints(scene.activeStroke)
          ? [...scene.completedStrokes, scene.activeStroke]
          : scene.completedStrokes,
        activeStroke: null,
      };
    }
    case 'undo':
      return { ...scene, completedStrokes: scene.completedStrokes.slice(0, -1), activeStroke: null };
    case 'clear':
      return createAnnotationScene();
    case 'mode':
      return event.mode === 'interact' ? { ...scene, activeStroke: null } : scene;
    case 'bounds':
      return scene;
    default:
      return scene;
  }
}

function drawLineStroke(
  context: CanvasRenderingContext2D,
  stroke: AnnotationStroke,
  viewport: { width: number; height: number },
): void {
  if (stroke.points.length < 2) return;
  context.beginPath();
  stroke.points.forEach((point, index) => {
    const x = point.x * viewport.width;
    const y = point.y * viewport.height;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
}

function drawCircleStroke(
  context: CanvasRenderingContext2D,
  stroke: AnnotationStroke,
  viewport: { width: number; height: number },
): void {
  if (stroke.points.length < 2) return;
  const first = stroke.points[0];
  const last = stroke.points[stroke.points.length - 1];
  const left = Math.min(first.x, last.x) * viewport.width;
  const top = Math.min(first.y, last.y) * viewport.height;
  const width = Math.abs(last.x - first.x) * viewport.width;
  const height = Math.abs(last.y - first.y) * viewport.height;
  context.beginPath();
  context.ellipse(left + width / 2, top + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  context.stroke();
}

function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: AnnotationStroke,
  viewport: { width: number; height: number },
): void {
  context.save();
  context.strokeStyle = stroke.color;
  context.lineWidth = Math.max(2, stroke.width * Math.min(viewport.width, viewport.height));
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.globalAlpha = stroke.tool === 'highlight' ? 0.32 : 1;
  if (stroke.tool === 'circle') drawCircleStroke(context, stroke, viewport);
  else drawLineStroke(context, stroke, viewport);
  context.restore();
}

function drawMarker(
  context: CanvasRenderingContext2D,
  point: NormalizedPoint,
  viewport: { width: number; height: number },
): void {
  const x = point.x * viewport.width;
  const y = point.y * viewport.height;
  const radius = Math.max(9, Math.min(18, Math.min(viewport.width, viewport.height) * 0.018));
  context.save();
  context.globalAlpha = 1;
  context.strokeStyle = '#ff3b30';
  context.fillStyle = '#ff3b30';
  context.lineWidth = Math.max(2, radius * 0.2);
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(x, y, Math.max(2, radius * 0.18), 0, Math.PI * 2);
  context.fill();
  context.restore();
}

export function drawAnnotationScene(
  context: CanvasRenderingContext2D,
  scene: AnnotationScene,
  viewport: { width: number; height: number },
): void {
  for (const stroke of scene.completedStrokes) drawStroke(context, stroke, viewport);
  if (scene.activeStroke) drawStroke(context, scene.activeStroke, viewport);
  if (scene.cursor) drawMarker(context, scene.cursor, viewport);
}
