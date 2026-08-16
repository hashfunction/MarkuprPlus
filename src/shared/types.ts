/**
 * Shared types for markupR
 */

/**
 * Represents a single screenshot captured during a feedback session
 */
export interface Screenshot {
  id: string;
  timestamp: number;
  imagePath: string;
  base64?: string;
  width: number;
  height: number;
}

/**
 * Hint describing the currently focused element at capture time.
 * Captured best-effort from DOM (renderer) and/or OS accessibility APIs.
 */
export interface FocusedElementHint {
  source: 'renderer-dom' | 'os-accessibility' | 'window-title' | 'unknown';
  role?: string;
  tagName?: string;
  id?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  textPreview?: string;
  appName?: string;
  windowTitle?: string;
}

/**
 * Cursor snapshot captured when a screenshot cue is marked.
 */
export interface CaptureCursorContext {
  x: number;
  y: number;
  displayId?: string;
  displayLabel?: string;
  relativeX?: number;
  relativeY?: number;
}

/**
 * Active window/application snapshot captured when a screenshot cue is marked.
 */
export interface CaptureWindowContext {
  sourceId?: string;
  sourceName?: string;
  sourceType?: 'screen' | 'window' | 'region';
  appName?: string;
  title?: string;
  pid?: number;
}

/**
 * Full context snapshot for a marked screenshot cue.
 */
export interface CaptureContextSnapshot {
  recordedAt: number;
  trigger: 'pause' | 'manual' | 'voice-command' | 'annotation';
  cursor?: CaptureCursorContext;
  activeWindow?: CaptureWindowContext;
  focusedElement?: FocusedElementHint;
  annotation?: {
    strokeId: string;
    tool: AnnotationTool;
    color: AnnotationColor;
  };
}

/**
 * Represents a transcription segment from voice narration
 */
export interface TranscriptionSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  isFinal: boolean;
}

/**
 * Represents a complete feedback session
 */
export interface FeedbackSession {
  id: string;
  startedAt: number;
  endedAt?: number;
  screenshots: Screenshot[];
  transcription: TranscriptionSegment[];
  status: SessionStatus;
}

/**
 * Session status enum (legacy, kept for compatibility)
 */
export type SessionStatus = 'idle' | 'recording' | 'processing' | 'complete' | 'error';

/**
 * Session state for bulletproof state machine.
 * Every state except 'idle' has a maximum timeout for automatic recovery.
 */
export type SessionState =
  | 'idle'       // Waiting for user action
  | 'starting'   // Initializing services (5s timeout)
  | 'recording'  // Active recording (30 min max)
  | 'stopping'   // Stopping services (3s timeout)
  | 'processing' // Processing results (10s timeout)
  | 'complete'   // Session finished (30s timeout then auto-idle)
  | 'error';     // Error occurred (5s timeout then auto-idle)

/**
 * Tray icon visual states
 */
export type TrayState = 'idle' | 'recording' | 'processing' | 'complete' | 'error';

/**
 * Hotkey configuration for the application
 */
export interface HotkeyConfig {
  toggleRecording: string;
  manualScreenshot: string;
  pauseResume: string;
}

/**
 * Default hotkey configuration
 */
export const DEFAULT_HOTKEY_CONFIG: HotkeyConfig = {
  toggleRecording: 'CommandOrControl+Shift+F',
  manualScreenshot: 'CommandOrControl+Shift+S',
  pauseResume: 'CommandOrControl+Shift+P',
};

/**
 * Provider used to turn captured feedback into an enhanced report.
 */
export const ANALYSIS_PROVIDERS = [
  'rules',
  'anthropic-api',
  'codex-cli',
  'claude-cli',
  'ollama',
  'lmstudio',
] as const;

export type AnalysisProvider = typeof ANALYSIS_PROVIDERS[number];
export type ModelAnalysisProvider = Exclude<AnalysisProvider, 'rules'>;
export type AnalysisConnection = 'local' | 'cli' | 'cloud';
export type AnalysisModelSource = 'default' | 'preset' | 'discovered';
export type AnalysisModelSelections = Partial<Record<ModelAnalysisProvider, string>>;

export interface AnalysisModelOption {
  id: string;
  name: string;
  source: AnalysisModelSource;
  supportsImages?: boolean;
}

export function isAnalysisProvider(value: unknown): value is AnalysisProvider {
  return typeof value === 'string'
    && (ANALYSIS_PROVIDERS as readonly string[]).includes(value);
}

export function normalizeAnalysisProvider(value: unknown): AnalysisProvider {
  if (value === 'codex') return 'codex-cli';
  if (value === 'anthropic') return 'anthropic-api';
  return isAnalysisProvider(value) ? value : 'anthropic-api';
}

