import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: unknown[]) => unknown>();
vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp/docs') },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
  },
  dialog: {
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
    showSaveDialog: vi.fn(async () => ({ canceled: true })),
  },
}));

vi.mock('../../../src/main/SessionController', () => ({
  sessionController: { reset: vi.fn() },
}));

vi.mock('../../../src/main/HotkeyManager', () => ({
  hotkeyManager: {
    getConfig: vi.fn(() => ({
      toggleRecording: 'CommandOrControl+Shift+R',
      manualScreenshot: 'CommandOrControl+Shift+S',
      pauseResume: 'CommandOrControl+Shift+P',
    })),
    updateConfig: vi.fn(() => [{ success: true }]),
  },
}));

vi.mock('../../../src/main/CrashRecovery', () => ({
  crashRecovery: {
    getIncompleteSession: vi.fn(() => null),
    discardIncompleteSession: vi.fn(),
    clearCrashLogs: vi.fn(),
    getCrashLogs: vi.fn(() => []),
    updateSettings: vi.fn(),
  },
}));

vi.mock('../../../src/main/output', () => ({
  fileManager: {
    getOutputDirectory: vi.fn(() => '/tmp/test-output'),
    saveSession: vi.fn(async () => ({ success: true, sessionDir: '/tmp/saved' })),
  },
}));

vi.mock('../../../src/main/recovery/RecoveredSessionWriter', () => ({
  saveRecoveredSession: vi.fn(async () => ({
    session: {
      id: 'recovered-1',
      feedbackItems: [],
      startTime: 1000,
      endTime: 2000,
      metadata: { markedIssues: [] },
    },
    reportPath: '/tmp/report.md',
    sessionDir: '/tmp/saved',
    reviewSession: {},
  })),
}));

vi.mock('../../../src/main/ipc/captureHandlers', () => ({
  getMarkedIssueArtifactStore: vi.fn(() => ({
    promoteIssues: vi.fn(),
    cleanupSession: vi.fn(),
  })),
}));

vi.mock('../../../src/main/e2e/ElectronTestHarness', () => ({
  isElectronTestHarnessAllowed: vi.fn(() => false),
}));

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    rm: vi.fn(async () => undefined),
    readFile: vi.fn(async () => '{}'),
    writeFile: vi.fn(async () => undefined),
  };
});

import { registerSettingsHandlers } from '../../../src/main/ipc/settingsHandlers';
import { IPC_CHANNELS, DEFAULT_SETTINGS } from '../../../src/shared/types';
import { hotkeyManager } from '../../../src/main/HotkeyManager';
import { crashRecovery } from '../../../src/main/CrashRecovery';
import { dialog } from 'electron';
import type { IpcContext, SessionActions } from '../../../src/main/ipc/types';

function makeSettingsManager() {
  const store = { ...DEFAULT_SETTINGS };
  return {
    get: vi.fn((key: string) => (store as Record<string, unknown>)[key]),
    getAll: vi.fn(() => ({ ...store })),
    update: vi.fn((updates: Record<string, unknown>) => ({ ...store, ...updates })),
    reset: vi.fn(),
    getApiKey: vi.fn(async () => 'sk-test-key'),
    setApiKey: vi.fn(async () => undefined),
    deleteApiKey: vi.fn(async () => undefined),
    hasApiKey: vi.fn(() => true),
  };
}

function makeCtx(settingsMgr = makeSettingsManager()): IpcContext {
  return {
    getMainWindow: () => null,
    getPopover: () => null,
    getSettingsManager: () => settingsMgr as never,
    getWindowsTaskbar: () => null,
    getHasCompletedOnboarding: () => true,
    setHasCompletedOnboarding: vi.fn(),
  };
}

function makeActions(): SessionActions {
  return {
    startSession: vi.fn(async () => ({ success: true, sessionId: 'test-id' })),
    stopSession: vi.fn(async () => ({ success: true })),
    pauseSession: vi.fn(() => ({ success: true })),
    resumeSession: vi.fn(() => ({ success: true })),
    cancelSession: vi.fn(() => ({ success: true })),
    serializeSession: vi.fn((s) => s as never),
    checkPermission: vi.fn(async () => true),
    requestPermission: vi.fn(async () => true),
  };
}

