/**
 * markupR - Preload Script
 *
 * Exposes a safe API to the renderer process via contextBridge.
 * This is the ONLY way the renderer can communicate with the main process.
 *
 * API Design:
 * - Organized by domain (session, capture, audio, transcript, settings, permissions, output)
 * - invoke() for request/response patterns
 * - on/send for event streams (returns cleanup function)
 * - Type-safe channel names from shared types
 */

import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type AppSettings,
  type CaptureSource,
  type AudioDevice,
  type PermissionType,
  type PermissionStatus,
  type SessionStatusPayload,
  type SessionPayload,
  type FeedbackItemPayload,
  type TranscriptChunkPayload,
  type ScreenshotCapturedPayload,
  type OutputReadyPayload,
  type SaveResult,
  type HotkeyConfig,
  type SessionState,
  type UpdateStatusType,
  type UpdateStatusPayload,
  type WhisperDownloadProgressPayload,
  type WhisperModelInfoPayload,
  type WhisperModelCheckResult,
  type TranscriptionTier,
  type TranscriptionTierStatus,
  type ApiKeyValidationResult,
  type ProcessingProgressPayload,
  type FocusedElementHint,
  type AnalysisProviderStatus,
} from '../shared/types';

// =============================================================================
// Type Definitions for Event Handlers
// =============================================================================

type Unsubscribe = () => void;

// =============================================================================
// Helper: Create typed event subscriber
// =============================================================================