const MODEL_ANALYSIS_PROVIDERS = new Set<ModelAnalysisProvider>([
  'anthropic-api',
  'codex-cli',
  'claude-cli',
  'ollama',
  'lmstudio',
]);

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

export function isValidAnalysisModelSelections(
  value: unknown,
): value is AnalysisModelSelections {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([provider, model]) =>
    MODEL_ANALYSIS_PROVIDERS.has(provider as ModelAnalysisProvider)
    && typeof model === 'string'
    && model.length > 0
    && model.length <= 200
    && !containsControlCharacter(model)
  );
}

/**
 * Runtime availability reported by an analysis provider.
 */
export interface AnalysisProviderStatus {
  id: AnalysisProvider;
  name: string;
  connection?: AnalysisConnection;
  installed: boolean;
  executablePath?: string;
  endpoint?: string;
  version?: string;
  authenticated?: boolean;
  ready: boolean;
  diagnostic?: string;
  models?: AnalysisModelOption[];
  modelsLoading?: boolean;
  refreshedAt?: string;
}

/**
 * Application settings (v2 - expanded schema)
 *
 * Note: API keys are NOT stored in settings.
 * Use SettingsManager.getApiKey('<service>') for secure storage via keytar.
 */
export interface AppSettings {
  // General
  outputDirectory: string;
  launchAtLogin: boolean;
  checkForUpdates: boolean;

  // Recording
  defaultCountdown: 0 | 3 | 5;
  showTranscriptionPreview: boolean;
  showAudioWaveform: boolean;

  // Capture
  pauseThreshold: number; // 500-3000ms
  minTimeBetweenCaptures: number; // 300-2000ms
  imageFormat: 'png' | 'jpeg';
  imageQuality: number; // 1-100 for jpeg
  maxImageWidth: number; // 800-2400

  // Transcription
  transcriptionService: 'openai';
  language: string;
  enableKeywordTriggers: boolean;

  // Hotkeys
  hotkeys: HotkeyConfig;

  // Appearance
  theme: 'dark' | 'light' | 'system';
  accentColor: string;

  // Audio
  audioDeviceId: string | null;

  // Advanced
  analysisProvider: AnalysisProvider;
  analysisModelsByProvider: AnalysisModelSelections;
  debugMode: boolean;
  keepAudioBackups: boolean;

  // Onboarding
  hasCompletedOnboarding: boolean;

  // Legacy fields (for migration compatibility)
  /** @deprecated Use imageQuality instead */
  screenshotQuality?: number;
  /** @deprecated Use pauseThreshold instead */
  pauseThresholdMs?: number;
  /** @deprecated Clipboard is always available, no setting needed */
  autoClipboard?: boolean;
  /** @deprecated Output format is always markdown */
  outputFormat?: 'markdown' | 'json';
  /** @deprecated Use audioDeviceId instead */
  preferredAudioDevice?: string;
}

/**
 * Result of validating a provider API key from the main process.
 */
export interface ApiKeyValidationResult {
  valid: boolean;
  error?: string;
  status?: number;
}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: AppSettings = {
  // General
  outputDirectory: '', // Set dynamically by SettingsManager
  launchAtLogin: false,
  checkForUpdates: true,

  // Recording
  defaultCountdown: 0,
  showTranscriptionPreview: true,
  showAudioWaveform: true,

  // Capture
  pauseThreshold: 1500,
  minTimeBetweenCaptures: 500,
  imageFormat: 'png',
  imageQuality: 85,
  maxImageWidth: 1920,

  // Transcription
  transcriptionService: 'openai',
  language: 'en',
  enableKeywordTriggers: false,

  // Hotkeys
  hotkeys: { ...DEFAULT_HOTKEY_CONFIG },

  // Appearance
  theme: 'system',
  accentColor: '#3B82F6',

  // Audio
  audioDeviceId: null,

  // Advanced
  analysisProvider: 'anthropic-api',
  analysisModelsByProvider: {},
  debugMode: false,
  keepAudioBackups: false,

  // Onboarding
  hasCompletedOnboarding: false,
};

// =============================================================================
// IPC Channel Definitions
// =============================================================================

/**
 * IPC channel names for main/renderer communication
 * Namespaced with 'markupr:' prefix for compatibility and clarity
 */
