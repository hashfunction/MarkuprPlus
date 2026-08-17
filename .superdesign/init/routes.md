# Renderer Routes and Views

MarkuprX has one trusted Electron renderer URL and no React Router. Navigation is state-based through `UIContext.currentView`; native menus and the tray deliver IPC events that switch the active secondary surface.

## View map

| Logical view | Trigger | Rendered component | Shared layout |
| --- | --- | --- | --- |
| `main` | Tray left-click, close/back from a secondary view | `src/renderer/App.tsx` main card | `AppWrapper` → `App` |
| `settings` | Home settings icon, application menu, tray context menu | `src/renderer/components/SettingsPanel.tsx` | Mounted by `App` |
| `history` | Home history icon, application File menu | `src/renderer/components/SessionHistory.tsx` | Mounted by `App` |
| `shortcuts` | Help → Keyboard Shortcuts, Cmd/Ctrl+/ | `src/renderer/components/KeyboardShortcuts.tsx` | Mounted by `App` |
| capture overlay | Separate Electron window with `?overlay` | `src/renderer/overlays/CaptureOverlayApp.tsx` | Separate renderer branch; outside this portrait-shell redesign |

## Renderer entry

Source: `src/renderer/main.tsx`

```tsx
/**
 * markuprx - Renderer Entry Point
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import AppWrapper from './AppWrapper';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './components/ThemeProvider';
import { initAudioCapture, destroyAudioCapture } from './audio/AudioCaptureRenderer';
import CaptureOverlayApp from './overlays/CaptureOverlayApp';

// Import global styles (includes CSS reset and theme utilities)
import './styles/globals.css';
// Import premium animation styles
import './styles/animations.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const isCaptureOverlay = new URLSearchParams(window.location.search).has('overlay');

// Overlay windows share this renderer bundle but must not initialize microphone
// capture or the primary app contexts.
if (!isCaptureOverlay) {
  initAudioCapture();
  window.addEventListener('beforeunload', () => {
    destroyAudioCapture();
  });
}

// Global error handler for uncaught errors
window.addEventListener('error', (event) => {
  console.error('[Global Error Handler]', event.error);
  // Could report to main process here
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason);
  // Could report to main process here
});

const root = createRoot(container);
root.render(
  <React.StrictMode>
    {isCaptureOverlay ? (
      <ErrorBoundary>
        <CaptureOverlayApp />
      </ErrorBoundary>
    ) : (
      <ThemeProvider defaultMode="system" defaultAccentColor="#3b82f6">
        <ErrorBoundary
          onError={(error, errorInfo) => {
            console.error('[App ErrorBoundary]', error, errorInfo);
          }}
        >
          <AppWrapper />
        </ErrorBoundary>
      </ThemeProvider>
    )}
  </React.StrictMode>
);
```

## State router

Source: `src/renderer/contexts/UIContext.tsx`

```tsx
/**
 * UIContext
 *
 * Manages UI navigation state, app settings, derived display values,
 * and navigation IPC listeners from the main process menu/tray.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AnalysisProviderStatus, AppSettings, SessionState } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';
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

  // Settings
  settings: AppSettings | null;
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
  handleExport: (options: { format: string; projectName: string; includeImages: boolean; theme: string }) => Promise<void>;
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

function mapOverlaySize(view: AppView): { width: number; height: number } {
  switch (view) {
    case 'settings':
      return { width: 920, height: 760 };
    case 'history':
      return { width: 920, height: 760 };
    case 'shortcuts':
      return { width: 720, height: 720 };
    default:
      return { width: 0, height: 0 };
  }
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

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [analysisProviderStatuses, setAnalysisProviderStatuses] = useState<AnalysisProviderStatus[]>([]);

  const refreshAnalysisProviderStatus = useCallback(async (): Promise<AppSettings | null> => {
    if (!window.markuprx?.settings || !window.markuprx?.analysisProviders) {
      setAnalysisProviderStatuses([]);
      return null;
    }
    try {
      const [loadedSettings, statuses] = await Promise.all([
        window.markuprx.settings.getAll(),
        window.markuprx.analysisProviders.discover(false),
      ]);
      const mergedSettings = { ...DEFAULT_SETTINGS, ...loadedSettings };
      setSettings(mergedSettings);
      setAnalysisProviderStatuses(statuses);
      return mergedSettings;
    } catch {
      setAnalysisProviderStatuses([]);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!window.markuprx?.settings) return;
    const loadInitialSettings = async () => {
      try {
        const loadedSettings = await refreshAnalysisProviderStatus();
        if (loadedSettings && !loadedSettings.hasCompletedOnboarding) {
          setShowOnboarding(true);
        }
      } catch {
        // Settings load failure is non-fatal
      }
    };

    void loadInitialSettings();
  }, [refreshAnalysisProviderStatus]);

  // Re-check provider readiness when returning to the main view from settings.
  useEffect(() => {
    if (!window.markuprx?.settings || currentView !== 'main') return;
    void refreshAnalysisProviderStatus();
  }, [currentView, refreshAnalysisProviderStatus]);

  useEffect(() => {
    const handleSettingsUpdated = () => {
      void refreshAnalysisProviderStatus();
    };
    window.addEventListener('markuprx:settings-updated', handleSettingsUpdated);
    return () => {
      window.removeEventListener('markuprx:settings-updated', handleSettingsUpdated);
    };
  }, [refreshAnalysisProviderStatus]);

  // ---------------------------------------------------------------------------
  // Navigation event listeners (from main process menu/tray)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const nav = window.markuprx?.navigation;
    if (!nav) return;

    const unsubSettings = nav.onShowSettings(() => setCurrentView('settings'));
    const unsubHistory = nav.onShowHistory(() => setCurrentView('history'));
    const unsubShortcuts = nav.onShowShortcuts(() => setCurrentView('shortcuts'));
    const unsubOnboarding = nav.onShowOnboarding(() => setShowOnboarding(true));
    const unsubExport = nav.onShowExport(() => setShowExportDialog(true));

    return () => {
      unsubSettings();
      unsubHistory();
      unsubShortcuts();
      unsubOnboarding();
      unsubExport();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Dismiss overlays when recording starts (driven by recording state)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (recording.state === 'recording') {
      setCurrentView('main');
      setShowCountdown(false);
    }
  }, [recording.state]);

  // ---------------------------------------------------------------------------
  // Popover resize on state/view change
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!window.markuprx?.popover) return;
    if (currentView !== 'main') {
      const { width, height } = mapOverlaySize(currentView);
      window.markuprx.popover.resize(width, height).catch(() => {});
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
              ? 'Recording works now. Add an OpenAI API key or repair the managed local transcription model for automatic narration transcription.'
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
    void refreshAnalysisProviderStatus();
    window.markuprx?.whisper
      ?.hasTranscriptionCapability()
      .then(() => {})
      .catch(() => {});
  }, [refreshAnalysisProviderStatus]);

  const handleOnboardingSkip = useCallback(() => {
    setShowOnboarding(false);
    window.markuprx.setSettings({ hasCompletedOnboarding: true }).catch(() => {});
  }, []);

  const handleExport = useCallback(async (_options: { format: string; projectName: string; includeImages: boolean; theme: string }) => {
    setShowExportDialog(false);
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
      settings,
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
      settings,
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
```
