import { contextBridge } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadPreload(isMainFrame: boolean): Promise<void> {
  vi.resetModules();
  Object.defineProperty(process, 'isMainFrame', {
    configurable: true,
    value: isMainFrame,
  });
  await import('../../src/preload/index');
}

describe('preload bridge exposure', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process, 'isMainFrame', {
      configurable: true,
      value: true,
    });
  });

  it('exposes the bridge exactly once for the renderer main frame', async () => {
    const expose = vi.mocked(contextBridge.exposeInMainWorld);
    expose.mockClear();
    await loadPreload(true);

    expect(expose).toHaveBeenCalledOnce();
    expect(expose.mock.calls[0]?.[0]).toBe('markuprx');
  });

  it('does not expose the bridge to a subframe', async () => {
    const expose = vi.mocked(contextBridge.exposeInMainWorld);
    expose.mockClear();
    await loadPreload(false);

    expect(expose).not.toHaveBeenCalled();
  });
});
