import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dialog, ipcMain } from 'electron';
import { registerSettingsHandlers } from '../../src/main/ipc/settingsHandlers';
import {
  getMarkedIssueArtifactStore,
  registerCaptureHandlers,
} from '../../src/main/ipc/captureHandlers';
import { fileManager } from '../../src/main/output';
import { audioCapture } from '../../src/main/audio';
import { sessionController } from '../../src/main/SessionController';
import { crashRecovery } from '../../src/main/CrashRecovery';
import { hotkeyManager } from '../../src/main/HotkeyManager';
import type { IpcContext, SessionActions } from '../../src/main/ipc/types';
import {
  DEFAULT_SETTINGS,
  IPC_CHANNELS,
  type AppSettings,
} from '../../src/shared/types';
import {
  PUBLIC_SETTING_KEYS,
  parsePublicSettingsPatch,
  parseSettingsImport,
  projectPublicSettings,
} from '../../src/shared/publicSettings';
import { isApplicationDataClearInProgress } from '../../src/main/settings/clearApplicationData';

const temporaryRoots: string[] = [];
const SECRET_CANARY = 'SECRET-CANARY-MUST-NOT-CROSS-IPC';

function lazyRejectedPromise(message: string): Promise<void> {
  return {
    then: (_resolve: (value: void) => unknown, reject: (reason: Error) => unknown) => {
      reject(new Error(message));
    },
  } as unknown as Promise<void>;
}

function registeredHandler(channel: string): (...args: unknown[]) => unknown {
  const registration = vi.mocked(ipcMain.handle).mock.calls.find(([name]) => name === channel);
  if (!registration) throw new Error(`Handler not registered for ${channel}`);
  return registration[1] as (...args: unknown[]) => unknown;
}

function makeManager(rawOverrides: Record<string, unknown> = {}) {
  let raw: Record<string, unknown> = {
    ...DEFAULT_SETTINGS,
    theme: 'dark',
    unknownLegacySetting: SECRET_CANARY,
    __plaintext_fallback__: { openai: SECRET_CANARY },
    'plaintext:openai': SECRET_CANARY,
    _version: 3,
    ...rawOverrides,
  };

  return {
    get: vi.fn((key: keyof AppSettings) => raw[key]),
    getAll: vi.fn(() => raw as unknown as AppSettings),
    update: vi.fn((updates: Partial<AppSettings>) => {
      raw = { ...raw, ...updates };
      return raw as unknown as AppSettings;
    }),
    reset: vi.fn(() => {
      raw = { ...DEFAULT_SETTINGS };
    }),
    getApiKey: vi.fn(async () => SECRET_CANARY),
    setApiKey: vi.fn(async () => undefined),
    deleteApiKey: vi.fn(async () => ({ success: true, failures: [] })),
    hasApiKey: vi.fn(async () => true),
  };
}

function context(manager: ReturnType<typeof makeManager>): IpcContext {
  return {
    getMainWindow: () => null,
    getPopover: () => null,
    getSettingsManager: () => manager as never,
    getWindowsTaskbar: () => null,
    getHasCompletedOnboarding: () => true,
    setHasCompletedOnboarding: vi.fn(),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })));
});

