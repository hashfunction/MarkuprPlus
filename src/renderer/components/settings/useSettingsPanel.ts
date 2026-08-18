/**
 * useSettingsPanel
 *
 * Encapsulates all settings panel state, handlers, and effects.
 * Returns everything the SettingsPanel shell needs to render.
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  AnalysisProviderStatus,
  PublicSettings,
  AudioDevice,
  HotkeyConfig,
  ModelAnalysisProvider,
  WhisperModelCheckResult,
} from '../../../shared/types';
import { DEFAULT_SETTINGS, DEFAULT_HOTKEY_CONFIG } from '../../../shared/types';
import type { ApiKeyState } from '../primitives';
import type { SettingsTab } from './tabConfig';
import { getAnalysisProviderViewState } from './analysisProviderViewState';

// ============================================================================
// Constants
// ============================================================================

const MASKED_API_KEY_PLACEHOLDER = '********';
const API_TEST_TIMEOUT_MS = 15000;
const API_SAVE_TIMEOUT_MS = 12000;

export type SettingsSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const buildProviderTestFailureMessage = (provider: 'OpenAI' | 'Anthropic', error: unknown): string => {
  const detail = error instanceof Error ? error.message : 'Unknown error';
  return `Failed to test ${provider} API key: ${detail}`;
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

// ============================================================================
// Hook
// ============================================================================

export function useSettingsPanel(isOpen: boolean, onClose: () => void, initialTab: SettingsTab = 'general') {
  // State
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [settings, setSettings] = useState<PublicSettings>(DEFAULT_SETTINGS);
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [openAiApiKey, setOpenAiApiKey] = useState<ApiKeyState>({
    value: '', visible: false, testing: false, valid: null, error: null,
  });
  const [anthropicApiKey, setAnthropicApiKey] = useState<ApiKeyState>({
    value: '', visible: false, testing: false, valid: null, error: null,
  });
  const [saveStatus, setSaveStatus] = useState<SettingsSaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState('');
  const [analysisProviderStatuses, setAnalysisProviderStatuses] = useState<AnalysisProviderStatus[]>([]);
  const [isScanningProviders, setIsScanningProviders] = useState(false);
  const [whisperModelStatus, setWhisperModelStatus] = useState<WhisperModelCheckResult | null>(null);
  const [isRepairingLocalTranscription, setIsRepairingLocalTranscription] = useState(false);
  const [localTranscriptionError, setLocalTranscriptionError] = useState<string | null>(null);
  const [isClearingData, setIsClearingData] = useState(false);
  const [clearDataError, setClearDataError] = useState<string | null>(null);
  const getApiKeyPresence = useCallback(async (): Promise<{ hasOpenAiKey: boolean; hasAnthropicKey: boolean }> => {
    try {
      const [hasOpenAiKey, hasAnthropicKey] = await Promise.all([
        window.markuprx.settings.hasApiKey('openai'),
        window.markuprx.settings.hasApiKey('anthropic'),
      ]);
      return { hasOpenAiKey, hasAnthropicKey };
    } catch {
      return { hasOpenAiKey: false, hasAnthropicKey: false };
    }
  }, []);

  const refreshAnalysisProviders = useCallback(async (force = true): Promise<AnalysisProviderStatus[]> => {
    setIsScanningProviders(true);
    try {
      const statuses = await window.markuprx.analysisProviders.discover(force);
      setAnalysisProviderStatuses(statuses);
      return statuses;
    } catch (error) {
      console.error('Failed to discover analysis providers:', error);
      setAnalysisProviderStatuses([]);
      return [];
    } finally {
      setIsScanningProviders(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Load settings on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isOpen) return;

    const loadSettings = async () => {
      try {
        const allSettings = await window.markuprx.settings.getAll();
        const loadedSettings = allSettings;
        setSettings(loadedSettings);

        const [devices, providerStatuses, { hasOpenAiKey, hasAnthropicKey }, localModelStatus] = await Promise.all([
          window.markuprx.audio.getDevices(),
          refreshAnalysisProviders(false),
          getApiKeyPresence(),
          window.markuprx.whisper.checkModel().catch(() => null),
        ]);
        setAudioDevices(devices);
        setWhisperModelStatus(localModelStatus);
        if (hasOpenAiKey) {
          setOpenAiApiKey((prev) => ({ ...prev, value: MASKED_API_KEY_PLACEHOLDER, valid: true }));
        }
        if (hasAnthropicKey) {
          setAnthropicApiKey((prev) => ({ ...prev, value: MASKED_API_KEY_PLACEHOLDER, valid: true }));
        }
        if (!getAnalysisProviderViewState(
          loadedSettings.analysisProvider,
          providerStatuses,
          loadedSettings.analysisModelsByProvider,
        ).ready && initialTab === 'general') {
          setActiveTab('advanced');
        }

        try {
          const ver = await window.markuprx.version();
          setAppVersion(ver);
        } catch {
          setAppVersion('');
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };

    loadSettings();
  }, [isOpen, initialTab, getApiKeyPresence, refreshAnalysisProviders]);

  // ---------------------------------------------------------------------------
  // Setting change handlers
  // ---------------------------------------------------------------------------

  const handleSettingChange = useCallback(
    async <K extends keyof PublicSettings>(key: K, value: PublicSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
      setSaveStatus('saving');
      setSaveError(null);
      try {
        if (key === 'audioDeviceId') {
          const result = await window.markuprx.audio.setDevice(value as PublicSettings['audioDeviceId']);
          if (!result.success) throw new Error(result.error || 'Unable to select this microphone.');
        } else {
          await window.markuprx.settings.set(key, value);
        }
        if (key === 'theme' || key === 'accentColor') {
          window.dispatchEvent(new CustomEvent('markuprx:settings-updated', {
            detail: { type: 'appearance' },
          }));
        }
        if (key === 'analysisProvider' || key === 'analysisModelsByProvider') {
          await refreshAnalysisProviders(true);
          window.dispatchEvent(new CustomEvent('markuprx:settings-updated', {
            detail: { type: 'analysis-provider', provider: key === 'analysisProvider' ? value : undefined },
          }));
        }
        setSaveStatus('saved');
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : 'Unable to save this setting.';
        setSaveStatus('error');
        setSaveError(message);
        console.error('Failed to save setting:', error);
      }
    },
    [refreshAnalysisProviders]
  );

  const handleAnalysisModelChange = useCallback(async (
    provider: ModelAnalysisProvider,
    modelId: string,
  ) => {
    const next = { ...settings.analysisModelsByProvider };
    const trimmed = modelId.trim();
    if (trimmed) next[provider] = trimmed;
    else delete next[provider];
    await handleSettingChange('analysisModelsByProvider', next);
  }, [settings.analysisModelsByProvider, handleSettingChange]);

  const handleRepairLocalTranscription = useCallback(async () => {
    setIsRepairingLocalTranscription(true);
    setLocalTranscriptionError(null);
    try {
      const result = await window.markuprx.whisper.downloadModel('tiny');
      if (!result.success) {
        throw new Error(result.error || 'The local transcription model download failed.');
      }
      const updated = await window.markuprx.whisper.checkModel();
      setWhisperModelStatus(updated);
      if (!updated.hasAnyModel) {
        throw new Error('The downloaded local transcription model could not be verified.');
      }
    } catch (error) {
      setLocalTranscriptionError(
        error instanceof Error ? error.message : 'Local transcription repair failed.',
      );
    } finally {
      setIsRepairingLocalTranscription(false);
    }
  }, []);

  const handleHotkeyChange = useCallback(
    async (key: keyof HotkeyConfig, value: string) => {
      const previousHotkeys = settings.hotkeys;
      const newHotkeys = { ...settings.hotkeys, [key]: value };
      setSettings((prev) => ({ ...prev, hotkeys: newHotkeys }));
      setSaveStatus('saving');
      setSaveError(null);
      try {
        const saved = await window.markuprx.settings.set('hotkeys', newHotkeys);
        setSettings(saved);
        setSaveStatus('saved');
      } catch (error) {
        setSettings((previous) => ({ ...previous, hotkeys: previousHotkeys }));
        const message = error instanceof Error
          ? error.message
          : 'Unable to save this setting.';
        setSaveStatus('error');
        setSaveError(message);
        console.error('Failed to save setting:', error);
      }
    },
    [settings.hotkeys]
  );

  // ---------------------------------------------------------------------------
  // API key handlers
  // ---------------------------------------------------------------------------

  const handleOpenAiApiKeyChange = useCallback((value: string) => {
    setOpenAiApiKey((prev) => ({ ...prev, value, valid: null, error: null }));
  }, []);

  const handleToggleOpenAiApiKeyVisibility = useCallback(() => {
    setOpenAiApiKey((prev) => ({ ...prev, visible: !prev.visible }));
  }, []);

  const handleTestOpenAiApiKey = useCallback(async () => {
    setOpenAiApiKey((prev) => ({ ...prev, testing: true, error: null }));
    try {
      const candidateKey = openAiApiKey.value.trim();
      const usingStoredKey = candidateKey === MASKED_API_KEY_PLACEHOLDER;
      const validation = await withTimeout(
        window.markuprx.settings.testApiKey('openai', usingStoredKey ? undefined : candidateKey),
        API_TEST_TIMEOUT_MS,
        'OpenAI API test timed out. Please try again.'
      );
      if (validation.valid) {
        setSaveStatus('saving');
        setSaveError(null);
        const saved = usingStoredKey || await withTimeout(
          window.markuprx.settings.setApiKey('openai', candidateKey),
          API_SAVE_TIMEOUT_MS,
          'Saving OpenAI key timed out. Please try again.'
        );
        if (!saved) {
          const message = 'OpenAI key validated, but local save verification failed. Relaunch app and try again.';
          setSaveStatus('error');
          setSaveError(message);
          setOpenAiApiKey((prev) => ({
            ...prev, valid: false,
            error: message,
          }));
          return;
        }
        setOpenAiApiKey((prev) => ({
          ...prev,
          value: MASKED_API_KEY_PLACEHOLDER,
          visible: false,
          valid: true,
        }));
        window.dispatchEvent(new CustomEvent('markuprx:settings-updated', { detail: { type: 'api-key', provider: 'openai' } }));
        setSaveStatus('saved');
      } else {
        setOpenAiApiKey((prev) => ({
          ...prev, valid: false,
          error: validation.error || 'OpenAI API key test failed. Please try again.',
        }));
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Unable to save this setting.';
      setSaveStatus('error');
      setSaveError(message);
      console.error('Failed to save setting:', error);
      setOpenAiApiKey((prev) => ({
        ...prev, valid: false,
        error: buildProviderTestFailureMessage('OpenAI', error),
      }));
    } finally {
      setOpenAiApiKey((prev) => ({ ...prev, testing: false }));
    }
  }, [openAiApiKey.value]);

  const handleAnthropicApiKeyChange = useCallback((value: string) => {
    setAnthropicApiKey((prev) => ({ ...prev, value, valid: null, error: null }));
  }, []);

  const handleToggleAnthropicApiKeyVisibility = useCallback(() => {
    setAnthropicApiKey((prev) => ({ ...prev, visible: !prev.visible }));
  }, []);

  const handleTestAnthropicApiKey = useCallback(async () => {
    setAnthropicApiKey((prev) => ({ ...prev, testing: true, error: null }));
    try {
      const candidateKey = anthropicApiKey.value.trim();
      const usingStoredKey = candidateKey === MASKED_API_KEY_PLACEHOLDER;
      const validation = await withTimeout(
        window.markuprx.settings.testApiKey('anthropic', usingStoredKey ? undefined : candidateKey),
        API_TEST_TIMEOUT_MS,
        'Anthropic API test timed out. Please try again.'
      );
      if (validation.valid) {
        setSaveStatus('saving');
        setSaveError(null);
        const saved = usingStoredKey || await withTimeout(
          window.markuprx.settings.setApiKey('anthropic', candidateKey),
          API_SAVE_TIMEOUT_MS,
          'Saving Anthropic key timed out. Please try again.'
        );
        if (!saved) {
          const message = 'Anthropic key validated, but local save verification failed. Relaunch app and try again.';
          setSaveStatus('error');
          setSaveError(message);
          setAnthropicApiKey((prev) => ({
            ...prev, valid: false,
            error: message,
          }));
          return;
        }
        await refreshAnalysisProviders(true);
        setAnthropicApiKey((prev) => ({
          ...prev,
          value: MASKED_API_KEY_PLACEHOLDER,
          visible: false,
          valid: true,
        }));
        window.dispatchEvent(new CustomEvent('markuprx:settings-updated', { detail: { type: 'api-key', provider: 'anthropic' } }));
        setSaveStatus('saved');
      } else {
        setAnthropicApiKey((prev) => ({
          ...prev, valid: false,
          error: validation.error || 'Anthropic API key test failed. Please try again.',
        }));
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Unable to save this setting.';
      setSaveStatus('error');
      setSaveError(message);
      console.error('Failed to save setting:', error);
      setAnthropicApiKey((prev) => ({
        ...prev, valid: false,
        error: buildProviderTestFailureMessage('Anthropic', error),
      }));
    } finally {
      setAnthropicApiKey((prev) => ({ ...prev, testing: false }));
    }
  }, [anthropicApiKey.value, refreshAnalysisProviders]);

  // ---------------------------------------------------------------------------
  // Reset handlers
  // ---------------------------------------------------------------------------

  const resetGeneralSection = useCallback(async () => {
    const defaults = {
      launchAtLogin: DEFAULT_SETTINGS.launchAtLogin,
      checkForUpdates: DEFAULT_SETTINGS.checkForUpdates,
    };
    setSettings((prev) => ({ ...prev, ...defaults }));
    setSaveStatus('saving');
    setSaveError(null);
    try {
      for (const [key, value] of Object.entries(defaults)) {
        await window.markuprx.settings.set(key as keyof PublicSettings, value);
      }
      setSaveStatus('saved');
      return true;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Unable to save this setting.';
      setSaveStatus('error');
      setSaveError(message);
      console.error('Failed to save setting:', error);
      return false;
    }
  }, []);

  const resetRecordingSection = useCallback(async () => {
    const defaults = {
      defaultCountdown: DEFAULT_SETTINGS.defaultCountdown,
      showAudioWaveform: DEFAULT_SETTINGS.showAudioWaveform,
    };
    setSettings((prev) => ({ ...prev, ...defaults }));
    setSaveStatus('saving');
    setSaveError(null);
    try {
      for (const [key, value] of Object.entries(defaults)) {
        await window.markuprx.settings.set(key as keyof PublicSettings, value);
      }
      setSaveStatus('saved');
      return true;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Unable to save this setting.';
      setSaveStatus('error');
      setSaveError(message);
      console.error('Failed to save setting:', error);
      return false;
    }
  }, []);

  const resetRecordingCompatibilitySection = useCallback(async () => {
    const defaults = {
      showTranscriptionPreview: DEFAULT_SETTINGS.showTranscriptionPreview,
      audioDeviceId: DEFAULT_SETTINGS.audioDeviceId,
      pauseThreshold: DEFAULT_SETTINGS.pauseThreshold,
      minTimeBetweenCaptures: DEFAULT_SETTINGS.minTimeBetweenCaptures,
    };
    setSettings((prev) => ({ ...prev, ...defaults }));
    setSaveStatus('saving');
    setSaveError(null);
    try {
      for (const [key, value] of Object.entries(defaults)) {
        if (key === 'audioDeviceId') {
          const result = await window.markuprx.audio.setDevice(value as PublicSettings['audioDeviceId']);
          if (!result.success) throw new Error(result.error || 'Unable to reset the microphone.');
        } else {
          await window.markuprx.settings.set(key as keyof PublicSettings, value);
        }
      }
      setSaveStatus('saved');
      return true;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Unable to save this setting.';
      setSaveStatus('error');
      setSaveError(message);
      console.error('Failed to save setting:', error);
      return false;
    }
  }, []);

  const resetAppearanceSection = useCallback(async () => {
    const defaults = {
      theme: DEFAULT_SETTINGS.theme,
      accentColor: DEFAULT_SETTINGS.accentColor,
    };
    setSettings((prev) => ({ ...prev, ...defaults }));
    setSaveStatus('saving');
    setSaveError(null);
    try {
      for (const [key, value] of Object.entries(defaults)) {
        await window.markuprx.settings.set(key as keyof PublicSettings, value);
      }
      window.dispatchEvent(new CustomEvent('markuprx:settings-updated', {
        detail: { type: 'appearance' },
      }));
      setSaveStatus('saved');
      return true;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Unable to save this setting.';
      setSaveStatus('error');
      setSaveError(message);
      console.error('Failed to save setting:', error);
      return false;
    }
  }, []);

  const resetHotkeysSection = useCallback(async () => {
    const previousHotkeys = settings.hotkeys;
    const defaults = { ...DEFAULT_HOTKEY_CONFIG };
    setSettings((prev) => ({ ...prev, hotkeys: defaults }));
    setSaveStatus('saving');
    setSaveError(null);
    try {
      const saved = await window.markuprx.settings.set('hotkeys', defaults);
      setSettings(saved);
      setSaveStatus('saved');
      return true;
    } catch (error) {
      setSettings((previous) => ({ ...previous, hotkeys: previousHotkeys }));
      const message = error instanceof Error
        ? error.message
        : 'Unable to save this setting.';
      setSaveStatus('error');
      setSaveError(message);
      console.error('Failed to save setting:', error);
      return false;
    }
  }, [settings.hotkeys]);

  const resetAdvancedSection = useCallback(async () => {
    const defaults = {
      analysisProvider: DEFAULT_SETTINGS.analysisProvider,
      analysisModelsByProvider: DEFAULT_SETTINGS.analysisModelsByProvider,
      debugMode: DEFAULT_SETTINGS.debugMode,
      keepAudioBackups: DEFAULT_SETTINGS.keepAudioBackups,
    };
    setSettings((prev) => ({ ...prev, ...defaults }));
    setSaveStatus('saving');
    setSaveError(null);
    try {
      for (const [key, value] of Object.entries(defaults)) {
        await window.markuprx.settings.set(key as keyof PublicSettings, value);
      }
      window.dispatchEvent(new CustomEvent('markuprx:settings-updated', { detail: { type: 'analysis-provider', provider: defaults.analysisProvider } }));
      await refreshAnalysisProviders(true);
      setSaveStatus('saved');
      return true;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Unable to save this setting.';
      setSaveStatus('error');
      setSaveError(message);
      console.error('Failed to save setting:', error);
      return false;
    }
  }, [refreshAnalysisProviders]);

  // ---------------------------------------------------------------------------
  // Data management handlers
  // ---------------------------------------------------------------------------

  const handleClearAllData = useCallback(async () => {
    if (isClearingData) return;
    setIsClearingData(true);
    setClearDataError(null);
    setSaveStatus('saving');
    try {
      const result = await window.markuprx.settings.clearAllData();
      setSettings(result.settings);
      window.dispatchEvent(new CustomEvent('markuprx:settings-updated', {
        detail: { type: result.success ? 'reset' : 'partial-reset' },
      }));
      await refreshAnalysisProviders(true);
      if (!result.success) {
        const count = result.failures.length;
        const message = `Clear All Data is incomplete. ${count} ${count === 1 ? 'item needs' : 'items need'} attention. Retry when ready.`;
        setClearDataError(message);
        setSaveError(message);
        setSaveStatus('error');
        const presence = await getApiKeyPresence();
        setOpenAiApiKey((previous) => ({
          ...previous,
          value: presence.hasOpenAiKey ? MASKED_API_KEY_PLACEHOLDER : '',
          valid: presence.hasOpenAiKey ? true : null,
        }));
        setAnthropicApiKey((previous) => ({
          ...previous,
          value: presence.hasAnthropicKey ? MASKED_API_KEY_PLACEHOLDER : '',
          valid: presence.hasAnthropicKey ? true : null,
        }));
        return;
      }
      setOpenAiApiKey({ value: '', visible: false, testing: false, valid: null, error: null });
      setAnthropicApiKey({ value: '', visible: false, testing: false, valid: null, error: null });
      setSaveError(null);
      setSaveStatus('saved');
    } catch {
      const message = 'Clear All Data could not finish. Nothing is reported as complete; retry when ready.';
      setClearDataError(message);
      setSaveError(message);
      setSaveStatus('error');
      console.error('Failed to clear application data.');
    } finally {
      setIsClearingData(false);
    }
  }, [getApiKeyPresence, isClearingData, refreshAnalysisProviders]);

  const handleExportSettings = useCallback(async () => {
    try {
      await window.markuprx.settings.export();
    } catch (error) {
      console.error('Failed to export settings:', error);
    }
  }, []);

  const handleImportSettings = useCallback(async () => {
    try {
      const imported = await window.markuprx.settings.import();
      if (imported) {
        setSettings(imported);
        window.dispatchEvent(new CustomEvent('markuprx:settings-updated', {
          detail: { type: 'import' },
        }));
      }
    } catch (error) {
      console.error('Failed to import settings:', error);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // ---------------------------------------------------------------------------
  // Return value
  // ---------------------------------------------------------------------------

  const analysisProviderViewState = getAnalysisProviderViewState(
    settings.analysisProvider,
    analysisProviderStatuses,
    settings.analysisModelsByProvider,
  );

  return {
    // State
    activeTab,
    setActiveTab,
    settings,
    audioDevices,
    openAiApiKey,
    anthropicApiKey,
    saveStatus,
    saveError,
    appVersion,
    analysisProviderStatuses,
    isScanningProviders,
    whisperModelStatus,
    isRepairingLocalTranscription,
    localTranscriptionError,
    isClearingData,
    clearDataError,
    analysisProviderViewState,

    // Setting handlers
    handleSettingChange,
    handleAnalysisModelChange,
    handleRepairLocalTranscription,
    handleHotkeyChange,
    refreshAnalysisProviders,

    // API key handlers
    handleOpenAiApiKeyChange,
    handleToggleOpenAiApiKeyVisibility,
    handleTestOpenAiApiKey,
    handleAnthropicApiKeyChange,
    handleToggleAnthropicApiKeyVisibility,
    handleTestAnthropicApiKey,

    // Reset handlers
    resetGeneralSection,
    resetRecordingSection,
    resetRecordingCompatibilitySection,
    resetAppearanceSection,
    resetHotkeysSection,
    resetAdvancedSection,

    // Data management
    handleClearAllData,
    handleExportSettings,
    handleImportSettings,
  };
}
