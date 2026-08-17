import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatAcceleratorForDisplay,
  formatHotkeyConfigForDisplay,
  formatHotkeyForDisplay,
  getAccelerator,
  getDisplayKeys,
  getDisplayKeysById,
  getHotkeyById,
  isMacOS,
  isWindows,
  normalizeAccelerator,
  parseAccelerator,
} from '../../src/shared/hotkeys';

function stubPlatform(platform: 'darwin' | 'win32' | 'linux') {
  vi.stubGlobal('process', { platform });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hotkeys helpers', () => {
  it('detects macOS and windows from process.platform', () => {
    stubPlatform('darwin');
    expect(isMacOS()).toBe(true);
    expect(isWindows()).toBe(false);

    stubPlatform('win32');
    expect(isWindows()).toBe(true);
    expect(isMacOS()).toBe(false);
  });

  it('falls back to navigator platform checks when process is missing', () => {
    vi.stubGlobal('process', undefined);
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    expect(isMacOS()).toBe(true);

    vi.stubGlobal('navigator', { platform: 'Win32' });
    expect(isWindows()).toBe(true);
  });

  it('returns platform specific accelerators', () => {
    stubPlatform('darwin');
    expect(getAccelerator('toggleRecording')).toBe('Command+Shift+F');

    stubPlatform('win32');
    expect(getAccelerator('toggleRecording')).toBe('Ctrl+Shift+F');
  });

  it('returns empty accelerator for unknown hotkey id', () => {
    expect(getAccelerator('does-not-exist')).toBe('');
    expect(getHotkeyById('does-not-exist')).toBeUndefined();
  });

  it('uses the same public exit copy as the Keyboard Shortcuts surface', () => {
    expect(getHotkeyById('quit')).toMatchObject({
      label: 'Quit',
      description: 'Exit MarkuprPlus',
    });
  });

  it('normalizes generic accelerators for macOS', () => {
    stubPlatform('darwin');
    expect(normalizeAccelerator('CommandOrControl+Shift+S')).toBe('Command+Shift+S');
    expect(normalizeAccelerator('CmdOrCtrl+P')).toBe('Cmd+P');
  });

  it('normalizes generic accelerators for windows/linux', () => {
    stubPlatform('win32');
    expect(normalizeAccelerator('CommandOrControl+Shift+S')).toBe('Control+Shift+S');
    expect(normalizeAccelerator('CmdOrCtrl+P')).toBe('Ctrl+P');
  });

  it('parses accelerators into key segments', () => {
    expect(parseAccelerator('Ctrl+Shift+S')).toEqual(['Ctrl', 'Shift', 'S']);
  });

  it('formats display keys for macOS and windows', () => {
    stubPlatform('darwin');
    expect(getDisplayKeys('Command+Shift+S')).toEqual(['Cmd', 'Shift', 'S']);

    stubPlatform('win32');
    expect(getDisplayKeys('Command+Shift+S')).toEqual(['Ctrl', 'Shift', 'S']);
  });

  it('formats hotkeys for display by id and by accelerator string', () => {
    stubPlatform('darwin');
    expect(getDisplayKeysById('manualScreenshot')).toEqual(['Cmd', 'Shift', 'S']);
    expect(formatHotkeyForDisplay('manualScreenshot')).toBe('Cmd+Shift+S');
    expect(formatAcceleratorForDisplay('Command+Shift+P')).toBe('Cmd+Shift+P');
  });

  it('formats generic hotkey config strings for display', () => {
    stubPlatform('win32');
    expect(formatHotkeyConfigForDisplay('CommandOrControl+Shift+F')).toBe('Ctrl+Shift+F');
  });
});