export const IPC_CHANNELS = {
  // ---------------------------------------------------------------------------
  // Session Channels (Renderer -> Main)
  // ---------------------------------------------------------------------------
  SESSION_START: 'markupr:session:start',
  SESSION_STOP: 'markupr:session:stop',
  SESSION_PAUSE: 'markupr:session:pause',
  SESSION_RESUME: 'markupr:session:resume',
  SESSION_CANCEL: 'markupr:session:cancel',
  SESSION_GET_STATUS: 'markupr:session:get-status',
  SESSION_GET_CURRENT: 'markupr:session:get-current',

  // ---------------------------------------------------------------------------
  // Session Channels (Main -> Renderer)
  // ---------------------------------------------------------------------------
  SESSION_STATE_CHANGED: 'markupr:session:state-changed',
  SESSION_STATUS: 'markupr:session:status-update',
  SESSION_COMPLETE: 'markupr:session:complete',
  SESSION_FEEDBACK_ITEM: 'markupr:session:feedback-item',
  SESSION_VOICE_ACTIVITY: 'markupr:session:voice-activity',
  SESSION_ERROR: 'markupr:session:error',

  // ---------------------------------------------------------------------------
  // Capture Channels (Renderer -> Main)
  // ---------------------------------------------------------------------------
  CAPTURE_GET_SOURCES: 'markupr:capture:get-sources',
  CAPTURE_MANUAL_SCREENSHOT: 'markupr:capture:manual-screenshot',
  CAPTURE_SELECT_TARGET: 'markupr:capture:select-target',
  CAPTURE_ANNOTATION_BEGIN: 'markupr:capture:annotation-begin',
  CAPTURE_ANNOTATION_END: 'markupr:capture:annotation-end',
  CAPTURE_ANNOTATION_SET_MODE: 'markupr:capture:annotation-set-mode',
  CAPTURE_STAGE_MARKED_ISSUE_CANDIDATE: 'markupr:capture:stage-marked-issue-candidate',
  CAPTURE_OVERLAY_GET_STATE: 'markupr:capture-overlay:get-state',
  CAPTURE_OVERLAY_CONFIRM: 'markupr:capture-overlay:confirm',
  CAPTURE_OVERLAY_CANCEL: 'markupr:capture-overlay:cancel',
  CAPTURE_OVERLAY_SET_SELECTION_MODE: 'markupr:capture-overlay:set-selection-mode',
  CAPTURE_OVERLAY_ANNOTATION_EVENT: 'markupr:capture-overlay:annotation-event',
  SCREEN_RECORDING_START: 'markupr:screen-recording:start',
  SCREEN_RECORDING_CHUNK: 'markupr:screen-recording:chunk',
  SCREEN_RECORDING_STOP: 'markupr:screen-recording:stop',

  // ---------------------------------------------------------------------------
  // Capture Channels (Main -> Renderer)
  // ---------------------------------------------------------------------------
  SCREENSHOT_CAPTURED: 'markupr:capture:screenshot-taken',
  MANUAL_SCREENSHOT: 'markupr:capture:manual-triggered',
  CAPTURE_ANNOTATION_EVENT: 'markupr:capture:annotation-event',
  CAPTURE_ANNOTATION_STATE: 'markupr:capture:annotation-state',
  CAPTURE_OVERLAY_STATE_CHANGED: 'markupr:capture-overlay:state-changed',

  // ---------------------------------------------------------------------------
  // Display Channels (Main -> Renderer) - Multi-monitor support
  // ---------------------------------------------------------------------------
  DISPLAYS_CHANGED: 'markupr:displays:changed',
  DISPLAY_DISCONNECTED: 'markupr:display:disconnected',

  // ---------------------------------------------------------------------------
  // Audio Channels (Renderer -> Main)
  // ---------------------------------------------------------------------------
  AUDIO_GET_DEVICES: 'markupr:audio:get-devices',
  AUDIO_SET_DEVICE: 'markupr:audio:set-device',

  // ---------------------------------------------------------------------------
  // Audio Channels (Main -> Renderer) - Communication with audio capture
  // ---------------------------------------------------------------------------
  AUDIO_REQUEST_DEVICES: 'markupr:audio:request-devices',
  AUDIO_START_CAPTURE: 'markupr:audio:start-capture',
  AUDIO_STOP_CAPTURE: 'markupr:audio:stop-capture',
  AUDIO_CHUNK: 'markupr:audio:chunk',
  AUDIO_DEVICES_RESPONSE: 'markupr:audio:devices-response',
  AUDIO_CAPTURE_ERROR: 'markupr:audio:capture-error',
  AUDIO_CAPTURE_STARTED: 'markupr:audio:capture-started',
  AUDIO_CAPTURE_STOPPED: 'markupr:audio:capture-stopped',
  AUDIO_LEVEL: 'markupr:audio:level',
  AUDIO_VOICE_ACTIVITY: 'markupr:audio:voice-activity',

  // ---------------------------------------------------------------------------
  // Transcription Channels (Main -> Renderer)
  // ---------------------------------------------------------------------------
  TRANSCRIPTION_UPDATE: 'markupr:transcript:chunk',
  TRANSCRIPTION_FINAL: 'markupr:transcript:final',

  // ---------------------------------------------------------------------------
  // Transcription Control Channels (Renderer -> Main)
  // ---------------------------------------------------------------------------
  TRANSCRIPTION_GET_TIER_STATUSES: 'markupr:transcription:get-tier-statuses',
  TRANSCRIPTION_GET_CURRENT_TIER: 'markupr:transcription:get-current-tier',
  TRANSCRIPTION_SET_TIER: 'markupr:transcription:set-tier',

  // ---------------------------------------------------------------------------
  // Settings Channels (Renderer -> Main)
  // ---------------------------------------------------------------------------
  SETTINGS_GET: 'markupr:settings:get',
  SETTINGS_GET_ALL: 'markupr:settings:get-all',
  SETTINGS_SET: 'markupr:settings:set',
  SETTINGS_GET_API_KEY: 'markupr:settings:get-api-key',
  SETTINGS_SET_API_KEY: 'markupr:settings:set-api-key',
  SETTINGS_DELETE_API_KEY: 'markupr:settings:delete-api-key',
  SETTINGS_HAS_API_KEY: 'markupr:settings:has-api-key',
  SETTINGS_TEST_API_KEY: 'markupr:settings:test-api-key',
  SETTINGS_SELECT_DIRECTORY: 'markupr:settings:select-directory',
  SETTINGS_CLEAR_ALL_DATA: 'markupr:settings:clear-all-data',
  SETTINGS_EXPORT: 'markupr:settings:export',
  SETTINGS_IMPORT: 'markupr:settings:import',

  // ---------------------------------------------------------------------------
  // Analysis Provider Channels (Renderer -> Main)
  // ---------------------------------------------------------------------------
  ANALYSIS_PROVIDERS_DISCOVER: 'markupr:analysis-providers:discover',
  ANALYSIS_PROVIDER_TEST: 'markupr:analysis-provider:test',
  ANALYSIS_PROVIDER_MODELS: 'markupr:analysis-provider:models',

  // ---------------------------------------------------------------------------
  // Permissions Channels (Renderer -> Main)
  // ---------------------------------------------------------------------------
  PERMISSIONS_CHECK: 'markupr:permissions:check',
  PERMISSIONS_REQUEST: 'markupr:permissions:request',
  PERMISSIONS_GET_ALL: 'markupr:permissions:get-all',

  // ---------------------------------------------------------------------------
  // Output Channels (Renderer -> Main)
  // ---------------------------------------------------------------------------
  OUTPUT_SAVE: 'markupr:output:save',
  OUTPUT_COPY_CLIPBOARD: 'markupr:output:copy-clipboard',
  OUTPUT_OPEN_FOLDER: 'markupr:output:open-folder',
  OUTPUT_EXPORT: 'markupr:output:export',

  // Session History Browser
  OUTPUT_LIST_SESSIONS: 'markupr:output:list-sessions',
  OUTPUT_GET_SESSION_METADATA: 'markupr:output:get-session-metadata',
  OUTPUT_DELETE_SESSION: 'markupr:output:delete-session',
  OUTPUT_DELETE_SESSIONS: 'markupr:output:delete-sessions',
  OUTPUT_EXPORT_SESSION: 'markupr:output:export-session',
  OUTPUT_EXPORT_SESSIONS: 'markupr:output:export-sessions',

  // ---------------------------------------------------------------------------
  // Output Channels (Main -> Renderer)
  // ---------------------------------------------------------------------------
  OUTPUT_READY: 'markupr:output:ready',
  OUTPUT_ERROR: 'markupr:output:error',

  // ---------------------------------------------------------------------------
  // Hotkey Channels
  // ---------------------------------------------------------------------------
  HOTKEY_TRIGGERED: 'markupr:hotkey:triggered',
  HOTKEY_CONFIG: 'markupr:hotkey:config',
  HOTKEY_UPDATE: 'markupr:hotkey:update',

  // ---------------------------------------------------------------------------
  // Clipboard (Legacy - kept for compatibility)
  // ---------------------------------------------------------------------------
  COPY_TO_CLIPBOARD: 'markupr:clipboard:copy',

  // ---------------------------------------------------------------------------
  // Window Control Channels
  // ---------------------------------------------------------------------------
  WINDOW_MINIMIZE: 'markupr:window:minimize',
  WINDOW_CLOSE: 'markupr:window:close',
  WINDOW_HIDE: 'markupr:window:hide',

  // ---------------------------------------------------------------------------
  // Update Channels (Renderer -> Main)
  // ---------------------------------------------------------------------------
  UPDATE_CHECK: 'markupr:update:check',
  UPDATE_DOWNLOAD: 'markupr:update:download',
  UPDATE_INSTALL: 'markupr:update:install',
  UPDATE_GET_STATUS: 'markupr:update:get-status',

  // ---------------------------------------------------------------------------
  // Update Channels (Main -> Renderer)
  // ---------------------------------------------------------------------------
  UPDATE_STATUS: 'markupr:update:status',

  // ---------------------------------------------------------------------------
  // Crash Recovery Channels (Renderer -> Main)
  // ---------------------------------------------------------------------------
  CRASH_RECOVERY_CHECK: 'markupr:crash-recovery:check',
  CRASH_RECOVERY_RECOVER: 'markupr:crash-recovery:recover',
  CRASH_RECOVERY_DISCARD: 'markupr:crash-recovery:discard',
  CRASH_RECOVERY_GET_LOGS: 'markupr:crash-recovery:get-logs',
  CRASH_RECOVERY_CLEAR_LOGS: 'markupr:crash-recovery:clear-logs',
  CRASH_RECOVERY_UPDATE_SETTINGS: 'markupr:crash-recovery:update-settings',

  // ---------------------------------------------------------------------------
  // Crash Recovery Channels (Main -> Renderer)
  // ---------------------------------------------------------------------------
  CRASH_RECOVERY_FOUND: 'markupr:crash-recovery:found',

  // ---------------------------------------------------------------------------
  // Taskbar Channels (Renderer -> Main) - Windows-specific
  // ---------------------------------------------------------------------------
  TASKBAR_SET_PROGRESS: 'markupr:taskbar:setProgress',
  TASKBAR_FLASH_FRAME: 'markupr:taskbar:flashFrame',
  TASKBAR_SET_OVERLAY: 'markupr:taskbar:setOverlay',

  // ---------------------------------------------------------------------------
  // Whisper Model Channels (Renderer -> Main)
  // ---------------------------------------------------------------------------
  WHISPER_CHECK_MODEL: 'markupr:whisper:check-model',
  WHISPER_DOWNLOAD_MODEL: 'markupr:whisper:download-model',
  WHISPER_CANCEL_DOWNLOAD: 'markupr:whisper:cancel-download',
  WHISPER_GET_AVAILABLE_MODELS: 'markupr:whisper:get-available-models',
  WHISPER_HAS_TRANSCRIPTION_CAPABILITY: 'markupr:whisper:has-transcription-capability',

  // ---------------------------------------------------------------------------
  // Whisper Model Channels (Main -> Renderer)
  // ---------------------------------------------------------------------------
  WHISPER_DOWNLOAD_PROGRESS: 'markupr:whisper:download-progress',
  WHISPER_DOWNLOAD_COMPLETE: 'markupr:whisper:download-complete',
  WHISPER_DOWNLOAD_ERROR: 'markupr:whisper:download-error',

  // ---------------------------------------------------------------------------
  // Processing Pipeline Channels (Main -> Renderer)
  // ---------------------------------------------------------------------------
  PROCESSING_PROGRESS: 'markupr:processing:progress',
  PROCESSING_COMPLETE: 'markupr:processing:complete',

  // ---------------------------------------------------------------------------
  // Session Events (Main -> Renderer, non-standard)
  // ---------------------------------------------------------------------------
  SESSION_RECOVERED: 'markupr:session:recovered',
  SESSION_WARNING: 'markupr:session:warning',

  // ---------------------------------------------------------------------------
  // Navigation Channels (Main -> Renderer)
  // ---------------------------------------------------------------------------
  SHOW_ONBOARDING: 'markupr:show-onboarding',
  SHOW_SETTINGS: 'markupr:show-settings',
  SHOW_HISTORY: 'markupr:show-history',
  SHOW_EXPORT: 'markupr:show-export',
  SHOW_SHORTCUTS: 'markupr:show-shortcuts',
  SHOW_WINDOW_SELECTOR: 'markupr:show-window-selector',
  OPEN_SESSION_DIALOG: 'markupr:open-session-dialog',
  OPEN_SESSION: 'markupr:open-session',

  // ---------------------------------------------------------------------------
  // App Channels (Renderer -> Main)
  // ---------------------------------------------------------------------------
  APP_VERSION: 'markupr:app:version',

  // ---------------------------------------------------------------------------
  // Popover Channels (Renderer -> Main)
  // ---------------------------------------------------------------------------
  POPOVER_RESIZE: 'markupr:popover:resize',
  POPOVER_RESIZE_TO_STATE: 'markupr:popover:resize-to-state',
  POPOVER_SHOW: 'markupr:popover:show',
  POPOVER_HIDE: 'markupr:popover:hide',
  POPOVER_TOGGLE: 'markupr:popover:toggle',

  // ---------------------------------------------------------------------------
  // Error Channels (Main -> Renderer)
  // ---------------------------------------------------------------------------
  NETWORK_ERROR: 'markupr:network-error',
  NETWORK_RESTORED: 'markupr:network-restored',
  CAPTURE_WARNING: 'markupr:capture-warning',
  AUDIO_ERROR: 'markupr:audio-error',
  TRANSCRIPTION_ERROR: 'markupr:transcription-error',
  NOTIFICATION: 'markupr:notification',

  // ---------------------------------------------------------------------------
  // Legacy channels (backwards compatibility)
  // ---------------------------------------------------------------------------
  START_SESSION: 'session:start',
  STOP_SESSION: 'session:stop',
  GET_SETTINGS: 'settings:get',
  SET_SETTINGS: 'settings:set',
} as const;

