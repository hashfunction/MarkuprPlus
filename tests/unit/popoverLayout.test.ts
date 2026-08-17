import { describe, expect, it } from 'vitest';
import {
  getPopoverSizeForView,
  POPOVER_SIZES,
  PORTRAIT_POPOVER_SIZE,
} from '../../src/shared/popoverLayout';

describe('popover layout contract', () => {
  it('uses one 460 by 680 size for every non-HUD state and view', () => {
    expect(PORTRAIT_POPOVER_SIZE).toEqual({ width: 460, height: 680 });
    expect(POPOVER_SIZES.idle).toEqual(PORTRAIT_POPOVER_SIZE);
    expect(POPOVER_SIZES.complete).toEqual(PORTRAIT_POPOVER_SIZE);
    expect(POPOVER_SIZES.settings).toEqual(PORTRAIT_POPOVER_SIZE);
    expect(POPOVER_SIZES.error).toEqual(PORTRAIT_POPOVER_SIZE);
    expect(getPopoverSizeForView('settings')).toEqual(PORTRAIT_POPOVER_SIZE);
    expect(getPopoverSizeForView('history')).toEqual(PORTRAIT_POPOVER_SIZE);
    expect(getPopoverSizeForView('shortcuts')).toEqual(PORTRAIT_POPOVER_SIZE);
  });

  it('preserves compact HUD dimensions', () => {
    expect(POPOVER_SIZES.recording).toEqual({ width: 316, height: 90 });
    expect(POPOVER_SIZES.processing).toEqual({ width: 320, height: 140 });
  });
});
