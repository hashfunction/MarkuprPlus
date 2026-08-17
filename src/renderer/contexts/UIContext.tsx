/**
 * UIContext
 *
 * Manages UI navigation state, app settings, derived display values,
 * and navigation IPC listeners from the main process menu/tray.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnalysisProviderStatus,
  PublicSettings,
  HotkeyConfig,
  ReviewExportOptions,
  ReviewExportResult,
  ReviewSession,
  SessionState,
} from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';
import { getPopoverSizeForView } from '../../shared/popoverLayout';
import { getAnalysisProviderViewState, type AnalysisProviderViewState } from '../components/settings/analysisProviderViewState';
import { useRecording } from './RecordingContext';
import { useProcessing } from './ProcessingContext';

// ============================================================================
// Types
// ============================================================================

export type AppView = 'main' | 'settings' | 'history' | 'shortcuts';

export interface UIContextValue {
  // Navigation
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  closeOverlay: () => void;

  // Dialog state
  showOnboarding: boolean;
  setShowOnboarding: (show: boolean) => void;
  showCountdown: boolean;
  setShowCountdown: (show: boolean) => void;
  showExportDialog: boolean;
  setShowExportDialog: (show: boolean) => void;
  isExportInFlight: boolean;

  // Settings
  settings: PublicSettings | null;
  applyHotkeyConfig: (hotkeys: HotkeyConfig) => void;
  analysisProviderViewState: AnalysisProviderViewState;
  countdownDuration: number;

  // Derived state
  isHudMode: boolean;
  showRecordingStatus: boolean;
  showProcessingProgress: boolean;
  statusCopy: { title: string; detail: string };
  primaryActionLabel: string;
  primaryActionDisabled: boolean;
  pauseActionDisabled: boolean;
  manualCaptureDisabled: boolean;

  // Handlers
  handleOnboardingComplete: () => void;
  handleOnboardingSkip: () => void;
  handleExport: (
    session: ReviewSession,
    options: ReviewExportOptions,
  ) => Promise<ReviewExportResult>;
}

const UIContext = createContext<UIContextValue | null>(null);

export function useUI(): UIContextValue {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within UIProvider');
  }
  return context;
}

// ============================================================================
// Helpers
// ============================================================================

function mapPopoverState(state: SessionState): 'idle' | 'recording' | 'processing' | 'complete' | 'error' {
  if (state === 'recording' || state === 'starting') return 'recording';
  if (state === 'stopping' || state === 'processing') return 'processing';
  if (state === 'complete') return 'complete';
  if (state === 'error') return 'error';
  return 'idle';
}

async function resizeForView(view: Exclude<AppView, 'main'>): Promise<void> {
  const size = getPopoverSizeForView(view);
  await window.markuprx.popover.resize(size.width, size.height);
}

// ============================================================================
// Provider
// ============================================================================

export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const recording = useRecording();
  const processing = useProcessing();

  // ---------------------------------------------------------------------------
  // Navigation state
  // ---------------------------------------------------------------------------
  const [currentView, setCurrentView] = useState<AppView>('main');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showCountdown, setShowCountdown] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isExportInFlight, setIsExportInFlight] = useState(false);
  const exportInFlightRef = useRef<Promise<ReviewExportResult> | null>(null);

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [analysisProviderStatuses, setAnalysisProviderStatuses] = useState<AnalysisProviderStatus[]>([]);
  const hasEvaluatedInitialOnboarding = useRef(false);

  const refreshSettings = useCallback(async (): Promise<PublicSettings | null> => {
    if (!window.markuprx?.settings) {
      return null;
    }
    try {
      const loadedSettings = await window.markuprx.settings.getAll();
      setSettings(loadedSettings);
      return loadedSettings;
    } catch {
      return null;
    }
  }, []);

  const refreshAnalysisProviderStatus = useCallback(async (): Promise<void> => {
    if (!window.markuprx?.analysisProviders) {
      setAnalysisProviderStatuses([]);
      return;
    }
    try {
      const statuses = await window.markuprx.analysisProviders.discover(false);
      setAnalysisProviderStatuses(statuses);
    } catch {
      setAnalysisProviderStatuses([]);
    }
  }, []);

  // Refresh settings independently on every view transition. Native menu
  // navigation is delivered only after main-process IPC registration, making
  // it a stable retry point if eager renderer hydration raced startup.
  useEffect(() => {
    if (!window.markuprx?.settings) return;
    const hydrateSettings = async () => {
      const loadedSettings = await refreshSettings();
      if (loadedSettings && !hasEvaluatedInitialOnboarding.current) {
        hasEvaluatedInitialOnboarding.current = true;
        if (!loadedSettings.hasCompletedOnboarding) {
          setShowOnboarding(true);
        }
      }
    };

    void hydrateSettings();
    if (currentView === 'main') {
      void refreshAnalysisProviderStatus();
    }
  }, [currentView, refreshAnalysisProviderStatus, refreshSettings]);

  const applyHotkeyConfig = useCallback((hotkeys: HotkeyConfig) => {
    setSettings((current) => ({ ...(current ?? DEFAULT_SETTINGS), hotkeys }));
  }, []);

  useEffect(() => {
    const handleSettingsUpdated = () => {
      void refreshSettings();
      void refreshAnalysisProviderStatus();
    };
    window.addEventListener('markuprx:settings-updated', handleSettingsUpdated);
    return () => {
      window.removeEventListener('markuprx:settings-updated', handleSettingsUpdated);
    };
  }, [refreshAnalysisProviderStatus, refreshSettings]);

  // ---------------------------------------------------------------------------
  // Navigation event listeners (from main process menu/tray)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const nav = window.markuprx?.navigation;
    if (!nav) return;

    const unsubSettings = nav.onShowSettings(() => setCurrentView('settings'));
    const unsubHistory = nav.onShowHistory(() => setCurrentView('history'));
    const unsubShortcuts = nav.onShowShortcuts(() => setCurrentView('shortcuts'));
    const recoveryOwnsTransientUi = Boolean(recording.incompleteSession)
      && !recording.isCheckingRecovery;
    const unsubOnboarding = nav.onShowOnboarding(() => {
      if (!recoveryOwnsTransientUi) setShowOnboarding(true);
    });
    const unsubExport = nav.onShowExport(() => {
      if (!recoveryOwnsTransientUi) setShowExportDialog(true);
    });

    return () => {
      unsubSettings();
      unsubHistory();
      unsubShortcuts();
      unsubOnboarding();
      unsubExport();
    };
  }, [recording.incompleteSession, recording.isCheckingRecovery]);

  // ---------------------------------------------------------------------------
  // Dismiss overlays when recording starts (driven by recording state)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (recording.state === 'recording') {
      setCurrentView('main');
      setShowCountdown(false);
    }
  }, [recording.state]);

  // Recovery owns the transient surface. Clear queued intents instead of
  // merely hiding them so they cannot reappear after recover/discard.
  useEffect(() => {
    if (recording.incompleteSession && !recording.isCheckingRecovery) {
      setShowCountdown(false);
      setShowExportDialog(false);
    }
  }, [recording.incompleteSession, recording.isCheckingRecovery]);

  // ---------------------------------------------------------------------------
  // Popover resize on state/view change
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!window.markuprx?.popover) return;
    if (currentView !== 'main') {
      void resizeForView(currentView).catch(() => {});
      return;
    }

    window.markuprx.popover.resizeToState(mapPopoverState(recording.state)).catch(() => {});
  }, [recording.state, currentView]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------
  const showRecordingStatus = recording.state === 'recording';
  const showProcessingProgress = recording.state === 'stopping' || recording.state === 'processing';
  const isHudMode = (showRecordingStatus || showProcessingProgress) && currentView === 'main';
  const countdownDuration = settings?.defaultCountdown ?? 0;
  const analysisProviderViewState = getAnalysisProviderViewState(
    settings?.analysisProvider ?? DEFAULT_SETTINGS.analysisProvider,
    analysisProviderStatuses,
    settings?.analysisModelsByProvider ?? DEFAULT_SETTINGS.analysisModelsByProvider,
  );

  const primaryActionLabel = recording.state === 'recording' ? 'Stop Session' : 'Start Session';
  const primaryActionDisabled =
    recording.isMutating ||
    recording.state === 'starting' ||
    recording.state === 'stopping' ||
    recording.state === 'processing';
  const pauseActionDisabled = recording.isMutating || recording.state !== 'recording';
  const manualCaptureDisabled = recording.isMutating || recording.state !== 'recording' || recording.isPaused;

  const statusCopy = useMemo(() => {
    switch (recording.state) {
      case 'starting':
        return {
          title: 'Preparing Session',
          detail: 'Initializing microphone capture and session recording.',
        };
      case 'recording':
        return {
          title: 'Recording Live',
          detail: recording.isPaused
            ? 'Session paused. Resume to continue capturing screen and narration.'
            : 'Mark shots while you narrate. After stop, AI aligns frames + transcript and assembles an AI-ready report.',
        };
      case 'stopping':
      case 'processing':
        return {
          title: 'Processing Your Recording',
          detail: processing.processingProgress?.step || 'Preparing post-processing pipeline...',
        };
      case 'complete':
        return {
          title: 'Report Ready',
          detail: 'Markdown path copied to your clipboard.',
        };
      case 'error':
        return {
          title: 'Session Error',
          detail: recording.errorMessage || 'An unexpected error interrupted this capture.',
        };
      default:
        return {
          title: 'Ready To Capture',
          detail:
            recording.hasTranscriptionCapability === false
              ? 'Recording works now. Repair the managed local transcription model, or add an OpenAI API key as an optional cloud fallback.'
              : 'Press Cmd+Shift+F to start a fresh feedback pass.',
        };
    }
  }, [recording.state, recording.errorMessage, recording.hasTranscriptionCapability, recording.isPaused, processing.processingProgress]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const closeOverlay = useCallback(() => {
    setCurrentView('main');
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
    window.markuprx?.setSettings({ hasCompletedOnboarding: true }).catch(() => {});
    void refreshSettings();
    void refreshAnalysisProviderStatus();
    window.markuprx?.whisper
      ?.hasTranscriptionCapability()
      .then(() => {})
      .catch(() => {});
  }, [refreshAnalysisProviderStatus, refreshSettings]);

  const handleOnboardingSkip = useCallback(() => {
    setShowOnboarding(false);
    window.markuprx.setSettings({ hasCompletedOnboarding: true }).catch(() => {});
  }, []);

  const handleExport = useCallback(async (
    session: ReviewSession,
    options: ReviewExportOptions,
  ): Promise<ReviewExportResult> => {
    if (exportInFlightRef.current) {
      return {
        success: false,
        status: 'error',
        error: 'A previous export is still finishing.',
      };
    }

    const operation = window.markuprx.output.exportReview(session, options);
    exportInFlightRef.current = operation;
    setIsExportInFlight(true);
    try {
      return await operation;
    } finally {
      if (exportInFlightRef.current === operation) {
        exportInFlightRef.current = null;
        setIsExportInFlight(false);
      }
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Context value
  // ---------------------------------------------------------------------------
  const value = useMemo(
    (): UIContextValue => ({
      currentView,
      setCurrentView,
      closeOverlay,
      showOnboarding,
      setShowOnboarding,
      showCountdown,
      setShowCountdown,
      showExportDialog,
      setShowExportDialog,
      isExportInFlight,
      settings,
      applyHotkeyConfig,
      analysisProviderViewState,
      countdownDuration,
      isHudMode,
      showRecordingStatus,
      showProcessingProgress,
      statusCopy,
      primaryActionLabel,
      primaryActionDisabled,
      pauseActionDisabled,
      manualCaptureDisabled,
      handleOnboardingComplete,
      handleOnboardingSkip,
      handleExport,
    }),
    [
      currentView,
      closeOverlay,
      showOnboarding,
      showCountdown,
      showExportDialog,
      isExportInFlight,
      settings,
      applyHotkeyConfig,
      analysisProviderViewState,
      countdownDuration,
      isHudMode,
      showRecordingStatus,
      showProcessingProgress,
      statusCopy,
      primaryActionLabel,
      primaryActionDisabled,
      pauseActionDisabled,
      manualCaptureDisabled,
      handleOnboardingComplete,
      handleOnboardingSkip,
      handleExport,
    ]
  );

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  );
};

export default UIContext;
