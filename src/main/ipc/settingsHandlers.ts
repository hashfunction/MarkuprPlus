/**
 * Settings IPC Handlers
 *
 * Registers IPC handlers for settings read/write, API key management,
 * permissions, hotkeys, and crash recovery configuration.
 */

import { ipcMain, dialog, app } from 'electron';
import * as fs from 'fs/promises';
import { join } from 'path';
import { sessionController } from '../SessionController';
import { hotkeyManager } from '../HotkeyManager';
import { crashRecovery } from '../CrashRecovery';
import { fileManager } from '../output';
import { saveRecoveredSession } from '../recovery/RecoveredSessionWriter';
import { getMarkedIssueArtifactStore } from './captureHandlers';
import { isElectronTestHarnessAllowed } from '../e2e/ElectronTestHarness';
import { PUBLIC_BRAND_NAME } from '../../shared/publicBrand';
import {
  IPC_CHANNELS,
  DEFAULT_SETTINGS,
  type AppSettings,
  type HotkeyConfig,
  type PermissionType,
  type PermissionStatus,
  type ApiKeyValidationResult,
} from '../../shared/types';
import type { IpcContext, SessionActions } from './types';

// =============================================================================
// API Key Validation
// =============================================================================

type ApiKeyProvider = 'openai' | 'anthropic';