/**
 * Type for IPC channel names
 */
export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

// =============================================================================
// IPC Payload Types
// =============================================================================

/**
 * Session status update payload
 */
export interface SessionStatusPayload {
  state: SessionState;
  duration: number;
  feedbackCount: number;
  screenshotCount: number;
  isPaused: boolean;
}

/**
 * Feedback item payload (without Buffer)
 */
export interface FeedbackItemPayload {
  id: string;
  timestamp: number;
  text: string;
  confidence: number;
  hasScreenshot: boolean;
  screenshotId?: string;
}

/**
 * Transcript chunk payload
 */
export interface TranscriptChunkPayload {
  text: string;
  timestamp: number;
  confidence: number;
  isFinal: boolean;
  words?: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
  }>;
}

/**
 * Screenshot captured payload
 */
export interface ScreenshotCapturedPayload {
  id: string;
  timestamp: number;
  count: number;
  width?: number;
  height?: number;
  trigger?: 'pause' | 'manual' | 'voice-command' | 'annotation';
  context?: CaptureContextSnapshot;
}

/**
 * Processing pipeline progress payload
 */
export interface ProcessingProgressPayload {
  percent: number;
  step: string;
}

/**
 * Transcription tier identifiers used by UI and IPC.
 */
export type TranscriptionTier = 'auto' | 'whisper' | 'timer-only';