describe('registerSettingsHandlers', () => {
  let settingsMgr: ReturnType<typeof makeSettingsManager>;
  let actions: SessionActions;

  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    settingsMgr = makeSettingsManager();
    actions = makeActions();
    registerSettingsHandlers(makeCtx(settingsMgr), actions);
  });

  describe('settings CRUD', () => {
    it('SETTINGS_GET returns value from settings manager', () => {
      const result = handlers.get(IPC_CHANNELS.SETTINGS_GET)!({}, 'outputDirectory');
      expect(settingsMgr.get).toHaveBeenCalledWith('outputDirectory');
      expect(result).toBeDefined();
    });

    it('SETTINGS_GET returns default when no settings manager', () => {
      handlers.clear();
      registerSettingsHandlers(
        { ...makeCtx(), getSettingsManager: () => null } as IpcContext,
        actions,
      );
      const result = handlers.get(IPC_CHANNELS.SETTINGS_GET)!({}, 'outputDirectory');
      expect(result).toBe(DEFAULT_SETTINGS.outputDirectory);
    });

    it('SETTINGS_GET_ALL returns all settings', () => {
      const result = handlers.get(IPC_CHANNELS.SETTINGS_GET_ALL)!({});
      expect(settingsMgr.getAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('SETTINGS_SET updates a setting', () => {
      handlers.get(IPC_CHANNELS.SETTINGS_SET)!({}, 'outputDirectory', '/new/path');
      expect(settingsMgr.update).toHaveBeenCalledWith({ outputDirectory: '/new/path' });
    });
  });

  describe('directory selection', () => {
    it('returns null when dialog is canceled', async () => {
      const result = await handlers.get(IPC_CHANNELS.SETTINGS_SELECT_DIRECTORY)!({});
      expect(result).toBeNull();
    });

    it('returns selected path and updates settings', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['/selected/dir'],
      } as never);
      const result = await handlers.get(IPC_CHANNELS.SETTINGS_SELECT_DIRECTORY)!({});
      expect(result).toBe('/selected/dir');
      expect(settingsMgr.update).toHaveBeenCalledWith({ outputDirectory: '/selected/dir' });
    });
  });

  describe('clear all data', () => {
    it('clears settings, recovery, and session state', async () => {
      await handlers.get(IPC_CHANNELS.SETTINGS_CLEAR_ALL_DATA)!({});
      expect(settingsMgr.reset).toHaveBeenCalled();
      expect(crashRecovery.discardIncompleteSession).toHaveBeenCalled();
      expect(crashRecovery.clearCrashLogs).toHaveBeenCalled();
    });
  });

  describe('settings export', () => {
    it('does nothing when dialog canceled', async () => {
      await handlers.get(IPC_CHANNELS.SETTINGS_EXPORT)!({});
      expect(vi.mocked(dialog.showSaveDialog)).toHaveBeenCalled();
    });
  });

  describe('settings import', () => {
    it('returns null when dialog canceled', async () => {
      const result = await handlers.get(IPC_CHANNELS.SETTINGS_IMPORT)!({});
      expect(result).toBeNull();
    });
  });

  describe('legacy settings', () => {
    it('GET_SETTINGS returns all settings', () => {
      const result = handlers.get(IPC_CHANNELS.GET_SETTINGS)!({});
      expect(result).toBeDefined();
    });

    it('SET_SETTINGS updates settings and returns result', () => {
      const result = handlers.get(IPC_CHANNELS.SET_SETTINGS)!({}, { outputDirectory: '/new' });
      expect(settingsMgr.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('SET_SETTINGS rejects non-object input', () => {
      const result = handlers.get(IPC_CHANNELS.SET_SETTINGS)!({}, 'invalid');
      expect(result).toBeDefined();
    });

    it('SET_SETTINGS updates hotkeys when provided', () => {
      const hotkeys = {
        toggleRecording: 'CommandOrControl+Shift+X',
        manualScreenshot: 'CommandOrControl+Shift+S',
        pauseResume: 'CommandOrControl+Shift+P',
      };
      handlers.get(IPC_CHANNELS.SET_SETTINGS)!({}, { hotkeys });
      expect(hotkeyManager.updateConfig).toHaveBeenCalledWith(hotkeys);
    });
  });

  describe('API key management', () => {
    it('SETTINGS_GET_API_KEY returns null for invalid service', async () => {
      const result = await handlers.get(IPC_CHANNELS.SETTINGS_GET_API_KEY)!({}, 'invalid');
      expect(result).toBeNull();
    });

    it('SETTINGS_GET_API_KEY returns key for valid service', async () => {
      const result = await handlers.get(IPC_CHANNELS.SETTINGS_GET_API_KEY)!({}, 'openai');
      expect(result).toBe('sk-test-key');
    });

    it('SETTINGS_SET_API_KEY returns false for invalid service', async () => {
      const result = await handlers.get(IPC_CHANNELS.SETTINGS_SET_API_KEY)!({}, 'invalid', 'key');
      expect(result).toBe(false);
    });

    it('SETTINGS_SET_API_KEY stores and verifies key', async () => {
      const result = await handlers.get(IPC_CHANNELS.SETTINGS_SET_API_KEY)!({}, 'openai', 'sk-new-key');
      expect(result).toBe(true);
      expect(settingsMgr.setApiKey).toHaveBeenCalledWith('openai', 'sk-new-key');
    });

    it('SETTINGS_DELETE_API_KEY returns false for invalid service', async () => {
      const result = await handlers.get(IPC_CHANNELS.SETTINGS_DELETE_API_KEY)!({}, 'invalid');
      expect(result).toBe(false);
    });

    it('SETTINGS_DELETE_API_KEY deletes key for valid service', async () => {
      const result = await handlers.get(IPC_CHANNELS.SETTINGS_DELETE_API_KEY)!({}, 'anthropic');
      expect(result).toBe(true);
      expect(settingsMgr.deleteApiKey).toHaveBeenCalledWith('anthropic');
    });

    it('SETTINGS_HAS_API_KEY returns false for invalid service', async () => {
      const result = await handlers.get(IPC_CHANNELS.SETTINGS_HAS_API_KEY)!({}, 'invalid');
      expect(result).toBe(false);
    });

    it('SETTINGS_HAS_API_KEY checks valid service', async () => {
      const result = await handlers.get(IPC_CHANNELS.SETTINGS_HAS_API_KEY)!({}, 'openai');
      expect(result).toBe(true);
    });

    it('SETTINGS_TEST_API_KEY rejects unsupported provider', async () => {
      const result = (await handlers.get(IPC_CHANNELS.SETTINGS_TEST_API_KEY)!({}, 'invalid', 'key')) as { valid: boolean };
      expect(result.valid).toBe(false);
    });

    it('SETTINGS_TEST_API_KEY rejects short keys', async () => {
      const result = (await handlers.get(IPC_CHANNELS.SETTINGS_TEST_API_KEY)!({}, 'openai', 'short')) as { valid: boolean; error: string };
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid API key');
    });
  });

  describe('permissions', () => {
    it('PERMISSIONS_CHECK delegates to actions', async () => {
      const result = await handlers.get(IPC_CHANNELS.PERMISSIONS_CHECK)!({}, 'microphone');
      expect(actions.checkPermission).toHaveBeenCalledWith('microphone');
      expect(result).toBe(true);
    });

    it('PERMISSIONS_REQUEST delegates to actions', async () => {
      const result = await handlers.get(IPC_CHANNELS.PERMISSIONS_REQUEST)!({}, 'screen');
      expect(actions.requestPermission).toHaveBeenCalledWith('screen');
      expect(result).toBe(true);
    });

    it('PERMISSIONS_GET_ALL returns all permission statuses', async () => {
      const result = (await handlers.get(IPC_CHANNELS.PERMISSIONS_GET_ALL)!({}) as Record<string, boolean>);
      expect(result.microphone).toBe(true);
      expect(result.screen).toBe(true);
      expect(result.accessibility).toBe(true);
    });
  });

  describe('hotkeys', () => {
    it('HOTKEY_CONFIG returns current config', () => {
      const result = handlers.get(IPC_CHANNELS.HOTKEY_CONFIG)!({});
      expect(hotkeyManager.getConfig).toHaveBeenCalled();
      expect(result).toMatchObject({ toggleRecording: expect.any(String) });
    });

    it('HOTKEY_UPDATE updates and persists config', () => {
      const newConfig = { toggleRecording: 'CommandOrControl+Shift+X' };
      const result = handlers.get(IPC_CHANNELS.HOTKEY_UPDATE)!({}, newConfig) as { config: Record<string, string> };
      expect(hotkeyManager.updateConfig).toHaveBeenCalledWith(newConfig);
      expect(result.config).toBeDefined();
    });
  });

  describe('crash recovery', () => {
    it('CRASH_RECOVERY_CHECK returns hasIncomplete false', () => {
      const result = handlers.get(IPC_CHANNELS.CRASH_RECOVERY_CHECK)!({}) as { hasIncomplete: boolean };
      expect(result.hasIncomplete).toBe(false);
    });

    it('CRASH_RECOVERY_CHECK returns session data when incomplete', () => {
      vi.mocked(crashRecovery.getIncompleteSession).mockReturnValueOnce({
        id: 'crash-1',
        markedIssues: [{ id: 'i1' }],
        markedIssueAccumulator: { active: true },
      } as never);
      const result = handlers.get(IPC_CHANNELS.CRASH_RECOVERY_CHECK)!({}) as {
        hasIncomplete: boolean;
        session: { markedIssueCount: number; pendingMarkedIssue: boolean };
      };
      expect(result.hasIncomplete).toBe(true);
      expect(result.session.markedIssueCount).toBe(1);
      expect(result.session.pendingMarkedIssue).toBe(true);
    });

    it('CRASH_RECOVERY_RECOVER returns error for missing session', async () => {
      const result = (await handlers.get(IPC_CHANNELS.CRASH_RECOVERY_RECOVER)!({}, 'nonexistent')) as { success: boolean };
      expect(result.success).toBe(false);
    });

    it('CRASH_RECOVERY_RECOVER recovers matching session', async () => {
      vi.mocked(crashRecovery.getIncompleteSession).mockReturnValue({
        id: 'crash-1',
        sourceName: 'Test',
      } as never);
      const result = (await handlers.get(IPC_CHANNELS.CRASH_RECOVERY_RECOVER)!({}, 'crash-1')) as { success: boolean };
      expect(result.success).toBe(true);
      expect(crashRecovery.discardIncompleteSession).toHaveBeenCalled();
    });

    it('CRASH_RECOVERY_DISCARD discards session', () => {
      const result = handlers.get(IPC_CHANNELS.CRASH_RECOVERY_DISCARD)!({}) as { success: boolean };
      expect(result.success).toBe(true);
      expect(crashRecovery.discardIncompleteSession).toHaveBeenCalled();
    });

    it('CRASH_RECOVERY_GET_LOGS returns logs', () => {
      const result = handlers.get(IPC_CHANNELS.CRASH_RECOVERY_GET_LOGS)!({});
      expect(crashRecovery.getCrashLogs).toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('CRASH_RECOVERY_GET_LOGS sanitizes limit', () => {
      handlers.get(IPC_CHANNELS.CRASH_RECOVERY_GET_LOGS)!({}, 50);
      expect(crashRecovery.getCrashLogs).toHaveBeenCalledWith(50);
    });

    it('CRASH_RECOVERY_GET_LOGS ignores invalid limit', () => {
      handlers.get(IPC_CHANNELS.CRASH_RECOVERY_GET_LOGS)!({}, -5);
      expect(crashRecovery.getCrashLogs).toHaveBeenCalledWith(undefined);
    });

    it('CRASH_RECOVERY_CLEAR_LOGS clears logs', () => {
      const result = handlers.get(IPC_CHANNELS.CRASH_RECOVERY_CLEAR_LOGS)!({}) as { success: boolean };
      expect(result.success).toBe(true);
      expect(crashRecovery.clearCrashLogs).toHaveBeenCalled();
    });

    it('CRASH_RECOVERY_UPDATE_SETTINGS validates and applies settings', () => {
      const result = handlers.get(IPC_CHANNELS.CRASH_RECOVERY_UPDATE_SETTINGS)!(
        {},
        { enableAutoSave: true, autoSaveIntervalMs: 5000, maxCrashLogs: 50 },
      ) as { success: boolean };
      expect(result.success).toBe(true);
      expect(crashRecovery.updateSettings).toHaveBeenCalledWith({
        enableAutoSave: true,
        autoSaveIntervalMs: 5000,
        maxCrashLogs: 50,
      });
    });

    it('CRASH_RECOVERY_UPDATE_SETTINGS rejects non-object', () => {
      const result = handlers.get(IPC_CHANNELS.CRASH_RECOVERY_UPDATE_SETTINGS)!({}, 'bad') as { success: boolean };
      expect(result.success).toBe(false);
    });

    it('CRASH_RECOVERY_UPDATE_SETTINGS rejects array', () => {
      const result = handlers.get(IPC_CHANNELS.CRASH_RECOVERY_UPDATE_SETTINGS)!({}, [1, 2]) as { success: boolean };
      expect(result.success).toBe(false);
    });
  });
});