describe('public settings contract', () => {
  it('projects only the explicit DEFAULT_SETTINGS key surface', () => {
    const projected = projectPublicSettings({
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      unknownLegacySetting: SECRET_CANARY,
      __plaintext_fallback__: { openai: SECRET_CANARY },
      encryptedOpenAiKey: SECRET_CANARY,
      _version: 3,
    });

    expect(Object.keys(projected).sort()).toEqual([...PUBLIC_SETTING_KEYS].sort());
    expect(projected.theme).toBe('dark');
    expect(JSON.stringify(projected)).not.toContain(SECRET_CANARY);
    expect(projected).not.toHaveProperty('__plaintext_fallback__');
    expect(projected).not.toHaveProperty('_version');
  });

  it('validates a patch as one atomic value without accepting unknown or dangerous keys', () => {
    expect(parsePublicSettingsPatch({ theme: 'light', imageQuality: 72 })).toEqual({
      theme: 'light',
      imageQuality: 72,
    });
    expect(() => parsePublicSettingsPatch({ theme: 'light', imageQuality: 0 }))
      .toThrow('Invalid settings payload.');
    expect(() => parsePublicSettingsPatch({ theme: 'light', unknown: SECRET_CANARY }))
      .toThrow('Invalid settings payload.');
    expect(() => parsePublicSettingsPatch(JSON.parse('{"__proto__":{"polluted":true}}')))
      .toThrow('Invalid settings payload.');
    expect(() => parsePublicSettingsPatch({ constructor: { prototype: { polluted: true } } }))
      .toThrow('Invalid settings payload.');
    expect(() => parsePublicSettingsPatch({ 'theme.value': 'dark' }))
      .toThrow('Invalid settings payload.');
    expect(() => parsePublicSettingsPatch({ outputDirectory: '' }))
      .toThrow('Invalid settings payload.');
    expect(() => parsePublicSettingsPatch({ outputDirectory: '../relative-output' }))
      .toThrow('Invalid settings payload.');
    expect(() => parsePublicSettingsPatch({ analysisModelsByProvider: new Date(0) }))
      .toThrow('Invalid settings payload.');
    expect(() => parsePublicSettingsPatch({
      analysisModelsByProvider: Object.create({ ollama: 'inherited-model' }),
    })).toThrow('Invalid settings payload.');
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('accepts a complete pre-hardening export while dropping only known internal fields', () => {
    const outputDirectory = join(tmpdir(), 'markuprplus-legacy-export-output');
    const imported = parseSettingsImport({
      ...DEFAULT_SETTINGS,
      outputDirectory,
      _version: 3,
      __plaintext_fallback__: { openai: SECRET_CANARY },
      openaiApiKey: SECRET_CANARY,
      anthropicApiKey: SECRET_CANARY,
      deepgramApiKey: SECRET_CANARY,
    });

    expect(imported).toEqual({ ...DEFAULT_SETTINGS, outputDirectory });
    expect(JSON.stringify(imported)).not.toContain(SECRET_CANARY);
  });
});

describe('settings IPC security boundary', () => {
  it('returns projections for current and legacy get-all channels', async () => {
    const manager = makeManager();
    registerSettingsHandlers(context(manager), {} as SessionActions);

    for (const channel of [IPC_CHANNELS.SETTINGS_GET_ALL, IPC_CHANNELS.GET_SETTINGS]) {
      const result = await registeredHandler(channel)({});
      expect(Object.keys(result as object).sort()).toEqual([...PUBLIC_SETTING_KEYS].sort());
      expect(JSON.stringify(result)).not.toContain(SECRET_CANARY);
    }
  });

  it('rejects unknown, dotted, prototype, and internal get keys before manager access', async () => {
    const manager = makeManager();
    registerSettingsHandlers(context(manager), {} as SessionActions);
    const get = registeredHandler(IPC_CHANNELS.SETTINGS_GET);

    for (const key of ['unknown', 'theme.value', '__proto__', 'constructor', '_version']) {
      await expect(Promise.resolve().then(() => get({}, key)))
        .rejects.toThrow('Invalid settings request.');
    }
    expect(manager.get).not.toHaveBeenCalled();
  });

  it('rejects invalid set keys and values before mutation and returns a projected result', async () => {
    const manager = makeManager();
    registerSettingsHandlers(context(manager), {} as SessionActions);
    const set = registeredHandler(IPC_CHANNELS.SETTINGS_SET);

    for (const [key, value] of [
      ['unknown', SECRET_CANARY],
      ['theme.value', 'dark'],
      ['__proto__', { polluted: true }],
      ['constructor', { prototype: { polluted: true } }],
      ['_version', 99],
      ['imageQuality', 0],
    ]) {
      await expect(Promise.resolve().then(() => set({}, key, value)))
        .rejects.toThrow('Invalid settings request.');
    }
    expect(manager.update).not.toHaveBeenCalled();

    const result = await set({}, 'theme', 'light');
    expect(manager.update).toHaveBeenCalledWith({ theme: 'light' });
    expect(result).toMatchObject({ theme: 'light' });
    expect(JSON.stringify(result)).not.toContain(SECRET_CANARY);
  });

  it('validates legacy bulk settings atomically and never applies a valid prefix', async () => {
    const manager = makeManager();
    registerSettingsHandlers(context(manager), {} as SessionActions);
    const setLegacy = registeredHandler(IPC_CHANNELS.SET_SETTINGS);

    await expect(Promise.resolve().then(() => setLegacy({}, {
      theme: 'light',
      imageQuality: 0,
      unknown: SECRET_CANARY,
    }))).rejects.toThrow('Invalid settings request.');
    expect(manager.update).not.toHaveBeenCalled();

    const result = await setLegacy({}, { theme: 'light', imageQuality: 72 });
    expect(manager.update).toHaveBeenCalledWith({ theme: 'light', imageQuality: 72 });
    expect(JSON.stringify(result)).not.toContain(SECRET_CANARY);
  });

  it('routes current and legacy hotkey settings through native state transactions', async () => {
    const manager = makeManager();
    const ctx = context(manager);
    let live = { ...DEFAULT_SETTINGS.hotkeys };
    vi.spyOn(hotkeyManager, 'getConfig').mockImplementation(() => ({ ...live }));
    const updateLive = vi.spyOn(hotkeyManager, 'updateConfig').mockImplementation((patch) => {
      live = { ...live, ...patch };
      return Object.entries(patch).map(([action, accelerator]) => ({
        action,
        accelerator,
        success: true,
      })) as never;
    });
    registerSettingsHandlers(ctx, {} as SessionActions);

    const currentHotkeys = {
      ...DEFAULT_SETTINGS.hotkeys,
      toggleRecording: 'CommandOrControl+Alt+J',
    };
    const current = await registeredHandler(IPC_CHANNELS.SETTINGS_SET)(
      {},
      'hotkeys',
      currentHotkeys,
    );
    expect(current).toMatchObject({ hotkeys: currentHotkeys });
    expect(updateLive).toHaveBeenCalledWith(currentHotkeys);
    expect(live).toEqual(currentHotkeys);

    const legacyHotkeys = {
      ...currentHotkeys,
      pauseResume: 'CommandOrControl+Alt+K',
    };
    const legacy = await registeredHandler(IPC_CHANNELS.SET_SETTINGS)({}, {
      hotkeys: legacyHotkeys,
      hasCompletedOnboarding: false,
    });
    expect(legacy).toMatchObject({ hotkeys: legacyHotkeys, hasCompletedOnboarding: false });
    expect(updateLive).toHaveBeenLastCalledWith(legacyHotkeys);
    expect(live).toEqual(legacyHotkeys);
    expect(ctx.setHasCompletedOnboarding).toHaveBeenCalledWith(false);
  });

  it('validates imports atomically and exports only the public projection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'markuprplus-settings-security-'));
    temporaryRoots.push(root);
    const importPath = join(root, 'import.json');
    const exportPath = join(root, 'export.json');
    const manager = makeManager();
    registerSettingsHandlers(context(manager), {} as SessionActions);
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: [importPath] });
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath: exportPath });

    await writeFile(importPath, JSON.stringify({
      theme: 'light',
      imageQuality: 0,
      unknownLegacySetting: SECRET_CANARY,
    }));
    const invalidResult = await registeredHandler(IPC_CHANNELS.SETTINGS_IMPORT)({});
    expect(invalidResult).toBeNull();
    expect(manager.update).not.toHaveBeenCalled();

    await writeFile(importPath, JSON.stringify({
      _version: 2,
      theme: 'light',
      imageQuality: 72,
      __plaintext_fallback__: { openai: SECRET_CANARY },
      deepgramApiKey: SECRET_CANARY,
    }));
    const validResult = await registeredHandler(IPC_CHANNELS.SETTINGS_IMPORT)({});
    expect(manager.update).toHaveBeenCalledWith({ theme: 'light', imageQuality: 72 });
    expect(JSON.stringify(validResult)).not.toContain(SECRET_CANARY);

    manager.update.mockClear();
    await writeFile(importPath, JSON.stringify({
      _version: 3,
      theme: 'light',
      arbitraryInternalRecord: { value: SECRET_CANARY },
    }));
    expect(await registeredHandler(IPC_CHANNELS.SETTINGS_IMPORT)({})).toBeNull();
    expect(manager.update).not.toHaveBeenCalled();

    await registeredHandler(IPC_CHANNELS.SETTINGS_EXPORT)({});
    const exported = await readFile(exportPath, 'utf8');
    expect(Object.keys(JSON.parse(exported)).sort()).toEqual([...PUBLIC_SETTING_KEYS].sort());
    expect(exported).not.toContain(SECRET_CANARY);
  });

  it('applies imported hotkeys to native state in the same transaction', async () => {
    const root = await mkdtemp(join(tmpdir(), 'markuprplus-settings-hotkey-import-'));
    temporaryRoots.push(root);
    const importPath = join(root, 'import.json');
    const manager = makeManager();
    const requested = {
      ...DEFAULT_SETTINGS.hotkeys,
      toggleRecording: 'CommandOrControl+Alt+J',
    };
    let live = { ...DEFAULT_SETTINGS.hotkeys };
    vi.spyOn(hotkeyManager, 'getConfig').mockImplementation(() => ({ ...live }));
    const updateLive = vi.spyOn(hotkeyManager, 'updateConfig').mockImplementation((patch) => {
      live = { ...live, ...patch };
      return Object.entries(patch).map(([action, accelerator]) => ({
        action,
        accelerator,
        success: true,
      })) as never;
    });
    registerSettingsHandlers(context(manager), {} as SessionActions);
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: [importPath] });
    await writeFile(importPath, JSON.stringify({ theme: 'light', hotkeys: requested }));

    const imported = await registeredHandler(IPC_CHANNELS.SETTINGS_IMPORT)({});

    expect(imported).toMatchObject({ theme: 'light', hotkeys: requested });
    expect(updateLive).toHaveBeenCalledWith(requested);
    expect(live).toEqual(requested);
    expect(manager.update).toHaveBeenCalledWith({ theme: 'light', hotkeys: requested });
  });

  it('never returns stored key material to the renderer', async () => {
    const manager = makeManager();
    registerSettingsHandlers(context(manager), {} as SessionActions);

    await expect(registeredHandler(IPC_CHANNELS.SETTINGS_GET_API_KEY)({}, 'openai'))
      .resolves.toBeNull();
    expect(manager.getApiKey).not.toHaveBeenCalled();
  });

  it('rejects oversized credential input before constructing a provider request', async () => {
    const manager = makeManager();
    registerSettingsHandlers(context(manager), {} as SessionActions);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await registeredHandler(IPC_CHANNELS.SETTINGS_TEST_API_KEY)(
      {},
      'openai',
      'x'.repeat(20_001),
    );

    expect(result).toEqual({ valid: false, error: 'Please enter a valid API key.' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns a path-free partial clear result and attempts later cleanup after failures', async () => {
    const root = await mkdtemp(join(tmpdir(), 'markuprplus-clear-ipc-'));
    temporaryRoots.push(root);
    const manager = makeManager({ outputDirectory: root });
    manager.deleteApiKey.mockImplementation(async (provider: string) => (
      provider === 'openai'
        ? { success: false, failures: [{ location: 'keychain' }] }
        : { success: true, failures: [] }
    ));
    vi.spyOn(sessionController, 'getState').mockReturnValue('idle');
    vi.spyOn(sessionController, 'reset').mockImplementation(() => undefined);
    vi.spyOn(fileManager, 'listOwnedSessionDirectoriesForDeletion').mockResolvedValue([]);
    vi.spyOn(crashRecovery, 'discardIncompleteSession').mockImplementation(() => {
      throw new Error(`recovery failed at ${root}`);
    });
    const clearLogs = vi.spyOn(crashRecovery, 'clearCrashLogs').mockImplementation(() => undefined);
    registerSettingsHandlers(context(manager), {} as SessionActions);

    const result = await registeredHandler(IPC_CHANNELS.SETTINGS_CLEAR_ALL_DATA)({});

    expect(manager.deleteApiKey).toHaveBeenCalledWith('openai');
    expect(manager.deleteApiKey).toHaveBeenCalledWith('anthropic');
    expect(clearLogs).toHaveBeenCalledOnce();
    expect(manager.reset).toHaveBeenCalledOnce();
    expect(manager.update).toHaveBeenCalledWith({
      outputDirectory: root,
      hasCompletedOnboarding: true,
    });
    expect(result).toMatchObject({
      success: false,
      deletedSessions: 0,
      failures: [
        { kind: 'credential', provider: 'openai' },
        { kind: 'recovery' },
      ],
    });
    expect(JSON.stringify((result as { failures: unknown }).failures)).not.toContain(root);
    expect(JSON.stringify(result)).not.toContain(SECRET_CANARY);
  });

  it('waits for crash-log deletion before reporting Clear All Data complete', async () => {
    const manager = makeManager({ outputDirectory: join(tmpdir(), 'markuprplus-clear-wait') });
    vi.spyOn(sessionController, 'getState').mockReturnValue('idle');
    vi.spyOn(sessionController, 'reset').mockImplementation(() => undefined);
    vi.spyOn(fileManager, 'listOwnedSessionDirectoriesForDeletion').mockResolvedValue([]);
    vi.spyOn(crashRecovery, 'discardIncompleteSession').mockImplementation(() => undefined);
    let finishCrashLogDeletion: (() => void) | undefined;
    const crashLogDeletion = new Promise<void>((resolve) => {
      finishCrashLogDeletion = resolve;
    });
    vi.spyOn(crashRecovery, 'clearCrashLogs')
      .mockImplementation(() => crashLogDeletion as never);
    registerSettingsHandlers(context(manager), {} as SessionActions);

    let settled = false;
    const clear = registeredHandler(IPC_CHANNELS.SETTINGS_CLEAR_ALL_DATA)({}) as Promise<unknown>;
    void clear.finally(() => { settled = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    finishCrashLogDeletion?.();
    await expect(clear).resolves.toMatchObject({ success: true, failures: [] });
  });

  it('reports crash-log deletion failure and retries it through the direct handler', async () => {
    const manager = makeManager({ outputDirectory: join(tmpdir(), 'markuprplus-clear-logs') });
    vi.spyOn(sessionController, 'getState').mockReturnValue('idle');
    vi.spyOn(sessionController, 'reset').mockImplementation(() => undefined);
    vi.spyOn(fileManager, 'listOwnedSessionDirectoriesForDeletion').mockResolvedValue([]);
    vi.spyOn(crashRecovery, 'discardIncompleteSession').mockImplementation(() => undefined);
    const rejectedDeletion = lazyRejectedPromise('crash log path is not removable');
    const clearLogs = vi.spyOn(crashRecovery, 'clearCrashLogs')
      .mockImplementationOnce(() => rejectedDeletion as never)
      .mockImplementation(() => Promise.resolve() as never);
    registerSettingsHandlers(context(manager), {} as SessionActions);

    const clearResult = await registeredHandler(IPC_CHANNELS.SETTINGS_CLEAR_ALL_DATA)({});
    expect(clearResult).toMatchObject({
      success: false,
      failures: [{ kind: 'recovery' }],
    });
    await expect(registeredHandler(IPC_CHANNELS.CRASH_RECOVERY_CLEAR_LOGS)({}))
      .resolves.toEqual({ success: true });
    expect(clearLogs).toHaveBeenCalledTimes(2);
  });

  it('reports raw-audio and staged-image cleanup failures instead of claiming all data was cleared', async () => {
    const manager = makeManager({ outputDirectory: join(tmpdir(), 'markuprplus-clear-audio') });
    vi.spyOn(sessionController, 'getState').mockReturnValue('idle');
    vi.spyOn(sessionController, 'reset').mockImplementation(() => undefined);
    vi.spyOn(fileManager, 'listOwnedSessionDirectoriesForDeletion').mockResolvedValue([]);
    vi.spyOn(crashRecovery, 'discardIncompleteSession').mockImplementation(() => undefined);
    vi.spyOn(crashRecovery, 'clearCrashLogs').mockImplementation(() => Promise.resolve() as never);
    const rejectedCleanup = lazyRejectedPromise('raw audio could not be removed');
    const clearAudio = vi.spyOn(audioCapture, 'clearRecoveryBuffers')
      .mockImplementationOnce(() => rejectedCleanup)
      .mockResolvedValue(undefined);
    const rejectedStagingCleanup = lazyRejectedPromise('staged image could not be removed');
    const clearStaging = vi.spyOn(getMarkedIssueArtifactStore(), 'cleanupStaleSessions')
      .mockImplementationOnce(() => rejectedStagingCleanup)
      .mockResolvedValue(undefined);
    registerSettingsHandlers(context(manager), {} as SessionActions);

    const first = await registeredHandler(IPC_CHANNELS.SETTINGS_CLEAR_ALL_DATA)({});
    expect(first).toMatchObject({
      success: false,
      failures: [{ kind: 'recovery' }],
    });

    const second = await registeredHandler(IPC_CHANNELS.SETTINGS_CLEAR_ALL_DATA)({});
    expect(second).toMatchObject({ success: true, failures: [] });
    expect(clearAudio).toHaveBeenCalledTimes(2);
    expect(clearStaging).toHaveBeenCalledTimes(2);
    expect(clearStaging).toHaveBeenCalledWith([]);
  });

  it('does not mutate data while a session is active', async () => {
    const manager = makeManager();
    vi.spyOn(sessionController, 'getState').mockReturnValue('recording');
    const listOwned = vi.spyOn(fileManager, 'listOwnedSessionDirectoriesForDeletion');
    registerSettingsHandlers(context(manager), {} as SessionActions);

    const result = await registeredHandler(IPC_CHANNELS.SETTINGS_CLEAR_ALL_DATA)({});

    expect(result).toMatchObject({ success: false, failures: [{ kind: 'settings' }] });
    expect(listOwned).not.toHaveBeenCalled();
    expect(manager.deleteApiKey).not.toHaveBeenCalled();
    expect(manager.reset).not.toHaveBeenCalled();
  });

  it('returns a structured result and continues independent cleanup when the output setting fails', async () => {
    const manager = makeManager();
    manager.get.mockImplementation(() => {
      throw new Error(`untrusted path ${SECRET_CANARY}`);
    });
    vi.spyOn(sessionController, 'getState').mockReturnValue('idle');
    vi.spyOn(sessionController, 'reset').mockImplementation(() => undefined);
    vi.spyOn(crashRecovery, 'discardIncompleteSession').mockImplementation(() => undefined);
    vi.spyOn(crashRecovery, 'clearCrashLogs').mockImplementation(() => undefined);
    const listOwned = vi.spyOn(fileManager, 'listOwnedSessionDirectoriesForDeletion');
    registerSettingsHandlers(context(manager), {} as SessionActions);

    const result = await registeredHandler(IPC_CHANNELS.SETTINGS_CLEAR_ALL_DATA)({});

    expect(listOwned).not.toHaveBeenCalled();
    expect(manager.deleteApiKey).toHaveBeenCalledTimes(2);
    expect(manager.reset).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      success: false,
      deletedSessions: 0,
      failures: [{ kind: 'settings' }],
    });
    expect(JSON.stringify(result)).not.toContain(SECRET_CANARY);
  });

  it('serializes concurrent clear requests into one destructive operation', async () => {
    const manager = makeManager({ outputDirectory: join(tmpdir(), 'markuprplus-clear-lock') });
    vi.spyOn(sessionController, 'getState').mockReturnValue('idle');
    vi.spyOn(sessionController, 'reset').mockImplementation(() => undefined);
    vi.spyOn(crashRecovery, 'discardIncompleteSession').mockImplementation(() => undefined);
    vi.spyOn(crashRecovery, 'clearCrashLogs').mockImplementation(() => undefined);
    let release: (() => void) | undefined;
    const listOwned = vi.spyOn(fileManager, 'listOwnedSessionDirectoriesForDeletion')
      .mockImplementation(() => new Promise<string[]>((resolve) => {
        release = () => resolve([]);
      }));
    registerSettingsHandlers(context(manager), {} as SessionActions);
    const clear = registeredHandler(IPC_CHANNELS.SETTINGS_CLEAR_ALL_DATA);

    const first = clear({}) as Promise<unknown>;
    const second = clear({}) as Promise<unknown>;
    expect(listOwned).toHaveBeenCalledOnce();
    expect(isApplicationDataClearInProgress()).toBe(true);
    release?.();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(isApplicationDataClearInProgress()).toBe(false);
    expect(listOwned).toHaveBeenCalledOnce();
    expect(manager.reset).toHaveBeenCalledOnce();
  });

  it('synchronizes default native hotkeys and onboarding state during Clear All Data', async () => {
    const customHotkeys = {
      ...DEFAULT_SETTINGS.hotkeys,
      toggleRecording: 'CommandOrControl+Alt+J',
    };
    const manager = makeManager({
      outputDirectory: join(tmpdir(), 'markuprplus-clear-runtime'),
      hotkeys: customHotkeys,
      hasCompletedOnboarding: true,
    });
    let live = { ...customHotkeys };
    vi.spyOn(hotkeyManager, 'getConfig').mockImplementation(() => ({ ...live }));
    const updateLive = vi.spyOn(hotkeyManager, 'updateConfig').mockImplementation((patch) => {
      live = { ...live, ...patch };
      return Object.entries(patch).map(([action, accelerator]) => ({
        action,
        accelerator,
        success: true,
      })) as never;
    });
    vi.spyOn(sessionController, 'getState').mockReturnValue('idle');
    vi.spyOn(sessionController, 'reset').mockImplementation(() => undefined);
    vi.spyOn(fileManager, 'listOwnedSessionDirectoriesForDeletion').mockResolvedValue([]);
    vi.spyOn(crashRecovery, 'clearCrashLogs').mockResolvedValue(undefined);
    vi.spyOn(crashRecovery, 'discardIncompleteSession').mockImplementation(() => undefined);
    const ctx = context(manager);
    registerSettingsHandlers(ctx, {} as SessionActions);

    const result = await registeredHandler(IPC_CHANNELS.SETTINGS_CLEAR_ALL_DATA)({});

    expect(result).toMatchObject({ success: true });
    expect(updateLive).toHaveBeenCalledWith(DEFAULT_SETTINGS.hotkeys);
    expect(live).toEqual(DEFAULT_SETTINGS.hotkeys);
    expect(ctx.setHasCompletedOnboarding).toHaveBeenCalledWith(false);
  });

  it('keeps a recoverable snapshot until every discard artifact cleanup succeeds', async () => {
    const manager = makeManager();
    const sessionId = '123e4567-e89b-42d3-a456-426614174000';
    vi.spyOn(crashRecovery, 'getIncompleteSession').mockReturnValue({ id: sessionId } as never);
    const discard = vi.spyOn(crashRecovery, 'discardIncompleteSession')
      .mockImplementation(() => undefined);
    vi.spyOn(audioCapture, 'clearRecoveryBuffers').mockResolvedValue(undefined);
    const cleanupSessions = vi.spyOn(getMarkedIssueArtifactStore(), 'cleanupStaleSessions')
      .mockRejectedValueOnce(new Error('staged screenshot is busy'))
      .mockResolvedValue(undefined);
    registerSettingsHandlers(context(manager), {} as SessionActions);
    const handler = registeredHandler(IPC_CHANNELS.CRASH_RECOVERY_DISCARD);

    await expect(handler({})).resolves.toMatchObject({ success: false });
    expect(discard).not.toHaveBeenCalled();

    await expect(handler({})).resolves.toEqual({ success: true });
    expect(cleanupSessions).toHaveBeenCalledWith([]);
    expect(discard).toHaveBeenCalledOnce();
  });

  it('updates only the validated public audioDeviceId field', async () => {
    const manager = makeManager();
    registerCaptureHandlers(context(manager));
    const setDevice = registeredHandler(IPC_CHANNELS.AUDIO_SET_DEVICE);

    await expect(setDevice({}, 'microphone-1')).resolves.toEqual({ success: true });
    expect(manager.update).toHaveBeenCalledWith({ audioDeviceId: 'microphone-1' });
    expect(manager.getAll).not.toHaveBeenCalled();

    manager.update.mockClear();
    await expect(setDevice({}, { device: SECRET_CANARY }))
      .resolves.toEqual({ success: false, error: 'Invalid audio device.' });
    expect(manager.update).not.toHaveBeenCalled();
  });
});
