/**
 * markupR - Main Process Entry Point
 *
 * This is the orchestration heart of markupR. It:
 * - Initializes all services in the correct order
 * - Wires up the complete session lifecycle
 * - Manages IPC communication with renderer
 * - Handles hotkey registration and tray management
 * - Coordinates graceful shutdown
 *
 * Service Integration Order:
 * 1. Error handler (for crash recovery)
 * 2. Settings (needed for API keys and config)
 * 3. Secure settings + API key availability check
 * 4. Window creation
 * 5. Session controller initialization
 * 6. Transcription service configuration
 * 7. Tray manager initialization
 * 8. Hotkey registration
 * 9. IPC handler setup
 */

import {
  app,
  BrowserWindow,
  shell,
  Notification,
} from 'electron';
import * as fs from 'fs/promises';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';

// Hide dock icon on macOS for pure menu bar experience
// IMPORTANT: Must be called before app.whenReady()
if (process.platform === 'darwin') {
  app.dock.hide();
}

// Ensure runtime app identity uses the shipped product name.
app.setName('markupR');

// ESM compatibility - __dirname doesn't exist in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import {
  IPC_CHANNELS,
  type PermissionType,
  type SessionState,
  type SessionPayload,
  type TrayState,
  type CaptureContextSnapshot,
  type AnnotationEvent,
  type CaptureTarget,
  type AnalysisConnection,
  type AnalysisProvider,
  type MarkedIssuePayload,
} from '../shared/types';
import { hotkeyManager, type HotkeyAction } from './HotkeyManager';
import { formatHotkeyForDisplay } from '../shared/hotkeys';
import { sessionController, type Session } from './SessionController';
import { trayManager } from './TrayManager';
import { audioCapture } from './audio/AudioCapture';
import { SettingsManager } from './settings';
import { fileManager, clipboardService, generateDocumentForFileManager, adaptSessionForMarkdown } from './output';
import { processSession as aiProcessSession } from './ai';
import { modelDownloadManager } from './transcription/ModelDownloadManager';
import { errorHandler } from './ErrorHandler';
import { autoUpdaterManager } from './AutoUpdater';
import { crashRecovery, type RecoverableFeedbackItem } from './CrashRecovery';
import {
  postProcessor,
  type PostProcessResult,
  type PostProcessProgress,
  type TranscriptSegment,
} from './pipeline';
import { menuManager } from './MenuManager';
import { WindowsTaskbar, createWindowsTaskbar } from './platform';
import { PopoverManager, POPOVER_SIZES } from './windows';
import { permissionManager } from './PermissionManager';
import {
  registerAllHandlers,
  extensionFromMimeType,
  finalizeScreenRecording,
  getScreenRecordingSnapshot,
  deleteFinalizedRecording,
  getActiveScreenRecordings,
  getFinalizedScreenRecordings,
  getMarkedIssueArtifactStore,
} from './ipc';
import { probeCaptureContext } from './capture/CaptureContextProbe';
import { captureOverlayManager } from './capture/CaptureOverlayManager';
import {
  AnnotationCueTracker,
  resolveCaptureTarget,
} from './capture/CaptureSessionLifecycle';
import {
  extractAiFrameHintsFromMarkdown,
  appendExtractedFramesToReport,
  appendTranscriptionFailureToReport,
  syncExtractedFrameMetadata,
  syncExtractedFrameSummary,
  syncMarkedIssueMetadata,
  writeProcessingTrace,
} from './output/MarkdownPatcher';
import { resolveSavedTranscriptionFailure } from './transcription/TranscriptionCompletion';
import {
  attachFallbackFramesToMarkedIssues,
  captureContextsToKeyMoments,
  nearestCaptureContext,
} from './pipeline/CaptureMomentHints';

// Guard against stdio EIO crashes when the parent terminal/PTY closes.
type ConsoleMethod = (...args: unknown[]) => void;

function wrapConsoleMethod(method: ConsoleMethod): ConsoleMethod {
  return (...args: unknown[]) => {
    try {
      method(...args);
    } catch (error) {
      if (error instanceof Error && error.message.includes('EIO')) {
        return;
      }
      throw error;
    }
  };
}

function isIgnorableStdioError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  if (typeof error === 'string') {
    return error.toUpperCase().includes('EIO');
  }

  if (error instanceof Error) {
    if (error.message.toUpperCase().includes('EIO')) {
      return true;
    }
    const withCode = error as Error & { code?: string };
    return withCode.code?.toUpperCase() === 'EIO';
  }

  if (typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.toUpperCase() === 'EIO') {
      return true;
    }
  }

  return false;
}

console.log = wrapConsoleMethod(console.log.bind(console));
console.info = wrapConsoleMethod(console.info.bind(console));
console.warn = wrapConsoleMethod(console.warn.bind(console));
console.error = wrapConsoleMethod(console.error.bind(console));

// =============================================================================
// Module State
// =============================================================================

let mainWindow: BrowserWindow | null = null;
let popover: PopoverManager | null = null;
let settingsManager: SettingsManager | null = null;
let isQuitting = false;
let hasCompletedOnboarding = false;
const rendererRecoveryAttempts = new WeakMap<BrowserWindow, number>();
let teardownAudioTelemetry: Array<() => void> = [];
let teardownSettingsListeners: Array<() => void> = [];
const annotationCueTracker = new AnnotationCueTracker();

// Windows taskbar integration (Windows only)
let windowsTaskbar: WindowsTaskbar | null = null;

const DEV_RENDERER_URL = 'http://localhost:5173';
const DEV_RENDERER_LOAD_RETRIES = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safely send an IPC message to the renderer.
 * Guards against destroyed windows (e.g., renderer crash during async processing).
 */
function safeSendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

function attachRendererDiagnostics(window: BrowserWindow, label: string): void {
  window.on('unresponsive', () => {
    console.error(`[Main] ${label} window became unresponsive`);
  });

  window.on('responsive', () => {
    console.log(`[Main] ${label} window responsive again`);
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[Main] ${label} renderer process gone`, details);

    const attempts = rendererRecoveryAttempts.get(window) ?? 0;
    if (attempts >= 3) {
      console.error(`[Main] ${label} renderer recovery skipped after ${attempts} failed attempts`);
      return;
    }

    const nextAttempt = attempts + 1;
    rendererRecoveryAttempts.set(window, nextAttempt);

    const retryDelayMs = 300 * nextAttempt;
    setTimeout(() => {
      if (window.isDestroyed()) {
        return;
      }

      void loadRendererIntoWindow(window, `${label} (recovery #${nextAttempt})`)
        .then(() => {
          rendererRecoveryAttempts.set(window, 0);
          console.log(`[Main] ${label} renderer recovered on attempt ${nextAttempt}`);
        })
        .catch((error) => {
          console.error(`[Main] ${label} renderer recovery attempt ${nextAttempt} failed`, error);
        });
    }, retryDelayMs);
  });

  window.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) {
        return;
      }
      console.error(
        `[Main] ${label} failed to load renderer (${errorCode}): ${errorDescription} (${validatedURL})`,
      );
    },
  );
}

function wireAudioTelemetry(): void {
  teardownAudioTelemetry.forEach((teardown) => teardown());
  teardownAudioTelemetry = [];

  const sendAudioLevel = (level: number) => {
    safeSendToRenderer(IPC_CHANNELS.AUDIO_LEVEL, level);
  };

  const sendVoiceActivity = (active: boolean) => {
    safeSendToRenderer(IPC_CHANNELS.AUDIO_VOICE_ACTIVITY, active);
  };

  teardownAudioTelemetry.push(
    audioCapture.onAudioLevel(sendAudioLevel),
    audioCapture.onVoiceActivity(sendVoiceActivity),
  );
}

