import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, globalShortcut, ipcMain } from 'electron';
import { hotkeyManager } from '../../src/main/HotkeyManager';
import { registerSettingsHandlers } from '../../src/main/ipc/settingsHandlers';
import type { IpcContext, SessionActions } from '../../src/main/ipc/types';
import type { AppSettings, HotkeyConfig } from '../../src/shared/types';
import { DEFAULT_SETTINGS, IPC_CHANNELS } from '../../src/shared/types';

const PRIOR_CONFIG: HotkeyConfig = {
  toggleRecording: 'CommandOrControl+Shift+F',
  manualScreenshot: 'CommandOrControl+Shift+S',
  pauseResume: 'CommandOrControl+Shift+P',
};
const REQUESTED_TOGGLE = 'CommandOrControl+Alt+J';
const TOGGLE_FALLBACKS = [
  'CommandOrControl+Shift+R',
  'CommandOrControl+Alt+F',
  'CommandOrControl+Alt+R',
];

function registeredHandler(channel: string): (...args: unknown[]) => unknown {
  const registration = vi.mocked(ipcMain.handle).mock.calls.find(([name]) => name === channel);
  if (!registration) throw new Error(`Handler not registered for ${channel}`);
  return registration[1] as (...args: unknown[]) => unknown;
}

function context(update: (updates: Partial<AppSettings>) => AppSettings): IpcContext {
  return {
    getMainWindow: () => null,
    getPopover: () => null,
    getSettingsManager: () => ({ update } as never),
    getWindowsTaskbar: () => null,
    getHasCompletedOnboarding: () => true,
    setHasCompletedOnboarding: () => undefined,
  };
}

describe('hotkey settings IPC transaction', () => {
  const registered = new Set<string>();
  const unavailable = new Set<string>();
  let persisted: HotkeyConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    persisted = { ...PRIOR_CONFIG };
    registered.clear();
    unavailable.clear();
    Object.defineProperty(app, 'isPackaged', { configurable: true, value: false });
    vi.stubEnv('MARKUPRX_E2E', '0');
    vi.stubEnv('MARKUPRX_E2E_FAIL_HOTKEY_PERSISTENCE_AFTER_REGISTRATION', '0');
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
    hotkeyManager.unregisterAll();
    hotkeyManager.updateConfig(PRIOR_CONFIG);
    expect(hotkeyManager.register('toggleRecording', PRIOR_CONFIG.toggleRecording).success).toBe(true);
  });

  afterEach(() => {
    hotkeyManager.unregisterAll();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('rolls live registration back when persistence throws after registration', () => {
    const update = vi.fn(() => {
      throw new Error('disk full');
    });
    registerSettingsHandlers(context(update), {} as SessionActions);
    const handler = registeredHandler(IPC_CHANNELS.HOTKEY_UPDATE);

    expect(() => handler({}, { toggleRecording: REQUESTED_TOGGLE }))
      .toThrow(/persist.*disk full/i);

    expect(update).toHaveBeenCalledWith({
      hotkeys: { ...PRIOR_CONFIG, toggleRecording: REQUESTED_TOGGLE },
    });
    expect(hotkeyManager.getConfig()).toEqual(PRIOR_CONFIG);
    expect(registered.has(PRIOR_CONFIG.toggleRecording)).toBe(true);
    expect(registered.has(REQUESTED_TOGGLE)).toBe(false);
  });

  it('surfaces a rollback failure instead of claiming live and persisted state agree', () => {
    const update = vi.fn(() => {
      [PRIOR_CONFIG.toggleRecording, ...TOGGLE_FALLBACKS]
        .forEach((accelerator) => unavailable.add(accelerator));
      throw new Error('disk full');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    registerSettingsHandlers(context(update), {} as SessionActions);
    const handler = registeredHandler(IPC_CHANNELS.HOTKEY_UPDATE);

    expect(() => handler({}, { toggleRecording: REQUESTED_TOGGLE }))
      .toThrow(/rollback failed.*live state may differ/i);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(/hotkey rollback failed/i),
      expect.anything(),
    );
  });

  it('ignores E2E hotkey failure injection in a packaged app', () => {
    vi.stubEnv('MARKUPRX_E2E', '1');
    vi.stubEnv('MARKUPRX_E2E_FAIL_HOTKEY_PERSISTENCE_AFTER_REGISTRATION', '1');
    Object.defineProperty(app, 'isPackaged', { configurable: true, value: true });
    const update = vi.fn((updates: Partial<AppSettings>) => {
      persisted = { ...(updates.hotkeys ?? persisted) };
      return { ...DEFAULT_SETTINGS, hotkeys: persisted };
    });
    registerSettingsHandlers(context(update), {} as SessionActions);
    const handler = registeredHandler(IPC_CHANNELS.HOTKEY_UPDATE);

    expect(handler({}, { toggleRecording: REQUESTED_TOGGLE })).toMatchObject({
      config: { toggleRecording: REQUESTED_TOGGLE },
    });
    expect(persisted.toggleRecording).toBe(REQUESTED_TOGGLE);
    expect(registered.has(REQUESTED_TOGGLE)).toBe(true);
  });

  it('ignores hotkey failure flags unless the E2E harness was requested', () => {
    vi.stubEnv('MARKUPRX_E2E', '0');
    vi.stubEnv('MARKUPRX_E2E_FAIL_HOTKEY_PERSISTENCE_AFTER_REGISTRATION', '1');
    const update = vi.fn((updates: Partial<AppSettings>) => {
      persisted = { ...(updates.hotkeys ?? persisted) };
      return { ...DEFAULT_SETTINGS, hotkeys: persisted };
    });
    registerSettingsHandlers(context(update), {} as SessionActions);
    const handler = registeredHandler(IPC_CHANNELS.HOTKEY_UPDATE);

    expect(handler({}, { toggleRecording: REQUESTED_TOGGLE })).toMatchObject({
      config: { toggleRecording: REQUESTED_TOGGLE },
    });
    expect(persisted.toggleRecording).toBe(REQUESTED_TOGGLE);
    expect(registered.has(REQUESTED_TOGGLE)).toBe(true);
  });
});
