/**
 * markuprx - Electron Type Declarations for Renderer
 *
 * This file provides TypeScript type support for the window.markuprx API
 * exposed by the preload script via contextBridge.
 */

import type {
  PublicSettings,
  ClearApplicationDataResult,
  CaptureSource,
  CaptureSelectionMode,
  AudioDevice,
  PermissionType,
  PermissionStatus,
  SessionStatusPayload,
  SessionPayload,
  FeedbackItemPayload,
  TranscriptChunkPayload,
  ScreenshotCapturedPayload,
  OutputReadyPayload,
  SaveResult,
  HotkeyConfig,
  SessionState,
  TranscriptionTier,
  TranscriptionTierStatus,
  UpdateStatusType,
  UpdateStatusPayload,
  WhisperDownloadProgressPayload,
  WhisperModelInfoPayload,
  WhisperModelCheckResult,
  ApiKeyValidationResult,
  ProcessingProgressPayload,
  FocusedElementHint,
  AnalysisProviderStatus,
  AnalysisProvider,
  AnalysisModelOption,
  ModelAnalysisProvider,
  AnnotationEvent,
  AnnotationMode,
  AnnotationStatePayload,
  CaptureOverlayState,
  CaptureTarget,
  MarkedIssueCandidatePayload,
  ReviewExportOptions,
  ReviewExportResult,
  ReviewSession,
} from '../../shared/types';
import type { ElectronTestAPI } from '../../shared/electronTestHarness';

type Unsubscribe = () => void;

/**
 * Session API
 */
interface SessionAPI {
  start: (
    target?: CaptureTarget | string,
    sourceName?: string
  ) => Promise<{ success: boolean; sessionId?: string; cancelled?: boolean; error?: string }>;
  stop: () => Promise<{
    success: boolean;
    session?: SessionPayload;
    reportPath?: string;
    sessionDir?: string;
    recordingPath?: string;
    audioPath?: string;
    error?: string;
  }>;
  pause: () => Promise<{ success: boolean; error?: string }>;
  resume: () => Promise<{ success: boolean; error?: string }>;
  cancel: () => Promise<{ success: boolean }>;
  getStatus: () => Promise<SessionStatusPayload>;
  getCurrent: () => Promise<SessionPayload | null>;
  onStateChange: (callback: (data: { state: SessionState; session: SessionPayload | null }) => void) => Unsubscribe;
  onStatusUpdate: (callback: (data: SessionStatusPayload) => void) => Unsubscribe;
  onComplete: (callback: (data: SessionPayload) => void) => Unsubscribe;
  onFeedbackItem: (callback: (data: FeedbackItemPayload) => void) => Unsubscribe;
  onVoiceActivity: (callback: (data: { active: boolean }) => void) => Unsubscribe;
  onError: (callback: (data: { message: string }) => void) => Unsubscribe;
}

/**
 * Capture API
 */
interface CaptureAPI {
  getSources: () => Promise<CaptureSource[]>;
  selectTarget: () => Promise<CaptureTarget | null>;
  beginAnnotation: (sessionId: string, target: CaptureTarget) => Promise<{ success: boolean; error?: string }>;
  endAnnotation: (finalizePendingIssue?: boolean) => Promise<{
    success: boolean;
    snapshotRevision?: number;
    error?: string;
  }>;
  setAnnotationMode: (mode: AnnotationMode) => Promise<{ success: boolean; error?: string }>;
  onAnnotationEvent: (callback: (event: AnnotationEvent) => void) => Unsubscribe;
  onAnnotationState: (callback: (state: AnnotationStatePayload) => void) => Unsubscribe;
  stageMarkedIssueCandidate: (
    payload: MarkedIssueCandidatePayload
  ) => Promise<{ success: boolean; error?: string }>;
  manualScreenshot: (context?: {
    focusedElementHint?: FocusedElementHint;
  }) => Promise<{ success: boolean; error?: string }>;
  onScreenshot: (callback: (data: ScreenshotCapturedPayload) => void) => Unsubscribe;
  onManualTrigger: (callback: (data: { timestamp: number }) => void) => Unsubscribe;
}