async function loadRendererIntoWindow(window: BrowserWindow, label: string): Promise<void> {
  if (process.env.NODE_ENV !== 'development') {
    await window.loadFile(join(__dirname, '../renderer/index.html'));
    return;
  }

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= DEV_RENDERER_LOAD_RETRIES; attempt++) {
    try {
      await window.loadURL(DEV_RENDERER_URL);
      window.webContents.openDevTools({ mode: 'detach' });
      return;
    } catch (error) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(
        `[Main] ${label} renderer load attempt ${attempt}/${DEV_RENDERER_LOAD_RETRIES} failed: ${errorMessage}`,
      );
      await sleep(250 * attempt);
    }
  }

  const finalMessage =
    lastError instanceof Error ? lastError.message : 'Unknown renderer load failure';
  await window.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(`
      <html>
        <body style="margin:0;padding:20px;background:#121212;color:#f5f5f5;font-family:-apple-system,system-ui,sans-serif;">
          <h2 style="margin:0 0 12px 0;">markupR failed to load</h2>
          <p style="margin:0 0 8px 0;">Dev renderer did not become reachable at ${DEV_RENDERER_URL}.</p>
          <p style="margin:0;color:#b3b3b3;">${finalMessage}</p>
        </body>
      </html>
    `)}`,
  );
}

// =============================================================================
// Window Management
// =============================================================================

function createWindow(): void {
  // Resolve preload path - works in both dev and production
  const preloadPath = join(app.getAppPath(), 'dist', 'preload', 'index.cjs');
  console.log('[Main] Preload path:', preloadPath);

  mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    minWidth: 320,
    minHeight: 200,
    resizable: true,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false, // Don't show until ready
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  attachRendererDiagnostics(mainWindow, 'Main');
  void loadRendererIntoWindow(mainWindow, 'Main');

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    console.log('[Main] Window ready to show');

    // Check if onboarding needed
    if (!hasCompletedOnboarding) {
      mainWindow?.webContents.send(IPC_CHANNELS.SHOW_ONBOARDING);
    }
  });

  // Handle window close - hide instead of quit on macOS
  mainWindow.on('close', (event) => {
    if (!isQuitting && process.platform === 'darwin') {
      event.preventDefault();
      mainWindow?.hide();
      return;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links - only allow http/https protocols
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url);
      } else {
        console.warn(`[Main] Blocked external URL with protocol: ${parsed.protocol}`);
      }
    } catch {
      console.warn(`[Main] Blocked invalid external URL`);
    }
    return { action: 'deny' };
  });

  // Set main window on session controller
  sessionController.setMainWindow(mainWindow);

  console.log('[Main] Window created');
}

/**
 * Show the main window (from tray or dock click)
 * In menu bar mode, shows the popover instead
 */
function showWindow(): void {
  // In menu bar mode, show the popover
  if (popover) {
    popover.show();
    return;
  }

  // Fallback for non-popover mode
  if (!mainWindow) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

// =============================================================================
// Session State Handling
// =============================================================================

/**
 * Map SessionController state to TrayManager state
 */
function mapToTrayState(state: SessionState): TrayState {
  switch (state) {
    case 'idle':
      return 'idle';
    case 'recording':
      return 'recording';
    case 'processing':
      return 'processing';
    case 'complete':
      return 'idle';
    default:
      return 'idle';
  }
}

/**
 * Handle session state changes - update tray, Windows taskbar, and notify renderer
 */
function handleSessionStateChange(state: SessionState, session: Session | null): void {
  console.log(`[Main] Session state changed: ${state}`);
  if (state === 'idle') annotationCueTracker.clear();
  if (state === 'stopping') captureOverlayManager.finalizePendingIssue();
  if (state === 'stopping' || state === 'processing' || state === 'complete'
    || state === 'error' || state === 'idle') {
    captureOverlayManager.endAnnotation();
  }
  try {
    mainWindow?.setContentProtection(
      state === 'starting' || state === 'recording' || state === 'stopping',
    );
  } catch (error) {
    console.warn('[Main] Failed to update recording HUD content protection:', error);
  }

  // Update tray icon
  trayManager.setState(mapToTrayState(state));
  if (state === 'recording' && sessionController.isSessionPaused()) {
    trayManager.setTooltip(`markupR - Paused (${formatHotkeyForDisplay('pauseResume')} to resume)`);
  }

  const keepVisibleOnBlur =
    state === 'starting' ||
    state === 'recording' ||
    state === 'stopping' ||
    state === 'processing';
  popover?.setKeepVisibleOnBlur(keepVisibleOnBlur);
  popover?.setRecordingHudPriority(state === 'recording');

  if (popover && (state === 'recording' || state === 'stopping' || state === 'processing')) {
    const hudState = state === 'recording' ? 'recording' : 'processing';
    popover.resizeToState(hudState);
  }

  if (state === 'recording' && popover && !popover.isVisible()) {
    popover.show();
  }

  // Update Windows taskbar (if on Windows)
  windowsTaskbar?.updateSessionState(state);

  // Notify renderer
  safeSendToRenderer(IPC_CHANNELS.SESSION_STATE_CHANGED, {
    state,
    session: session ? serializeSession(session) : null,
  });

  // Also send status update
  safeSendToRenderer(IPC_CHANNELS.SESSION_STATUS, sessionController.getStatus());
}

function handleAnnotationEvent(event: AnnotationEvent): void {
  const session = sessionController.getSession();
  if (!session || session.id !== event.sessionId) return;
  const context = annotationCueTracker.consume(event);
  if (!context) return;
  const cue = sessionController.registerCaptureCue('annotation', context);
  if (cue) crashRecovery.updateSession({ screenshotCount: cue.count });
}

function handleMarkedIssueCommitted(issue: MarkedIssuePayload): void {
  const session = sessionController.getSession();
  if (!session) return;
  try {
    getMarkedIssueArtifactStore().markCommitted(
      session.id,
      issue.snapshotRevision,
      issue.ordinal,
    );
    const issues = sessionController.getMarkedIssues();
    const nextIssues = issues.some((existing) => existing.id === issue.id)
      ? issues.map((existing) => existing.id === issue.id ? issue : existing)
      : [...issues, issue];
    sessionController.setMarkedIssues(nextIssues);
    crashRecovery.updateSession({
      markedIssues: nextIssues,
      screenshotCount: sessionController.getStatus().screenshotCount,
    });
  } catch (error) {
    console.warn('[Main] Failed to reserve marked screenshot candidate:', error);
  }
}

/**
 * Handle new feedback item
 */
function handleFeedbackItem(item: {
  id: string;
  timestamp: number;
  text: string;
  confidence: number;
}): void {
  safeSendToRenderer(IPC_CHANNELS.SESSION_FEEDBACK_ITEM, {
    id: item.id,
    timestamp: item.timestamp,
    text: item.text,
    confidence: item.confidence,
    hasScreenshot: false,
  });

  // Update crash recovery with new feedback item
  const session = sessionController.getSession();
  if (session) {
    const recoverableFeedbackItems: RecoverableFeedbackItem[] = session.feedbackItems.map((fi) => ({
      id: fi.id,
      timestamp: fi.timestamp,
      text: fi.text,
      confidence: fi.confidence,
      hasScreenshot: false,
    }));

    crashRecovery.updateSession({
      feedbackItems: recoverableFeedbackItems,
      screenshotCount: sessionController.getStatus().screenshotCount,
    });
  }
}

/**
 * Handle session errors
 */
function handleSessionError(error: Error): void {
  console.error('[Main] Session error:', error);

  // Update tray to error state
  trayManager.setState('error');
  trayManager.setTooltip(`markupR - Error: ${error.message}`);

  // Notify renderer
  safeSendToRenderer(IPC_CHANNELS.SESSION_ERROR, {
    message: error.message,
  });

  // Show notification
  showErrorNotification('Recording Error', error.message);
}

// =============================================================================
// Tray Handling
// =============================================================================

/**
 * Handle tray icon click - toggle popover for menu bar mode
 */
function handleTrayClick(): void {
  // In menu bar mode, tray click toggles the popover
  if (popover) {
    popover.toggle();
    return;
  }

  // Fallback for non-popover mode
  const currentState = sessionController.getState();

  if (currentState === 'idle') {
    // Show window to start a new session
    showWindow();
    mainWindow?.webContents.send(IPC_CHANNELS.SHOW_WINDOW_SELECTOR);
  } else if (currentState === 'recording') {
    // Stop recording
    stopSession();
  } else {
    // Just show the window
    showWindow();
  }
}

/**
 * Handle settings click from tray menu
 */
function handleSettingsClick(): void {
  showWindow();
  mainWindow?.webContents.send(IPC_CHANNELS.SHOW_SETTINGS);
}

/**
 * Handle menu bar actions from MenuManager
 */
function handleMenuAction(action: string, data?: unknown): void {
  console.log(`[Main] Menu action: ${action}`, data);

  switch (action) {
    case 'toggle-recording':
      handleToggleRecording();
      break;
    case 'show-settings':
      handleSettingsClick();
      break;
    case 'show-history':
      showWindow();
      mainWindow?.webContents.send(IPC_CHANNELS.SHOW_HISTORY);
      break;
    case 'show-export':
      showWindow();
      mainWindow?.webContents.send(IPC_CHANNELS.SHOW_EXPORT);
      break;
    case 'show-shortcuts':
      showWindow();
      mainWindow?.webContents.send(IPC_CHANNELS.SHOW_SHORTCUTS);
      break;
    case 'check-updates':
      void autoUpdaterManager.checkForUpdates({ userInitiated: true });
      break;
    case 'open-session':
      showWindow();
      mainWindow?.webContents.send(IPC_CHANNELS.OPEN_SESSION_DIALOG);
      break;
    case 'open-session-path':
      if (data && typeof data === 'object' && 'path' in data) {
        showWindow();
        mainWindow?.webContents.send(IPC_CHANNELS.OPEN_SESSION, (data as { path: string }).path);
      }
      break;
    default:
      console.warn(`[Main] Unknown menu action: ${action}`);
  }
}

// =============================================================================
// Notifications
// =============================================================================

function showSuccessNotification(title: string, body: string): void {
  if (Notification.isSupported()) {
    const notification = new Notification({ title, body, silent: false });
    notification.show();
  }
}

function showErrorNotification(title: string, body: string): void {
  if (body.toUpperCase().includes('EIO')) {
    return;
  }

  if (Notification.isSupported()) {
    const notification = new Notification({ title, body, silent: false, urgency: 'critical' });
    notification.show();
  }
}

// =============================================================================
// Hotkey Management
// =============================================================================

function initializeHotkeys(): void {
  const results = hotkeyManager.initialize();

  for (const result of results) {
    if (result.success) {
      console.log(`[Main] Hotkey registered: ${result.action} -> ${result.accelerator}`);
      if (result.fallbackUsed) {
        console.log(`[Main] (Used fallback: ${result.fallbackUsed})`);
      }
    } else {
      console.error(`[Main] Failed to register hotkey for ${result.action}: ${result.error}`);
    }
  }

  hotkeyManager.onHotkey((action: HotkeyAction) => {
    handleHotkeyAction(action);
  });
}

function handleHotkeyAction(action: HotkeyAction): void {
  console.log(`[Main] Hotkey triggered: ${action}`);

  switch (action) {
    case 'toggleRecording':
      void handleToggleRecording();
      break;

    case 'manualScreenshot':
      void handleManualScreenshot();
      break;

    case 'pauseResume':
      void handlePauseResume();
      break;

    default:
      console.warn(`[Main] Unknown hotkey action: ${action}`);
  }
}

let toggleRecordingInFlight = false;

async function handleToggleRecording(): Promise<void> {
  if (toggleRecordingInFlight) return;
  toggleRecordingInFlight = true;
  try {
    const currentState = sessionController.getState();

    if (currentState === 'recording') {
      // Stop recording
      await stopSession();
    } else if (currentState === 'idle') {
      const result = await startSession();
      if (!result.success && result.error) {
        showErrorNotification('Unable to Start Recording', result.error);
      }
    }
  } finally {
    toggleRecordingInFlight = false;
  }
}

async function handlePauseResume(): Promise<void> {
  if (sessionController.getState() !== 'recording') {
    return;
  }

  if (sessionController.isSessionPaused()) {
    resumeSession();
    return;
  }

  pauseSession();
}

async function handleManualScreenshot(): Promise<void> {
  const session = sessionController.getSession();
  const captureContext = await probeCaptureContext({
    trigger: 'manual',
    sourceId: session?.sourceId,
    sourceName: session?.metadata?.sourceName,
  });

  const cue = sessionController.registerCaptureCue('manual', captureContext);
  if (!cue) {
    return;
  }

  crashRecovery.updateSession({
    screenshotCount: cue.count,
  });
}

function pauseSession(): { success: boolean; error?: string } {
  if (sessionController.getState() !== 'recording') {
    return { success: false, error: 'No recording session is active.' };
  }

  const paused = sessionController.pause();
  if (!paused) {
    return { success: false, error: 'Session is already paused.' };
  }

  trayManager.setTooltip(`markupR - Paused (${formatHotkeyForDisplay('pauseResume')} to resume)`);
  return { success: true };
}

function resumeSession(): { success: boolean; error?: string } {
  if (sessionController.getState() !== 'recording') {
    return { success: false, error: 'No recording session is active.' };
  }

  const resumed = sessionController.resume();
  if (!resumed) {
    return { success: false, error: 'Session is not paused.' };
  }

  trayManager.setTooltip(`markupR - Recording... (${formatHotkeyForDisplay('toggleRecording')} to stop)`);
  return { success: true };
}

// =============================================================================
// Session Control
// =============================================================================

function buildPostProcessTranscriptSegments(session: Session): TranscriptSegment[] {
  const sessionStartSec = session.startTime / 1000;
  const events = session.transcriptBuffer
    .filter((event) => event.text.trim().length > 0 && event.isFinal)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (events.length === 0) {
    return [];
  }

  return events.map((event, index) => {
    const startTime = Math.max(0, event.timestamp - sessionStartSec);
    const nextTimestampSec =
      index < events.length - 1
        ? Math.max(startTime + 0.35, events[index + 1].timestamp - sessionStartSec)
        : startTime + Math.min(3, Math.max(1, event.text.trim().split(/\s+/).length * 0.35));
    const endTime = Math.max(startTime + 0.35, nextTimestampSec);

    return {
      text: event.text.trim(),
      startTime,
      endTime,
      confidence: Number.isFinite(event.confidence) ? event.confidence : 0.8,
    };
  });
}

function getSessionCaptureContexts(session: Session): CaptureContextSnapshot[] {
  const contexts = session.metadata?.captureContexts || [];
  return contexts
    .filter((context) => Number.isFinite(context.recordedAt))
    .slice()
    .sort((a, b) => a.recordedAt - b.recordedAt);
}

function attachCaptureContextsToExtractedFrames(
  session: Session,
  extractedFrames: PostProcessResult['extractedFrames'],
  captureContexts: CaptureContextSnapshot[]
): PostProcessResult['extractedFrames'] {
  if (!captureContexts.length || !extractedFrames.length) {
    return extractedFrames;
  }

  const maxDistanceMs = 5_000;
  const videoStartTime = session.metadata.videoStartTime || session.startTime;

  return extractedFrames.map((frame) => {
    const bestMatch = nearestCaptureContext(
      frame.timestamp,
      videoStartTime,
      captureContexts,
      maxDistanceMs,
    );
    if (!bestMatch) {
      return frame;
    }

    return {
      ...frame,
      captureContext: bestMatch,
    };
  });
}

async function copyReportPathToClipboard(path: string): Promise<boolean> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const copied = await clipboardService.copy(path);
    if (copied) {
      return true;
    }

    if (attempt < maxAttempts) {
      await sleep(120 * attempt);
    }
  }

  return false;
}

async function attachRecordingToSessionOutput(
  sessionId: string,
  sessionDir: string,
  markdownPath: string
): Promise<{ path: string; mimeType: string; bytesWritten: number; startTime?: number } | undefined> {
  const artifact = await finalizeScreenRecording(sessionId);
  if (!artifact || artifact.bytesWritten <= 0) {
    return undefined;
  }

  const extension = extname(artifact.tempPath) || extensionFromMimeType(artifact.mimeType);
  const finalPath = join(sessionDir, `session-recording${extension}`);

  try {
    await fs.copyFile(artifact.tempPath, finalPath);

    // Append recording link to the report for agent context replay.
    let markdown = await fs.readFile(markdownPath, 'utf-8');
    if (!markdown.includes('## Session Recording')) {
      markdown += `\n## Session Recording\n- [Open full recording](./${basename(finalPath)})\n`;
      await fs.writeFile(markdownPath, markdown, 'utf-8');
    }

    return {
      path: finalPath,
      mimeType: artifact.mimeType,
      bytesWritten: artifact.bytesWritten,
      startTime: artifact.startTime,
    };
  } catch (error) {
    console.warn('[Main] Failed to attach session recording to output:', error);
    return undefined;
  } finally {
    deleteFinalizedRecording(sessionId);
    await fs.unlink(artifact.tempPath).catch(() => {
      // Best-effort cleanup for temp artifacts.
    });
  }
}

