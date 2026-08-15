/**
 * RecordingContext
 *
 * Manages the core recording session lifecycle: state machine, IPC listeners,
 * screen recording sync, audio levels, output paths, and session actions.
 * This is the foundational context that other contexts depend on.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  SessionPayload,
  SessionState,
  ReviewSession,
  FocusedElementHint,
  AnnotationMode,
} from '../../shared/types';
import { getScreenRecordingRenderer } from '../capture/ScreenRecordingRenderer';
import { useCrashRecovery } from '../components';
import { getOutputReadyStatus } from './outputReadyState';

// ============================================================================
// Types
// ============================================================================

export interface ProcessingProgress {
  percent: number;
  step: string;
}

export interface RecentSession {
  id: string;
  startTime: number;
  endTime: number;
  itemCount: number;
  screenshotCount: number;
  sourceName: string;
  firstThumbnail?: string;
  folder: string;
  transcriptionPreview?: string;
}

export interface LastCapture {
  trigger?: 'pause' | 'manual' | 'voice-command' | 'annotation';
  timestamp: number;
}

export interface RecordingContextValue {
  // Session state
  state: SessionState;
  duration: number;
  screenshotCount: number;
  isPaused: boolean;
  isMutating: boolean;
  annotationActive: boolean;
  annotationMode: AnnotationMode;

  // Audio
  audioLevel: number;
  isVoiceActive: boolean;
  lastCapture: LastCapture | null;

  // Output
  reportPath: string | null;
  recordingPath: string | null;
  audioPath: string | null;
  sessionDir: string | null;
  reviewSession: ReviewSession | null;
  errorMessage: string | null;

  // Capability
  hasTranscriptionCapability: boolean | null;

  // Recent sessions
  recentSessions: RecentSession[];
  loadRecentSessions: () => Promise<void>;

  // Processing raw state (consumed by ProcessingContext)
  rawProcessingProgress: ProcessingProgress | null;
  processingStartedAt: number | null;

  // Review editor
  showReviewEditor: boolean;
  setShowReviewEditor: (show: boolean) => void;

  // Crash recovery
  incompleteSession: ReturnType<typeof useCrashRecovery>['incompleteSession'];
  isCheckingRecovery: boolean;

  // Actions
  startSession: () => Promise<void>;
  stopSession: () => Promise<void>;
  togglePause: () => Promise<void>;
  toggleAnnotation: () => Promise<void>;
  manualCapture: () => Promise<void>;
  copyReportPath: () => Promise<void>;
  openReportFolder: () => Promise<void>;
  copyRecordingPath: () => Promise<void>;
  copyAudioPath: () => Promise<void>;
  openRecent: (session: { folder: string }) => Promise<void>;
  copyRecentPath: (session: { folder: string }) => Promise<void>;
  recoverSession: () => void;
  discardSession: () => void;
  reviewSave: (session: ReviewSession) => Promise<void>;
  reviewClose: () => void;
}

const RecordingContext = createContext<RecordingContextValue | null>(null);

function collectFocusedElementHintFromDom(): FocusedElementHint | undefined {
  const active = document.activeElement;
  if (!active || !(active instanceof HTMLElement)) {
    return undefined;
  }

  const textPreview = (active.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const label =
    active.getAttribute('aria-label')
    || active.getAttribute('aria-labelledby')
    || undefined;

  return {
    source: 'renderer-dom',
    role: active.getAttribute('role') || undefined,
    tagName: active.tagName?.toLowerCase() || undefined,
    id: active.id || undefined,
    name: active.getAttribute('name') || undefined,
    label,
    placeholder: active.getAttribute('placeholder') || undefined,
    textPreview: textPreview || undefined,
  };
}

export function useRecording(): RecordingContextValue {
  const context = useContext(RecordingContext);
  if (!context) {
    throw new Error('useRecording must be used within RecordingProvider');
  }
  return context;
}

// ============================================================================
// Provider
// ============================================================================

export const RecordingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // ---------------------------------------------------------------------------
  // Session state
  // ---------------------------------------------------------------------------
  const [state, setState] = useState<SessionState>('idle');
  const [duration, setDuration] = useState(0);
  const [screenshotCount, setScreenshotCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [annotationActive, setAnnotationActive] = useState(false);
  const [annotationMode, setAnnotationMode] = useState<AnnotationMode>('interact');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [lastCapture, setLastCapture] = useState<LastCapture | null>(null);
  const [reportPath, setReportPath] = useState<string | null>(null);
  const [recordingPath, setRecordingPath] = useState<string | null>(null);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [sessionDir, setSessionDir] = useState<string | null>(null);
  const [reviewSession, setReviewSession] = useState<ReviewSession | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasTranscriptionCapability, setHasTranscriptionCapability] = useState<boolean | null>(null);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [rawProcessingProgress, setRawProcessingProgress] = useState<ProcessingProgress | null>(null);
  const [showReviewEditor, setShowReviewEditor] = useState(false);

  // Refs
  const outputReadyRef = useRef(false);
  const processingStartedAtRef = useRef<number | null>(null);
  const stopRequestedRef = useRef(false);
  const screenRecorderRef = useRef(getScreenRecordingRenderer());
  const screenSyncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const annotationSessionIdRef = useRef<string | null>(null);

  // ---------------------------------------------------------------------------
  // Crash recovery
  // ---------------------------------------------------------------------------
  const {
    incompleteSession,
    isCheckingRecovery,
    recoverSession: rawRecoverSession,
    discardSession: rawDiscardSession,
  } = useCrashRecovery();

  // ---------------------------------------------------------------------------
  // Recent sessions
  // ---------------------------------------------------------------------------
  const loadRecentSessions = useCallback(async () => {
    try {
      if (!window.markupr?.output?.listSessions) {
        setRecentSessions([]);
        return;
      }
      const sessions = await window.markupr.output.listSessions();
      setRecentSessions(sessions.slice(0, 5));
    } catch (error) {
      console.error('[RecordingContext] Failed to load recent sessions:', error);
      setRecentSessions([]);
    }
  }, []);

  useEffect(() => {
    loadRecentSessions();
  }, [loadRecentSessions]);

  // ---------------------------------------------------------------------------
  // Transcription capability check
  // ---------------------------------------------------------------------------
  const refreshTranscriptionCapability = useCallback(() => {
    const whisperApi = window.markupr?.whisper;
    const settingsApi = window.markupr?.settings;

    if (!whisperApi && !settingsApi) {
      setHasTranscriptionCapability(false);
      return;
    }

    const capabilityCheck = whisperApi?.hasTranscriptionCapability
      ? whisperApi.hasTranscriptionCapability().catch(() => false)
      : Promise.resolve(false);
    const openAiKeyCheck = settingsApi?.hasApiKey
      ? settingsApi.hasApiKey('openai').catch(() => false)
      : Promise.resolve(false);

    void Promise.all([capabilityCheck, openAiKeyCheck])
      .then(([hasCapability, hasOpenAiKey]) => {
        setHasTranscriptionCapability(Boolean(hasCapability || hasOpenAiKey));
      })
      .catch(() => setHasTranscriptionCapability(false));
  }, []);

  useEffect(() => {
    refreshTranscriptionCapability();
  }, [refreshTranscriptionCapability]);

  useEffect(() => {
    const handleSettingsUpdated = () => {
      refreshTranscriptionCapability();
    };
    window.addEventListener('markupr:settings-updated', handleSettingsUpdated);
    return () => {
      window.removeEventListener('markupr:settings-updated', handleSettingsUpdated);
    };
  }, [refreshTranscriptionCapability]);

  // ---------------------------------------------------------------------------
  // Screen recording sync
  // ---------------------------------------------------------------------------
  const syncScreenRecording = useCallback(
    async (nextState: SessionState, session: SessionPayload | null, paused: boolean) => {
      const recorder = screenRecorderRef.current;

      if (nextState === 'recording') {
        if (stopRequestedRef.current) {
          recorder.releaseCaptureTracks();
          if (recorder.isRecording() || recorder.getSessionId()) {
            await recorder.stop().catch((error) => {
              console.warn('[RecordingContext] Forced recorder stop during stop-request guard failed:', error);
            });
          }
          return;
        }

        const latestStatus = await window.markupr.session.getStatus().catch(() => null);
        if (latestStatus && latestStatus.state !== 'recording') {
          if (recorder.isRecording() || recorder.getSessionId()) {
            await recorder.stop().catch((error) => {
              console.warn('[RecordingContext] Forced recorder stop during stale recording status guard failed:', error);
            });
          }
          return;
        }

        let activeSession = session;
        if (!activeSession) {
          for (let attempt = 0; attempt < 4; attempt += 1) {
            activeSession = await window.markupr.session.getCurrent();
            if (activeSession) break;
            if (attempt < 3) {
              await new Promise((resolve) => setTimeout(resolve, 180));
            }
          }
        }

        if (!activeSession) {
          setErrorMessage((prev) => prev || 'Session started, but screen recorder could not find an active capture target.');
          return;
        }

        if (!recorder.isRecording()) {
          try {
            const captureTarget = activeSession.metadata.captureTarget;
            await recorder.start(captureTarget
              ? { sessionId: activeSession.id, target: captureTarget }
              : { sessionId: activeSession.id, sourceId: activeSession.sourceId });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown screen recording error.';
            console.warn('[RecordingContext] Continuous screen recording failed for selected source:', message);
            setErrorMessage((prev) => prev || `Screen recording unavailable: ${message}`);
            return;
          }
        }

        const captureTarget = activeSession?.metadata.captureTarget;
        if (activeSession && captureTarget && annotationSessionIdRef.current !== activeSession.id) {
          const result = await window.markupr.capture.beginAnnotation(activeSession.id, captureTarget);
          if (result.success) {
            annotationSessionIdRef.current = activeSession.id;
          } else {
            setErrorMessage((prev) => prev || result.error || 'Live annotation could not be started.');
          }
        }

        if (paused) {
          await recorder.pause();
        } else {
          await recorder.resume();
        }
        return;
      }

      if (annotationSessionIdRef.current) {
        await window.markupr.capture.endAnnotation().catch(() => ({ success: false }));
        annotationSessionIdRef.current = null;
      }
      recorder.releaseCaptureTracks();
      if (recorder.isRecording() || recorder.getSessionId()) {
        await recorder.stop().catch((error) => {
          console.warn('[RecordingContext] Failed to stop continuous screen recording:', error);
        });
      }
      recorder.forceReleaseOrphanedCapture();
    },
    []
  );

  const queueScreenRecordingSync = useCallback(
    (nextState: SessionState, session: SessionPayload | null, paused: boolean) => {
      screenSyncQueueRef.current = screenSyncQueueRef.current
        .catch(() => {})
        .then(() => syncScreenRecording(nextState, session, paused));
      return screenSyncQueueRef.current;
    },
    [syncScreenRecording]
  );

  // ---------------------------------------------------------------------------
  // Session IPC listeners
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!window.markupr?.session) return;
    let mounted = true;
    const recorder = screenRecorderRef.current;

    window.markupr.session
      .getStatus()
      .then((status) => {
        if (!mounted) return;
        setState(status.state);
        setDuration(status.duration);
        setScreenshotCount(status.screenshotCount);
        setIsPaused(status.isPaused);
        void queueScreenRecordingSync(status.state, null, status.isPaused);
      })
      .catch((error) => {
        console.error('[RecordingContext] Failed to load initial status:', error);
      });

    const toUiState = (nextState: SessionState): SessionState =>
      nextState === 'complete' && !outputReadyRef.current ? 'processing' : nextState;

    const unsubState = window.markupr.session.onStateChange(({ state: nextState, session }) => {
      const effectiveState =
        stopRequestedRef.current && nextState === 'recording' ? 'stopping' : nextState;
      setState(toUiState(effectiveState));
      void queueScreenRecordingSync(effectiveState, session, false);
      if (nextState === 'recording') {
        stopRequestedRef.current = false;
        outputReadyRef.current = false;
        setErrorMessage(null);
        setReportPath(null);
        setRecordingPath(null);
        setAudioPath(null);
        setSessionDir(null);
        setReviewSession(null);
        setShowReviewEditor(false);
        setRawProcessingProgress(null);
        processingStartedAtRef.current = null;
        setIsPaused(false);
      }
      if (nextState === 'stopping' || nextState === 'processing') {
        stopRequestedRef.current = true;
        if (!processingStartedAtRef.current) {
          processingStartedAtRef.current = Date.now();
        }
        setRawProcessingProgress((previous) => previous ?? { percent: 0, step: 'preparing' });
      }
      if (nextState === 'idle') {
        stopRequestedRef.current = false;
        outputReadyRef.current = false;
        setDuration(0);
        setRawProcessingProgress(null);
        processingStartedAtRef.current = null;
        setIsPaused(false);
      }
    });

    const unsubStatus = window.markupr.session.onStatusUpdate((status) => {
      if (status.state === 'stopping' || status.state === 'processing') {
        stopRequestedRef.current = true;
      }
      const effectiveState =
        stopRequestedRef.current && status.state === 'recording' ? 'stopping' : status.state;
      setDuration(status.duration);
      setScreenshotCount(status.screenshotCount);
      setState(toUiState(effectiveState));
      setIsPaused(status.isPaused);
      void queueScreenRecordingSync(effectiveState, null, status.isPaused);
    });

    const unsubScreenshot = window.markupr.capture.onScreenshot((payload) => {
      setScreenshotCount(payload.count);
      setLastCapture({
        trigger: payload.trigger,
        timestamp: payload.timestamp,
      });
    });

    const unsubReady = window.markupr.output.onReady((payload) => {
      recorder.releaseCaptureTracks();
      recorder.forceReleaseOrphanedCapture();
      void queueScreenRecordingSync('idle', null, false).catch((error) => {
        console.warn('[RecordingContext] Failed to force-release screen recorder on output ready:', error);
      });
      window.setTimeout(() => {
        recorder.forceReleaseOrphanedCapture();
        void queueScreenRecordingSync('idle', null, false).catch(() => {});
      }, 450);
      stopRequestedRef.current = false;
      outputReadyRef.current = true;
      setRawProcessingProgress({ percent: 100, step: 'complete' });
      const outputStatus = getOutputReadyStatus(payload);
      setState(outputStatus.state);
      setErrorMessage(outputStatus.errorMessage);
      setReportPath(payload.path || payload.reportPath || null);
      setRecordingPath(payload.recordingPath || null);
      setAudioPath(payload.audioPath || null);
      setSessionDir(payload.sessionDir || null);
      setReviewSession(payload.reviewSession || null);
      setShowReviewEditor(false);
      setDuration(0);
      loadRecentSessions();
      processingStartedAtRef.current = null;
    });

    const unsubSessionError = window.markupr.session.onError((payload) => {
      stopRequestedRef.current = false;
      outputReadyRef.current = false;
      setState('error');
      setErrorMessage(payload.message);
    });

    const unsubOutputError = window.markupr.output.onError((payload) => {
      stopRequestedRef.current = false;
      outputReadyRef.current = false;
      setState('error');
      setErrorMessage(payload.message);
    });

    return () => {
      mounted = false;
      unsubState();
      unsubStatus();
      unsubScreenshot();
      unsubReady();
      unsubSessionError();
      unsubOutputError();

      if (recorder.isRecording()) {
        void recorder.stop();
      }
    };
  }, [loadRecentSessions, queueScreenRecordingSync]);

  // ---------------------------------------------------------------------------
  // Audio level + voice activity listeners
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!window.markupr?.audio) return;
    const unsubLevel = window.markupr.audio.onLevel((level) => {
      setAudioLevel(level);
    });
    const unsubVoice = window.markupr.audio.onVoiceActivity((active) => {
      setIsVoiceActive(active);
    });
    const unsubSessionVoice = window.markupr.session.onVoiceActivity(({ active }) => {
      setIsVoiceActive(active);
    });

    return () => {
      unsubLevel();
      unsubVoice();
      unsubSessionVoice();
    };
  }, []);

  useEffect(() => window.markupr.capture.onAnnotationState((annotationState) => {
    setAnnotationActive(annotationState.active);
    setAnnotationMode(annotationState.mode);
  }), []);

  // ---------------------------------------------------------------------------
  // Post-processing progress listeners
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const processingApi = window.markupr?.processing;
    if (!processingApi || typeof processingApi.onProgress !== 'function' || typeof processingApi.onComplete !== 'function') {
      return;
    }

    const unsubProgress = processingApi.onProgress((data) => {
      setRawProcessingProgress({
        percent: Math.max(0, Math.min(100, Math.round(data.percent))),
        step: data.step,
      });
    });
    const unsubComplete = processingApi.onComplete(() => {
      setRawProcessingProgress({ percent: 100, step: 'complete' });
    });

    return () => {
      unsubProgress();
      unsubComplete();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const startSession = useCallback(async () => {
    setIsMutating(true);
    try {
      setScreenshotCount(0);
      setLastCapture(null);
      setRecordingPath(null);
      setAudioPath(null);
      setErrorMessage(null);
      stopRequestedRef.current = false;
      outputReadyRef.current = false;

      const result = await window.markupr.session.start();
      if (!result.success) {
        if (result.cancelled) {
          setState('idle');
          return;
        }
        setState('error');
        setErrorMessage(result.error || 'Unable to start session.');
        window.markupr?.whisper
          ?.hasTranscriptionCapability()
          .then((ready) => setHasTranscriptionCapability(ready))
          .catch(() => {});
      } else {
        const activeSession = await window.markupr.session.getCurrent();
        if (activeSession) {
          await queueScreenRecordingSync('recording', activeSession, false);
        }
      }
    } catch (error) {
      setState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown session error.');
    } finally {
      setIsMutating(false);
    }
  }, [queueScreenRecordingSync]);

  const stopSession = useCallback(async () => {
    setIsMutating(true);
    try {
      stopRequestedRef.current = true;

      const recorder = screenRecorderRef.current;
      recorder.releaseCaptureTracks();

      try {
        await queueScreenRecordingSync('idle', null, false);
      } catch (error) {
        console.warn('[RecordingContext] Failed to flush screen recording before stop:', error);
      }

      const result = await window.markupr.session.stop();
      if (!result.success) {
        setReportPath(result.reportPath || null);
        setSessionDir(result.sessionDir || null);
        setRecordingPath(result.recordingPath || null);
        setAudioPath(result.audioPath || null);
        setState('error');
        setErrorMessage(result.error || 'Unable to stop session.');
      }
    } catch (error) {
      setState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown session error.');
    } finally {
      setIsMutating(false);
    }
  }, [queueScreenRecordingSync]);

  const togglePause = useCallback(async () => {
    if (state !== 'recording') return;

    setIsMutating(true);
    try {
      if (isPaused) {
        const result = await window.markupr.session.resume();
        if (!result.success) {
          setErrorMessage(result.error || 'Unable to resume session.');
          return;
        }
        setIsPaused(false);
        await queueScreenRecordingSync('recording', null, false);
        return;
      }

      const result = await window.markupr.session.pause();
      if (!result.success) {
        setErrorMessage(result.error || 'Unable to pause session.');
        return;
      }
      setIsPaused(true);
      setIsVoiceActive(false);
      await queueScreenRecordingSync('recording', null, true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Pause/resume failed.');
    } finally {
      setIsMutating(false);
    }
  }, [isPaused, state, queueScreenRecordingSync]);

  const manualCapture = useCallback(async () => {
    if (state !== 'recording' || isPaused || isMutating) return;
    const result = await window.markupr.capture.manualScreenshot({
      focusedElementHint: collectFocusedElementHintFromDom(),
    });
    if (!result.success) {
      setErrorMessage(result.error || 'Manual capture failed.');
    }
  }, [state, isPaused, isMutating]);

  const toggleAnnotation = useCallback(async () => {
    if (state !== 'recording' || !annotationActive || isPaused || isMutating) return;
    const nextMode: AnnotationMode = annotationMode === 'draw' ? 'interact' : 'draw';
    const result = await window.markupr.capture.setAnnotationMode(nextMode);
    if (!result.success) {
      setErrorMessage(result.error || 'Unable to change annotation mode.');
    }
  }, [annotationActive, annotationMode, isMutating, isPaused, state]);

  const copyReportPath = useCallback(async () => {
    if (!reportPath) return;
    await window.markupr.copyToClipboard(reportPath);
  }, [reportPath]);

  const openReportFolder = useCallback(async () => {
    if (sessionDir) {
      await window.markupr.output.openFolder(sessionDir);
      return;
    }
    if (reportPath) {
      await window.markupr.output.openFolder(reportPath);
    }
  }, [sessionDir, reportPath]);

  const copyRecordingPath = useCallback(async () => {
    if (!recordingPath) return;
    await window.markupr.copyToClipboard(recordingPath);
  }, [recordingPath]);

  const copyAudioPath = useCallback(async () => {
    if (!audioPath) return;
    await window.markupr.copyToClipboard(audioPath);
  }, [audioPath]);

  const openRecent = useCallback(async (session: { folder: string }) => {
    await window.markupr.output.openFolder(session.folder);
  }, []);

  const copyRecentPath = useCallback(async (session: { folder: string }) => {
    await window.markupr.copyToClipboard(`${session.folder}/feedback-report.md`);
  }, []);

  const recoverSession = useCallback(() => {
    rawRecoverSession();
    outputReadyRef.current = true;
    setState('complete');
    loadRecentSessions();
  }, [rawRecoverSession, loadRecentSessions]);

  const discardSession = useCallback(() => {
    rawDiscardSession();
  }, [rawDiscardSession]);

  const reviewSave = useCallback(async (_session: ReviewSession) => {
    try {
      await window.markupr.output.save();
    } catch {
      // Save failure is non-fatal in review mode
    }
  }, []);

  const reviewClose = useCallback(() => {
    setShowReviewEditor(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Context value
  // ---------------------------------------------------------------------------
  const value: RecordingContextValue = useMemo(() => ({
    state,
    duration,
    screenshotCount,
    isPaused,
    isMutating,
    annotationActive,
    annotationMode,
    audioLevel,
    isVoiceActive,
    lastCapture,
    reportPath,
    recordingPath,
    audioPath,
    sessionDir,
    reviewSession,
    errorMessage,
    hasTranscriptionCapability,
    recentSessions,
    loadRecentSessions,
    rawProcessingProgress,
    processingStartedAt: processingStartedAtRef.current,
    showReviewEditor,
    setShowReviewEditor,
    incompleteSession,
    isCheckingRecovery,
    startSession,
    stopSession,
    togglePause,
    toggleAnnotation,
    manualCapture,
    copyReportPath,
    openReportFolder,
    copyRecordingPath,
    copyAudioPath,
    openRecent,
    copyRecentPath,
    recoverSession,
    discardSession,
    reviewSave,
    reviewClose,
  }), [
    state,
    duration,
    screenshotCount,
    isPaused,
    isMutating,
    annotationActive,
    annotationMode,
    audioLevel,
    isVoiceActive,
    lastCapture,
    reportPath,
    recordingPath,
    audioPath,
    sessionDir,
    reviewSession,
    errorMessage,
    hasTranscriptionCapability,
    recentSessions,
    loadRecentSessions,
    rawProcessingProgress,
    // processingStartedAtRef.current is intentionally excluded from deps:
    // it only changes when state changes (which is in deps), and ref.current
    // is not a valid React dependency (mutations don't trigger re-renders).
    showReviewEditor,
    setShowReviewEditor,
    incompleteSession,
    isCheckingRecovery,
    startSession,
    stopSession,
    togglePause,
    toggleAnnotation,
    manualCapture,
    copyReportPath,
    openReportFolder,
    copyRecordingPath,
    copyAudioPath,
    openRecent,
    copyRecentPath,
    recoverSession,
    discardSession,
    reviewSave,
    reviewClose,
  ]);

  return (
    <RecordingContext.Provider value={value}>
      {children}
    </RecordingContext.Provider>
  );
};

export default RecordingContext;