/**
 * Runtime availability status for a transcription tier.
 */
export interface TranscriptionTierStatus {
  tier: Exclude<TranscriptionTier, 'auto'>;
  available: boolean;
  reason?: string;
}

// =============================================================================
// Review Session Types (renderer-compatible mirrors of MarkdownGenerator types)
// =============================================================================

/**
 * Feedback category labels for the review UI
 */
export type ReviewFeedbackCategory = 'Bug' | 'UX Issue' | 'Suggestion' | 'Performance' | 'Question' | 'General';

/**
 * Feedback severity levels for the review UI
 */
export type ReviewFeedbackSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

/**
 * A single feedback item in the review session (renderer-safe)
 */
export interface ReviewFeedbackItem {
  id: string;
  transcription: string;
  timestamp: number;
  screenshots: Screenshot[];
  title?: string;
  keywords?: string[];
  category?: ReviewFeedbackCategory;
  severity?: ReviewFeedbackSeverity;
}

/**
 * Review session metadata
 */
export interface ReviewSessionMetadata {
  os?: string;
  sourceName?: string;
  sourceType?: 'screen' | 'window' | 'region';
  /** Epoch ms when video recording started, for computing video offsets */
  videoStartTime?: number;
}

/**
 * Complete review session for SessionReview component (renderer-safe)
 */
