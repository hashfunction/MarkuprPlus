import { describe, expect, it } from 'vitest';
import {
  reduceAnnotationInput,
  type GlobalAnnotationInputSample,
} from '../../src/main/capture/annotationInputModel';

const bounds = { x: 100, y: 50, width: 800, height: 600 };

function sample(
  sequence: number,
  overrides: Partial<GlobalAnnotationInputSample> = {},
): GlobalAnnotationInputSample {
  return {
    sequence,
    modifierDown: false,
    primaryDown: false,
    cursor: { x: 300, y: 250 },
    capturedAt: 1_000 + sequence,
    ...overrides,
  };
}

describe('annotation input transition model', () => {
  it('arms drawing only when the modifier changes from up to down', () => {
    expect(reduceAnnotationInput(sample(1), sample(2, { modifierDown: true }), bounds))
      .toEqual([{ type: 'modifier-down' }]);
    expect(reduceAnnotationInput(sample(2, { modifierDown: true }), sample(3, { modifierDown: true }), bounds))
      .toEqual([]);
  });

  it('always exits drawing on modifier release and normalizes an in-bounds cursor', () => {
    expect(reduceAnnotationInput(
      sample(2, { modifierDown: true }),
      sample(3),
      bounds,
    )).toEqual([{
      type: 'modifier-up',
      point: { x: 0.25, y: 1 / 3 },
    }]);
  });

  it('always exits drawing on modifier release even when the cursor is outside capture bounds', () => {
    expect(reduceAnnotationInput(
      sample(2, { modifierDown: true }),
      sample(3, { cursor: { x: 2_000, y: 1_500 } }),
      bounds,
    )).toEqual([{ type: 'modifier-up', point: null }]);
  });

  it('turns any unmodified primary press into a commit action', () => {
    expect(reduceAnnotationInput(sample(1), sample(2, { primaryDown: true }), bounds))
      .toEqual([{ type: 'plain-primary-down', point: { x: 0.25, y: 1 / 3 } }]);
    expect(reduceAnnotationInput(
      sample(3),
      sample(4, { primaryDown: true, cursor: { x: 2_000, y: 1_500 } }),
      bounds,
    )).toEqual([{ type: 'plain-primary-down', point: null }]);
  });

  it('does not treat the drawing press as an ordinary click', () => {
    expect(reduceAnnotationInput(
      sample(1, { modifierDown: true }),
      sample(2, { modifierDown: true, primaryDown: true }),
      bounds,
    )).toEqual([]);
  });

  it('ignores the initial sample, duplicate sequences, and malformed values', () => {
    expect(reduceAnnotationInput(null, sample(1, { modifierDown: true }), bounds)).toEqual([]);
    expect(reduceAnnotationInput(sample(2), sample(2, { primaryDown: true }), bounds)).toEqual([]);
    expect(reduceAnnotationInput(
      sample(2),
      sample(3, { cursor: { x: Number.NaN, y: 250 }, primaryDown: true }),
      bounds,
    )).toEqual([]);
  });
});
