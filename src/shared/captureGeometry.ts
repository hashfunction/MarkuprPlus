import type {
  AnnotationEvent,
  CapturableWindow,
  CaptureBounds,
  CaptureDisplay,
  CapturePoint,
  CaptureTarget,
} from './types';

const MIN_REGION_SIZE = 32;
const MAX_ANNOTATION_BATCH_POINTS = 256;
const ANNOTATION_TOOLS = new Set(['freehand', 'circle', 'highlight']);
const ANNOTATION_COLORS = new Set(['#ff3b30', '#ffcc00', '#34c759', '#0a84ff']);

interface DisplayDescription {
  id: string | number;
  label?: string;
  bounds: CaptureBounds;
  scaleFactor: number;
}

interface ScreenSourceDescription {
  id: string;
  name: string;
  displayId?: string;
}

function isFiniteNumber(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isFiniteBounds(bounds: CaptureBounds): boolean {
  return isFiniteNumber(bounds.x)
    && isFiniteNumber(bounds.y)
    && isFiniteNumber(bounds.width)
    && isFiniteNumber(bounds.height)
    && bounds.width > 0
    && bounds.height > 0;
}

function isNormalizedPoint(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const point = value as { x?: unknown; y?: unknown };
  return typeof point.x === 'number' && Number.isFinite(point.x)
    && typeof point.y === 'number' && Number.isFinite(point.y)
    && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

function validIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 160;
}

function validPointBatch(value: unknown, allowEmpty = false): boolean {
  return Array.isArray(value)
    && (allowEmpty || value.length > 0)
    && value.length <= MAX_ANNOTATION_BATCH_POINTS
    && value.every(isNormalizedPoint);
}

/** Validate renderer-supplied annotation IPC before it reaches host or compositor state. */
export function validateAnnotationEvent(value: unknown): value is AnnotationEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  if (!validIdentifier(event.sessionId) || typeof event.type !== 'string') return false;

  if (event.type === 'cursor') return event.point === null || isNormalizedPoint(event.point);
  if (event.type === 'stroke-start') {
    if (!event.stroke || typeof event.stroke !== 'object') return false;
    const stroke = event.stroke as Record<string, unknown>;
    return validIdentifier(stroke.id)
      && ANNOTATION_TOOLS.has(String(stroke.tool))
      && ANNOTATION_COLORS.has(String(stroke.color))
      && typeof stroke.width === 'number'
      && Number.isFinite(stroke.width)
      && stroke.width >= 0.001
      && stroke.width <= 0.1
      && validPointBatch(stroke.points);
  }
  if (event.type === 'stroke-points') {
    return validIdentifier(event.strokeId) && validPointBatch(event.points);
  }
  if (event.type === 'stroke-end') return validIdentifier(event.strokeId);
  if (event.type === 'undo' || event.type === 'clear') return true;
  if (event.type === 'mode') return event.mode === 'interact' || event.mode === 'draw';
  if (event.type === 'bounds') {
    return Boolean(event.bounds && typeof event.bounds === 'object')
      && isFiniteBounds(event.bounds as CaptureBounds);
  }
  return false;
}

