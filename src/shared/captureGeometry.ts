import type {
  CapturableWindow,
  CaptureBounds,
  CaptureDisplay,
  CapturePoint,
  CaptureTarget,
} from './types';

const MIN_REGION_SIZE = 32;

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
