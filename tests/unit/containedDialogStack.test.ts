import { describe, expect, it } from 'vitest';
import {
  isTopmostContainedDialog,
  registerContainedDialog,
} from '../../src/renderer/hooks/useContainedDialogFocus';

function connectedDialog(): HTMLElement {
  return { isConnected: true } as HTMLElement;
}

describe('contained dialog stack', () => {
  it('makes only the most recently registered dialog active and resumes the one below it', () => {
    const underlying = connectedDialog();
    const topmost = connectedDialog();
    const unregisterUnderlying = registerContainedDialog(underlying);

    expect(isTopmostContainedDialog(underlying)).toBe(true);
    const unregisterTopmost = registerContainedDialog(topmost);
    expect(isTopmostContainedDialog(underlying)).toBe(false);
    expect(isTopmostContainedDialog(topmost)).toBe(true);

    expect(unregisterTopmost()).toBe(true);
    expect(isTopmostContainedDialog(underlying)).toBe(true);
    expect(unregisterUnderlying()).toBe(true);
  });

  it('ignores a disconnected dialog left at the top of the stack', () => {
    const underlying = connectedDialog();
    const disconnected = { isConnected: false } as HTMLElement;
    const unregisterUnderlying = registerContainedDialog(underlying);
    const unregisterDisconnected = registerContainedDialog(disconnected);

    expect(isTopmostContainedDialog(underlying)).toBe(true);
    expect(isTopmostContainedDialog(disconnected)).toBe(false);

    expect(unregisterDisconnected()).toBe(true);
    expect(unregisterUnderlying()).toBe(true);
  });
});
