import { BrowserWindow } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, IPC_CHANNELS } from '../../src/shared/types';
import { SettingsManager } from '../../src/main/settings/SettingsManager';

describe('interface language settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(BrowserWindow, { getAllWindows: vi.fn(() => []) });
  });

  it('defaults to English independently of transcription language', () => {
    const settings = new SettingsManager();
    expect(DEFAULT_SETTINGS.uiLanguage).toBe('en');
    expect(settings.get('uiLanguage')).toBe('en');
    settings.set('language', 'ja');
    expect(settings.get('uiLanguage')).toBe('en');
  });

  it('persists supported languages and rejects unknown locale identifiers', () => {
    const settings = new SettingsManager();
    settings.set('uiLanguage', 'zh-TW');
    expect(settings.get('uiLanguage')).toBe('zh-TW');
    settings.set('uiLanguage', 'unsupported' as never);
    expect(settings.get('uiLanguage')).toBe('zh-TW');
    settings.set('uiLanguage', 'en');
    expect(settings.get('uiLanguage')).toBe('en');
  });

  it('notifies every live renderer, including capture overlays, after a saved language change', () => {
    const main = new BrowserWindow();
    const overlay = new BrowserWindow();
    const destroyed = new BrowserWindow();
    vi.mocked(destroyed.isDestroyed).mockReturnValue(true);
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([main, overlay, destroyed]);
    const settings = new SettingsManager();
    settings.set('uiLanguage', 'zh-TW');
    expect(main.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.UI_LANGUAGE_CHANGED, 'zh-TW');
    expect(overlay.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.UI_LANGUAGE_CHANGED, 'zh-TW');
    expect(destroyed.webContents.send).not.toHaveBeenCalled();
  });

  it('does not broadcast invalid values or transcription-language changes', () => {
    const window = new BrowserWindow();
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([window]);
    const settings = new SettingsManager();
    settings.set('uiLanguage', 'invalid' as never);
    settings.set('language', 'zh');
    expect(window.webContents.send).not.toHaveBeenCalled();
  });
});