function createEventSubscriber<T>(channel: string) {
  return (callback: (data: T) => void): Unsubscribe => {
    const handler = (_: Electron.IpcRendererEvent, data: T) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
}

// =============================================================================
// markupR API (exposed on window.markupr for backward compatibility)
// =============================================================================

const markuprApi = {
  // ===========================================================================
  // Session API
  // ===========================================================================
  session: {
    /**
     * Start a recording session
     * @param sourceId - ID of the capture source (screen or window)
     */
    start: (
      sourceId?: string,
      sourceName?: string
    ): Promise<{ success: boolean; sessionId?: string; error?: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_START, sourceId, sourceName);
    },

    /**
     * Stop the current recording session
     */
    stop: (): Promise<{
      success: boolean;
      session?: SessionPayload;
      reportPath?: string;
      sessionDir?: string;
      recordingPath?: string;
      audioPath?: string;
      error?: string;
    }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_STOP);
    },

    /**
     * Pause the current recording session
     */
    pause: (): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_PAUSE);
    },

    /**
     * Resume a paused recording session
     */
    resume: (): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_RESUME);
    },

    /**
     * Cancel the current session without saving
     */
    cancel: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_CANCEL);
    },

    /**
     * Get current session status
     */
    getStatus: (): Promise<SessionStatusPayload> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET_STATUS);
    },

    /**
     * Get current session data
     */
    getCurrent: (): Promise<SessionPayload | null> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET_CURRENT);
    },

    /**
     * Subscribe to session state changes
     */
    onStateChange: createEventSubscriber<{
      state: SessionState;
      session: SessionPayload | null;
    }>(IPC_CHANNELS.SESSION_STATE_CHANGED),

    /**
     * Subscribe to session status updates (periodic updates during recording)
     */
    onStatusUpdate: createEventSubscriber<SessionStatusPayload>(IPC_CHANNELS.SESSION_STATUS),

    /**
     * Subscribe to session completion
     */
    onComplete: createEventSubscriber<SessionPayload>(IPC_CHANNELS.SESSION_COMPLETE),

    /**
     * Subscribe to new feedback items
     */
    onFeedbackItem: createEventSubscriber<FeedbackItemPayload>(IPC_CHANNELS.SESSION_FEEDBACK_ITEM),

    /**
     * Subscribe to voice activity changes
     */
    onVoiceActivity: createEventSubscriber<{ active: boolean }>(IPC_CHANNELS.SESSION_VOICE_ACTIVITY),

    /**
     * Subscribe to session errors
     */
    onError: createEventSubscriber<{ message: string }>(IPC_CHANNELS.SESSION_ERROR),
  },

  // ===========================================================================
  // Capture API
  // ===========================================================================
  capture: {
    /**
     * Get available capture sources (screens and windows)
     */
    getSources: (): Promise<CaptureSource[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_GET_SOURCES);
    },

    /**
     * Trigger a manual screenshot during recording
     */
    manualScreenshot: (
      context?: { focusedElementHint?: FocusedElementHint }
    ): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_MANUAL_SCREENSHOT, context);
    },

    /**
     * Subscribe to screenshot captured events
     */
    onScreenshot: createEventSubscriber<ScreenshotCapturedPayload>(IPC_CHANNELS.SCREENSHOT_CAPTURED),

    /**
     * Subscribe to manual screenshot trigger events (from hotkey)
     */
    onManualTrigger: createEventSubscriber<{ timestamp: number }>(IPC_CHANNELS.MANUAL_SCREENSHOT),
  },

  // ===========================================================================
  // Audio API
  // ===========================================================================
  audio: {
    /**
     * Get available audio input devices
     * Note: Device enumeration happens in renderer via Web Audio API
     */
    getDevices: (): Promise<AudioDevice[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.AUDIO_GET_DEVICES);
    },

    /**
     * Set the preferred audio input device
     */
    setDevice: (deviceId: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.AUDIO_SET_DEVICE, deviceId);
    },

    /**
     * Subscribe to audio level updates (for visualization)
     */
    onLevel: createEventSubscriber<number>(IPC_CHANNELS.AUDIO_LEVEL),

    /**
     * Subscribe to voice activity detection updates
     */
    onVoiceActivity: createEventSubscriber<boolean>(IPC_CHANNELS.AUDIO_VOICE_ACTIVITY),

    // -------------------------------------------------------------------------
    // Audio Capture Bridge (Renderer -> Main communication)
    // These are used by the AudioCaptureRenderer to communicate with AudioCapture in main
    // -------------------------------------------------------------------------

    /**
     * Respond to device enumeration request from main
     */
    onRequestDevices: (callback: () => void): Unsubscribe => {
      const handler = () => callback();
      ipcRenderer.on(IPC_CHANNELS.AUDIO_REQUEST_DEVICES, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AUDIO_REQUEST_DEVICES, handler);
    },

    /**
     * Send device list back to main
     */
    sendDevices: (devices: AudioDevice[]): void => {
      ipcRenderer.send(IPC_CHANNELS.AUDIO_DEVICES_RESPONSE, devices);
    },

    /**
     * Handle start capture command from main
     */
    onStartCapture: (
      callback: (config: {
        deviceId: string | null;
        sampleRate: number;
        channels: number;
        chunkDurationMs: number;
      }) => void
    ): Unsubscribe => {
      const handler = (
        _: Electron.IpcRendererEvent,
        config: {
          deviceId: string | null;
          sampleRate: number;
          channels: number;
          chunkDurationMs: number;
        }
      ) => callback(config);
      ipcRenderer.on(IPC_CHANNELS.AUDIO_START_CAPTURE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AUDIO_START_CAPTURE, handler);
    },

    /**
     * Handle stop capture command from main
     */
    onStopCapture: (callback: () => void): Unsubscribe => {
      const handler = () => callback();
      ipcRenderer.on(IPC_CHANNELS.AUDIO_STOP_CAPTURE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AUDIO_STOP_CAPTURE, handler);
    },

    /**
     * Handle device change command from main
     */
    onSetDevice: (callback: (deviceId: string) => void): Unsubscribe => {
      const handler = (_: Electron.IpcRendererEvent, deviceId: string) => callback(deviceId);
      ipcRenderer.on(IPC_CHANNELS.AUDIO_SET_DEVICE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AUDIO_SET_DEVICE, handler);
    },

    /**
     * Send audio chunk to main for transcription
     */
    sendAudioChunk: (data: {
      timestamp: number;
      duration: number;
      samples?: number[] | Float32Array;
      encodedChunk?: Uint8Array;
      mimeType?: string;
      audioLevel?: number;
      rms?: number;
    }): void => {
      ipcRenderer.send(IPC_CHANNELS.AUDIO_CHUNK, data);
    },

    /**
     * Notify main that capture started
     */
    notifyCaptureStarted: (): void => {
      ipcRenderer.send(IPC_CHANNELS.AUDIO_CAPTURE_STARTED);
    },

    /**
     * Notify main that capture stopped
     */
    notifyCaptureStopped: (): void => {
      ipcRenderer.send(IPC_CHANNELS.AUDIO_CAPTURE_STOPPED);
    },

    /**
     * Send capture error to main
     */
    sendCaptureError: (error: string): void => {
      ipcRenderer.send(IPC_CHANNELS.AUDIO_CAPTURE_ERROR, error);
    },
  },

  // ===========================================================================
  // Screen Recording API
  // ===========================================================================
  screenRecording: {
    /**
     * Start persisted screen recording for a session
     */
    start: (
      sessionId: string,
      mimeType: string,
      startTime?: number
    ): Promise<{ success: boolean; path?: string; error?: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SCREEN_RECORDING_START, sessionId, mimeType, startTime);
    },

    /**
     * Append a video chunk to the active recording file
     */
    appendChunk: (
      sessionId: string,
      chunk: Uint8Array
    ): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SCREEN_RECORDING_CHUNK, sessionId, chunk);
    },

    /**
     * Finalize persisted recording for a session
     */
    stop: (
      sessionId: string
    ): Promise<{ success: boolean; path?: string; bytes?: number; mimeType?: string; error?: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SCREEN_RECORDING_STOP, sessionId);
    },
  },

  // ===========================================================================
  // Transcription API
  // ===========================================================================
  transcript: {
    /**
     * Subscribe to transcription chunks (interim and final)
     */
    onChunk: createEventSubscriber<TranscriptChunkPayload>(IPC_CHANNELS.TRANSCRIPTION_UPDATE),

    /**
     * Subscribe to final transcription results
     */
    onFinal: createEventSubscriber<{
      text: string;
      confidence: number;
      timestamp: number;
    }>(IPC_CHANNELS.TRANSCRIPTION_FINAL),
  },

  // ===========================================================================
  // Processing Pipeline API (Main -> Renderer events)
  // ===========================================================================
  processing: {
    /**
     * Subscribe to post-process pipeline progress updates
     */
    onProgress: createEventSubscriber<ProcessingProgressPayload>(IPC_CHANNELS.PROCESSING_PROGRESS),

    /**
     * Subscribe to post-process pipeline completion
     */
    onComplete: createEventSubscriber<OutputReadyPayload>(IPC_CHANNELS.PROCESSING_COMPLETE),
  },

  // ===========================================================================
  // Transcription Control API
  // ===========================================================================
  transcription: {
    /**
     * Get runtime availability for all transcription tiers.
     */
    getTierStatuses: (): Promise<TranscriptionTierStatus[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIPTION_GET_TIER_STATUSES);
    },

    /**
     * Get current preferred/active transcription tier.
     */
    getCurrentTier: (): Promise<TranscriptionTier | null> => {
      return ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIPTION_GET_CURRENT_TIER);
    },

    /**
     * Set preferred transcription tier.
     */
    setTier: (tier: TranscriptionTier): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIPTION_SET_TIER, tier);
    },

    /**
     * Download a specific Whisper model via transcription controls.
     */
    downloadModel: (model: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WHISPER_DOWNLOAD_MODEL, model);
    },

    /**
     * Cancel Whisper model download via transcription controls.
     */
    cancelDownload: (model: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WHISPER_CANCEL_DOWNLOAD, model);
    },

    /**
     * Subscribe to Whisper model progress updates.
     */
    onModelProgress: createEventSubscriber<WhisperDownloadProgressPayload>(
      IPC_CHANNELS.WHISPER_DOWNLOAD_PROGRESS
    ),
  },

  // ===========================================================================
  // Settings API
  // ===========================================================================
  settings: {
    /**
     * Get a specific setting
     */
    get: <K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key);
    },

    /**
     * Get all settings
     */
    getAll: (): Promise<AppSettings> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL);
    },

    /**
     * Set a specific setting
     */
    set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<AppSettings> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, key, value);
    },

    /**
     * Get an API key from secure storage
     */
    getApiKey: (service: string): Promise<string | null> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_API_KEY, service);
    },

    /**
     * Set an API key in secure storage
     */
    setApiKey: (service: string, key: string): Promise<boolean> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_API_KEY, service, key);
    },

    /**
     * Delete an API key from secure storage
     */
    deleteApiKey: (service: string): Promise<boolean> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_DELETE_API_KEY, service);
    },

    /**
     * Check if an API key exists in secure storage
     */
    hasApiKey: (service: string): Promise<boolean> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_HAS_API_KEY, service);
    },

    /**
     * Validate an API key by performing a provider request from main process.
     */
    testApiKey: (
      service: 'openai' | 'anthropic',
      key: string
    ): Promise<ApiKeyValidationResult> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_TEST_API_KEY, service, key);
    },

    /**
     * Open native directory picker for output path selection
     */
    selectDirectory: (): Promise<string | null> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SELECT_DIRECTORY);
    },

    /**
     * Clear app data and reset settings
     */
    clearAllData: (): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_CLEAR_ALL_DATA);
    },

    /**
     * Export settings to a JSON file
     */
    export: (): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_EXPORT);
    },

    /**
     * Import settings from a JSON file
     */
    import: (): Promise<AppSettings | null> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_IMPORT);
    },
  },

  // ===========================================================================
  // Analysis Provider API
  // ===========================================================================
  analysisProviders: {
    discover: (forceRefresh = false): Promise<AnalysisProviderStatus[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_PROVIDERS_DISCOVER, forceRefresh);
    },
    test: (provider: 'codex'): Promise<AnalysisProviderStatus> => {
      return ipcRenderer.invoke(IPC_CHANNELS.ANALYSIS_PROVIDER_TEST, provider);
    },
  },

  // ===========================================================================
  // Hotkey API
  // ===========================================================================
  hotkeys: {
    /**
     * Get current hotkey configuration
     */
    getConfig: (): Promise<HotkeyConfig> => {
      return ipcRenderer.invoke(IPC_CHANNELS.HOTKEY_CONFIG);
    },

    /**
     * Update hotkey configuration
     */
    updateConfig: (
      config: Partial<HotkeyConfig>
    ): Promise<{ config: HotkeyConfig; results: unknown[] }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.HOTKEY_UPDATE, config);
    },

    /**
     * Subscribe to hotkey triggered events
     */
    onTriggered: createEventSubscriber<{ action: string; accelerator: string }>(
      IPC_CHANNELS.HOTKEY_TRIGGERED
    ),
  },

  // ===========================================================================
  // Permissions API
  // ===========================================================================
  permissions: {
    /**
     * Check if a permission is granted
     */
    check: (type: PermissionType): Promise<boolean> => {
      return ipcRenderer.invoke(IPC_CHANNELS.PERMISSIONS_CHECK, type);
    },

    /**
     * Request a permission
     */
    request: (type: PermissionType): Promise<boolean> => {
      return ipcRenderer.invoke(IPC_CHANNELS.PERMISSIONS_REQUEST, type);
    },

    /**
     * Get all permission statuses
     */
    getAll: (): Promise<PermissionStatus> => {
      return ipcRenderer.invoke(IPC_CHANNELS.PERMISSIONS_GET_ALL);
    },
  },

  // ===========================================================================
  // Output API
  // ===========================================================================
  output: {
    /**
     * Save the current session to disk
     */
    save: (session?: SessionPayload): Promise<SaveResult> => {
      return ipcRenderer.invoke(IPC_CHANNELS.OUTPUT_SAVE, session);
    },

    /**
     * Copy session summary to clipboard
     */
    copyClipboard: (): Promise<boolean> => {
      return ipcRenderer.invoke(IPC_CHANNELS.OUTPUT_COPY_CLIPBOARD);
    },

    /**
     * Open the session output folder in file explorer
     */
    openFolder: (sessionDir?: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.OUTPUT_OPEN_FOLDER, sessionDir);
    },

    /**
     * Subscribe to output ready events
     */
    onReady: createEventSubscriber<OutputReadyPayload>(
      IPC_CHANNELS.OUTPUT_READY
    ),

    /**
     * Subscribe to output error events
     */
    onError: createEventSubscriber<{ message: string }>(IPC_CHANNELS.OUTPUT_ERROR),

    // -------------------------------------------------------------------------
    // Session History Browser API
    // -------------------------------------------------------------------------

    /**
     * List all saved sessions
     */
    listSessions: (): Promise<Array<{
      id: string;
      startTime: number;
      endTime: number;
      itemCount: number;
      screenshotCount: number;
      sourceName: string;
      firstThumbnail?: string;
      folder: string;
      transcriptionPreview?: string;
    }>> => {
      return ipcRenderer.invoke(IPC_CHANNELS.OUTPUT_LIST_SESSIONS);
    },

    /**
     * Get metadata for a specific session
     */
    getSessionMetadata: (sessionId: string): Promise<{
      id: string;
      startTime: number;
      endTime: number;
      itemCount: number;
      screenshotCount: number;
      sourceName: string;
      firstThumbnail?: string;
      folder: string;
      transcriptionPreview?: string;
    } | null> => {
      return ipcRenderer.invoke(IPC_CHANNELS.OUTPUT_GET_SESSION_METADATA, sessionId);
    },

    /**
     * Delete a single session
     */
    deleteSession: (sessionId: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.OUTPUT_DELETE_SESSION, sessionId);
    },

    /**
     * Delete multiple sessions
     */
    deleteSessions: (sessionIds: string[]): Promise<{ success: boolean; deleted: string[]; failed: string[] }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.OUTPUT_DELETE_SESSIONS, sessionIds);
    },

    /**
     * Export a single session
     */
    exportSession: (
      sessionId: string,
      format: 'markdown' | 'json' | 'pdf' = 'markdown'
    ): Promise<{ success: boolean; path?: string; error?: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.OUTPUT_EXPORT_SESSION, sessionId, format);
    },

    /**
     * Export multiple sessions
     */
    exportSessions: (
      sessionIds: string[],
      format: 'markdown' | 'json' | 'pdf' = 'markdown'
    ): Promise<{ success: boolean; path?: string; error?: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.OUTPUT_EXPORT_SESSIONS, sessionIds, format);
    },
  },

  // ===========================================================================
  // Crash Recovery API
  // ===========================================================================
  crashRecovery: {
    /**
     * Check for incomplete sessions from crashes
     */
    check: (): Promise<{
      hasIncomplete: boolean;
      session: {
        id: string;
        startTime: number;
        lastSaveTime: number;
        feedbackItems: Array<{
          id: string;
          timestamp: number;
          text: string;
          confidence: number;
          hasScreenshot: boolean;
          screenshotId?: string;
        }>;
        sourceName: string;
        screenshotCount: number;
        metadata?: {
          appVersion: string;
          platform: string;
          sessionDurationMs: number;
        };
      } | null;
    }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CRASH_RECOVERY_CHECK);
    },

    /**
     * Recover an incomplete session
     */
    recover: (
      sessionId: string
    ): Promise<{
      success: boolean;
      session?: {
        id: string;
        feedbackItems: Array<{
          id: string;
          timestamp: number;
          text: string;
          confidence: number;
          hasScreenshot: boolean;
        }>;
      };
      error?: string;
    }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CRASH_RECOVERY_RECOVER, sessionId);
    },

    /**
     * Discard an incomplete session
     */
    discard: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CRASH_RECOVERY_DISCARD);
    },

    /**
     * Get recent crash logs for debugging
     */
    getLogs: (
      limit?: number
    ): Promise<
      Array<{
        timestamp: string;
        error: { name: string; message: string; stack?: string };
        appVersion: string;
        platform: string;
        sessionId?: string;
      }>
    > => {
      return ipcRenderer.invoke(IPC_CHANNELS.CRASH_RECOVERY_GET_LOGS, limit);
    },

    /**
     * Clear crash logs
     */
    clearLogs: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CRASH_RECOVERY_CLEAR_LOGS);
    },

    /**
     * Update crash recovery settings
     */
    updateSettings: (settings: {
      enableAutoSave?: boolean;
      autoSaveIntervalMs?: number;
      enableCrashReporting?: boolean;
      maxCrashLogs?: number;
    }): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CRASH_RECOVERY_UPDATE_SETTINGS, settings);
    },

    /**
     * Subscribe to incomplete session found events (on startup)
     */
    onIncompleteFound: createEventSubscriber<{
      session: {
        id: string;
        startTime: number;
        lastSaveTime: number;
        feedbackItems: Array<{
          id: string;
          timestamp: number;
          text: string;
          confidence: number;
          hasScreenshot: boolean;
        }>;
        sourceName: string;
        screenshotCount: number;
      };
    }>(IPC_CHANNELS.CRASH_RECOVERY_FOUND),
  },

  // ===========================================================================
  // Updates API
  // ===========================================================================
  updates: {
    /**
     * Check for available updates
     */
    check: (): Promise<unknown> => {
      return ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK);
    },

    /**
     * Download the available update
     */
    download: (): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.UPDATE_DOWNLOAD);
    },

    /**
     * Install the downloaded update (quits and restarts app)
     */
    install: (): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL);
    },

    /**
     * Get current update state (version info, availability, etc.)
     */
    getStatus: (): Promise<{
      status: UpdateStatusType;
      currentVersion: string;
      availableVersion: string | null;
      releaseNotes: string | null;
      downloadProgress: number | null;
      updaterAvailable: boolean;
    }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.UPDATE_GET_STATUS);
    },

    /**
     * Subscribe to update status changes
     */
    onStatus: (callback: (status: UpdateStatusPayload) => void): Unsubscribe => {
      const handler = (_: Electron.IpcRendererEvent, status: UpdateStatusPayload) => callback(status);
      ipcRenderer.on(IPC_CHANNELS.UPDATE_STATUS, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_STATUS, handler);
    },
  },

  // ===========================================================================
  // Whisper Model API
  // ===========================================================================
  whisper: {
    /**
     * Check if any Whisper model is downloaded and get recommended model
     */
    checkModel: (): Promise<WhisperModelCheckResult> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WHISPER_CHECK_MODEL);
    },

    /**
     * Check if we have any tier that can actually transcribe
     * (OpenAI key or Whisper with model)
     */
    hasTranscriptionCapability: (): Promise<boolean> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WHISPER_HAS_TRANSCRIPTION_CAPABILITY);
    },

    /**
     * Get available models with their info
     */
    getAvailableModels: (): Promise<WhisperModelInfoPayload[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WHISPER_GET_AVAILABLE_MODELS);
    },

    /**
     * Download a specific Whisper model
     * @param model - Model name: 'tiny', 'base', 'small', 'medium', or 'large'
     */
    downloadModel: (model: string): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WHISPER_DOWNLOAD_MODEL, model);
    },

    /**
     * Cancel an active download
     * @param model - Model name to cancel
     */
    cancelDownload: (model: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WHISPER_CANCEL_DOWNLOAD, model);
    },

    /**
     * Subscribe to download progress events
     */
    onDownloadProgress: createEventSubscriber<WhisperDownloadProgressPayload>(
      IPC_CHANNELS.WHISPER_DOWNLOAD_PROGRESS
    ),

    /**
     * Subscribe to download complete events
     */
    onDownloadComplete: createEventSubscriber<{ model: string; path: string }>(
      IPC_CHANNELS.WHISPER_DOWNLOAD_COMPLETE
    ),

    /**
     * Subscribe to download error events
     */
    onDownloadError: createEventSubscriber<{ model: string; error: string }>(
      IPC_CHANNELS.WHISPER_DOWNLOAD_ERROR
    ),
  },

  // ===========================================================================
  // App Version
  // ===========================================================================
  version: (): Promise<string> => {
    return ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION);
  },

  // ===========================================================================
  // Legacy API (for backwards compatibility)
  // ===========================================================================
  startSession: (): Promise<{ success: boolean; sessionId?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.START_SESSION);
  },

  stopSession: (): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.STOP_SESSION);
  },

  getSettings: (): Promise<AppSettings> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS);
  },

  setSettings: (settings: Partial<AppSettings>): Promise<AppSettings> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SET_SETTINGS, settings);
  },

  copyToClipboard: (text: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.COPY_TO_CLIPBOARD, text);
  },

  // Window controls
  window: {
    minimize: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE);
    },
    hide: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_HIDE);
    },
    close: (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE);
    },
  },

  // Popover controls
  popover: {
    resize: (width: number, height: number): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.POPOVER_RESIZE, width, height);
    },
    resizeToState: (state: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS.POPOVER_RESIZE_TO_STATE, state);
    },
  },

  // ===========================================================================
  // Navigation API (Main -> Renderer navigation events)
  // ===========================================================================
  navigation: {
    onShowSettings: (callback: () => void): Unsubscribe => {
      const handler = () => callback();
      ipcRenderer.on(IPC_CHANNELS.SHOW_SETTINGS, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SHOW_SETTINGS, handler);
    },
    onShowHistory: (callback: () => void): Unsubscribe => {
      const handler = () => callback();
      ipcRenderer.on(IPC_CHANNELS.SHOW_HISTORY, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SHOW_HISTORY, handler);
    },
    onShowShortcuts: (callback: () => void): Unsubscribe => {
      const handler = () => callback();
      ipcRenderer.on(IPC_CHANNELS.SHOW_SHORTCUTS, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SHOW_SHORTCUTS, handler);
    },
    onShowOnboarding: (callback: () => void): Unsubscribe => {
      const handler = () => callback();
      ipcRenderer.on(IPC_CHANNELS.SHOW_ONBOARDING, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SHOW_ONBOARDING, handler);
    },
    onShowExport: (callback: () => void): Unsubscribe => {
      const handler = () => callback();
      ipcRenderer.on(IPC_CHANNELS.SHOW_EXPORT, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SHOW_EXPORT, handler);
    },
    onShowWindowSelector: (callback: () => void): Unsubscribe => {
      const handler = () => callback();
      ipcRenderer.on(IPC_CHANNELS.SHOW_WINDOW_SELECTOR, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SHOW_WINDOW_SELECTOR, handler);
    },
  },

  onSessionStatus: (
    callback: (status: { action: string; status?: SessionStatusPayload }) => void
  ): Unsubscribe => {
    const handler = (
      _: Electron.IpcRendererEvent,
      data: { action: string; status?: SessionStatusPayload }
    ) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.SESSION_STATUS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_STATUS, handler);
  },

  onTranscriptionUpdate: (callback: (data: { text: string; isFinal: boolean }) => void): Unsubscribe => {
    const handler = (_: Electron.IpcRendererEvent, data: { text: string; isFinal: boolean }) =>
      callback(data);
    ipcRenderer.on(IPC_CHANNELS.TRANSCRIPTION_UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TRANSCRIPTION_UPDATE, handler);
  },

  onScreenshotCaptured: (callback: (data: { id: string; timestamp: number }) => void): Unsubscribe => {
    const handler = (_: Electron.IpcRendererEvent, data: { id: string; timestamp: number }) =>
      callback(data);
    ipcRenderer.on(IPC_CHANNELS.SCREENSHOT_CAPTURED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCREENSHOT_CAPTURED, handler);
  },

  onOutputReady: (callback: (data: OutputReadyPayload) => void): Unsubscribe => {
    const handler = (_: Electron.IpcRendererEvent, data: OutputReadyPayload) =>
      callback(data);
    ipcRenderer.on(IPC_CHANNELS.OUTPUT_READY, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OUTPUT_READY, handler);
  },

  onOutputError: (callback: (error: { message: string }) => void): Unsubscribe => {
    const handler = (_: Electron.IpcRendererEvent, error: { message: string }) => callback(error);
    ipcRenderer.on(IPC_CHANNELS.OUTPUT_ERROR, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OUTPUT_ERROR, handler);
  },
};

// =============================================================================
// Expose API to Renderer
// =============================================================================

contextBridge.exposeInMainWorld('markupr', markuprApi);

// =============================================================================
// Type Exports
// =============================================================================

export type MarkuprAPI = typeof markuprApi;

declare global {
  interface Window {
    markupr: MarkuprAPI;
  }
}
