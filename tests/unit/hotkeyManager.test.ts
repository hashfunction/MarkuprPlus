import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { globalShortcut } from 'electron';
import {
  createHotkeyManager,
  type HotkeyRegistrationResult,
} from '../../src/main/HotkeyManager';

const DEFAULT_TOGGLE = 'CommandOrControl+Shift+F';
const CUSTOM_TOGGLE = 'CommandOrControl+Alt+J';
const TOGGLE_FALLBACKS = [
  'CommandOrControl+Shift+R',
  'CommandOrControl+Alt+F',
  'CommandOrControl+Alt+R',
];

describe('HotkeyManager live configuration', () => {
  const registered = new Set<string>();
  const unavailable = new Set<string>();

  beforeEach(() => {
    registered.clear();
    unavailable.clear();
    vi.mocked(globalShortcut.isRegistered).mockImplementation((accelerator) => (
      registered.has(accelerator) || unavailable.has(accelerator)
    ));
    vi.mocked(globalShortcut.register).mockImplementation((accelerator) => {
      if (unavailable.has(accelerator)) return false;
      registered.add(accelerator);
      return true;
    });
    vi.mocked(globalShortcut.unregister).mockImplementation((accelerator) => {
      registered.delete(accelerator);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers persisted configuration during initialization', () => {
    const manager = createHotkeyManager();

    const results = manager.initialize({ toggleRecording: CUSTOM_TOGGLE });

    expect(results.find(({ action }) => action === 'toggleRecording')).toMatchObject({
      success: true,
      accelerator: CUSTOM_TOGGLE,
    });
    expect(manager.getConfig().toggleRecording).toBe(CUSTOM_TOGGLE);
    expect(manager.getAccelerator('toggleRecording')).toBe(CUSTOM_TOGGLE);
    expect(registered.has(CUSTOM_TOGGLE)).toBe(true);
  });

  it('restores the previous live accelerator when a replacement and every fallback fail', () => {
    const manager = createHotkeyManager();
    expect(manager.register('toggleRecording', DEFAULT_TOGGLE).success).toBe(true);
    [CUSTOM_TOGGLE, ...TOGGLE_FALLBACKS].forEach((accelerator) => unavailable.add(accelerator));

    const result = manager.register('toggleRecording', CUSTOM_TOGGLE);

    expect(result).toMatchObject<Partial<HotkeyRegistrationResult>>({
      success: false,
      action: 'toggleRecording',
      accelerator: CUSTOM_TOGGLE,
      restoredAccelerator: DEFAULT_TOGGLE,
    });
    expect(manager.getConfig().toggleRecording).toBe(DEFAULT_TOGGLE);
    expect(manager.getAccelerator('toggleRecording')).toBe(DEFAULT_TOGGLE);
    expect(registered.has(DEFAULT_TOGGLE)).toBe(true);
    expect(registered.has(CUSTOM_TOGGLE)).toBe(false);
  });

  it('reports when the previous live accelerator cannot be restored', () => {
    const manager = createHotkeyManager();
    expect(manager.register('toggleRecording', DEFAULT_TOGGLE).success).toBe(true);
    [DEFAULT_TOGGLE, CUSTOM_TOGGLE, ...TOGGLE_FALLBACKS]
      .forEach((accelerator) => unavailable.add(accelerator));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = manager.register('toggleRecording', CUSTOM_TOGGLE);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/could not restore.*previous.*hotkey/i);
    expect(manager.getAccelerator('toggleRecording')).toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(expect.stringMatching(/could not restore/i));
  });
});