export interface ReviewSession {
  id: string;
  startTime: number;
  endTime?: number;
  feedbackItems: ReviewFeedbackItem[];
  metadata?: ReviewSessionMetadata;
}

/**
 * Output ready payload
 */
export interface OutputReadyPayload {
  markdown: string;
  sessionId: string;
  path: string;
  reportPath?: string;
  sessionDir?: string;
  recordingPath?: string;
  audioPath?: string;
  audioDurationMs?: number;
  /** Actionable error when saved narration could not be transcribed. */
  transcriptionError?: string;
  /** Actionable error when the selected report provider fell back to Local Rules. */
  analysisError?: string;
  /** Epoch ms when video recording started, for computing video offsets from transcript timestamps */
  videoStartTime?: number;
  /** The full review session for SessionReview component */
  reviewSession?: ReviewSession;
}

/**
 * Whisper model download progress payload
 */
export interface WhisperDownloadProgressPayload {
  model: string;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  speedBps: number;
  estimatedSecondsRemaining: number;
}

/**
 * Whisper model info payload
 */
export interface WhisperModelInfoPayload {
  name: string;
  filename: string;
  sizeMB: number;
  ramRequired: string;
  quality: string;
  isDownloaded: boolean;
}

/**
 * Whisper model check result
 */
export interface WhisperModelCheckResult {
  hasAnyModel: boolean;
  defaultModel: string | null;
  downloadedModels: string[];
  recommendedModel: string;
  recommendedModelSizeMB: number;
}