interface CaptureOverlayAPI {
  getState: () => Promise<CaptureOverlayState | null>;
  confirmTarget: (target: CaptureTarget) => Promise<{ success: boolean; error?: string }>;
  cancel: () => Promise<{ success: boolean }>;
  setSelectionMode: (mode: CaptureSelectionMode) => Promise<{ success: boolean; error?: string }>;
  sendAnnotation: (event: AnnotationEvent) => Promise<{ success: boolean; error?: string }>;
  onStateChange: (callback: (state: CaptureOverlayState) => void) => Unsubscribe;
}

/**
 * Audio API
 */
interface AudioAPI {
  getDevices: () => Promise<AudioDevice[]>;
  setDevice: (deviceId: string) => Promise<{ success: boolean }>;
  onLevel: (callback: (level: number) => void) => Unsubscribe;
  onVoiceActivity: (callback: (active: boolean) => void) => Unsubscribe;

  // Audio capture bridge
  onRequestDevices: (callback: () => void) => Unsubscribe;
  sendDevices: (devices: AudioDevice[]) => void;
  onStartCapture: (callback: (config: {
    deviceId: string | null;
    sampleRate: number;
    channels: number;
    chunkDurationMs: number;
  }) => void) => Unsubscribe;
  onStopCapture: (callback: () => void) => Unsubscribe;
  onSetDevice: (callback: (deviceId: string) => void) => Unsubscribe;
  sendAudioChunk: (data: {
    timestamp: number;
    duration: number;
    samples?: number[] | Float32Array;
    encodedChunk?: Uint8Array;
    mimeType?: string;
    audioLevel?: number;
    rms?: number;
  }) => void;
  notifyCaptureStarted: () => void;
  notifyCaptureStopped: () => void;
  sendCaptureError: (error: string) => void;
}

/**
 * Screen recording persistence API
 */
interface ScreenRecordingAPI {
  start: (
    sessionId: string,
    mimeType: string,
    startTime?: number
  ) => Promise<{ success: boolean; path?: string; error?: string }>;
  appendChunk: (sessionId: string, chunk: Uint8Array) => Promise<{ success: boolean; error?: string }>;
  stop: (
    sessionId: string
  ) => Promise<{ success: boolean; path?: string; bytes?: number; mimeType?: string; error?: string }>;
}

/**
 * Transcript API
 */
interface TranscriptAPI {
  onChunk: (callback: (data: TranscriptChunkPayload) => void) => Unsubscribe;
  onFinal: (callback: (data: { text: string; confidence: number; timestamp: number }) => void) => Unsubscribe;
}

/**
 * Transcription tier and model control API
 */
interface TranscriptionControlAPI {
  getTierStatuses: () => Promise<TranscriptionTierStatus[]>;
  getCurrentTier: () => Promise<TranscriptionTier | null>;
  setTier: (tier: TranscriptionTier) => Promise<{ success: boolean; error?: string }>;
  downloadModel: (model: string) => Promise<{ success: boolean; error?: string }>;
  cancelDownload: (model: string) => Promise<{ success: boolean }>;
  onModelProgress: (callback: (data: WhisperDownloadProgressPayload) => void) => Unsubscribe;
}

/**
 * Processing Pipeline API (post-recording progress events)
 */
interface ProcessingAPI {
  onProgress: (callback: (data: ProcessingProgressPayload) => void) => Unsubscribe;
  onComplete: (callback: (data: OutputReadyPayload) => void) => Unsubscribe;
}

/**
 * Settings API
 */
interface SettingsAPI {
  get: <K extends keyof PublicSettings>(key: K) => Promise<PublicSettings[K]>;
  getAll: () => Promise<PublicSettings>;
  set: <K extends keyof PublicSettings>(key: K, value: PublicSettings[K]) => Promise<PublicSettings>;
  getApiKey: (service: string) => Promise<string | null>;
  setApiKey: (service: string, key: string) => Promise<boolean>;
  deleteApiKey: (service: string) => Promise<boolean>;
  hasApiKey: (service: string) => Promise<boolean>;
  testApiKey: (service: 'openai' | 'anthropic', key?: string) => Promise<ApiKeyValidationResult>;
  selectDirectory: () => Promise<string | null>;
  clearAllData: () => Promise<ClearApplicationDataResult>;
  export: () => Promise<void>;
  import: () => Promise<PublicSettings | null>;
}

