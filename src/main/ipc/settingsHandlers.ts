/**
 * Settings IPC Handlers
 *
 * Registers IPC handlers for settings read/write, API key management,
 * permissions, hotkeys, and crash recovery configuration.
 */

import { ipcMain, dialog, app } from 'electron';
import * as fs from 'fs/promises';
import { basename, dirname, isAbsolute, join } from 'path';
import { sessionController } from '../SessionController';
import { hotkeyManager } from '../HotkeyManager';
import { crashRecovery } from '../CrashRecovery';
import { fileManager } from '../output';
import { audioCapture } from '../audio';
import { saveRecoveredSession } from '../recovery/RecoveredSessionWriter';
import {
  clearScreenRecordingArtifacts,
  getMarkedIssueArtifactStore,
} from './captureHandlers';
import { isElectronTestHarnessAllowed } from '../e2e/ElectronTestHarness';
import { clearLegacyCaptureArtifacts } from '../security/PrivateCaptureStorage';
import { PUBLIC_BRAND_NAME } from '../../shared/publicBrand';
import {
  IPC_CHANNELS,
  DEFAULT_SETTINGS,
  type HotkeyConfig,
  type PermissionType,
  type PermissionStatus,
  type ApiKeyValidationResult,
  type ClearApplicationDataFailure,
  type ClearApplicationDataResult,
  type PublicSettings,
} from '../../shared/types';
import {
  isPublicSettingKey,
  isValidPublicSettingValue,
  parseHotkeyConfigPatch,
  parsePublicSettingsPatch,
  parseSettingsImport,
  projectPublicSettings,
} from '../../shared/publicSettings';
import type { IpcContext, SessionActions } from './types';
import {
  beginApplicationDataClear,
  clearOwnedApplicationData,
} from '../settings/clearApplicationData';
import { isPathInside } from '../security/pathContainment';

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