/**
 * Permission types
 */
export type PermissionType = 'microphone' | 'screen' | 'accessibility';

/**
 * Permission status
 */
export interface PermissionStatus {
  microphone: boolean;
  screen: boolean;
  accessibility: boolean;
}

/**
 * Save result
 */
export interface SaveResult {
  success: boolean;
  path?: string;
  error?: string;
}

// =============================================================================
// Update Types
// =============================================================================

/**
 * Update status types for auto-updater
 */
export type UpdateStatusType =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'ready'
  | 'error';

/**
 * Update status payload from main process
 */
export interface UpdateStatusPayload {
  status: UpdateStatusType;
  version?: string;
  releaseNotes?: string | null;
  releaseDate?: string;
  percent?: number;
  bytesPerSecond?: number;
  total?: number;
  transferred?: number;
  message?: string;
}

// =============================================================================
// Audio Types
// =============================================================================

/**
 * Audio device representation
 */
export interface AudioDevice {
  id: string;
  name: string;
  isDefault: boolean;
}

/**
 * Audio chunk for streaming to transcription
 */
export interface AudioChunk {
  buffer: Buffer;
  timestamp: number;
  duration: number;
  sampleRate: number;
}

/**
 * Audio capture configuration
 */
export interface AudioCaptureConfig {
  sampleRate: number;
  channels: number;
  chunkDurationMs: number;
  vadThreshold: number;
  vadSilenceMs: number;
  recoveryBufferMinutes: number;
}

/**
 * Default audio configuration (optimized for speech transcription)
 */
export const DEFAULT_AUDIO_CONFIG: AudioCaptureConfig = {
  sampleRate: 16000,
  channels: 1,
  chunkDurationMs: 100,
  vadThreshold: 0.01,
  vadSilenceMs: 300,
  recoveryBufferMinutes: 5,
};

// =============================================================================
// Capture Types
// =============================================================================

/**
 * Output document structure
 */
export interface OutputDocument {
  sessionId: string;
  generatedAt: number;
  markdown: string;
  screenshots: Screenshot[];
}

/**
 * Display information with layout positioning for multi-monitor support
 */
export interface DisplayInfo {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  isPrimary: boolean;
  rotation: 0 | 90 | 180 | 270;
  internal: boolean;
}

/**
 * Capture source for window/screen selection
 */
export interface CaptureSource {
  id: string;
  name: string;
  type: 'screen' | 'window';
  thumbnail?: string;
  appIcon?: string;
  /** Display info for screen sources (multi-monitor support) */
  display?: DisplayInfo;
}

/** Integer rectangle expressed in Electron device-independent screen pixels. */
export interface CaptureBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CapturePoint {
  x: number;
  y: number;
}

/** Display details used by the full-desktop selection overlay. */
export interface CaptureDisplay {
  id: string;
  label: string;
  sourceId: string;
  sourceName: string;
  bounds: CaptureBounds;
  scaleFactor: number;
  isPrimary: boolean;
}

/** A visible OS window matched to the exact Electron desktop source. */
export interface CapturableWindow {
  sourceId: string;
  sourceName: string;
  nativeWindowId: string;
  appName: string;
  bounds: CaptureBounds;
  ownerPid?: number;
  appIcon?: string;
  thumbnail?: string;
}

interface CaptureTargetBase {
  sourceId: string;
  sourceName: string;
}

export interface WindowCaptureTarget extends CaptureTargetBase {
  kind: 'window';
  nativeWindowId: string;
  appName: string;
  bounds: CaptureBounds;
  /** False for privacy-preserving gallery fallback when the OS hides geometry. */
  geometryAvailable?: boolean;
}

export interface RegionCaptureTarget extends CaptureTargetBase {
  kind: 'region';
  displayId: string;
  displayBounds: CaptureBounds;
  scaleFactor: number;
  /** Crop expressed relative to the display's top-left corner. */
  region: CaptureBounds;
}

export interface ScreenCaptureTarget extends CaptureTargetBase {
  kind: 'screen';
  displayId: string;
  displayBounds: CaptureBounds;
  scaleFactor: number;
}

export type CaptureTarget =
  | WindowCaptureTarget
  | RegionCaptureTarget
  | ScreenCaptureTarget;

