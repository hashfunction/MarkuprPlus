import { describe, expect, it } from 'vitest';
import {
  getContainedDialogLayer,
  isTopmostContainedDialog,
  registerContainedDialog,
} from '../../src/renderer/hooks/useContainedDialogFocus';
import { TRANSIENT_LAYER_SCALE } from '../../src/renderer/styles/transientLayerScale';

function dialogFixture(isConnected = true): {
  dialog: HTMLElement;
  layer: HTMLElement;
} {
  const layer = {
    classList: { contains: (value: string) => value === 'ff-contained-dialog-layer' },
    dataset: {},
    style: { zIndex: '' },
  } as unknown as HTMLElement;
  const dialog = {
    isConnected,
    parentElement: layer,
  } as unknown as HTMLElement;
  return { dialog, layer };
}

describe('contained dialog stack', () => {
  it('makes only the most recently registered dialog active and resumes the one below it', () => {
    const { dialog: underlying, layer: underlyingLayer } = dialogFixture();
    const { dialog: topmost, layer: topmostLayer } = dialogFixture();
    const unregisterUnderlying = registerContainedDialog(underlying);

    expect(isTopmostContainedDialog(underlying)).toBe(true);
    expect(getContainedDialogLayer(underlying)).toBe(TRANSIENT_LAYER_SCALE.containedDialogBase);
    expect(underlyingLayer.style.zIndex).toBe(String(TRANSIENT_LAYER_SCALE.containedDialogBase));
    const unregisterTopmost = registerContainedDialog(topmost);
    expect(isTopmostContainedDialog(underlying)).toBe(false);
    expect(isTopmostContainedDialog(topmost)).toBe(true);
    expect(getContainedDialogLayer(topmost)).toBe(TRANSIENT_LAYER_SCALE.containedDialogBase + 1);
    expect(topmostLayer.style.zIndex).toBe(String(TRANSIENT_LAYER_SCALE.containedDialogBase + 1));

    expect(unregisterTopmost()).toBe(true);
    expect(topmostLayer.style.zIndex).toBe('');
    expect(isTopmostContainedDialog(underlying)).toBe(true);
    expect(unregisterUnderlying()).toBe(true);
    expect(underlyingLayer.style.zIndex).toBe('');
  });

  it('prunes disconnected ownership and compacts visual layers before async registration', () => {
    const { dialog: underlying, layer: underlyingLayer } = dialogFixture();
    const disconnectedFixture = dialogFixture(false);
    const disconnected = disconnectedFixture.dialog;
    const unregisterUnderlying = registerContainedDialog(underlying);
    const unregisterDisconnected = registerContainedDialog(disconnected);

    expect(isTopmostContainedDialog(underlying)).toBe(true);
    expect(isTopmostContainedDialog(disconnected)).toBe(false);
    expect(disconnectedFixture.layer.style.zIndex).toBe('');
    expect(underlyingLayer.style.zIndex).toBe(String(TRANSIENT_LAYER_SCALE.containedDialogBase));

    const asyncFixture = dialogFixture();
    const unregisterAsync = registerContainedDialog(asyncFixture.dialog);
    expect(isTopmostContainedDialog(asyncFixture.dialog)).toBe(true);
    expect(asyncFixture.layer.style.zIndex)
      .toBe(String(TRANSIENT_LAYER_SCALE.containedDialogBase + 1));

    expect(unregisterDisconnected()).toBe(false);
    expect(unregisterAsync()).toBe(true);
    expect(unregisterUnderlying()).toBe(true);
  });

  it('reindexes the remaining top layer when an underlying dialog unregisters first', () => {
    const first = dialogFixture();
    const second = dialogFixture();
    const unregisterFirst = registerContainedDialog(first.dialog);
    const unregisterSecond = registerContainedDialog(second.dialog);

    expect(unregisterFirst()).toBe(false);
    expect(first.layer.style.zIndex).toBe('');
    expect(second.layer.style.zIndex).toBe(String(TRANSIENT_LAYER_SCALE.containedDialogBase));
    expect(isTopmostContainedDialog(second.dialog)).toBe(true);
    expect(unregisterSecond()).toBe(true);
  });

  it('remembers topmost ownership when DOM detachment precedes effect cleanup', () => {
    const underlying = dialogFixture();
    const topmost = dialogFixture();
    const unregisterUnderlying = registerContainedDialog(underlying.dialog);
    const unregisterTopmost = registerContainedDialog(topmost.dialog);

    Object.defineProperty(topmost.dialog, 'isConnected', { value: false });
    expect(isTopmostContainedDialog(underlying.dialog)).toBe(true);
    expect(unregisterTopmost()).toBe(true);
    expect(unregisterUnderlying()).toBe(true);
  });
});