export function findWindowAtPoint(
  windows: CapturableWindow[],
  point: CapturePoint,
): CapturableWindow | null {
  if (!isFiniteNumber(point.x) || !isFiniteNumber(point.y)) return null;

  return windows.find(({ bounds }) =>
    isFiniteBounds(bounds)
    && point.x >= bounds.x
    && point.y >= bounds.y
    && point.x < bounds.x + bounds.width
    && point.y < bounds.y + bounds.height
  ) || null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeRegion(
  start: CapturePoint,
  end: CapturePoint,
  displayBounds: CaptureBounds,
): CaptureBounds | null {
  if (!isFiniteBounds(displayBounds)
    || !isFiniteNumber(start.x)
    || !isFiniteNumber(start.y)
    || !isFiniteNumber(end.x)
    || !isFiniteNumber(end.y)) {
    return null;
  }

  const left = clamp(Math.min(start.x, end.x), displayBounds.x, displayBounds.x + displayBounds.width);
  const top = clamp(Math.min(start.y, end.y), displayBounds.y, displayBounds.y + displayBounds.height);
  const right = clamp(Math.max(start.x, end.x), displayBounds.x, displayBounds.x + displayBounds.width);
  const bottom = clamp(Math.max(start.y, end.y), displayBounds.y, displayBounds.y + displayBounds.height);
  const width = Math.round(right - left);
  const height = Math.round(bottom - top);

  if (width < MIN_REGION_SIZE || height < MIN_REGION_SIZE) return null;

  return {
    x: Math.round(left - displayBounds.x),
    y: Math.round(top - displayBounds.y),
    width,
    height,
  };
}

export function regionToSourceCrop(
  target: CaptureTarget,
  videoSize: { width: number; height: number },
): CaptureBounds {
  if (target.kind !== 'region') {
    return { x: 0, y: 0, width: videoSize.width, height: videoSize.height };
  }

  const scaleX = videoSize.width / target.displayBounds.width;
  const scaleY = videoSize.height / target.displayBounds.height;
  return {
    x: Math.round(target.region.x * scaleX),
    y: Math.round(target.region.y * scaleY),
    width: Math.round(target.region.width * scaleX),
    height: Math.round(target.region.height * scaleY),
  };
}

export function containRect(
  source: { width: number; height: number },
  destination: { width: number; height: number },
): CaptureBounds {
  if (source.width <= 0 || source.height <= 0 || destination.width <= 0 || destination.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const scale = Math.min(destination.width / source.width, destination.height / source.height);
  // Multiplication can overshoot the constraining edge by an IEEE-754 epsilon
  // (for example 1920 * (1000 / 1920) === 1000.0000000000001). Clamp the
  // result so canvas destination coordinates never become subtly negative.
  const width = Math.min(destination.width, source.width * scale);
  const height = Math.min(destination.height, source.height * scale);
  return {
    x: Math.max(0, (destination.width - width) / 2),
    y: Math.max(0, (destination.height - height) / 2),
    width,
    height,
  };
}

function sameBounds(left: CaptureBounds, right: CaptureBounds): boolean {
  return left.x === right.x
    && left.y === right.y
    && left.width === right.width
    && left.height === right.height;
}

/**
 * Pair Electron displays to desktop capture sources without relying on list
 * order. Recording the wrong display is a privacy boundary, so ambiguous
 * multi-display results are deliberately omitted. A single-display machine is
 * the only safe case for a source without platform display metadata.
 */
export function matchCaptureDisplays(
  displays: DisplayDescription[],
  screenSources: ScreenSourceDescription[],
  primaryDisplayId: string,
): CaptureDisplay[] {
  const singleDisplayFallback = displays.length === 1 && screenSources.length === 1
    ? screenSources[0]
    : null;

  return displays.flatMap((display, index): CaptureDisplay[] => {
    const displayId = String(display.id);
    const exactMatches = screenSources.filter((source) => source.displayId === displayId);
    const source = exactMatches.length === 1 ? exactMatches[0] : singleDisplayFallback;
    if (!source) return [];

    return [{
      id: displayId,
      label: display.label || source.name || `Display ${index + 1}`,
      sourceId: source.id,
      sourceName: source.name,
      bounds: { ...display.bounds },
      scaleFactor: display.scaleFactor,
      isPrimary: displayId === primaryDisplayId,
    }];
  });
}

/** Compare the discriminated capture-target payload field by field. */
export function sameCaptureTarget(left: CaptureTarget, right: CaptureTarget): boolean {
  if (left.kind !== right.kind
    || left.sourceId !== right.sourceId
    || left.sourceName !== right.sourceName) {
    return false;
  }

  if (left.kind === 'window' && right.kind === 'window') {
    return left.nativeWindowId === right.nativeWindowId
      && left.appName === right.appName
      && left.geometryAvailable === right.geometryAvailable
      && sameBounds(left.bounds, right.bounds);
  }

  if (left.kind === 'screen' && right.kind === 'screen') {
    return left.displayId === right.displayId
      && left.scaleFactor === right.scaleFactor
      && sameBounds(left.displayBounds, right.displayBounds);
  }

  if (left.kind === 'region' && right.kind === 'region') {
    return left.displayId === right.displayId
      && left.scaleFactor === right.scaleFactor
      && sameBounds(left.displayBounds, right.displayBounds)
      && sameBounds(left.region, right.region);
  }

  return false;
}

export function validateCaptureTarget(
  target: CaptureTarget,
  displays: CaptureDisplay[],
): boolean {
  if (!target || typeof target.sourceId !== 'string' || !target.sourceId
    || typeof target.sourceName !== 'string' || !target.sourceName) {
    return false;
  }

  if (target.kind === 'window') {
    return target.sourceId.startsWith('window:')
      && target.nativeWindowId.length > 0
      && target.appName.length > 0
      && isFiniteBounds(target.bounds);
  }

  const display = displays.find((candidate) =>
    candidate.id === target.displayId && candidate.sourceId === target.sourceId
  );
  if (!display || !sameBounds(display.bounds, target.displayBounds)) return false;
  if (!isFiniteNumber(target.scaleFactor) || target.scaleFactor <= 0) return false;

  if (target.kind === 'screen') return target.sourceId.startsWith('screen:');

  return isFiniteBounds(target.region)
    && target.region.width >= MIN_REGION_SIZE
    && target.region.height >= MIN_REGION_SIZE
    && target.region.x >= 0
    && target.region.y >= 0
    && target.region.x + target.region.width <= display.bounds.width
    && target.region.y + target.region.height <= display.bounds.height;
}
