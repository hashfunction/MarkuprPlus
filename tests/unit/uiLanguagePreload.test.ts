import { contextBridge, ipcRenderer } from 'electron';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let settings: { onUiLanguageChange(callback: (language: string) => void): () => void };

describe('interface language preload notifications', () => {
  beforeAll(async () => {
    await import('../../src/preload/index');
    const exposure = vi.mocked(contextBridge.exposeInMainWorld).mock.calls.find(([name]) => name === 'markuprx');
    if (!exposure) throw new Error('Missing preload API');
    settings = exposure[1].settings;
  });

  beforeEach(() => {
    vi.mocked(ipcRenderer.on).mockClear();
    vi.mocked(ipcRenderer.removeListener).mockClear();
  });

  it('exposes only the saved language and unsubscribes its exact listener', () => {
    const callback = vi.fn();
    const unsubscribe = settings.onUiLanguageChange(callback);
    const [channel, listener] = vi.mocked(ipcRenderer.on).mock.calls[0];
    expect(channel).toBe('markuprx:ui-language-changed');
    listener({ sender: 'not exposed' } as never, 'zh-TW');
    expect(callback).toHaveBeenCalledWith('zh-TW');
    unsubscribe();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(channel, listener);
  });
});
