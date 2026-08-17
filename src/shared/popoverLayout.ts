export const PORTRAIT_POPOVER_SIZE = Object.freeze({
  width: 460,
  height: 680,
});

export const POPOVER_SIZES = Object.freeze({
  idle: PORTRAIT_POPOVER_SIZE,
  recording: Object.freeze({ width: 316, height: 90 }),
  processing: Object.freeze({ width: 320, height: 140 }),
  complete: PORTRAIT_POPOVER_SIZE,
  settings: PORTRAIT_POPOVER_SIZE,
  error: PORTRAIT_POPOVER_SIZE,
});

export type PopoverState = keyof typeof POPOVER_SIZES;
export type PortraitAppView = 'settings' | 'history' | 'shortcuts';

export function getPopoverSizeForView(
  view: PortraitAppView,
): typeof PORTRAIT_POPOVER_SIZE {
  return PORTRAIT_POPOVER_SIZE;
}