export type AnnotationMode = 'interact' | 'draw';
export type CaptureSelectionMode = 'window' | 'region' | 'screen';
export type AnnotationTool = 'freehand' | 'circle' | 'highlight';
export type AnnotationColor = '#ff3b30' | '#ffcc00' | '#34c759' | '#0a84ff';
export const MAX_MARKED_SCREENSHOT_BYTES = 15 * 1024 * 1024;

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface AnnotationStroke {
  id: string;
  tool: AnnotationTool;
  color: AnnotationColor;
  width: number;
  points: NormalizedPoint[];
}

interface AnnotationEventBase {
  sessionId: string;
}

export type AnnotationEvent =
  | (AnnotationEventBase & { type: 'cursor'; point: NormalizedPoint | null })
  | (AnnotationEventBase & { type: 'stroke-start'; stroke: AnnotationStroke })
  | (AnnotationEventBase & { type: 'stroke-points'; strokeId: string; points: NormalizedPoint[] })
  | (AnnotationEventBase & { type: 'stroke-end'; strokeId: string })
  | (AnnotationEventBase & { type: 'undo' })
  | (AnnotationEventBase & { type: 'clear' })
  | (AnnotationEventBase & { type: 'mode'; mode: AnnotationMode })
  | (AnnotationEventBase & { type: 'bounds'; bounds: CaptureBounds })
  | (AnnotationEventBase & {
    type: 'snapshot-request';
    revision: number;
    requestedAt: number;
  });

/** A single independently captured problem or requested change in a recording. */
export interface MarkedIssuePayload {
  id: string;
  ordinal: number;
  startedAt: number;
  markedAt: number;
  completedAt: number;
  strokeIds: string[];
  tools: AnnotationTool[];
  colors: AnnotationColor[];
  screenshotPath?: string;
  fallbackVideoTimestamp: number;
  captureContext?: CaptureContextSnapshot;
  comment?: string;
  transcriptionStatus: 'pending' | 'available' | 'unavailable';
  snapshotRevision: number;
  transcriptSegmentIds: string[];
  evidenceWarning?: string;
}

/** Request to capture the current marked frame before the user navigates away. */
export interface MarkedIssueSnapshotRequest {
  sessionId: string;
  revision: number;
  requestedAt: number;
}

export interface MarkedIssueCandidatePayload {
  sessionId: string;
  revision: number;
  bytes: Uint8Array;
}

export interface CaptureSelectionOverlayState {
  kind: 'selection';
  overlayId: string;
  mode: CaptureSelectionMode;
  display: CaptureDisplay;
  displays: CaptureDisplay[];
  windows: CapturableWindow[];
  windowSources: CaptureSource[];
}

export interface CaptureAnnotationOverlayState {
  kind: 'annotation';
  overlayId: string;
  sessionId: string;
  target: CaptureTarget;
  mode: AnnotationMode;
  modifierKey?: 'Command' | 'Control';
  modifierInputAvailable?: boolean;
  modifierInputError?: string;
}

export type CaptureOverlayState = CaptureSelectionOverlayState | CaptureAnnotationOverlayState;

export interface AnnotationStatePayload {
  active: boolean;
  mode: AnnotationMode;
  inputMode?: 'modifier' | 'fallback';
  modifierKey?: 'Command' | 'Control';
  error?: string;
}

// =============================================================================
// Session Types (for IPC)
// =============================================================================

/**
 * Session metadata for IPC transport
 */
export interface SessionMetadata {
  sourceId: string;
  sourceName?: string;
  sourceType?: 'screen' | 'window' | 'region';
  captureTarget?: CaptureTarget;
  windowTitle?: string;
  appName?: string;
  recordingPath?: string;
  recordingMimeType?: string;
  recordingBytes?: number;
  audioPath?: string;
  audioBytes?: number;
  audioDurationMs?: number;
  /** Epoch ms when video recording started, for computing video offsets from transcript timestamps */
  videoStartTime?: number;
  /** Best-effort cue-time metadata snapshots for marked captures */
  captureContexts?: CaptureContextSnapshot[];
  /** Actionable reason recorded narration did not produce a transcript. */
  transcriptionFailure?: TranscriptionFailure;
}

export type TranscriptionFailureCode =
  | 'audio-unavailable'
  | 'not-configured'
  | 'openai-failed'
  | 'whisper-failed'
  | 'no-speech';

export interface TranscriptionFailure {
  code: TranscriptionFailureCode;
  message: string;
}

/**
 * Complete session for IPC (excludes Buffer data)
 */
export interface SessionPayload {
  id: string;
  startTime: number;
  endTime?: number;
  state: SessionState;
  sourceId: string;
  feedbackItems: FeedbackItemPayload[];
  metadata: SessionMetadata;
}