function hotkeyConfigsEqual(left: HotkeyConfig, right: HotkeyConfig): boolean {
  return left.toggleRecording === right.toggleRecording &&
    left.manualScreenshot === right.manualScreenshot &&
    left.pauseResume === right.pauseResume;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shouldInjectHotkeyPersistenceFailure(): boolean {
  return isElectronTestHarnessAllowed({
    requested:
      process.env.MARKUPRX_E2E === '1' &&
      process.env.MARKUPRX_E2E_FAIL_HOTKEY_PERSISTENCE_AFTER_REGISTRATION === '1',
    isPackaged: app.isPackaged,
  });
}

async function validateProviderApiKey(
  service: ApiKeyProvider,
  key: string,
): Promise<ApiKeyValidationResult> {
  const trimmedKey = typeof key === 'string' ? key.trim() : '';

  if (trimmedKey.length < 10) {
    return {
      valid: false,
      error: 'Please enter a valid API key.',
    };
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 12000);

  const requestConfig = service === 'openai'
    ? {
        url: 'https://api.openai.com/v1/audio/transcriptions',
        method: 'POST' as const,
        headers: {
          Authorization: `Bearer ${trimmedKey}`,
        } as Record<string, string>,
        body: new FormData() as BodyInit,
      }
    : {
        url: 'https://api.anthropic.com/v1/models?limit=1',
        method: 'GET' as const,
        headers: {
          'x-api-key': trimmedKey,
          'anthropic-version': '2023-06-01',
        } as Record<string, string>,
        body: undefined as BodyInit | undefined,
      };

  try {
    const response = await fetch(requestConfig.url, {
      method: requestConfig.method,
      headers: requestConfig.headers,
      body: requestConfig.body,
      signal: controller.signal,
    });

    if (service === 'openai' && response.status === 400) {
      return { valid: true };
    }

    if (response.ok) {
      return { valid: true };
    }

    if (service === 'openai' && (response.status === 401 || response.status === 403)) {
      return {
        valid: false,
        status: response.status,
        error:
          response.status === 401
            ? 'Invalid OpenAI API key. Please check and try again.'
            : 'OpenAI key is valid but missing required permissions. Enable model/audio access for this project key and try again.',
      };
    }

    if (service === 'anthropic' && (response.status === 401 || response.status === 403)) {
      return {
        valid: false,
        status: response.status,
        error: 'Invalid Anthropic API key. Please check and try again.',
      };
    }

    const providerLabel = service === 'openai' ? 'OpenAI' : 'Anthropic';
    return {
      valid: false,
      status: response.status,
      error: `${providerLabel} API error (${response.status}). Please try again.`,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        valid: false,
        error: 'Request timed out. Please check your connection and try again.',
      };
    }

    return {
      valid: false,
      error: 'Unable to reach API service. Check internet/VPN/firewall and try again.',
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// =============================================================================
// IPC Registration
// =============================================================================

export function registerSettingsHandlers(ctx: IpcContext, actions: SessionActions): void {
  const { getMainWindow, getSettingsManager, setHasCompletedOnboarding } = ctx;

  // -------------------------------------------------------------------------
  // Settings Channels
  // -------------------------------------------------------------------------

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_, key: keyof AppSettings) => {
    return getSettingsManager()?.get(key) ?? DEFAULT_SETTINGS[key];
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, (): AppSettings => {
    return getSettingsManager()?.getAll() ?? { ...DEFAULT_SETTINGS };
  });

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET,
    (_, key: keyof AppSettings, value: unknown): AppSettings => {
      if (process.env.MARKUPRX_E2E === '1' && process.env.MARKUPRX_E2E_FAIL_SETTINGS_KEY === key) {
        throw new Error(`Injected settings save failure for ${key}.`);
      }
      const updates = { [key]: value } as Partial<AppSettings>;
      return getSettingsManager()?.update(updates) ?? { ...DEFAULT_SETTINGS, ...updates };
    }
  );

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SELECT_DIRECTORY, async (): Promise<string | null> => {
    const mainWindow = getMainWindow();
    const options: Electron.OpenDialogOptions = {
      title: 'Select Feedback Output Folder',
      buttonLabel: 'Use Folder',
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const selected = result.filePaths[0];
    getSettingsManager()?.update({ outputDirectory: selected });
    return selected;
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_CLEAR_ALL_DATA, async (): Promise<void> => {
    const settingsManager = getSettingsManager();
    if (!settingsManager) {
      return;
    }

    const outputDirectory = settingsManager.get('outputDirectory');
    await fs.rm(outputDirectory, { recursive: true, force: true }).catch(() => {});

    await settingsManager.deleteApiKey('openai').catch(() => {});
    await settingsManager.deleteApiKey('anthropic').catch(() => {});
    await settingsManager.deleteApiKey('cli-bridge').catch(() => {});

    settingsManager.reset();
    crashRecovery.discardIncompleteSession();
    crashRecovery.clearCrashLogs();
    sessionController.reset();
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_EXPORT, async (): Promise<void> => {
    const settingsManager = getSettingsManager();
    if (!settingsManager) {
      return;
    }

    const mainWindow = getMainWindow();
    const options: Electron.SaveDialogOptions = {
      title: `Export ${PUBLIC_BRAND_NAME} Settings`,
      defaultPath: join(app.getPath('documents'), `${PUBLIC_BRAND_NAME}-settings.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options);

    if (result.canceled || !result.filePath) {
      return;
    }

    const payload = JSON.stringify(settingsManager.getAll(), null, 2);
    await fs.writeFile(result.filePath, payload, 'utf-8');
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_IMPORT, async (): Promise<AppSettings | null> => {
    try {
      const settingsManager = getSettingsManager();
      if (!settingsManager) {
        return null;
      }

      const mainWindow = getMainWindow();
      const options: Electron.OpenDialogOptions = {
        title: `Import ${PUBLIC_BRAND_NAME} Settings`,
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }],
      };
      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options);

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const raw = await fs.readFile(result.filePaths[0], 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        console.warn('[Main] Invalid settings file format');
        return null;
      }

      const entries = Object.entries(parsed as Record<string, unknown>);
      const allowedKeys = new Set(Object.keys(DEFAULT_SETTINGS));
      const sanitized: Partial<AppSettings> = {};

      for (const [key, value] of entries) {
        if (!allowedKeys.has(key)) {
          continue;
        }
        // Skip __proto__ and constructor to prevent prototype pollution
        if (key === '__proto__' || key === 'constructor') {
          continue;
        }
        (sanitized as Record<string, unknown>)[key] = value;
      }

      return settingsManager.update(sanitized);
    } catch (error) {
      console.error('[Main] Failed to import settings:', error);
      return null;
    }
  });

  // Legacy settings handlers
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => {
    return getSettingsManager()?.getAll() ?? { ...DEFAULT_SETTINGS };
  });

  ipcMain.handle(IPC_CHANNELS.SET_SETTINGS, (_, newSettings: unknown) => {
    if (!newSettings || typeof newSettings !== 'object' || Array.isArray(newSettings)) {
      return getSettingsManager()?.getAll() ?? { ...DEFAULT_SETTINGS };
    }

    const typedSettings = newSettings as Partial<AppSettings>;
    const settings = getSettingsManager()?.update(typedSettings) ?? {
      ...DEFAULT_SETTINGS,
      ...typedSettings,
    };

    if (typedSettings.hotkeys) {
      const results = hotkeyManager.updateConfig(typedSettings.hotkeys);
      console.log('[Main] Hotkeys updated:', results);
    }

    if (typedSettings.hasCompletedOnboarding) {
      setHasCompletedOnboarding(true);
    }

    return settings;
  });

  // -------------------------------------------------------------------------
  // API Key Channels (Secure Storage)
  // -------------------------------------------------------------------------

  const ALLOWED_API_SERVICES = new Set(['openai', 'anthropic']);

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_API_KEY,
    async (_, service: string): Promise<string | null> => {
      if (!ALLOWED_API_SERVICES.has(service)) {
        return null;
      }
      return getSettingsManager()?.getApiKey(service) ?? null;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET_API_KEY,
    async (_, service: string, key: string): Promise<boolean> => {
      if (!ALLOWED_API_SERVICES.has(service)) {
        return false;
      }
      const settingsManager = getSettingsManager();
      if (!settingsManager) {
        return false;
      }

      try {
        await settingsManager.setApiKey(service, key);

        for (let attempt = 0; attempt < 3; attempt++) {
          const persisted = await settingsManager.getApiKey(service);
          if (persisted && persisted.trim().length > 0) {
            return true;
          }

          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));
          }
        }

        if (key.trim().length > 0) {
          console.warn(
            `[Main] ${service} API key write verification timed out; accepting write success.`
          );
          return true;
        }

        return false;
      } catch (error) {
        console.error(`[Main] Failed to store ${service} API key:`, error);
        return false;
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_DELETE_API_KEY,
    async (_, service: string): Promise<boolean> => {
      if (!ALLOWED_API_SERVICES.has(service)) {
        return false;
      }
      const settingsManager = getSettingsManager();
      if (!settingsManager) {
        return false;
      }

      await settingsManager.deleteApiKey(service);
      return true;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_HAS_API_KEY,
    async (_, service: string): Promise<boolean> => {
      if (!ALLOWED_API_SERVICES.has(service)) {
        return false;
      }
      return getSettingsManager()?.hasApiKey(service) ?? false;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_TEST_API_KEY,
    async (_, service: ApiKeyProvider, key: string): Promise<ApiKeyValidationResult> => {
      if (service !== 'openai' && service !== 'anthropic') {
        return {
          valid: false,
          error: 'Unsupported API provider.',
        };
      }

      try {
        return await validateProviderApiKey(service, key);
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown validation error';
        console.error(`[Main] API key validation failed for ${service}:`, error);
        return {
          valid: false,
          error: `Unable to validate ${service} API key (${detail}).`,
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // Permissions Channels
  // -------------------------------------------------------------------------

  ipcMain.handle(
    IPC_CHANNELS.PERMISSIONS_CHECK,
    async (_, type: PermissionType): Promise<boolean> => {
      return actions.checkPermission(type);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PERMISSIONS_REQUEST,
    async (_, type: PermissionType): Promise<boolean> => {
      return actions.requestPermission(type);
    }
  );

  ipcMain.handle(IPC_CHANNELS.PERMISSIONS_GET_ALL, async (): Promise<PermissionStatus> => {
    return {
      microphone: await actions.checkPermission('microphone'),
      screen: await actions.checkPermission('screen'),
      accessibility: await actions.checkPermission('accessibility'),
    };
  });

  // -------------------------------------------------------------------------
  // Hotkey Channels
  // -------------------------------------------------------------------------

  ipcMain.handle(IPC_CHANNELS.HOTKEY_CONFIG, (): HotkeyConfig => {
    return hotkeyManager.getConfig();
  });

  ipcMain.handle(
    IPC_CHANNELS.HOTKEY_UPDATE,
    (_, newConfig: Partial<HotkeyConfig>) => {
      const previousConfig = hotkeyManager.getConfig();
      const results = hotkeyManager.updateConfig(newConfig);
      const updatedConfig = hotkeyManager.getConfig();

      try {
        if (shouldInjectHotkeyPersistenceFailure()) {
          throw new Error('Injected hotkey persistence failure after registration');
        }

        const settingsManager = getSettingsManager();
        if (!settingsManager) {
          throw new Error('Settings manager is unavailable.');
        }
        const persisted = settingsManager.update({ hotkeys: updatedConfig });
        if (!hotkeyConfigsEqual(persisted.hotkeys, updatedConfig)) {
          throw new Error('Stored hotkey settings did not match the registered configuration.');
        }
      } catch (persistenceError) {
        const rollbackResults = hotkeyManager.updateConfig(previousConfig);
        const rolledBackConfig = hotkeyManager.getConfig();
        const rollbackFailed = rollbackResults.some((result) => !result.success) ||
          !hotkeyConfigsEqual(rolledBackConfig, previousConfig);

        if (rollbackFailed) {
          console.error('[Main] Hotkey rollback failed; live state may differ.', {
            persistenceError,
            rollbackResults,
            previousConfig,
            liveConfig: rolledBackConfig,
          });
          throw new Error(
            `Hotkey persistence failed (${errorMessage(persistenceError)}); ` +
            'rollback failed and live state may differ.'
          );
        }

        throw new Error(
          `Failed to persist hotkey settings: ${errorMessage(persistenceError)}. ` +
          'Live registration was rolled back.'
        );
      }

      return { config: updatedConfig, results };
    }
  );

  // -------------------------------------------------------------------------
  // Crash Recovery Channels
  // -------------------------------------------------------------------------

  ipcMain.handle(IPC_CHANNELS.CRASH_RECOVERY_CHECK, () => {
    const session = crashRecovery.getIncompleteSession();
    return {
      hasIncomplete: !!session,
      session: session ? {
        ...session,
        markedIssueCount: session.markedIssues?.length ?? 0,
        pendingMarkedIssue: Boolean(session.markedIssueAccumulator?.active),
      } : null,
    };
  });

  ipcMain.handle(IPC_CHANNELS.CRASH_RECOVERY_RECOVER, async (_, sessionId: string) => {
    const session = crashRecovery.getIncompleteSession();
    if (!session || session.id !== sessionId) {
      return {
        success: false,
        error: 'Session not found or ID mismatch',
      };
    }

    try {
      const artifacts = getMarkedIssueArtifactStore();
      const recovered = await saveRecoveredSession(session, {
        saveSession: (controllerSession, document) =>
          fileManager.saveSession(controllerSession, document),
        promoteIssues: (id, issues, sessionDir) =>
          artifacts.promoteIssues(id, issues, sessionDir),
        cleanupSession: (id) => artifacts.cleanupSession(id),
      });
      // Only clear the recovery snapshot after every required report write succeeds.
      crashRecovery.discardIncompleteSession();

      return {
        success: true,
        session: {
          id: recovered.session.id,
          feedbackItems: recovered.session.feedbackItems.map((item) => ({
            ...item,
            hasScreenshot: Boolean(item.screenshot),
          })),
          startTime: recovered.session.startTime,
          endTime: recovered.session.endTime,
          sourceName: session.sourceName,
          screenshotCount: recovered.session.metadata.markedIssues
            ?.filter((issue) => Boolean(issue.screenshotPath)).length ?? 0,
          markedIssues: structuredClone(recovered.session.metadata.markedIssues ?? []),
        },
        reportPath: recovered.reportPath,
        sessionDir: recovered.sessionDir,
        reviewSession: recovered.reviewSession,
      };
    } catch (error) {
      console.error('[Recovery] Failed to save recovered session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unable to recover session.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CRASH_RECOVERY_DISCARD, () => {
    crashRecovery.discardIncompleteSession();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.CRASH_RECOVERY_GET_LOGS, (_, limit?: unknown) => {
    const sanitizedLimit = typeof limit === 'number' && limit > 0 && limit <= 100
      ? Math.floor(limit)
      : undefined;
    return crashRecovery.getCrashLogs(sanitizedLimit);
  });

  ipcMain.handle(IPC_CHANNELS.CRASH_RECOVERY_CLEAR_LOGS, () => {
    crashRecovery.clearCrashLogs();
    return { success: true };
  });

  ipcMain.handle(
    IPC_CHANNELS.CRASH_RECOVERY_UPDATE_SETTINGS,
    (_, settings: unknown) => {
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        return { success: false };
      }

      const input = settings as Record<string, unknown>;
      const validated: Partial<{
        enableAutoSave: boolean;
        autoSaveIntervalMs: number;
        enableCrashReporting: boolean;
        maxCrashLogs: number;
      }> = {};

      if (typeof input.enableAutoSave === 'boolean') {
        validated.enableAutoSave = input.enableAutoSave;
      }
      if (typeof input.autoSaveIntervalMs === 'number' && input.autoSaveIntervalMs >= 1000 && input.autoSaveIntervalMs <= 30000) {
        validated.autoSaveIntervalMs = input.autoSaveIntervalMs;
      }
      if (typeof input.enableCrashReporting === 'boolean') {
        validated.enableCrashReporting = input.enableCrashReporting;
      }
      if (typeof input.maxCrashLogs === 'number' && input.maxCrashLogs >= 0 && input.maxCrashLogs <= 100) {
        validated.maxCrashLogs = input.maxCrashLogs;
      }

      crashRecovery.updateSettings(validated);
      return { success: true };
    }
  );
}