function applyHotkeyTransaction(
  requested: Partial<HotkeyConfig>,
  persist: (liveConfig: HotkeyConfig) => PublicSettings,
  requireEveryRegistration = false,
): { config: HotkeyConfig; results: ReturnType<typeof hotkeyManager.updateConfig>; settings: PublicSettings } {
  const previousConfig = hotkeyManager.getConfig();
  let results: ReturnType<typeof hotkeyManager.updateConfig> = [];

  try {
    results = hotkeyManager.updateConfig(requested);
    if (requireEveryRegistration && results.some((result) => !result.success)) {
      throw new Error('One or more imported hotkeys could not be registered.');
    }
    const updatedConfig = hotkeyManager.getConfig();
    const settings = persist(updatedConfig);
    if (!hotkeyConfigsEqual(settings.hotkeys, updatedConfig)) {
      throw new Error('Stored hotkey settings did not match the registered configuration.');
    }
    return { config: updatedConfig, results, settings };
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
}

function shouldInjectHotkeyPersistenceFailure(): boolean {
  return isElectronTestHarnessAllowed({
    requested:
      process.env.MARKUPRX_E2E === '1' &&
      process.env.MARKUPRX_E2E_FAIL_HOTKEY_PERSISTENCE_AFTER_REGISTRATION === '1',
    isPackaged: app.isPackaged,
  });
}

function electronTestOverride(name: string): string | null {
  const value = process.env[name];
  return value && isElectronTestHarnessAllowed({
    requested: process.env.MARKUPRX_E2E === '1',
    isPackaged: app.isPackaged,
  }) ? value : null;
}

function electronTestDelay(name: string, maximumMs = 2_000): number {
  const raw = electronTestOverride(name);
  if (!raw || !/^\d{1,5}$/u.test(raw)) return 0;
  const milliseconds = Number(raw);
  return Number.isSafeInteger(milliseconds) && milliseconds <= maximumMs
    ? milliseconds
    : 0;
}

async function validateProviderApiKey(
  service: ApiKeyProvider,
  key: string,
): Promise<ApiKeyValidationResult> {
  const trimmedKey = typeof key === 'string' ? key.trim() : '';

  if (trimmedKey.length < 10 || trimmedKey.length > 20_000) {
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
  const {
    getMainWindow,
    getSettingsManager,
    getHasCompletedOnboarding,
    setHasCompletedOnboarding,
  } = ctx;

  // -------------------------------------------------------------------------
  // Settings Channels
  // -------------------------------------------------------------------------

  const getPublicSettings = (): PublicSettings => projectPublicSettings(
    getSettingsManager()?.getAll() ?? DEFAULT_SETTINGS,
  );
  const getPublicSettingsOrDefaults = (): PublicSettings => {
    try {
      return getPublicSettings();
    } catch {
      return projectPublicSettings(DEFAULT_SETTINGS);
    }
  };
  let clearInFlight: Promise<ClearApplicationDataResult> | null = null;

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_, key: unknown) => {
    if (!isPublicSettingKey(key)) {
      throw new Error('Invalid settings request.');
    }
    const value = getSettingsManager()?.get(key) ?? DEFAULT_SETTINGS[key];
    return isValidPublicSettingValue(key, value)
      ? structuredClone(value)
      : structuredClone(DEFAULT_SETTINGS[key]);
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, (): PublicSettings => {
    return getPublicSettings();
  });

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET,
    (_, key: unknown, value: unknown): PublicSettings => {
      if (!isPublicSettingKey(key) || !isValidPublicSettingValue(key, value)) {
        throw new Error('Invalid settings request.');
      }
      if (process.env.MARKUPRX_E2E === '1' && process.env.MARKUPRX_E2E_FAIL_SETTINGS_KEY === key) {
        throw new Error('Injected settings save failure.');
      }
      const updates = { [key]: structuredClone(value) } as Partial<PublicSettings>;
      const manager = getSettingsManager();
      if (!manager) throw new Error('Settings are unavailable.');
      const settings = key === 'hotkeys'
        ? applyHotkeyTransaction(
            value as HotkeyConfig,
            (liveHotkeys) => manager.update({ hotkeys: liveHotkeys }),
            true,
          ).settings
        : manager.update(updates);
      if (key === 'hasCompletedOnboarding') {
        setHasCompletedOnboarding(value as boolean);
      }
      return projectPublicSettings(settings);
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
    getSettingsManager()?.update(parsePublicSettingsPatch({ outputDirectory: selected }));
    return selected;
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_CLEAR_ALL_DATA, (): Promise<ClearApplicationDataResult> => {
    if (clearInFlight) return clearInFlight;
    const settingsManager = getSettingsManager();
    if (!settingsManager) {
      return Promise.resolve({
        success: false,
        deletedSessions: 0,
        failures: [{ kind: 'settings' }],
        settings: projectPublicSettings(DEFAULT_SETTINGS),
      });
    }
    const releaseClearLock = beginApplicationDataClear();
    if (!releaseClearLock) {
      return Promise.resolve({
        success: false,
        deletedSessions: 0,
        failures: [{ kind: 'settings' }],
        settings: getPublicSettingsOrDefaults(),
      });
    }

    const clear = async (): Promise<ClearApplicationDataResult> => {
      const failures: ClearApplicationDataFailure[] = [];
      const addFailure = (failure: ClearApplicationDataFailure): void => {
        if (!failures.some((existing) => (
          existing.kind === failure.kind && existing.provider === failure.provider
        ))) failures.push(failure);
      };
      try {
        if (sessionController.getState() !== 'idle') {
          return {
            success: false,
            deletedSessions: 0,
            failures: [{ kind: 'settings' }],
            settings: getPublicSettingsOrDefaults(),
          };
        }
      } catch {
        return {
          success: false,
          deletedSessions: 0,
          failures: [{ kind: 'settings' }],
          settings: getPublicSettingsOrDefaults(),
        };
      }

      let outputDirectory: string | null = null;
      const completedOnboardingBeforeClear = getHasCompletedOnboarding();
      try {
        outputDirectory = settingsManager.get('outputDirectory');
      } catch {
        addFailure({ kind: 'settings' });
      }

      const sessionResult = outputDirectory
        ? await clearOwnedApplicationData({
            outputRoot: outputDirectory,
            listOwnedSessions: async () => {
              const testDelayMs = electronTestDelay('MARKUPRX_E2E_CLEAR_DATA_DELAY_MS');
              if (testDelayMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, testDelayMs));
              }
              // Keep the file service synchronized with persisted settings
              // before it enumerates candidates. It never receives a
              // renderer-provided path.
              fileManager.setOutputDirectory(outputDirectory as string);
              return fileManager.listOwnedSessionDirectoriesForDeletion();
            },
            removePath: async (path) => {
              const injectedFailureName = electronTestOverride(
                'MARKUPRX_E2E_FAIL_CLEAR_SESSION_NAME',
              );
              if (injectedFailureName && basename(path) === injectedFailureName) {
                throw new Error('Injected owned-session removal failure.');
              }
              await fs.rm(path, { recursive: true, force: true });
            },
          })
        : { deletedSessions: 0, failedSessions: 0 };
      for (let index = 0; index < sessionResult.failedSessions; index++) {
        failures.push({ kind: 'session' });
      }

      for (const provider of ['openai', 'anthropic'] as const) {
        try {
          const deletion = await settingsManager.deleteApiKey(provider);
          if (deletion && !deletion.success) addFailure({ kind: 'credential', provider });
        } catch {
          addFailure({ kind: 'credential', provider });
        }
      }

      try {
        await crashRecovery.clearCrashLogs();
      } catch {
        addFailure({ kind: 'recovery' });
      }
      let captureArtifactsCleared = true;
      try {
        await audioCapture.clearRecoveryBuffers();
      } catch {
        captureArtifactsCleared = false;
        addFailure({ kind: 'recovery' });
      }
      try {
        await getMarkedIssueArtifactStore().cleanupStaleSessions([]);
      } catch {
        captureArtifactsCleared = false;
        addFailure({ kind: 'recovery' });
      }
      try {
        await clearScreenRecordingArtifacts();
      } catch {
        captureArtifactsCleared = false;
        addFailure({ kind: 'recovery' });
      }
      try {
        await clearLegacyCaptureArtifacts();
      } catch {
        captureArtifactsCleared = false;
        addFailure({ kind: 'recovery' });
      }
      if (captureArtifactsCleared) {
        try {
          crashRecovery.discardIncompleteSession();
        } catch {
          addFailure({ kind: 'recovery' });
        }
      }
      try {
        sessionController.reset();
      } catch {
        addFailure({ kind: 'recovery' });
      }

      let settingsReset = false;
      try {
        settingsManager.reset();
        settingsReset = true;
        setHasCompletedOnboarding(false);
      } catch {
        addFailure({ kind: 'settings' });
      }

      if (settingsReset) {
        try {
          const results = hotkeyManager.updateConfig(DEFAULT_SETTINGS.hotkeys);
          const liveHotkeys = hotkeyManager.getConfig();
          const persisted = settingsManager.update({ hotkeys: liveHotkeys });
          if (results.some((result) => !result.success)
            || !hotkeyConfigsEqual(persisted.hotkeys, liveHotkeys)) {
            addFailure({ kind: 'settings' });
          }
        } catch {
          addFailure({ kind: 'settings' });
          try {
            settingsManager.update({ hotkeys: hotkeyManager.getConfig() });
          } catch {
            addFailure({ kind: 'settings' });
          }
        }
      }

      if (failures.length === 0) {
        try {
          fileManager.setOutputDirectory(settingsManager.get('outputDirectory'));
        } catch {
          addFailure({ kind: 'settings' });
        }
      }
      if (failures.length > 0) {
        try {
          const restored = settingsManager.update({
            ...(outputDirectory ? { outputDirectory } : {}),
            hasCompletedOnboarding: completedOnboardingBeforeClear,
          });
          setHasCompletedOnboarding(completedOnboardingBeforeClear);
          fileManager.setOutputDirectory(restored.outputDirectory);
        } catch {
          addFailure({ kind: 'settings' });
        }
      }

      return {
        success: failures.length === 0,
        deletedSessions: sessionResult.deletedSessions,
        failures,
        settings: getPublicSettingsOrDefaults(),
      };
    };

    clearInFlight = clear().finally(() => {
      releaseClearLock();
      clearInFlight = null;
    });
    return clearInFlight;
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
    const testExportPath = electronTestOverride('MARKUPRX_E2E_SETTINGS_EXPORT_PATH');
    const testOutputRoot = electronTestOverride('MARKUPRX_E2E_OUTPUT_ROOT');
    const safeTestExportPath = testExportPath && testOutputRoot
      && isAbsolute(testExportPath)
      && isPathInside(dirname(testOutputRoot), testExportPath)
      ? testExportPath
      : null;
    const result = safeTestExportPath
      ? { canceled: false, filePath: safeTestExportPath }
      : mainWindow
        ? await dialog.showSaveDialog(mainWindow, options)
        : await dialog.showSaveDialog(options);

    if (result.canceled || !result.filePath) {
      return;
    }

    const payload = JSON.stringify(projectPublicSettings(settingsManager.getAll()), null, 2);
    await fs.writeFile(result.filePath, payload, 'utf-8');
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_IMPORT, async (): Promise<PublicSettings | null> => {
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
      const testImportPath = electronTestOverride('MARKUPRX_E2E_SETTINGS_IMPORT_PATH');
      const testOutputRoot = electronTestOverride('MARKUPRX_E2E_OUTPUT_ROOT');
      const safeTestImportPath = testImportPath && testOutputRoot
        && isAbsolute(testImportPath)
        && isPathInside(dirname(testOutputRoot), testImportPath)
        ? testImportPath
        : null;
      const result = safeTestImportPath
        ? { canceled: false, filePaths: [safeTestImportPath] }
        : mainWindow
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

      const sanitized = parseSettingsImport(parsed);
      const imported = sanitized.hotkeys
        ? applyHotkeyTransaction(
            sanitized.hotkeys,
            (liveHotkeys) => settingsManager.update({
              ...sanitized,
              hotkeys: liveHotkeys,
            }),
            true,
          ).settings
        : settingsManager.update(sanitized);
      if (sanitized.hasCompletedOnboarding !== undefined) {
        setHasCompletedOnboarding(sanitized.hasCompletedOnboarding);
      }
      return projectPublicSettings(imported);
    } catch {
      console.error('[Main] Settings import was rejected.');
      return null;
    }
  });

  // Legacy settings handlers
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => {
    return getPublicSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SET_SETTINGS, (_, newSettings: unknown) => {
    let typedSettings: Partial<PublicSettings>;
    try {
      typedSettings = parsePublicSettingsPatch(newSettings);
    } catch {
      throw new Error('Invalid settings request.');
    }
    const manager = getSettingsManager();
    if (!manager) throw new Error('Settings are unavailable.');
    const updated = typedSettings.hotkeys
      ? applyHotkeyTransaction(
          typedSettings.hotkeys,
          (liveHotkeys) => manager.update({ ...typedSettings, hotkeys: liveHotkeys }),
          true,
        ).settings
      : manager.update(typedSettings);
    const settings = projectPublicSettings(updated);

    if (typedSettings.hasCompletedOnboarding !== undefined) {
      setHasCompletedOnboarding(typedSettings.hasCompletedOnboarding);
    }

    return settings;
  });

  // -------------------------------------------------------------------------
  // API Key Channels (Secure Storage)
  // -------------------------------------------------------------------------

  const ALLOWED_API_SERVICES = new Set(['openai', 'anthropic']);

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_API_KEY,
    async (): Promise<null> => {
      // Renderer code can query presence and validate a saved key without ever
      // receiving the credential itself.
      return null;
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
        return true;
      } catch {
        console.error(`[Main] Failed to store ${service} API key securely.`);
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

      const result = await settingsManager.deleteApiKey(service);
      return result.success;
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
    async (_, service: ApiKeyProvider, key?: unknown): Promise<ApiKeyValidationResult> => {
      if (service !== 'openai' && service !== 'anthropic') {
        return {
          valid: false,
          error: 'Unsupported API provider.',
        };
      }

      try {
        const candidate = key === undefined
          ? await getSettingsManager()?.getApiKey(service)
          : key;
        if (typeof candidate !== 'string' || candidate.trim().length === 0) {
          return { valid: false, error: `No saved ${service === 'openai' ? 'OpenAI' : 'Anthropic'} key found.` };
        }
        return await validateProviderApiKey(service, candidate);
      } catch {
        console.error(`[Main] API key validation failed for ${service}.`);
        return {
          valid: false,
          error: `Unable to validate ${service} API key.`,
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
    (_, newConfig: unknown) => {
      let validatedConfig: Partial<HotkeyConfig>;
      try {
        validatedConfig = parseHotkeyConfigPatch(newConfig);
      } catch {
        throw new Error('Invalid hotkey configuration.');
      }
      return applyHotkeyTransaction(validatedConfig, (updatedConfig) => {
        if (shouldInjectHotkeyPersistenceFailure()) {
          throw new Error('Injected hotkey persistence failure after registration');
        }
        const settingsManager = getSettingsManager();
        if (!settingsManager) throw new Error('Settings manager is unavailable.');
        return settingsManager.update({ hotkeys: updatedConfig });
      });
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

  const recoveriesInFlight = new Map<string, Promise<unknown>>();
  ipcMain.handle(IPC_CHANNELS.CRASH_RECOVERY_RECOVER, (_, sessionId: string) => {
    const existing = recoveriesInFlight.get(sessionId);
    if (existing) return existing;

    const recover = async () => {
      const session = crashRecovery.getIncompleteSession();
      if (!session || session.id !== sessionId) {
        return {
          success: false,
          error: 'Session not found or ID mismatch',
        };
      }

      try {
      const artifacts = getMarkedIssueArtifactStore();
      await artifacts.migrateLegacySession(session.id);
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
    };

    const operation = recover();
    recoveriesInFlight.set(sessionId, operation);
    const clearRecovery = () => {
      if (recoveriesInFlight.get(sessionId) === operation) {
        recoveriesInFlight.delete(sessionId);
      }
    };
    void operation.then(clearRecovery, clearRecovery);
    return operation;
  });

  ipcMain.handle(IPC_CHANNELS.CRASH_RECOVERY_DISCARD, async () => {
    const session = crashRecovery.getIncompleteSession();
    if (!session) return { success: true };

    const results = await Promise.allSettled([
      audioCapture.clearRecoveryBuffers(),
      getMarkedIssueArtifactStore().cleanupStaleSessions([]),
      clearScreenRecordingArtifacts(),
      clearLegacyCaptureArtifacts(),
    ]);
    if (results.some((result) => result.status === 'rejected')) {
      return {
        success: false,
        error: 'Some recovery artifacts could not be removed. Retry Discard.',
      };
    }

    crashRecovery.discardIncompleteSession();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.CRASH_RECOVERY_GET_LOGS, (_, limit?: unknown) => {
    const sanitizedLimit = typeof limit === 'number' && limit > 0 && limit <= 100
      ? Math.floor(limit)
      : undefined;
    return crashRecovery.getCrashLogs(sanitizedLimit);
  });

  ipcMain.handle(IPC_CHANNELS.CRASH_RECOVERY_CLEAR_LOGS, async () => {
    await crashRecovery.clearCrashLogs();
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