async function attachAudioToSessionOutput(
  sessionDir: string,
  markdownPath: string
): Promise<{ path: string; bytesWritten: number; durationMs: number; mimeType: string } | undefined> {
  const basePath = join(sessionDir, 'session-audio');

  try {
    const exported = await sessionController.exportCapturedAudio(basePath);
    if (!exported || exported.bytesWritten <= 0) {
      return undefined;
    }

    let markdown = await fs.readFile(markdownPath, 'utf-8');
    if (!markdown.includes('## Session Audio')) {
      markdown += `\n## Session Audio\n- [Open narration audio](./${basename(exported.path)})\n`;
      await fs.writeFile(markdownPath, markdown, 'utf-8');
    }

    return {
      path: exported.path,
      bytesWritten: exported.bytesWritten,
      durationMs: exported.durationMs,
      mimeType: exported.mimeType,
    };
  } catch (error) {
    console.warn('[Main] Failed to attach session audio to output:', error);
    return undefined;
  } finally {
    sessionController.clearCapturedAudio();
  }
}

/**
 * Start a recording session.
 */
async function startSession(sourceId?: CaptureTarget | string, sourceName?: string): Promise<{
  success: boolean;
  sessionId?: string;
  cancelled?: boolean;
  error?: string;
}> {
  try {
    const [hasMicrophonePermission, hasScreenPermission] = await Promise.all([
      checkPermission('microphone'),
      checkPermission('screen'),
    ]);

    if (!hasMicrophonePermission) {
      await requestPermission('microphone');
    }
    if (!hasScreenPermission) {
      await requestPermission('screen');
    }

    const [microphoneGranted, screenGranted] = await Promise.all([
      checkPermission('microphone'),
      checkPermission('screen'),
    ]);

    if (!microphoneGranted || !screenGranted) {
      const settingsName = process.platform === 'darwin'
        ? 'macOS System Settings'
        : process.platform === 'win32'
          ? 'Windows Settings > Privacy'
          : 'your system settings';
      return {
        success: false,
        error:
          `Microphone and screen recording permissions are required. Enable both in ${settingsName}, then retry.`,
      };
    }

    const explicitTarget = typeof sourceId === 'object' ? sourceId as CaptureTarget : undefined;
    const captureTarget = typeof sourceId === 'string'
      ? undefined
      : await resolveCaptureTarget(explicitTarget, () => captureOverlayManager.selectTarget());
    if (typeof sourceId !== 'string' && !captureTarget) {
      return { success: false, cancelled: true };
    }
    const legacySourceId = typeof sourceId === 'string' ? sourceId : undefined;
    const resolvedSourceId = captureTarget?.sourceId || legacySourceId;
    const resolvedSourceName = captureTarget?.sourceName || sourceName;
    if (!resolvedSourceId) {
      return { success: false, error: 'No capture target was selected.' };
    }

    // Start the session
    await sessionController.start(resolvedSourceId, resolvedSourceName, captureTarget || undefined);

    const session = sessionController.getSession();

    // Start crash recovery tracking
    if (session) {
      crashRecovery.startTracking({
        id: session.id,
        startTime: session.startTime,
        lastSaveTime: Date.now(),
        feedbackItems: [],
        transcriptionBuffer: '',
        sourceId: session.sourceId,
        sourceName: resolvedSourceName || 'Unknown Source',
        screenshotCount: 0,
        markedIssues: [],
        metadata: {
          appVersion: app.getVersion(),
          platform: process.platform,
          sessionDurationMs: 0,
        },
      });
    }

    return {
      success: true,
      sessionId: session?.id,
    };
  } catch (error) {
    console.error('[Main] Failed to start session:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Stop the current recording session and generate output
 */
async function stopSession(): Promise<{
  success: boolean;
  session?: SessionPayload;
  reportPath?: string;
  sessionDir?: string;
  recordingPath?: string;
  audioPath?: string;
  error?: string;
}> {
  let stoppedSessionId: string | null = null;
  const stopStartedAt = Date.now();
  let aiDurationMs = 0;
  let saveDurationMs = 0;
  let postProcessDurationMs = 0;
  let aiFrameHintCount = 0;
  let stopPhaseTicker: NodeJS.Timeout | null = null;
  let stopPhasePercent = 6;

  const cleanupRecordingArtifacts = async (sessionId: string): Promise<void> => {
    await getMarkedIssueArtifactStore().cleanupSession(sessionId).catch((error) => {
      console.warn('[Main] Failed to clean marked screenshot staging:', error);
    });
    const artifact = await finalizeScreenRecording(sessionId).catch(() => null);
    if (!artifact?.tempPath) {
      deleteFinalizedRecording(sessionId);
      return;
    }

    await fs.unlink(artifact.tempPath).catch(() => {
      // Best-effort cleanup of orphaned temp recordings.
    });
    deleteFinalizedRecording(sessionId);
  };

  const emitProcessingProgress = (percent: number, step: string): void => {
    const boundedPercent = Math.max(0, Math.min(100, Math.round(percent)));
    safeSendToRenderer(IPC_CHANNELS.PROCESSING_PROGRESS, {
      percent: boundedPercent,
      step,
    });
  };

  const stopStopPhaseTicker = (): void => {
    if (stopPhaseTicker) {
      clearInterval(stopPhaseTicker);
      stopPhaseTicker = null;
    }
  };

  const startStopPhaseTicker = (): void => {
    stopStopPhaseTicker();
    emitProcessingProgress(stopPhasePercent, 'preparing');
    stopPhaseTicker = setInterval(() => {
      stopPhasePercent = Math.min(32, stopPhasePercent + 1);
      emitProcessingProgress(stopPhasePercent, 'preparing');
      windowsTaskbar?.setProgress(Math.max(0.06, stopPhasePercent / 100));
      if (stopPhasePercent >= 32) {
        stopStopPhaseTicker();
      }
    }, 420);
  };

  try {
    // Set Windows taskbar to processing state with indeterminate progress
    windowsTaskbar?.setProgress(-1);
    startStopPhaseTicker();

    // Stop the session and get results
    console.log('[Main:stopSession] Step 1/6: Stopping session controller...');
    const session = await sessionController.stop();
    stopStopPhaseTicker();

    // Stop crash recovery tracking
    crashRecovery.stopTracking();

    if (!session) {
      windowsTaskbar?.clearProgress();
      return {
        success: false,
        error: 'No active session to stop',
      };
    }
    stoppedSessionId = session.id;
    console.log(
      `[Main:stopSession] Session stopped: ${session.id}, ` +
      `${session.feedbackItems.length} feedback items, ` +
      `${session.transcriptBuffer.length} transcript events`
    );

    const recordingProbe = getScreenRecordingSnapshot(session.id);
    const hasTranscript = session.transcriptBuffer.some((entry) => entry.text.trim().length > 0);
    const hasRecording = !!recordingProbe && recordingProbe.bytesWritten > 0;
    const hasMarkedIssues = (session.metadata.markedIssues?.length ?? 0) > 0;
    const recordingExtension = hasRecording
      ? extname(recordingProbe?.tempPath ?? '') || extensionFromMimeType(recordingProbe?.mimeType)
      : '.webm';
    const recordingFilename = `session-recording${recordingExtension}`;

    if (!hasTranscript && !hasRecording && !hasMarkedIssues) {
      await cleanupRecordingArtifacts(session.id);
      sessionController.clearCapturedAudio();
      windowsTaskbar?.clearProgress();
      return {
        success: false,
        error:
          'No capture data was collected (no transcript or recording). Check microphone/screen capture access and retry.',
      };
    }

    emitProcessingProgress(10, 'preparing');

    // Update progress: generating document (33%)
    windowsTaskbar?.setProgress(0.33);
    emitProcessingProgress(24, 'analyzing');

    // Generate output through the explicitly selected analysis provider.
    // The pipeline always retains a rule-based document as its safety net.
    console.log(
      `[Main:stopSession] Step 2/6: Running AI analysis pipeline ` +
      `(settingsManager ${settingsManager ? 'available' : 'NOT available'}, ` +
      `hasTranscript=${hasTranscript}, hasRecording=${hasRecording})...`
    );
    const aiStartedAt = Date.now();
    let aiTier: 'free' | 'byok' | 'premium' = 'free';
    let aiProvider: AnalysisProvider = 'rules';
    let requestedProvider: AnalysisProvider = 'rules';
    let requestedModel: string | null = null;
    let actualProvider: AnalysisProvider = 'rules';
    let actualModel: string | null = null;
    let analysisConnection: AnalysisConnection = 'local';
    let aiEnhanced = false;
    let aiFallbackReason: string | undefined;
    const { document } = settingsManager
      ? await aiProcessSession(session, {
          settingsManager,
          projectName: session.metadata?.sourceName || 'Feedback Session',
          screenshotDir: './screenshots',
          hasRecording,
          recordingFilename,
        }).then((result) => {
          aiTier = result.pipelineOutput.tier;
          aiProvider = result.pipelineOutput.provider;
          requestedProvider = result.pipelineOutput.requestedProvider;
          requestedModel = result.pipelineOutput.requestedModel;
          actualProvider = result.pipelineOutput.actualProvider;
          actualModel = result.pipelineOutput.actualModel;
          analysisConnection = result.pipelineOutput.connection;
          aiEnhanced = result.pipelineOutput.aiEnhanced;
          aiFallbackReason = result.pipelineOutput.fallbackReason;
          return result;
        })
      : {
          document: generateDocumentForFileManager(session, {
            projectName: session.metadata?.sourceName || 'Feedback Session',
            screenshotDir: './screenshots',
          }),
        };
    aiDurationMs = Date.now() - aiStartedAt;
    console.log(
      `[Main:stopSession] Step 2/6 complete: AI analysis took ${aiDurationMs}ms ` +
      `(provider=${aiProvider}, tier=${aiTier}, aiEnhanced=${aiEnhanced}` +
      `${aiFallbackReason ? `, fallback=${aiFallbackReason}` : ''})`
    );
    emitProcessingProgress(44, 'analyzing');

    // Update progress: saving to file system (66%)
    windowsTaskbar?.setProgress(0.66);
    emitProcessingProgress(56, 'saving');

    // Save to file system
    console.log('[Main:stopSession] Step 3/6: Saving session to file system...');
    const saveStartedAt = Date.now();
    const saveResult = await fileManager.saveSession(session, document);
    saveDurationMs = Date.now() - saveStartedAt;
    console.log(`[Main:stopSession] Step 3/6 complete: save took ${saveDurationMs}ms`);
    if (!saveResult.success) {
      await cleanupRecordingArtifacts(session.id);
      sessionController.clearCapturedAudio();
      windowsTaskbar?.clearProgress();
      return {
        success: false,
        error: saveResult.error || 'Unable to save session report.',
      };
    }
    emitProcessingProgress(64, 'saving');

    let finalizedMarkedIssues = structuredClone(session.metadata.markedIssues ?? []);
    if (finalizedMarkedIssues.length > 0) {
      try {
        finalizedMarkedIssues = await getMarkedIssueArtifactStore().promoteIssues(
          session.id,
          finalizedMarkedIssues,
          saveResult.sessionDir,
        );
      } catch (error) {
        console.warn('[Main] Failed to promote marked screenshots; recorded-video fallback will be attempted:', error);
        finalizedMarkedIssues = finalizedMarkedIssues.map((issue) => ({
          ...issue,
          evidenceWarning: 'Direct marked screenshot unavailable; using recorded-video fallback.',
        }));
      }
      session.metadata.markedIssues = structuredClone(finalizedMarkedIssues);
      sessionController.setMarkedIssues(finalizedMarkedIssues);
    }

    console.log('[Main:stopSession] Step 4/6: Attaching recording and audio artifacts...');
    const recordingArtifact = await attachRecordingToSessionOutput(
      session.id,
      saveResult.sessionDir,
      saveResult.markdownPath
    );

    const audioArtifact = await attachAudioToSessionOutput(
      saveResult.sessionDir,
      saveResult.markdownPath
    );

    if (recordingArtifact) {
      sessionController.setSessionMetadata({
        recordingPath: recordingArtifact.path,
        recordingMimeType: recordingArtifact.mimeType,
        recordingBytes: recordingArtifact.bytesWritten,
        videoStartTime: recordingArtifact.startTime || session.metadata.videoStartTime,
      });
    }
    if (audioArtifact) {
      sessionController.setSessionMetadata({
        audioPath: audioArtifact.path,
        audioBytes: audioArtifact.bytesWritten,
        audioDurationMs: audioArtifact.durationMs,
      });
    }
    console.log(
      `[Main:stopSession] Step 4/6 complete: recording=${recordingArtifact ? `${recordingArtifact.bytesWritten}B` : 'none'}, ` +
      `audio=${audioArtifact ? `${audioArtifact.bytesWritten}B, ${audioArtifact.durationMs}ms` : 'none'}`
    );
    emitProcessingProgress(71, 'preparing');

    // ------------------------------------------------------------------
    // Post-Processing Pipeline
    // ------------------------------------------------------------------
    // Run the post-processor if we have audio and/or video artifacts.
    // Progress and completion events are sent to the renderer via IPC.
    let postProcessResult: PostProcessResult | null = null;
    const providedTranscriptSegments = buildPostProcessTranscriptSegments(session);
    const captureContexts = getSessionCaptureContexts(session);
    const aiMomentHints = extractAiFrameHintsFromMarkdown(
      document.content,
      providedTranscriptSegments
    );
    const annotationMomentHints = captureContextsToKeyMoments(
      captureContexts,
      session.metadata.videoStartTime || recordingArtifact?.startTime || session.startTime,
      finalizedMarkedIssues,
    );
    const frameMomentHints = [...aiMomentHints, ...annotationMomentHints];
    aiFrameHintCount = aiMomentHints.length;

    console.log(
      `[Main:stopSession] Step 5/6: Post-processing pipeline ` +
      `(${providedTranscriptSegments.length} pre-provided segments, ` +
      `${aiMomentHints.length} AI frame hints, ${annotationMomentHints.length} annotation hints, ` +
      `hasAudio=${!!audioArtifact}, hasRecording=${!!recordingArtifact})...`
    );

    if (audioArtifact || recordingArtifact) {
      const postProcessStartedAt = Date.now();
      emitProcessingProgress(74, 'transcribing');
      try {
        postProcessResult = await postProcessor.process({
          videoPath: recordingArtifact?.path ?? '',
          audioPath: audioArtifact?.path ?? '',
          sessionDir: saveResult.sessionDir,
          aiMomentHints: frameMomentHints,
          transcriptSegments:
            providedTranscriptSegments.length > 0
              ? providedTranscriptSegments
              : undefined,
          onProgress: (progress: PostProcessProgress) => {
            const bounded = Math.max(0, Math.min(100, progress.percent));
            // Map pipeline-local progress into the global stop-session range.
            const mappedPercent = 72 + bounded * 0.2; // 72% -> 92%
            emitProcessingProgress(mappedPercent, progress.step);
          },
        });

        if (postProcessResult) {
          postProcessResult.captureContexts = captureContexts;
          postProcessResult.extractedFrames = attachCaptureContextsToExtractedFrames(
            session,
            postProcessResult.extractedFrames,
            captureContexts
          );
          finalizedMarkedIssues = attachFallbackFramesToMarkedIssues(
            finalizedMarkedIssues,
            postProcessResult.extractedFrames,
          );
        }

        console.log(
          `[Main:stopSession] Step 5/6 complete: post-processing took ${Date.now() - postProcessStartedAt}ms, ` +
          `${postProcessResult?.transcriptSegments.length ?? 0} segments, ` +
          `${postProcessResult?.extractedFrames.length ?? 0} frames extracted`
        );

        // Notify renderer that post-processing is complete
        safeSendToRenderer(IPC_CHANNELS.PROCESSING_COMPLETE, postProcessResult);
      } catch (postProcessError) {
        console.warn('[Main:stopSession] Step 5/6 FAILED: Post-processing pipeline error, continuing with basic output:', postProcessError);
        // Non-fatal: we still have the basic markdown report from the AI/rule-based pipeline
      } finally {
        postProcessDurationMs = Date.now() - postProcessStartedAt;
      }
    } else {
      console.log('[Main:stopSession] Step 5/6 skipped: no audio or recording artifacts available');
    }

    if (finalizedMarkedIssues.length > 0) {
      finalizedMarkedIssues = attachFallbackFramesToMarkedIssues(
        finalizedMarkedIssues,
        postProcessResult?.extractedFrames ?? [],
      );
      session.metadata.markedIssues = structuredClone(finalizedMarkedIssues);
      sessionController.setMarkedIssues(finalizedMarkedIssues);
      const ordinaryFrameCount = postProcessResult?.extractedFrames
        .filter((frame) => !frame.markedIssueId).length ?? 0;
      const markedEvidenceCount = finalizedMarkedIssues
        .filter((issue) => Boolean(issue.screenshotPath)).length;
      await syncMarkedIssueMetadata(
        saveResult.sessionDir,
        finalizedMarkedIssues,
        ordinaryFrameCount + markedEvidenceCount,
      );
    }
    emitProcessingProgress(93, 'generating-report');

    console.log('[Main:stopSession] Step 6/6: Finalizing report and copying to clipboard...');
    if (postProcessResult?.extractedFrames?.length) {
      await appendExtractedFramesToReport(
        saveResult.markdownPath,
        postProcessResult.extractedFrames
      ).catch((error) => {
        console.warn('[Main] Failed to append extracted frame links to report:', error);
      });
      await syncExtractedFrameMetadata(
        saveResult.sessionDir,
        postProcessResult.extractedFrames.length
      );
      await syncExtractedFrameSummary(
        saveResult.sessionDir,
        postProcessResult.extractedFrames.length
      );
    }

    const transcriptionFailure = resolveSavedTranscriptionFailure({
      audioBytes: audioArtifact?.bytesWritten ?? 0,
      transcriptTexts: session.transcriptBuffer.map((entry) => entry.text),
      recoveryFailure: session.metadata.transcriptionFailure,
    });
    if (transcriptionFailure) {
      await appendTranscriptionFailureToReport(
        saveResult.markdownPath,
        transcriptionFailure,
      ).catch((error) => {
        console.warn('[Main] Failed to append transcription failure to report:', error);
      });
    }

    const markdownForPayload = await fs
      .readFile(saveResult.markdownPath, 'utf-8')
      .catch(() => document.content);

    // Update progress: copying to clipboard (90%)
    windowsTaskbar?.setProgress(0.9);
    emitProcessingProgress(96, 'complete');

    // Copy markdown report path to clipboard (the bridge into AI agents)
    const clipboardCopied = await copyReportPathToClipboard(saveResult.markdownPath);

    // Complete progress and flash taskbar
    windowsTaskbar?.setProgress(1);
    windowsTaskbar?.flashFrame(3);
    emitProcessingProgress(99, 'complete');

    // Clear progress after a brief delay
    setTimeout(() => {
      windowsTaskbar?.clearProgress();
    }, 1000);

    // Build the review session for the SessionReview component
    const reviewSession = adaptSessionForMarkdown(session);

    await writeProcessingTrace(saveResult.sessionDir, {
      reportPath: saveResult.markdownPath,
      totalMs: Date.now() - stopStartedAt,
      aiMs: aiDurationMs,
      saveMs: saveDurationMs,
      postProcessMs: postProcessDurationMs,
      audioBytes: audioArtifact?.bytesWritten ?? 0,
      recordingBytes: recordingArtifact?.bytesWritten ?? 0,
      transcriptBufferEvents: session.transcriptBuffer.length,
      providedTranscriptSegments: providedTranscriptSegments.length,
      aiFrameHints: aiFrameHintCount,
      postProcessSegments: postProcessResult?.transcriptSegments.length ?? 0,
      extractedFrames: postProcessResult?.extractedFrames.length ?? 0,
      aiTier,
      aiEnhanced,
      requestedProvider,
      requestedModel,
      actualProvider,
      actualModel,
      connection: analysisConnection,
      aiFallbackReason,
      transcriptionFailure,
      completedAt: new Date().toISOString(),
    }).catch((error) => {
      console.warn('[Main] Failed to write processing trace:', error);
    });

    const totalDurationMs = Date.now() - stopStartedAt;
    console.log(
      `[Main:stopSession] All steps complete in ${totalDurationMs}ms ` +
      `(AI: ${aiDurationMs}ms, save: ${saveDurationMs}ms, postProcess: ${postProcessDurationMs}ms). ` +
      `Report: ${saveResult.markdownPath}`
    );

    // Notify renderer only after final post-processing/trace bookkeeping is finished.
    safeSendToRenderer(IPC_CHANNELS.SESSION_COMPLETE, serializeSession(session));
    safeSendToRenderer(IPC_CHANNELS.OUTPUT_READY, {
      markdown: markdownForPayload,
      sessionId: session.id,
      path: saveResult.markdownPath,
      reportPath: saveResult.markdownPath,
      sessionDir: saveResult.sessionDir,
      recordingPath: recordingArtifact?.path,
      audioPath: audioArtifact?.path,
      audioDurationMs: audioArtifact?.durationMs,
      transcriptionError: transcriptionFailure?.message,
      analysisError: aiFallbackReason
        ? `${aiFallbackReason} Local Rules report saved.`
        : undefined,
      videoStartTime: session.metadata.videoStartTime || recordingArtifact?.startTime,
      reviewSession,
    });

    // Show completion notification only after trace/write pipeline is done.
    if (transcriptionFailure) {
      showErrorNotification(
        'Transcription Failed',
        `${transcriptionFailure.message} Your recording and audio were saved.`,
      );
    } else if (aiFallbackReason) {
      showErrorNotification(
        'Report Provider Unavailable',
        `${aiFallbackReason} A Local Rules report was saved.`,
      );
    } else {
      showSuccessNotification(
        'Feedback Captured!',
        clipboardCopied
          ? `${session.feedbackItems.length} items saved. Report path copied to clipboard.`
          : `${session.feedbackItems.length} items saved. Clipboard copy failed, use Copy Path in the app.`
      );
    }

    return {
      success: !transcriptionFailure,
      session: serializeSession(session),
      reportPath: saveResult.markdownPath,
      sessionDir: saveResult.sessionDir,
      recordingPath: recordingArtifact?.path,
      audioPath: audioArtifact?.path,
      error: transcriptionFailure?.message,
    };
  } catch (error) {
    if (stoppedSessionId) {
      await cleanupRecordingArtifacts(stoppedSessionId);
    }
    stopStopPhaseTicker();
    sessionController.clearCapturedAudio();
    console.error('[Main] Failed to stop session:', error);
    windowsTaskbar?.clearProgress();
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Cancel session without saving
 */
function cancelSession(): { success: boolean } {
  const currentSessionId = sessionController.getSession()?.id;
  sessionController.cancel();
  crashRecovery.stopTracking();

  if (currentSessionId) {
    void getMarkedIssueArtifactStore().cleanupSession(currentSessionId).catch((error) => {
      console.warn('[Main] Failed to clean canceled marked screenshots:', error);
    });
    void finalizeScreenRecording(currentSessionId).then(async (artifact) => {
      if (artifact?.tempPath) {
        await fs.unlink(artifact.tempPath).catch(() => {
          // Best-effort cleanup for canceled session recordings.
        });
      }
      deleteFinalizedRecording(currentSessionId);
    });
  }

  return { success: true };
}

// =============================================================================
// IPC Handlers Setup (delegated to src/main/ipc/ modules)
// =============================================================================

function setupIPC(): void {
  registerAllHandlers(
    {
      getMainWindow: () => mainWindow,
      getPopover: () => popover,
      getSettingsManager: () => settingsManager,
      getWindowsTaskbar: () => windowsTaskbar,
      getHasCompletedOnboarding: () => hasCompletedOnboarding,
      setHasCompletedOnboarding: (value: boolean) => { hasCompletedOnboarding = value; },
    },
    {
      startSession,
      stopSession,
      pauseSession,
      resumeSession,
      cancelSession,
      serializeSession,
      checkPermission,
      requestPermission,
    },
  );
}

// =============================================================================
// Permission Helpers
// =============================================================================

async function checkPermission(type: PermissionType): Promise<boolean> {
  return permissionManager.isGranted(type);
}

async function requestPermission(type: PermissionType): Promise<boolean> {
  return permissionManager.requestPermission(type);
}

/**
 * Check all permissions on startup and show dialog if any are missing
 * This runs after the window is ready to ensure dialogs are properly parented
 */
async function checkStartupPermissions(): Promise<void> {
  if (process.platform !== 'darwin') {
    // Only macOS has these system-level permissions
    return;
  }

  const initial = await permissionManager.checkAllPermissions();

  // On first launch, proactively trigger macOS permission prompts for not-determined states.
  if (initial.state.microphone === 'not-determined') {
    await requestPermission('microphone');
  }
  if (initial.state.screen === 'not-determined') {
    await requestPermission('screen');
  }

  const result = await permissionManager.checkAllPermissions();

  if (!result.allGranted && result.missing.length > 0) {
    // Log which permissions are missing
    errorHandler.log('warn', 'Missing required permissions on startup', {
      component: 'Main',
      operation: 'checkStartupPermissions',
      data: {
        missing: result.missing,
        state: result.state,
      },
    });

    // Show guidance dialog for users who already finished onboarding.
    // New users will continue through onboarding guidance.
    if (hasCompletedOnboarding) {
      // Avoid blocking startup on a modal dialog; show guidance asynchronously.
      setTimeout(() => {
        void permissionManager.showStartupPermissionDialog(result.missing).catch((error) => {
          console.warn('[Main] Startup permission dialog failed:', error);
        });
      }, 500);
    }
  }
}

// =============================================================================
// Session Serialization Helper
// =============================================================================

function serializeSession(session: Session): SessionPayload {
  return {
    id: session.id,
    startTime: session.startTime,
    endTime: session.endTime,
    state: session.state,
    sourceId: session.sourceId,
    feedbackItems: session.feedbackItems.map((item) => ({
      id: item.id,
      timestamp: item.timestamp,
      text: item.text,
      confidence: item.confidence,
      hasScreenshot: false, // Screenshots are now extracted in post-processing
    })),
    metadata: session.metadata,
  };
}

// =============================================================================
// App Lifecycle
// =============================================================================

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[Main] Another instance is running, quitting...');
  app.quit();
} else {
  app.on('second-instance', () => {
    showWindow();
  });
}

app.whenReady().then(async () => {
  console.log('[Main] App ready, starting initialization...');

  // 1. Initialize error handler first (for crash recovery)
  await errorHandler.initialize();

  // 1b. Initialize crash recovery manager
  await crashRecovery.initialize();
  console.log('[Main] Crash recovery initialized');

  const incompleteSession = crashRecovery.getIncompleteSession();
  await getMarkedIssueArtifactStore()
    .cleanupStaleSessions(incompleteSession ? [incompleteSession.id] : [])
    .catch((error) => {
      console.warn('[Main] Failed to clean stale marked screenshot staging:', error);
    });
  if (incompleteSession?.markedIssues) {
    for (const issue of incompleteSession.markedIssues) {
      try {
        getMarkedIssueArtifactStore().markCommitted(
          incompleteSession.id,
          issue.snapshotRevision,
          issue.ordinal,
        );
      } catch (error) {
        console.warn('[Main] Failed to restore marked screenshot reservation:', error);
      }
    }
  }

  // 2. Initialize settings manager
  settingsManager = new SettingsManager();
  console.log('[Main] Settings loaded');

  teardownSettingsListeners.forEach((teardown) => teardown());
  teardownSettingsListeners = [];
  teardownSettingsListeners.push(
    settingsManager.onChange((key, newValue) => {
      if (key === 'checkForUpdates') {
        autoUpdaterManager.setAutoCheckEnabled(Boolean(newValue));
      }
    }),
  );

  // 3. Determine onboarding readiness from persisted flag or BYOK keys + transcription path
  const [hasOpenAiKey, hasAnthropicKey] = await Promise.all([
    settingsManager.hasApiKey('openai'),
    settingsManager.hasApiKey('anthropic'),
  ]);
  const hasLocalWhisperModel = modelDownloadManager.hasAnyModel();
  const hasTranscriptionPath = hasOpenAiKey || hasLocalWhisperModel;
  hasCompletedOnboarding = settingsManager.get('hasCompletedOnboarding') || (hasAnthropicKey && hasTranscriptionPath);

  // 5. Initialize session controller
  await sessionController.initialize();
  console.log('[Main] Session controller initialized');

  // 7. Initialize tray manager FIRST (needed for popover positioning)
  trayManager.initialize();
  console.log('[Main] Tray manager initialized');

  // 8. Create popover window (menu bar native UI)
  const tray = trayManager.getTray();
  if (tray) {
    popover = new PopoverManager({
      width: POPOVER_SIZES.idle.width,
      height: POPOVER_SIZES.idle.height,
      tray: tray,
    });

    const popoverWindow = popover.create();
    mainWindow = popoverWindow; // Assign to mainWindow for compatibility
    sessionController.setMainWindow(popoverWindow);

    attachRendererDiagnostics(popoverWindow, 'Popover');
    void loadRendererIntoWindow(popoverWindow, 'Popover');

    // Check if onboarding needed after window is ready
    popoverWindow.once('ready-to-show', () => {
      console.log('[Main] Popover ready to show');
      if (!hasCompletedOnboarding) {
        popoverWindow.webContents.send(IPC_CHANNELS.SHOW_ONBOARDING);
      }
    });

    console.log('[Main] Popover window created');
  } else {
    // Fallback to regular window if tray not available
    createWindow();
    console.log('[Main] Fallback: Regular window created (no tray)');
  }

  captureOverlayManager.configure({
    getHostWindow: () => mainWindow,
    onAnnotationEvent: handleAnnotationEvent,
    onMarkedIssueCommitted: handleMarkedIssueCommitted,
    onMarkedIssueAccumulatorChanged: (snapshot) => {
      crashRecovery.updateSession({ markedIssueAccumulator: snapshot });
    },
    isAnnotationEnabled: () => sessionController.getState() === 'recording'
      && !sessionController.isSessionPaused(),
  });

  wireAudioTelemetry();

  // Set error handler main window
  errorHandler.setMainWindow(mainWindow!);

  // Set crash recovery main window
  crashRecovery.setMainWindow(mainWindow!);

  // Set permission manager main window
  permissionManager.setMainWindow(mainWindow!);

  // 9. Wire up tray click to toggle popover
  trayManager.onClick(handleTrayClick);
  trayManager.onSettingsClick(handleSettingsClick);

  // 8b. Initialize menu manager (native macOS menu bar)
  menuManager.initialize(mainWindow!);
  menuManager.onAction((action, data) => {
    handleMenuAction(action, data);
  });
  // Load recent sessions into menu
  const recentSessions = sessionController.getRecentSessions();
  menuManager.setRecentSessions(
    recentSessions.map((s) => ({
      id: s.id,
      name: s.metadata?.sourceName || 'Feedback Session',
      path: s.id, // We use ID as path for now
      date: new Date(s.startTime),
    }))
  );
  console.log('[Main] Menu manager initialized');

  // 8c. Initialize Windows taskbar (Windows only)
  if (process.platform === 'win32') {
    windowsTaskbar = createWindowsTaskbar(mainWindow!);
    windowsTaskbar.setActionCallbacks({
      onRecord: () => handleToggleRecording(),
      onStop: () => stopSession(),
      onScreenshot: () => handleManualScreenshot(),
      onSettings: () => handleSettingsClick(),
    });
    windowsTaskbar.initialize();
    // Update jump list with recent sessions
    windowsTaskbar.updateRecentSessions(
      recentSessions.map((s) => ({
        id: s.id,
        name: s.metadata?.sourceName || 'Feedback Session',
        path: s.id,
        date: new Date(s.startTime),
      }))
    );
    console.log('[Main] Windows taskbar initialized');
  }

  // 9. Initialize hotkeys
  initializeHotkeys();

  // 10. Setup IPC handlers
  setupIPC();

  // 11. Configure session controller event callbacks
  sessionController.setEventCallbacks({
    onStateChange: handleSessionStateChange,
    onFeedbackItem: handleFeedbackItem,
    onError: handleSessionError,
  });

  // 12. Initialize auto-updater
  // Always initialize so IPC handlers are registered and Settings UI can show
  // update status. The updater internally disables itself for dev/unpackaged builds.
  autoUpdaterManager.setAutoCheckEnabled(settingsManager.get('checkForUpdates'));
  autoUpdaterManager.initialize(mainWindow!);
  console.log('[Main] Auto-updater initialized');

  // 13. Check permissions on startup (macOS only)
  // Delay slightly to ensure window is fully ready
  setTimeout(async () => {
    await checkStartupPermissions();
    console.log('[Main] Startup permission check complete');
  }, 1000);

  // Handle macOS dock click (fallback, dock is hidden in menu bar mode)
  app.on('activate', () => {
    // In menu bar mode, show the popover
    if (popover) {
      popover.show();
      return;
    }

    // Fallback for non-popover mode
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      showWindow();
    }
  });

  console.log('[Main] markupR initialization complete');
});

// Handle all windows closed
app.on('window-all-closed', () => {
  // On macOS, keep the app running in the tray
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle before quit
app.on('before-quit', () => {
  isQuitting = true;
});

// Handle app quit
app.on('will-quit', async () => {
  console.log('[Main] App quitting, cleaning up...');

  // Stop any active session
  if (sessionController.getState() === 'recording') {
    sessionController.cancel();
  }

  // Best-effort cleanup of temporary recording artifacts.
  for (const [sessionId] of getActiveScreenRecordings()) {
    const artifact = await finalizeScreenRecording(sessionId).catch(() => null);
    if (artifact?.tempPath) {
      await fs.unlink(artifact.tempPath).catch(() => {});
    }
    deleteFinalizedRecording(sessionId);
  }
  for (const artifact of getFinalizedScreenRecordings().values()) {
    await fs.unlink(artifact.tempPath).catch(() => {});
  }
  getFinalizedScreenRecordings().clear();

  // Clean up orphaned audio recovery buffer files (only on normal exit;
  // crash recovery relies on these files still being present after a crash).
  await audioCapture.clearRecoveryBuffers().catch((err) => {
    console.warn('[Main] Failed to clear audio recovery buffers:', err);
  });

  // Cleanup services
  teardownAudioTelemetry.forEach((teardown) => teardown());
  teardownAudioTelemetry = [];
  teardownSettingsListeners.forEach((teardown) => teardown());
  teardownSettingsListeners = [];
  hotkeyManager.unregisterAll();
  captureOverlayManager.destroy();
  popover?.destroy();
  trayManager.destroy();
  menuManager.destroy();
  windowsTaskbar?.destroy();
  sessionController.destroy();
  autoUpdaterManager.destroy();
  crashRecovery.destroy();

  // Clean up error handler
  await errorHandler.destroy();

  console.log('[Main] Cleanup complete');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  if (isIgnorableStdioError(error)) {
    return;
  }

  console.error('[Main] Uncaught exception:', error);
  try {
    showErrorNotification('markupR Error', error.message);
  } catch {
    // Ignore notification errors
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  if (isIgnorableStdioError(reason)) {
    return;
  }

  console.error('[Main] Unhandled rejection:', reason);
});

// Export for testing
export {
  createWindow,
  startSession,
  stopSession,
  showWindow,
};
