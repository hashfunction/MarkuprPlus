/**
 * SessionController - Core Orchestrator for markuprx
 *
 * Implements a bulletproof finite state machine for session lifecycle:
 *   idle -> starting -> recording -> stopping -> processing -> complete
 *
 * Responsibilities:
 * - Coordinate all services (audio, video recording)
 * - Manage session state (crash recovery delegated to CrashRecoveryManager)
 * - Watchdog timer to prevent stuck states
 * - Run PostProcessor pipeline after recording stops
 * - Emit state changes and processing progress to renderer via IPC
 */

import Store from 'electron-store';
import { BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { audioCapture, type AudioChunk } from './audio/AudioCapture';
import type { TranscriptEvent } from './transcription/types';
import { recoverTranscript, normalizeTranscriptTimestamp } from './transcription/TranscriptionRecoveryService';
import {
  IPC_CHANNELS,
  type SessionState,
  type SessionMetadata,
  type CaptureContextSnapshot,
  type CaptureTarget,
  type MarkedIssuePayload,
} from '../shared/types';
import { errorHandler } from './ErrorHandler';
import { type PostProcessResult, type PostProcessProgress } from './pipeline';

// =============================================================================
// Types - Bulletproof State Machine
// =============================================================================

// SessionState is imported from '../shared/types' (single source of truth)

/**
 * State timeout configuration (in milliseconds).
 * Every state except 'idle' has a maximum duration.
 */
export const STATE_TIMEOUTS: Record<SessionState, number | null> = {
  idle: null,              // Infinite - waits for user action
  starting: 5_000,         // 5 seconds to initialize
  recording: 30 * 60_000,  // 30 minutes max recording
  stopping: 3_000,         // 3 seconds to stop services
  processing: 5 * 60_000,  // 5 minutes for post-processing pipeline
  complete: 5 * 60_000,    // 5 minutes for post-processing to finish
  error: 5_000,            // 5 seconds to show error
} as const;

/**
 * Recording duration warnings and limits
 */
export const RECORDING_LIMITS = {
  WARNING_DURATION_MS: 25 * 60_000,  // 25 minutes - show warning
  MAX_DURATION_MS: 30 * 60_000,       // 30 minutes - force stop
} as const;

/**
 * @deprecated Screenshot capture during recording has been removed.
 * Frame extraction now happens in the post-processing pipeline.
 * This interface is kept for backward compatibility with downstream consumers.
 */
export interface Screenshot {
  id: string;
  timestamp: number;
  buffer: Buffer;
  width: number;
  height: number;
  base64?: string;
  trigger?: string;
}

export interface FeedbackItem {
  id: string;
  timestamp: number;
  text: string;
  confidence: number;
  /**
   * @deprecated Screenshots are no longer captured during recording.
   * Extracted frames are available via PostProcessResult after processing.
   */
  screenshot?: Screenshot;
}

// SessionMetadata is imported from '../shared/types' (single source of truth)

export interface Session {
  id: string;
  startTime: number;
  endTime?: number;
  state: SessionState;
  sourceId: string;
  feedbackItems: FeedbackItem[];
  transcriptBuffer: TranscriptEvent[];
  /**
   * @deprecated Screenshots are no longer captured during recording.
   * Kept for backward compatibility; always an empty array.
   */
  screenshotBuffer: Screenshot[];
  metadata: SessionMetadata;
}

export interface SessionStatus {
  state: SessionState;
  duration: number;
  feedbackCount: number;
  screenshotCount: number;
  isPaused: boolean;
  /** Post-processing progress (only set when state === 'processing') */
  processingProgress?: PostProcessProgress;
}

export interface SessionControllerEvents {
  onStateChange: (state: SessionState, session: Session | null) => void;
  onFeedbackItem: (item: FeedbackItem) => void;
  onTranscriptBufferChange?: (events: TranscriptEvent[]) => void;
  onError: (error: Error) => void;
}

function cloneMarkedIssues(issues: MarkedIssuePayload[] | undefined): MarkedIssuePayload[] {
  return issues ? structuredClone(issues) : [];
}

/**
 * Valid state transitions.
 * Every state has a path back to 'idle' for recovery.
 */
const STATE_TRANSITIONS: Record<SessionState, SessionState[]> = {
  idle: ['starting'],
  starting: ['recording', 'error', 'idle'],  // success, error, or cancel
  recording: ['stopping', 'error', 'idle'],  // stop, error, or cancel
  stopping: ['processing', 'error', 'idle'], // success, error, or cancel
  processing: ['complete', 'error', 'idle'], // success, error, or timeout
  complete: ['idle'],                         // only back to idle
  error: ['idle'],                            // only back to idle
};

// =============================================================================
// Persistence Store Schema
// =============================================================================

// Session data for persistence (without Buffer objects)
interface PersistedSession {
  id: string;
  startTime: number;
  endTime?: number;
  state: SessionState;
  sourceId: string;
  feedbackItemCount: number;
  metadata: SessionMetadata;
}

interface StoreSchema {
  currentSession: PersistedSession | null;
  recentSessions: PersistedSession[];
}

const store = new Store<StoreSchema>({
  name: 'markuprx-sessions',
  defaults: {
    currentSession: null,
    recentSessions: [],
  },
  // Clear on corruption
  clearInvalidConfig: true,
});

// =============================================================================
// SessionController Class
// =============================================================================

export class SessionController {
  // Core state
  private state: SessionState = 'idle';
  private isPaused = false;
  private pausedAtMs: number | null = null;
  private accumulatedPausedMs = 0;
  private captureCount = 0;
  private session: Session | null = null;
  private events: SessionControllerEvents | null = null;
  private mainWindow: BrowserWindow | null = null;

  // Service references (using actual implementations)
  private audioCaptureService: typeof audioCapture;

  // Cleanup functions for event subscriptions
  private cleanupFunctions: Array<() => void> = [];

  // Timers
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private durationTimer: NodeJS.Timeout | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;

  // Watchdog state
  private stateEnteredAt: number = Date.now();
  private recordingWarningShown: boolean = false;
  private recoveryInProgress: boolean = false;

  // Post-processing result (available after processing completes)
  private postProcessResult: PostProcessResult | null = null;

  // Current processing progress (for status reporting)
  private currentProcessingProgress: PostProcessProgress | null = null;

  // Configuration constants
  private readonly AUTO_SAVE_INTERVAL_MS = 5000;       // 5 seconds (per spec)
  private readonly WATCHDOG_CHECK_INTERVAL_MS = 1000;  // 1 second
  private readonly MAX_RECENT_SESSIONS = 10;
  private readonly MAX_TRANSCRIPT_BUFFER_EVENTS = 2000;

  private getActiveDurationMs(nowMs: number = Date.now()): number {
    if (!this.session) {
      return 0;
    }

    const activePauseWindowMs =
      this.isPaused && this.pausedAtMs !== null
        ? Math.max(0, nowMs - this.pausedAtMs)
        : 0;

    return Math.max(
      0,
      nowMs - this.session.startTime - this.accumulatedPausedMs - activePauseWindowMs
    );
  }

  private closeActivePauseWindow(nowMs: number = Date.now()): void {
    if (this.pausedAtMs === null) {
      return;
    }
    this.accumulatedPausedMs += Math.max(0, nowMs - this.pausedAtMs);
    this.pausedAtMs = null;
  }

  private resetSessionRuntimeState(): void {
    this.isPaused = false;
    this.pausedAtMs = null;
    this.accumulatedPausedMs = 0;
    this.captureCount = 0;
  }

  constructor() {
    // Use singleton instances
    this.audioCaptureService = audioCapture;
  }

  // ===========================================================================
  // Timeout Utilities
  // ===========================================================================

  /**
   * Wraps an async operation with a timeout.
   * If the operation takes longer than timeoutMs, returns the fallback value.
   *
   * @param operation - The promise to wrap
   * @param timeoutMs - Maximum time to wait in milliseconds
   * @param fallback - Value to return if timeout occurs
   * @param operationName - Name for logging purposes
   * @returns Promise resolving to either the operation result or the fallback
   */
  private async withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    fallback: T,
    operationName: string = 'operation'
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([operation, timeoutPromise]);
      if (timeoutId) clearTimeout(timeoutId);
      return result;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      console.warn(`[SessionController] ${operationName} timeout/error, using fallback:`, error);
      return fallback;
    }
  }

  /**
   * Wraps a synchronous function that may block, converting it to async with timeout.
   * Useful for wrapping service.stop() calls that don't return promises.
   */
  private async withTimeoutSync(
    fn: () => void,
    timeoutMs: number,
    operationName: string = 'operation'
  ): Promise<void> {
    return this.withTimeout(
      new Promise<void>((resolve) => {
        try {
          fn();
          resolve();
        } catch (error) {
          console.warn(`[SessionController] ${operationName} threw:`, error);
          resolve(); // Still resolve - we don't want to block
        }
      }),
      timeoutMs,
      undefined,
      operationName
    );
  }

  /**
   * Initialize the SessionController.
   * Crash recovery is handled by CrashRecoveryManager (single authority).
   */
  async initialize(): Promise<void> {
    console.log('[SessionController] Initializing...');

    // Watchdog is started on-demand when leaving idle state (see transition())
    // to avoid unnecessary CPU wake-ups while idle.

    console.log('[SessionController] Initialization complete');
  }

  /**
   * Set the main window for IPC communication
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
    // Also set on audio capture service (it needs window for renderer communication)
    this.audioCaptureService.setMainWindow(window);
  }

  /**
   * Set event callbacks
   */
  setEventCallbacks(events: SessionControllerEvents): void {
    this.events = events;
  }

  /**
   * Configure transcription service with API key
   * Note: TierManager handles API key configuration internally via settings
   * This method is kept for backward compatibility but is now a no-op
   */
  configureTranscription(_apiKey: string): void {
    // TierManager reads API key from settings automatically
    // No action needed here
  }

  // ===========================================================================
  // State Machine
  // ===========================================================================

  /**
   * Transition to a new state with validation.
   * Updates state entry time for watchdog tracking.
   */
  private transition(newState: SessionState): boolean {
    const validTransitions = STATE_TRANSITIONS[this.state];

    if (!validTransitions.includes(newState)) {
      console.error(
        `[SessionController] Invalid state transition: ${this.state} -> ${newState}`
      );
      return false;
    }

    const oldState = this.state;

    // Start watchdog when leaving idle (active session needs monitoring)
    if (oldState === 'idle' && newState !== 'idle') {
      this.startWatchdog();
    }

    // Stop watchdog when entering idle (no need to monitor idle state)
    if (newState === 'idle') {
      this.stopWatchdog();
    }

    this.state = newState;
    this.stateEnteredAt = Date.now();
    this.recordingWarningShown = false; // Reset for new state

    // Update session state if exists
    if (this.session) {
      this.session.state = newState;
    }

    console.log(`[SessionController] State: ${oldState} -> ${newState}`);

    // Notify listeners
    this.emitStateChange();

    return true;
  }

  /**
   * Get current state
   */
  getState(): SessionState {
    return this.state;
  }

  // ===========================================================================
  // Session Lifecycle
  // ===========================================================================

  /**
   * Start a new recording session.
   * Transitions: idle -> starting -> recording
   */
  async start(sourceId: string, sourceName?: string, captureTarget?: CaptureTarget): Promise<void> {
    if (this.state === 'complete') {
      this.reset();
    }
    if (this.state !== 'idle') {
      throw new Error(`Cannot start a new session while in "${this.state}" state. Wait for the current session to finish or cancel it first.`);
    }

    console.log(`[SessionController] Starting session for source: ${sourceId}`);

    // Transition to starting state FIRST
    if (!this.transition('starting')) {
      throw new Error('Failed to transition to starting state');
    }

    // Reset counters
    this.audioChunkCount = 0;
    this.resetSessionRuntimeState();
    this.postProcessResult = null;
    this.currentProcessingProgress = null;

    // Create new session
    this.session = {
      id: randomUUID(),
      startTime: Date.now(),
      state: 'starting',
      sourceId,
      feedbackItems: [],
      transcriptBuffer: [],
      screenshotBuffer: [],
      metadata: {
        sourceId,
        sourceName,
        sourceType: captureTarget?.kind
          || (sourceId.startsWith('window:') ? 'window' : 'screen'),
        captureTarget,
        markedIssues: [],
      },
    };

    try {
      // Initialize services with timeout protection
      await this.initializeServicesWithTimeout();

      // Transition to recording
      if (!this.transition('recording')) {
        throw new Error('Failed to transition to recording state');
      }
      this.session.state = 'recording';

      // Start timers
      this.startAutoSave();
      this.startDurationTimer();

      console.log(`[SessionController] Session started: ${this.session.id}`);
    } catch (error) {
      console.error('[SessionController] Failed to start services:', error);

      // Cleanup on failure
      await this.cleanupServicesAsync();
      this.session = null;

      // Transition to error state (which will auto-recover to idle)
      try {
        this.transition('error');
        this.emitToRenderer(IPC_CHANNELS.SESSION_ERROR, {
          type: 'startError',
          message: error instanceof Error ? error.message : 'Failed to start session',
        });
      } catch {
        // If transition fails, force to idle
        this.transitionForced('idle');
      }

      throw error;
    }
  }

  /**
   * Initialize all services with timeout protection.
   * Total timeout: 5 seconds (starting state timeout).
   */
  private async initializeServicesWithTimeout(): Promise<void> {
    const totalTimeout = STATE_TIMEOUTS.starting!;
    const startTime = Date.now();

    // Subscribe to audio events
    const unsubAudioChunk = this.audioCaptureService.onAudioChunk((chunk) =>
      this.handleAudioChunk(chunk)
    );
    const unsubVoiceActivity = this.audioCaptureService.onVoiceActivity((active) =>
      this.handleVoiceActivity(active)
    );
    const unsubAudioError = this.audioCaptureService.onError((error) =>
      this.handleServiceError('audio', error)
    );

    this.cleanupFunctions.push(unsubAudioChunk, unsubVoiceActivity, unsubAudioError);

    console.log(
      '[SessionController] Live transcription disabled for this workflow; using post-session transcription from captured audio.'
    );

    // Check if we still have time
    const elapsed2 = Date.now() - startTime;
    const remaining2 = Math.max(totalTimeout - elapsed2, 500);

    // Start audio capture with timeout
    const audioStarted = await this.withTimeout(
      this.audioCaptureService.start().then(() => true),
      remaining2,
      false,
      'AudioCapture.start()'
    );

    if (!audioStarted) {
      throw new Error(
        'Microphone capture failed to start. Check microphone permission and selected input device, then retry.'
      );
    }
  }

  /**
   * Stop the current session and run the post-processing pipeline.
   * Transitions: recording -> stopping -> processing -> complete
   */
  async stop(): Promise<Session | null> {
    if (this.state !== 'recording') {
      console.warn(`[SessionController] Cannot stop from state: ${this.state}`);
      return null;
    }

    if (!this.session) {
      console.warn('[SessionController] No active session to stop');
      return null;
    }

    console.log(`[SessionController] Stopping session: ${this.session.id}`);

    // Transition to stopping state
    if (!this.transition('stopping')) {
      console.error('[SessionController] Failed to transition to stopping state');
      return null;
    }
    this.session.state = 'stopping';

    // Stop services with timeout protection
    await this.withTimeout(
      this.cleanupServicesAsync(),
      STATE_TIMEOUTS.stopping!,
      undefined,
      'cleanupServices'
    );

    // Transition to processing
    if (!this.transition('processing')) {
      console.error('[SessionController] Failed to transition to processing state');
      // Force complete with partial data
      this.transitionForced('complete');
      if (this.session) this.session.state = 'complete';
    } else {
      this.session.state = 'processing';
    }

    // NOTE: The full PostProcessor pipeline (transcribe -> analyze -> extract frames)
    // is NOT run here because recordingPath and audioPath are not yet available on
    // session.metadata at this point. Those paths are set later in stopSession()
    // (src/main/index.ts) after the recording and audio files are finalized and
    // written to disk. The real PostProcessor call happens there with the actual
    // file paths. Here we only attempt transcript recovery from the in-memory
    // captured audio buffer as a fallback for when stop() is called directly
    // (e.g., by the watchdog timer) without going through stopSession().
    await this.withTimeout(
      this.recoverTranscriptFromCapturedAudio(),
      Math.floor(STATE_TIMEOUTS.processing! * 0.8),
      undefined,
      'recoverTranscriptFromCapturedAudio'
    );

    // Set end time
    this.session.endTime = Date.now();
    this.closeActivePauseWindow(this.session.endTime);
    this.isPaused = false;
    this.currentProcessingProgress = null;

    // Transition to complete
    if (!this.transition('complete')) {
      this.transitionForced('complete');
    }
    this.session.state = 'complete';

    // Move to recent sessions
    const completedSession = { ...this.session };
    this.addToRecentSessions(completedSession);

    // Clear current session from store
    store.set('currentSession', null);

    console.log(
      `[SessionController] Session completed: ${completedSession.id}, ` +
        `${completedSession.feedbackItems.length} feedback items`
    );

    return completedSession;
  }

  /**
   * Cancel the current session without processing
   */
  cancel(): void {
    if (this.state !== 'recording' && this.state !== 'processing' && this.state !== 'starting') {
      console.warn(`[SessionController] Cannot cancel from state: ${this.state}`);
      return;
    }

    console.log(`[SessionController] Cancelling session: ${this.session?.id}`);

    // Force cleanup (don't wait for async)
    this.cleanupServicesForced();
    this.audioCaptureService.clearCapturedAudio();

    // Clear session
    this.session = null;
    this.resetSessionRuntimeState();
    store.set('currentSession', null);

    // Force transition to idle (bypass normal validation since we're cancelling)
    this.transitionForced('idle');
  }

  /**
   * Reset controller to idle state
   */
  reset(): void {
    this.cleanupServices();
    this.session = null;
    this.postProcessResult = null;
    this.currentProcessingProgress = null;
    this.resetSessionRuntimeState();
    this.transitionForced('idle');
  }

  // ===========================================================================
  // Status & Data Access
  // ===========================================================================

  /**
   * Get current session status
   */
  getStatus(): SessionStatus {
    const duration = this.getActiveDurationMs();

    const status: SessionStatus = {
      state: this.state,
      duration,
      feedbackCount: this.session?.feedbackItems.length ?? 0,
      screenshotCount: this.session
        ? this.captureCount + (this.session.metadata.markedIssues?.length ?? 0)
        : 0,
      isPaused: this.state === 'recording' && this.isPaused,
    };

    if (this.state === 'processing' && this.currentProcessingProgress) {
      status.processingProgress = this.currentProcessingProgress;
    }

    return status;
  }

  isSessionPaused(): boolean {
    return this.state === 'recording' && this.isPaused;
  }

  pause(): boolean {
    if (this.state !== 'recording' || this.isPaused) {
      return false;
    }

    this.isPaused = true;
    this.pausedAtMs = Date.now();
    this.audioCaptureService.setPaused(true);
    this.emitToRenderer(IPC_CHANNELS.SESSION_VOICE_ACTIVITY, { active: false });
    this.emitStatus();
    return true;
  }

  resume(): boolean {
    if (this.state !== 'recording' || !this.isPaused) {
      return false;
    }

    this.closeActivePauseWindow();
    this.isPaused = false;
    this.audioCaptureService.setPaused(false);
    this.emitStatus();
    return true;
  }

  registerCaptureCue(
    trigger: 'pause' | 'manual' | 'voice-command' | 'annotation' = 'manual',
    context?: CaptureContextSnapshot,
  ): {
    id: string;
    timestamp: number;
    count: number;
    trigger: 'pause' | 'manual' | 'voice-command' | 'annotation';
    context?: CaptureContextSnapshot;
  } | null {
    if (this.state !== 'recording' || this.isPaused || !this.session) {
      return null;
    }

    this.captureCount += 1;
    const timestamp = Date.now();
    const sourceType = this.session.metadata.sourceType
      || (this.session.sourceId.startsWith('window') ? 'window' : 'screen');
    const mergedContext: CaptureContextSnapshot = {
      recordedAt: timestamp,
      trigger,
      activeWindow: {
        sourceId: this.session.sourceId,
        sourceName: this.session.metadata?.sourceName,
        sourceType,
      },
    };
    if (context) {
      Object.assign(mergedContext, context);
      mergedContext.trigger = context.trigger || trigger;
      mergedContext.recordedAt = context.recordedAt ?? timestamp;
      mergedContext.activeWindow = {
        ...(context.activeWindow || {}),
        sourceId: this.session.sourceId,
        sourceName: this.session.metadata?.sourceName,
        sourceType,
      };
    }

    const existingContexts = this.session.metadata.captureContexts || [];
    this.session.metadata.captureContexts = [...existingContexts, mergedContext].slice(-400);

    const payload = {
      id: randomUUID(),
      timestamp,
      count: this.captureCount,
      trigger,
      context: mergedContext,
    };

    this.emitToRenderer(IPC_CHANNELS.SCREENSHOT_CAPTURED, payload);
    this.persistSession();
    this.emitStatus();
    return payload;
  }

  /**
   * Get current session
   */
  getSession(): Session | null {
    if (!this.session) return null;
    return {
      ...this.session,
      metadata: {
        ...this.session.metadata,
        markedIssues: cloneMarkedIssues(this.session.metadata.markedIssues),
      },
    };
  }

  setMarkedIssues(issues: MarkedIssuePayload[]): boolean {
    if (!this.session || issues.length > 200) return false;
    this.session.metadata.markedIssues = cloneMarkedIssues(issues);
    this.persistSession();
    this.emitStatus();
    return true;
  }

  getMarkedIssues(): MarkedIssuePayload[] {
    return cloneMarkedIssues(this.session?.metadata.markedIssues);
  }

  /** Guarded Electron UI harness hook; callers must enforce the unpackaged-app gate. */
  injectTranscriptForTesting(text: string, recordedAt = Date.now()): boolean {
    if (this.state !== 'recording' || !this.session || !text.trim()
      || !Number.isFinite(recordedAt) || recordedAt < 0) {
      return false;
    }
    this.handleTranscriptResult({
      text: text.trim(),
      isFinal: true,
      confidence: 0.99,
      timestamp: recordedAt / 1000,
      tier: 'timer-only',
    });
    this.persistSession();
    return true;
  }

  /**
   * Update metadata fields on the active session.
   */
  setSessionMetadata(updates: Partial<SessionMetadata>): boolean {
    if (!this.session) {
      return false;
    }

    this.session.metadata = {
      ...this.session.metadata,
      ...updates,
      ...(updates.markedIssues
        ? { markedIssues: cloneMarkedIssues(updates.markedIssues) }
        : {}),
    };

    this.persistSession();
    return true;
  }

  /**
   * Export the captured microphone audio for the most recent session.
   */
  async exportCapturedAudio(
    outputPathBase: string,
  ): Promise<{ path: string; bytesWritten: number; durationMs: number; mimeType: string } | null> {
    const exported = await this.audioCaptureService.exportCapturedAudio(outputPathBase);
    if (!exported) {
      return null;
    }

    return exported;
  }

  clearCapturedAudio(): void {
    this.audioCaptureService.clearCapturedAudio();
  }

  /**
   * Get recent completed sessions (persisted metadata only)
   */
  getRecentSessions(): PersistedSession[] {
    return store.get('recentSessions') || [];
  }

  /**
   * Get the post-processing result from the most recent session.
   * Available after the processing state completes.
   */
  getPostProcessResult(): PostProcessResult | null {
    return this.postProcessResult;
  }

  // ===========================================================================
  // Feedback Item Management
  // ===========================================================================

  /**
   * Add a feedback item manually
   */
  addFeedbackItem(item: Partial<FeedbackItem>): FeedbackItem {
    if (!this.session) {
      throw new Error('No active session. Start a recording before adding feedback items.');
    }

    const feedbackItem: FeedbackItem = {
      id: randomUUID(),
      timestamp: Date.now(),
      text: item.text || '',
      confidence: item.confidence ?? 1.0,
    };

    this.session.feedbackItems.push(feedbackItem);
    this.emitFeedbackItem(feedbackItem);
    this.persistSession();

    return feedbackItem;
  }

  /**
   * Delete a feedback item
   */
  deleteFeedbackItem(id: string): boolean {
    if (!this.session) {
      return false;
    }

    const index = this.session.feedbackItems.findIndex((item) => item.id === id);
    if (index === -1) {
      return false;
    }

    this.session.feedbackItems.splice(index, 1);
    this.persistSession();
    this.emitStateChange();

    return true;
  }

  /**
   * Update a feedback item
   */
  updateFeedbackItem(id: string, updates: Partial<FeedbackItem>): FeedbackItem | null {
    if (!this.session) {
      return null;
    }

    const item = this.session.feedbackItems.find((item) => item.id === id);
    if (!item) {
      return null;
    }

    Object.assign(item, updates, { id }); // Preserve ID
    this.persistSession();

    return item;
  }

  // ===========================================================================
  // Service Event Handlers
  // ===========================================================================

  // Audio chunk counter for debug logging
  private audioChunkCount: number = 0;

  /**
   * Handle audio chunk from microphone
   */
  private handleAudioChunk(_chunk: AudioChunk): void {
    if (this.state !== 'recording') {
      return;
    }

    if (this.isPaused) {
      return;
    }

    // Log every 100 chunks (roughly every 10 seconds at 100ms chunks)
    this.audioChunkCount++;
    if (this.audioChunkCount % 100 === 0) {
      console.log(
        `[SessionController] Audio captured: ${this.audioChunkCount} chunks, ${Math.round(
          this.audioChunkCount * 0.1
        )}s of audio`
      );
    }
  }

  /**
   * Handle voice activity changes (forward to renderer for UI feedback).
   * Screenshots are no longer captured during recording; frame extraction
   * happens in the post-processing pipeline after recording stops.
   */
  private handleVoiceActivity(active: boolean): void {
    if (this.isPaused) {
      this.emitToRenderer(IPC_CHANNELS.SESSION_VOICE_ACTIVITY, { active: false });
      return;
    }

    this.emitToRenderer(IPC_CHANNELS.SESSION_VOICE_ACTIVITY, { active });
  }

  /**
   * Run a post-session transcription recovery pass when live transcription produced no final output.
   * Delegates to TranscriptionRecoveryService for the actual recovery strategies.
   */
  private async recoverTranscriptFromCapturedAudio(): Promise<void> {
    if (!this.session) {
      return;
    }

    const hasFinalTranscript = this.session.transcriptBuffer.some(
      (entry) => entry.isFinal && entry.text.trim().length > 0,
    );
    if (hasFinalTranscript) {
      return;
    }

    const sessionStartSec = this.session.startTime / 1000;
    const recovery = await recoverTranscript(sessionStartSec, {
      capturedAudioAsset: this.audioCaptureService.getCapturedAudioAsset(),
      capturedAudioBuffer: this.audioCaptureService.getCapturedAudioBuffer(),
    });
    const recoveredEvents = recovery.events;

    if (recoveredEvents.length > 0) {
      delete this.session.metadata.transcriptionFailure;
      this.session.transcriptBuffer.push(...recoveredEvents);
      this.session.transcriptBuffer.sort((a, b) => a.timestamp - b.timestamp);
      if (this.session.transcriptBuffer.length > this.MAX_TRANSCRIPT_BUFFER_EVENTS) {
        this.session.transcriptBuffer.splice(
          0,
          this.session.transcriptBuffer.length - this.MAX_TRANSCRIPT_BUFFER_EVENTS,
        );
      }
    } else if (recovery.failure) {
      this.session.metadata.transcriptionFailure = recovery.failure;
    }
  }

  /**
   * Handle transcript result from the active transcription source.
   * Note: Live transcription is currently disabled in favor of post-processing,
   * but this handler is retained for future use if streaming transcription returns.
   */
  private handleTranscriptResult(event: TranscriptEvent): void {
    if (!this.session) {
      return;
    }

    const sessionStartSec = this.session.startTime / 1000;
    const normalizedTimestamp = normalizeTranscriptTimestamp(event.timestamp, sessionStartSec);
    const normalizedEvent: TranscriptEvent = {
      ...event,
      timestamp: normalizedTimestamp,
    };

    const text = normalizedEvent.text.trim();
    if (!text) {
      return;
    }

    // Add to buffer
    this.session.transcriptBuffer.push(normalizedEvent);
    if (this.session.transcriptBuffer.length > this.MAX_TRANSCRIPT_BUFFER_EVENTS) {
      this.session.transcriptBuffer.splice(
        0,
        this.session.transcriptBuffer.length - this.MAX_TRANSCRIPT_BUFFER_EVENTS
      );
    }
    this.events?.onTranscriptBufferChange?.(
      structuredClone(this.session.transcriptBuffer),
    );

    // Emit to renderer
    if (normalizedEvent.isFinal) {
      console.log(`[SessionController] Final transcript (${normalizedEvent.tier}): "${text}"`);
      this.emitToRenderer(IPC_CHANNELS.TRANSCRIPTION_FINAL, {
        text,
        confidence: normalizedEvent.confidence,
        timestamp: normalizedEvent.timestamp,
        tier: normalizedEvent.tier,
      });
    } else {
      this.emitToRenderer(IPC_CHANNELS.TRANSCRIPTION_UPDATE, {
        text,
        confidence: normalizedEvent.confidence,
        timestamp: normalizedEvent.timestamp,
        isFinal: false,
        tier: normalizedEvent.tier,
      });
    }
  }



  /**
   * Handle service errors with categorized error handling
   */
  private handleServiceError(service: string, error: Error): void {
    const context = {
      component: 'SessionController',
      operation: `${service}Error`,
      data: { service, sessionId: this.session?.id },
    };

    // Log the error
    errorHandler.log('error', `${service} error`, {
      ...context,
      error: error.message,
    });

    // Handle based on service type
    switch (service) {
      case 'audio':
        errorHandler.handleAudioError(error, context);
        break;
      case 'transcription':
        errorHandler.handleTranscriptionError(error, context);
        break;
      case 'capture':
        errorHandler.handleCaptureError(error, context);
        break;
      default:
        // Generic error handling
        errorHandler.log('error', `Unknown service error: ${service}`, context);
    }

    // Notify event callbacks
    this.events?.onError(error);

    // Emit to renderer for UI feedback
    this.emitToRenderer(IPC_CHANNELS.SESSION_ERROR, {
      service,
      message: error.message,
      category: errorHandler.categorizeError(error),
    });
  }

  // ===========================================================================
  // Persistence
  // ===========================================================================

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    this.stopAutoSave();

    this.autoSaveTimer = setInterval(() => {
      if (this.session) {
        this.persistSession();
        console.log('[SessionController] Auto-saved session');
      }
    }, this.AUTO_SAVE_INTERVAL_MS);
  }

  /**
   * Stop auto-save timer
   */
  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Persist current session metadata to disk
   * Note: We don't persist full session with buffers, just metadata
   */
  private persistSession(): void {
    if (this.session) {
      try {
        const persisted: PersistedSession = {
          id: this.session.id,
          startTime: this.session.startTime,
          endTime: this.session.endTime,
          state: this.session.state,
          sourceId: this.session.sourceId,
          feedbackItemCount: this.session.feedbackItems.length,
          metadata: this.session.metadata,
        };
        store.set('currentSession', persisted);
      } catch (err) {
        console.error('[SessionController] Failed to persist session:', err);
      }
    }
  }

  // ===========================================================================
  // Watchdog Timer - Monitors state age and forces recovery
  // ===========================================================================

  /**
   * Start the watchdog timer.
   * Monitors state age and triggers recovery if a state exceeds its timeout.
   * Also handles recording duration warnings and limits.
   */
  private startWatchdog(): void {
    this.stopWatchdog();
    this.stateEnteredAt = Date.now();
    this.recordingWarningShown = false;

    this.watchdogTimer = setInterval(() => {
      this.watchdogCheck();
    }, this.WATCHDOG_CHECK_INTERVAL_MS);

    console.log('[SessionController] Watchdog started');
  }

  /**
   * Stop the watchdog timer.
   */
  private stopWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  /**
   * Watchdog check - runs every second.
   * Monitors state timeouts and recording duration.
   */
  private watchdogCheck(): void {
    // Skip checks while recovery is in progress to prevent re-entrance
    if (this.recoveryInProgress) return;

    const elapsed = Date.now() - this.stateEnteredAt;
    const timeout = STATE_TIMEOUTS[this.state];

    // Check state timeout (recording uses active-duration checks below)
    if (this.state !== 'recording' && timeout !== null && elapsed > timeout) {
      console.error(
        `[SessionController] WATCHDOG: State '${this.state}' exceeded ${timeout}ms timeout (elapsed: ${elapsed}ms). Forcing recovery.`
      );
      this.forceRecovery();
      return;
    }

    // Check recording-specific limits
    if (this.state === 'recording') {
      this.checkRecordingDuration();
    }
  }

  /**
   * Check recording duration and emit warnings/force stop.
   */
  private checkRecordingDuration(): void {
    const elapsed = this.getActiveDurationMs();

    // Warning at 25 minutes
    if (!this.recordingWarningShown && elapsed >= RECORDING_LIMITS.WARNING_DURATION_MS) {
      this.recordingWarningShown = true;
      const remainingMinutes = Math.ceil(
        (RECORDING_LIMITS.MAX_DURATION_MS - elapsed) / 60_000
      );

      console.log(`[SessionController] Recording warning: ${remainingMinutes} minutes remaining`);

      this.emitToRenderer(IPC_CHANNELS.SESSION_WARNING, {
        type: 'duration',
        message: `Recording will auto-stop in ${remainingMinutes} minutes`,
        remainingMs: RECORDING_LIMITS.MAX_DURATION_MS - elapsed,
      });
    }

    // Force stop at 30 minutes
    if (elapsed >= RECORDING_LIMITS.MAX_DURATION_MS) {
      console.log('[SessionController] Recording max duration reached, auto-stopping');
      this.emitToRenderer(IPC_CHANNELS.SESSION_WARNING, {
        type: 'maxDuration',
        message: 'Maximum recording duration reached. Stopping automatically.',
      });
      void this.stop().catch((error) => {
        console.error('[SessionController] Auto-stop at max duration failed:', error);
        this.handleTimeoutError('Recording auto-stop failed');
      });
    }
  }

  /**
   * Force recovery from a stuck state.
   * Called by watchdog when a state exceeds its timeout.
   */
  private forceRecovery(): void {
    if (this.recoveryInProgress) return;
    this.recoveryInProgress = true;

    console.log(`[SessionController] Force recovery from state: ${this.state}`);

    switch (this.state) {
      case 'starting':
        // Starting timed out - abort to idle
        this.handleTimeoutError('Service initialization timed out');
        this.cleanupServicesForced();
        this.transitionForced('idle');
        this.recoveryInProgress = false;
        break;

      case 'recording':
        // Recording hit 30 minute limit - force stop
        this.stop()
          .catch((error) => {
            console.error('[SessionController] Force stop failed:', error);
            this.handleTimeoutError('Recording auto-stop failed');
            this.cleanupServicesForced();
            this.transitionForced('error');
          })
          .finally(() => {
            this.recoveryInProgress = false;
          });
        break;

      case 'stopping':
        // Stopping timed out - force to processing anyway
        console.warn('[SessionController] Stopping timeout, forcing to processing');
        this.cleanupServicesForced();
        this.transitionForced('processing');
        // Reset state entry time for processing timeout
        this.stateEnteredAt = Date.now();
        this.recoveryInProgress = false;
        break;

      case 'processing':
        // Processing timed out - complete with partial data
        console.warn('[SessionController] Processing timeout, completing with partial data');
        if (this.session) {
          this.session.endTime = this.session.endTime || Date.now();
          this.session.state = 'complete';
          this.addToRecentSessions(this.session);
          store.set('currentSession', null);
        }
        this.transitionForced('complete');
        this.stateEnteredAt = Date.now();
        this.recoveryInProgress = false;
        break;

      case 'complete':
        // Complete state timeout - reset to idle
        console.log('[SessionController] Complete timeout, resetting to idle');
        this.session = null;
        this.transitionForced('idle');
        this.recoveryInProgress = false;
        break;

      case 'error':
        // Error state timeout - reset to idle
        console.log('[SessionController] Error timeout, resetting to idle');
        this.session = null;
        this.transitionForced('idle');
        this.recoveryInProgress = false;
        break;

      case 'idle':
        // Should never happen (idle has no timeout)
        console.warn('[SessionController] Unexpected watchdog trigger in idle state');
        this.recoveryInProgress = false;
        break;
    }
  }

  /**
   * Force a state transition without validation.
   * ONLY used by watchdog recovery - bypasses normal transition checks.
   */
  private transitionForced(newState: SessionState): void {
    const oldState = this.state;

    // Stop watchdog when forcing to idle
    if (newState === 'idle') {
      this.stopWatchdog();
    }

    this.state = newState;
    this.stateEnteredAt = Date.now();

    if (this.session) {
      this.session.state = newState;
    }

    console.log(`[SessionController] Forced transition: ${oldState} -> ${newState}`);
    this.emitStateChange();
  }

  /**
   * Handle timeout errors - emit to renderer and log.
   */
  private handleTimeoutError(message: string): void {
    const error = new Error(message);

    console.error(`[SessionController] Timeout error: ${message}`);

    this.emitToRenderer(IPC_CHANNELS.SESSION_ERROR, {
      type: 'timeout',
      message,
      state: this.state,
      timestamp: Date.now(),
    });

    this.events?.onError(error);
  }

  /**
   * Force cleanup without waiting for services.
   * Used by watchdog when cleanup itself times out.
   */
  private cleanupServicesForced(): void {
    console.log('[SessionController] FORCED service cleanup');
    this.isPaused = false;

    // Stop timers
    this.stopAutoSave();
    this.stopDurationTimer();

    // Unsubscribe without waiting
    for (const cleanup of this.cleanupFunctions) {
      try {
        cleanup();
      } catch {
        // Ignore errors in forced cleanup
      }
    }
    this.cleanupFunctions = [];

    // Try to stop services but don't wait
    try {
      void this.audioCaptureService.stop();
    } catch {
      // Ignore
    }
    // No-op: transcription recovery is post-session and does not run as a live service.
  }

  /**
   * Add session to recent sessions list (full session)
   */
  private addToRecentSessions(session: Session): void {
    const persisted: PersistedSession = {
      id: session.id,
      startTime: session.startTime,
      endTime: session.endTime,
      state: session.state,
      sourceId: session.sourceId,
      feedbackItemCount: session.feedbackItems.length,
      metadata: session.metadata,
    };
    this.addToRecentSessionsPersisted(persisted);
  }

  /**
   * Add persisted session to recent sessions list
   */
  private addToRecentSessionsPersisted(session: PersistedSession): void {
    const recent = store.get('recentSessions') || [];

    // Add to front
    recent.unshift(session);

    // Limit size
    if (recent.length > this.MAX_RECENT_SESSIONS) {
      recent.splice(this.MAX_RECENT_SESSIONS);
    }

    store.set('recentSessions', recent);
  }

  // ===========================================================================
  // Duration Timer
  // ===========================================================================

  /**
   * Start duration timer (updates UI)
   */
  private startDurationTimer(): void {
    this.stopDurationTimer();

    this.durationTimer = setInterval(() => {
      this.emitToRenderer(IPC_CHANNELS.SESSION_STATUS, this.getStatus());
    }, 1000);
  }

  /**
   * Stop duration timer
   */
  private stopDurationTimer(): void {
    if (this.durationTimer) {
      clearInterval(this.durationTimer);
      this.durationTimer = null;
    }
  }

  // ===========================================================================
  // Event Emission
  // ===========================================================================

  /**
   * Emit state change to listeners
   */
  private emitStateChange(): void {
    this.events?.onStateChange(this.state, this.session);
    this.emitStatus();
  }

  private emitStatus(): void {
    this.emitToRenderer(IPC_CHANNELS.SESSION_STATUS, this.getStatus());
  }

  /**
   * Emit feedback item to listeners
   */
  private emitFeedbackItem(item: FeedbackItem): void {
    this.events?.onFeedbackItem(item);
    this.emitToRenderer(IPC_CHANNELS.SESSION_FEEDBACK_ITEM, {
      id: item.id,
      timestamp: item.timestamp,
      text: item.text,
      confidence: item.confidence,
    });
  }

  /**
   * Send event to renderer via IPC
   */
  private emitToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Clean up all services and timers (synchronous version for backwards compatibility)
   */
  private cleanupServices(): void {
    this.closeActivePauseWindow();
    this.isPaused = false;
    // Stop timers
    this.stopAutoSave();
    this.stopDurationTimer();
    // Unsubscribe from all events
    for (const cleanup of this.cleanupFunctions) {
      try {
        cleanup();
      } catch (error) {
        console.warn('[SessionController] Cleanup callback error:', error);
      }
    }
    this.cleanupFunctions = [];

    // Stop services
    void this.audioCaptureService.stop();
  }

  /**
   * Clean up all services and timers with timeout protection.
   * Never blocks for more than 2 seconds per service.
   */
  private async cleanupServicesAsync(): Promise<void> {
    console.log('[SessionController] Cleaning up services...');
    this.closeActivePauseWindow();
    this.isPaused = false;

    // Stop timers first (fast, non-blocking)
    this.stopAutoSave();
    this.stopDurationTimer();

    // Unsubscribe from all events (fast, non-blocking)
    for (const cleanup of this.cleanupFunctions) {
      try {
        cleanup();
      } catch (error) {
        console.warn('[SessionController] Cleanup callback error:', error);
      }
    }
    this.cleanupFunctions = [];

    // Stop services with timeout protection (may block)
    const serviceTimeout = 2000; // 2 seconds per service

    const [audioResult] = await Promise.allSettled([
      this.withTimeout(
        this.audioCaptureService.stop(),
        serviceTimeout,
        undefined,
        'AudioCapture.stop()'
      ),
    ]);

    // Log any failures
    if (audioResult.status === 'rejected') {
      console.warn('[SessionController] Audio cleanup failed:', audioResult.reason);
    }
    console.log('[SessionController] Service cleanup complete');
  }

  /**
   * Full cleanup for app shutdown.
   * Mark clean exit for crash recovery.
   */
  destroy(): void {
    console.log('[SessionController] Destroying...');

    // Save any active session
    if (this.session && this.state !== 'idle' && this.state !== 'complete' && this.state !== 'error') {
      this.session.state = 'complete';
      this.session.endTime = Date.now();
      this.addToRecentSessions(this.session);
    }

    // Stop all timers
    this.stopWatchdog();
    this.cleanupServicesForced();

    // Clear state
    this.session = null;
    this.resetSessionRuntimeState();
    this.postProcessResult = null;
    this.currentProcessingProgress = null;
    this.events = null;
    this.mainWindow = null;

    console.log('[SessionController] Destroy complete');
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const sessionController = new SessionController();
export default SessionController;

// Re-export types from shared/types for downstream consumers
export type { SessionState, SessionMetadata } from '../shared/types';