/**
 * Installed analysis provider discovery API.
 */
interface AnalysisProvidersAPI {
  discover: (forceRefresh?: boolean) => Promise<AnalysisProviderStatus[]>;
  test: (provider: AnalysisProvider) => Promise<AnalysisProviderStatus>;
  models: (
    provider: ModelAnalysisProvider,
    forceRefresh?: boolean,
  ) => Promise<AnalysisModelOption[]>;
}

/**
 * Hotkey API
 */
interface HotkeyAPI {
  getConfig: () => Promise<HotkeyConfig>;
  updateConfig: (config: Partial<HotkeyConfig>) => Promise<{ config: HotkeyConfig; results: unknown[] }>;
  onTriggered: (callback: (data: { action: string; accelerator: string }) => void) => Unsubscribe;
}

/**
 * Permissions API
 */
interface PermissionsAPI {
  check: (type: PermissionType) => Promise<boolean>;
  request: (type: PermissionType) => Promise<boolean>;
  getAll: () => Promise<PermissionStatus>;
}

/**
 * Session history metadata for display
 */
interface SessionHistoryItem {
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

/**
 * Output API
 */
interface OutputAPI {
  exportReview: (session: ReviewSession, options: ReviewExportOptions) => Promise<ReviewExportResult>;
  save: (session?: ReviewSession, sessionDir?: string) => Promise<SaveResult>;
  copyClipboard: () => Promise<boolean>;
  openFolder: (sessionDir?: string) => Promise<{ success: boolean; error?: string }>;
  onReady: (callback: (data: OutputReadyPayload) => void) => Unsubscribe;
  onError: (callback: (data: { message: string }) => void) => Unsubscribe;

  // Session History Browser API
  listSessions: () => Promise<SessionHistoryItem[]>;
  getSessionMetadata: (sessionId: string) => Promise<SessionHistoryItem | null>;
  deleteSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
  deleteSessions: (sessionIds: string[]) => Promise<{ success: boolean; deleted: string[]; failed: string[] }>;
  exportSession: (sessionId: string, format?: 'markdown' | 'json' | 'pdf') => Promise<{ success: boolean; path?: string; error?: string }>;
  exportSessions: (sessionIds: string[], format?: 'markdown' | 'json' | 'pdf') => Promise<{ success: boolean; path?: string; error?: string }>;
}

/**
 * Complete markuprx API
 */
/**
 * Navigation API (Main -> Renderer navigation events)
 */
interface NavigationAPI {
  onShowSettings: (callback: () => void) => Unsubscribe;
  onShowHistory: (callback: () => void) => Unsubscribe;
  onShowShortcuts: (callback: () => void) => Unsubscribe;
  onShowOnboarding: (callback: () => void) => Unsubscribe;
  onShowExport: (callback: () => void) => Unsubscribe;
  onShowWindowSelector: (callback: () => void) => Unsubscribe;
}

/**
 * Window control API
 */
interface WindowAPI {
  minimize: () => Promise<{ success: boolean }>;
  hide: () => Promise<{ success: boolean }>;
  close: () => Promise<{ success: boolean }>;
}

/**
 * Popover control API
 */
interface PopoverAPI {
  resize: (width: number, height: number) => Promise<{ success: boolean }>;
  resizeToState: (state: string) => Promise<{ success: boolean }>;
}

/**
 * Crash Recovery API
 */
interface CrashRecoveryAPI {
  check: () => Promise<{
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
      markedIssueCount: number;
      pendingMarkedIssue: boolean;
      metadata?: { appVersion: string; platform: string; sessionDurationMs: number };
    } | null;
  }>;
  recover: (sessionId: string) => Promise<{
    success: boolean;
    session?: {
      id: string;
      startTime: number;
      endTime?: number;
      screenshotCount: number;
      feedbackItems: Array<{
        id: string;
        timestamp: number;
        text: string;
        confidence: number;
        hasScreenshot: boolean;
      }>;
    };
    reportPath?: string;
    sessionDir?: string;
    reviewSession?: ReviewSession;
    error?: string;
  }>;
  discard: () => Promise<{ success: boolean }>;
  getLogs: (limit?: number) => Promise<Array<{
    timestamp: string;
    error: { name: string; message: string; stack?: string };
    appVersion: string;
    platform: string;
    sessionId?: string;
  }>>;
  clearLogs: () => Promise<{ success: boolean }>;
  updateSettings: (settings: {
    enableAutoSave?: boolean;
    autoSaveIntervalMs?: number;
    enableCrashReporting?: boolean;
    maxCrashLogs?: number;
  }) => Promise<{ success: boolean }>;
  onIncompleteFound: (callback: (data: {
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
      markedIssueCount: number;
      pendingMarkedIssue: boolean;
    };
  }) => void) => Unsubscribe;
}

