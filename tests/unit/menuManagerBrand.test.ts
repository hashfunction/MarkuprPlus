import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';

const nativeMenuState = vi.hoisted(() => ({
  openExternal: vi.fn<(url: string) => Promise<void>>(),
  template: [] as MenuItemConstructorOptions[],
}));

vi.mock('electron', () => ({
  app: {
    getVersion: () => '3.0.0',
    name: 'MarkuprPlus',
  },
  BrowserWindow: class BrowserWindow {},
  Menu: {
    buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => {
      nativeMenuState.template = template;
      return {};
    }),
    setApplicationMenu: vi.fn(),
  },
  shell: {
    openExternal: nativeMenuState.openExternal,
  },
}));

vi.mock('../../src/main/SessionController', () => ({
  sessionController: {
    getStatus: () => ({ state: 'idle' }),
  },
}));

vi.mock('../../src/main/settings/SettingsManager', () => ({
  getSettingsManager: () => ({
    get: (key: string) => ({
      showAudioWaveform: true,
      showTranscriptionPreview: true,
      theme: 'system',
    })[key],
  }),
}));

import { MenuManager } from '../../src/main/MenuManager';

describe('native application menu public brand', () => {
  beforeEach(() => {
    nativeMenuState.openExternal.mockReset().mockResolvedValue(undefined);
    nativeMenuState.template = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function websiteClick(): () => unknown {
    const manager = new MenuManager();
    manager.initialize({
      isDestroyed: () => false,
      webContents: { send: vi.fn() },
    } as never);
    const helpMenu = nativeMenuState.template.find((item) => item.label === 'Help');
    const submenu = helpMenu?.submenu as MenuItemConstructorOptions[];
    const website = submenu.find((item) => item.label === 'MarkuprPlus Website');

    if (typeof website?.click !== 'function') {
      throw new Error('Expected a clickable MarkuprPlus Website menu item.');
    }
    return website.click as () => unknown;
  }

  it('shows the MarkuprPlus website and opens the canonical public URL', () => {
    const click = websiteClick();

    expect(JSON.stringify(nativeMenuState.template)).not.toContain('MarkuprX');
    click();
    expect(nativeMenuState.openExternal)
      .toHaveBeenCalledWith('https://markuprplus.com');
  });

  it('offers only View toggles that change the current renderer', () => {
    const manager = new MenuManager();
    manager.initialize({
      isDestroyed: () => false,
      webContents: { send: vi.fn() },
    } as never);
    const viewMenu = nativeMenuState.template.find((item) => item.label === 'View');
    const labels = (viewMenu?.submenu as MenuItemConstructorOptions[])
      .map((item) => item.label)
      .filter(Boolean);

    expect(labels).toContain('Toggle Audio Waveform');
    expect(labels).not.toContain('Toggle Transcription Preview');
  });

  it.each([
    ['a rejected launch promise', () => Promise.reject(new Error('no browser'))],
    ['a synchronous shell failure', () => { throw new Error('shell unavailable'); }],
  ])('contains and reports %s', async (_description, failure) => {
    nativeMenuState.openExternal.mockImplementation(failure);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const click = websiteClick();

    let result: unknown;
    expect(() => {
      result = click();
    }).not.toThrow();
    await expect(Promise.resolve(result)).resolves.toBeUndefined();
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        '[MenuManager] Failed to open the MarkuprPlus website:',
        expect.any(Error),
      );
    });
  });

  it('contains a reporting failure after the website launch fails', async () => {
    nativeMenuState.openExternal.mockRejectedValue(new Error('no browser'));
    vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('logger unavailable');
    });
    const click = websiteClick();

    expect(() => click()).not.toThrow();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
});
