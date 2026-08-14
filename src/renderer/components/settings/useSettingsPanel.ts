/**
 * useSettingsPanel
 *
 * Encapsulates all settings panel state, handlers, and effects.
 * Returns everything the SettingsPanel shell needs to render.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  AnalysisProviderStatus,
  AppSettings,
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
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [openAiApiKey, setOpenAiApiKey] = useState<ApiKeyState>({
    value: '', visible: false, testing: false, valid: null, error: null,
  });
  const [anthropicApiKey, setAnthropicApiKey] = useState<ApiKeyState>({
    value: '', visible: false, testing: false, valid: null, error: null,
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [analysisProviderStatuses, setAnalysisProviderStatuses] = useState<AnalysisProviderStatus[]>([]);
  const [isScanningProviders, setIsScanningProviders] = useState(false);
  const [whisperModelStatus, setWhisperModelStatus] = useState<WhisperModelCheckResult | null>(null);
  const [isRepairingLocalTranscription, setIsRepairingLocalTranscription] = useState(false);
  const [localTranscriptionError, setLocalTranscriptionError] = useState<string | null>(null);
  const [isCompact, setIsCompact] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 760
  );

  const panelRef = useRef<HTMLDivElement>(null);

  const getApiKeyPresence = useCallback(async (): Promise<{ hasOpenAiKey: boolean; hasAnthropicKey: boolean }> => {
    try {
      const [hasOpenAiKey, hasAnthropicKey] = await Promise.all([
        window.markupr.settings.hasApiKey('openai'),
        window.markupr.settings.hasApiKey('anthropic'),
      ]);
      return { hasOpenAiKey, hasAnthropicKey };
    } catch {
      return { hasOpenAiKey: false, hasAnthropicKey: false };
    }
  }, []);

  const refreshAnalysisProviders = useCallback(async (force = true): Promise<AnalysisProviderStatus[]> => {
    setIsScanningProviders(true);
    try {
      const statuses = await window.markupr.analysisProviders.discover(force);
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
        const allSettings = await window.markupr.settings.getAll();
        const loadedSettings = { ...DEFAULT_SETTINGS, ...allSettings };
        setSettings(loadedSettings);

        const [devices, providerStatuses, { hasOpenAiKey, hasAnthropicKey }, localModelStatus] = await Promise.all([
          window.markupr.audio.getDevices(),
          refreshAnalysisProviders(false),
          getApiKeyPresence(),
          window.markupr.whisper.checkModel().catch(() => null),
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
          const ver = await window.markupr.version();
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
    async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
      setHasChanges(true);
      try {
        await window.markupr.settings.set(key, value);
        if (key === 'analysisProvider' || key === 'analysisModelsByProvider') {
          await refreshAnalysisProviders(true);
          window.dispatchEvent(new CustomEvent('markupr:settings-updated', {
            detail: { type: 'analysis-provider', provider: key === 'analysisProvider' ? value : undefined },
          }));
        }
      } catch (error) {
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
      const result = await window.markupr.whisper.downloadModel('tiny');
      if (!result.success) {
        throw new Error(result.error || 'The local transcription model download failed.');
      }
      const updated = await window.markupr.whisper.checkModel();
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
      const newHotkeys = { ...settings.hotkeys, [key]: value };
      setSettings((prev) => ({ ...prev, hotkeys: newHotkeys }));
      setHasChanges(true);
      try {
        await window.markupr.settings.set('hotkeys', newHotkeys);
        await window.markupr.hotkeys.updateConfig(newHotkeys);
      } catch (error) {
        console.error('Failed to update hotkey:', error);
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
      let candidateKey = openAiApiKey.value.trim();
      if (candidateKey === MASKED_API_KEY_PLACEHOLDER) {
        const storedKey = await window.markupr.settings.getApiKey('openai');
        if (!storedKey) {
          setOpenAiApiKey((prev) => ({
            ...prev, valid: false,
            error: 'No saved OpenAI key found. Paste your key and test again.',
          }));
          return;
        }
        candidateKey = storedKey.trim();
      }
      const validation = await withTimeout(
        window.markupr.settings.testApiKey('openai', candidateKey),
        API_TEST_TIMEOUT_MS,
        'OpenAI API test timed out. Please try again.'
      );
      if (validation.valid) {
        const saved = await withTimeout(
          window.markupr.settings.setApiKey('openai', candidateKey),
          API_SAVE_TIMEOUT_MS,
          'Saving OpenAI key timed out. Please try again.'
        );
        if (!saved) {
          setOpenAiApiKey((prev) => ({
            ...prev, valid: false,
            error: 'OpenAI key validated, but local save verification failed. Relaunch app and try again.',
          }));
          return;
        }
        setOpenAiApiKey((prev) => ({ ...prev, valid: true }));
        window.dispatchEvent(new CustomEvent('markupr:settings-updated', { detail: { type: 'api-key', provider: 'openai' } }));
      } else {
        setOpenAiApiKey((prev) => ({
          ...prev, valid: false,
          error: validation.error || 'OpenAI API key test failed. Please try again.',
        }));
      }
    } catch (error) {
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
      let candidateKey = anthropicApiKey.value.trim();
      if (candidateKey === MASKED_API_KEY_PLACEHOLDER) {
        const storedKey = await window.markupr.settings.getApiKey('anthropic');
        if (!storedKey) {
          setAnthropicApiKey((prev) => ({
            ...prev, valid: false,
            error: 'No saved Anthropic key found. Paste your key and test again.',
          }));
          return;
        }
        candidateKey = storedKey.trim();
      }
      const validation = await withTimeout(
        window.markupr.settings.testApiKey('anthropic', candidateKey),
        API_TEST_TIMEOUT_MS,
        'Anthropic API test timed out. Please try again.'
      );
      if (validation.valid) {
        const saved = await withTimeout(
          window.markupr.settings.setApiKey('anthropic', candidateKey),
          API_SAVE_TIMEOUT_MS,
          'Saving Anthropic key timed out. Please try again.'
        );
        if (!saved) {
          setAnthropicApiKey((prev) => ({
            ...prev, valid: false,
            error: 'Anthropic key validated, but local save verification failed. Relaunch app and try again.',
          }));
          return;
        }
        await refreshAnalysisProviders(true);
        setAnthropicApiKey((prev) => ({ ...prev, valid: true }));
        window.dispatchEvent(new CustomEvent('markupr:settings-updated', { detail: { type: 'api-key', provider: 'anthropic' } }));
      } else {
        setAnthropicApiKey((prev) => ({
          ...prev, valid: false,
          error: validation.error || 'Anthropic API key test failed. Please try again.',
        }));
      }
    } catch (error) {
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
      outputDirectory: DEFAULT_SETTINGS.outputDirectory,
      launchAtLogin: DEFAULT_SETTINGS.launchAtLogin,
      checkForUpdates: DEFAULT_SETTINGS.checkForUpdates,
    };
    setSettings((prev) => ({ ...prev, ...defaults }));
    for (const [key, value] of Object.entries(defaults)) {
      await window.markupr.settings.set(key as keyof AppSettings, value);
    }
  }, []);

  const resetRecordingSection = useCallback(async () => {
    const defaults = {
      defaultCountdown: DEFAULT_SETTINGS.defaultCountdown,
      showTranscriptionPreview: DEFAULT_SETTINGS.showTranscriptionPreview,
      showAudioWaveform: DEFAULT_SETTINGS.showAudioWaveform,
      audioDeviceId: DEFAULT_SETTINGS.audioDeviceId,
      pauseThreshold: DEFAULT_SETTINGS.pauseThreshold,
      minTimeBetweenCaptures: DEFAULT_SETTINGS.minTimeBetweenCaptures,
    };
    setSettings((prev) => ({ ...prev, ...defaults }));
    for (const [key, value] of Object.entries(defaults)) {
      await window.markupr.settings.set(key as keyof AppSettings, value);
    }
  }, []);

  const resetAppearanceSection = useCallback(async () => {
    const defaults = {
      theme: DEFAULT_SETTINGS.theme,
      accentColor: DEFAULT_SETTINGS.accentColor,
    };
    setSettings((prev) => ({ ...prev, ...defaults }));
    for (const [key, value] of Object.entries(defaults)) {
      await window.markupr.settings.set(key as keyof AppSettings, value);
    }
  }, []);

  const resetHotkeysSection = useCallback(async () => {
    const defaults = { ...DEFAULT_HOTKEY_CONFIG };
    setSettings((prev) => ({ ...prev, hotkeys: defaults }));
    await window.markupr.settings.set('hotkeys', defaults);
    // @ts-expect-error - update may be named updateConfig in type definition
    await (window.markupr.hotkeys.update ?? window.markupr.hotkeys.updateConfig)?.(defaults);
  }, []);

  const resetAdvancedSection = useCallback(async () => {
    const defaults = {
      analysisProvider: DEFAULT_SETTINGS.analysisProvider,
      analysisModelsByProvider: DEFAULT_SETTINGS.analysisModelsByProvider,
      debugMode: DEFAULT_SETTINGS.debugMode,
      keepAudioBackups: DEFAULT_SETTINGS.keepAudioBackups,
    };
    setSettings((prev) => ({ ...prev, ...defaults }));
    for (const [key, value] of Object.entries(defaults)) {
      await window.markupr.settings.set(key as keyof AppSettings, value);
    }
    window.dispatchEvent(new CustomEvent('markupr:settings-updated', { detail: { type: 'analysis-provider', provider: defaults.analysisProvider } }));
    await refreshAnalysisProviders(true);
  }, [refreshAnalysisProviders]);

  // ---------------------------------------------------------------------------
  // Data management handlers
  // ---------------------------------------------------------------------------

  const handleClearAllData = useCallback(async () => {
    try {
      await window.markupr.settings.clearAllData();
      setSettings(DEFAULT_SETTINGS);
      setOpenAiApiKey({ value: '', visible: false, testing: false, valid: null, error: null });
      setAnthropicApiKey({ value: '', visible: false, testing: false, valid: null, error: null });
      setAnalysisProviderStatuses([]);
      window.dispatchEvent(new CustomEvent('markupr:settings-updated', { detail: { type: 'reset' } }));
    } catch (error) {
      console.error('Failed to clear data:', error);
    }
  }, []);

  const handleExportSettings = useCallback(async () => {
    try {
      await window.markupr.settings.export();
    } catch (error) {
      console.error('Failed to export settings:', error);
    }
  }, []);

  const handleImportSettings = useCallback(async () => {
    try {
      const imported = await window.markupr.settings.import();
      if (imported) {
        setSettings({ ...DEFAULT_SETTINGS, ...imported });
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

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    const onResize = () => {
      setIsCompact(window.innerWidth < 760);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
    hasChanges,
    isAnimating,
    appVersion,
    analysisProviderStatuses,
    isScanningProviders,
    whisperModelStatus,
    isRepairingLocalTranscription,
    localTranscriptionError,
    analysisProviderViewState,
    isCompact,
    panelRef,

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
    resetAppearanceSection,
    resetHotkeysSection,
    resetAdvancedSection,

    // Data management
    handleClearAllData,
    handleExportSettings,
    handleImportSettings,
  };
}