/**
 * Updates API
 */
interface UpdatesAPI {
  check: () => Promise<unknown>;
  download: () => Promise<void>;
  install: () => Promise<void>;
  getStatus: () => Promise<{
    status: UpdateStatusType;
    currentVersion: string;
    availableVersion: string | null;
    releaseNotes: string | null;
    downloadProgress: number | null;
    updaterAvailable: boolean;
  }>;
  onStatus: (callback: (status: UpdateStatusPayload) => void) => Unsubscribe;
}

/**
 * Whisper Model API
 */
interface WhisperAPI {
  checkModel: () => Promise<WhisperModelCheckResult>;
  hasTranscriptionCapability: () => Promise<boolean>;
  getAvailableModels: () => Promise<WhisperModelInfoPayload[]>;
  downloadModel: (model: string) => Promise<{ success: boolean; error?: string }>;
  cancelDownload: (model: string) => Promise<{ success: boolean }>;
  onDownloadProgress: (callback: (data: WhisperDownloadProgressPayload) => void) => Unsubscribe;
  onDownloadComplete: (callback: (data: { model: string; path: string }) => void) => Unsubscribe;
  onDownloadError: (callback: (data: { model: string; error: string }) => void) => Unsubscribe;
}

/**
 * Complete markuprx API
 */
export interface MarkuprXAPI {
  // Domain APIs
  session: SessionAPI;
  capture: CaptureAPI;
  captureOverlay: CaptureOverlayAPI;
  audio: AudioAPI;
  screenRecording: ScreenRecordingAPI;
  transcript: TranscriptAPI;
  transcription: TranscriptionControlAPI;
  processing: ProcessingAPI;
  settings: SettingsAPI;
  analysisProviders: AnalysisProvidersAPI;
  hotkeys: HotkeyAPI;
  permissions: PermissionsAPI;
  output: OutputAPI;
  navigation: NavigationAPI;
  window: WindowAPI;
  popover: PopoverAPI;
  crashRecovery: CrashRecoveryAPI;
  updates: UpdatesAPI;
  whisper: WhisperAPI;
  e2e?: ElectronTestAPI;

  // App version
  version: () => Promise<string>;

  // Legacy API (backwards compatibility)
  startSession: () => Promise<{ success: boolean; sessionId?: string }>;
  stopSession: () => Promise<{ success: boolean }>;
  getSettings: () => Promise<PublicSettings>;
  setSettings: (settings: Partial<PublicSettings>) => Promise<PublicSettings>;
  copyToClipboard: (text: string) => Promise<{ success: boolean }>;
  onSessionStatus: (callback: (status: { action: string; status?: SessionStatusPayload }) => void) => Unsubscribe;
  onTranscriptionUpdate: (callback: (data: { text: string; isFinal: boolean }) => void) => Unsubscribe;
  onScreenshotCaptured: (callback: (data: { id: string; timestamp: number }) => void) => Unsubscribe;
  onOutputReady: (callback: (data: OutputReadyPayload) => void) => Unsubscribe;
  onOutputError: (callback: (error: { message: string }) => void) => Unsubscribe;
}

declare global {
  interface Window {
    markuprx: MarkuprXAPI;
  }
}

export {};
