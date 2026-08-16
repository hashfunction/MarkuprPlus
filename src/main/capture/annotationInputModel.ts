import type { CaptureBounds, NormalizedPoint } from '../../shared/types';

export interface GlobalAnnotationInputSample {
  sequence: number;
  modifierDown: boolean;
  primaryDown: boolean;
  cursor: { x: number; y: number };
  capturedAt: number;
}

export type AnnotationInputAction =
  | { type: 'modifier-down' }
  | { type: 'modifier-up'; point: NormalizedPoint | null }
  | { type: 'plain-primary-down'; point: NormalizedPoint | null };

function validSample(sample: GlobalAnnotationInputSample): boolean {
  return Number.isSafeInteger(sample.sequence)
    && sample.sequence >= 0
    && typeof sample.modifierDown === 'boolean'
    && typeof sample.primaryDown === 'boolean'
    && Number.isFinite(sample.cursor.x)
    && Number.isFinite(sample.cursor.y)
    && Number.isFinite(sample.capturedAt)
    && sample.capturedAt >= 0;
}

function normalizeScreenPoint(
  point: GlobalAnnotationInputSample['cursor'],
  bounds: CaptureBounds,
): NormalizedPoint | null {
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    || bounds.width <= 0
    || bounds.height <= 0
    || point.x < bounds.x
    || point.y < bounds.y
    || point.x >= bounds.x + bounds.width
    || point.y >= bounds.y + bounds.height) {
    return null;
  }
  return {
    x: (point.x - bounds.x) / bounds.width,
    y: (point.y - bounds.y) / bounds.height,
  };
}

export function reduceAnnotationInput(
  previous: GlobalAnnotationInputSample | null,
  next: GlobalAnnotationInputSample,
  bounds: CaptureBounds,
): AnnotationInputAction[] {
  if (!validSample(next) || !previous || next.sequence <= previous.sequence) return [];

  const point = normalizeScreenPoint(next.cursor, bounds);
  const actions: AnnotationInputAction[] = [];

  if (!previous.modifierDown && next.modifierDown) {
    actions.push({ type: 'modifier-down' });
  }
  if (previous.modifierDown && !next.modifierDown) {
    actions.push({ type: 'modifier-up', point });
  }
  if (!previous.primaryDown && next.primaryDown && !next.modifierDown) {
    actions.push({ type: 'plain-primary-down', point });
  }

  return actions;
}

