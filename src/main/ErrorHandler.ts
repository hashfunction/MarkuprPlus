/**
 * ErrorHandler - Centralized Error Management for MarkuprX
 *
 * Provides:
 * - Categorized error handling (permission, API key, network, capture, critical)
 * - User-friendly error dialogs and notifications
 * - Persistent logging to disk for debugging
 * - Recovery suggestions and system preferences access
 */

import { app, dialog, shell, BrowserWindow, Notification } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PUBLIC_BRAND_NAME } from '../shared/publicBrand';
import { IPC_CHANNELS } from '../shared/types';

// ============================================================================
// Types
// ============================================================================

export interface ErrorContext {
  component: string;
  operation: string;
  data?: Record<string, unknown>;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  component?: string;
  operation?: string;
  data?: Record<string, unknown>;
  error?: string;
  stack?: string;
}

export type ErrorCategory =
  | 'permission'
  | 'api_key'
  | 'network'
  | 'capture'
  | 'transcription'
  | 'audio'
  | 'file'
  | 'unknown';

// ============================================================================
// Constants
// ============================================================================

const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_LOG_LINES = 10000;
const LOG_ROTATION_CHECK_INTERVAL_MS = 60000; // Check every minute

// ============================================================================
// ErrorHandler Class
// ============================================================================

class ErrorHandler {
  private logPath: string;
  private mainWindow: BrowserWindow | null = null;
  private logBuffer: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private rotationTimer: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;
  private lastNotificationAt: number = 0;
  private readonly NOTIFICATION_RATE_LIMIT_MS = 3000; // Min 3s between notifications

  constructor() {
    this.logPath = path.join(app.getPath('logs'), 'markuprx.log');
  }

  /**
   * Initialize the error handler
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Ensure log directory exists
      const logDir = path.dirname(this.logPath);
      await fs.mkdir(logDir, { recursive: true });

      // Start log rotation check
      this.rotationTimer = setInterval(
        () => this.checkLogRotation(),
        LOG_ROTATION_CHECK_INTERVAL_MS
      );

      // Start flush timer for buffered logs
      this.flushTimer = setInterval(() => {
        try {
          this.flushLogs();
        } catch {
          // Ignore flush errors to prevent crashing the interval
        }
      }, 5000);

      this.isInitialized = true;
      this.log('info', 'ErrorHandler initialized', { component: 'ErrorHandler' });
    } catch (error) {
      console.error('[ErrorHandler] Failed to initialize:', error);
    }
  }

  /**
   * Set the main window for IPC communication
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  // ==========================================================================
  // Permission Errors
  // ==========================================================================

  /**
   * Handle permission errors and guide user to system settings
   */
  async handlePermissionError(type: 'microphone' | 'screen'): Promise<boolean> {
    const settingsName = process.platform === 'darwin'
      ? 'System Settings'
      : process.platform === 'win32'
        ? 'Windows Settings'
        : 'system settings';

    const messages = {
      microphone: {
        title: 'Microphone Access Required',
        message: `${PUBLIC_BRAND_NAME} needs microphone access to capture your voice feedback.`,
        detail:
          `Click "Open Settings" to grant microphone permission in ${settingsName}.` +
          '\n\nAfter enabling, you may need to restart the app.',
        pane: 'Privacy_Microphone',
        winSettings: 'ms-settings:privacy-microphone',
      },
      screen: {
        title: 'Screen Recording Required',
        message: `${PUBLIC_BRAND_NAME} needs screen recording permission to capture screenshots.`,
        detail:
          `Click "Open Settings" to grant screen recording permission in ${settingsName}.` +
          '\n\nYou will need to restart the app after enabling.',
        pane: 'Privacy_ScreenCapture',
        winSettings: 'ms-settings:privacy-screencapture',
      },
    };

    const config = messages[type];

    this.log('warn', `Permission denied: ${type}`, {
      component: 'ErrorHandler',
      operation: 'handlePermissionError',
      data: { permissionType: type },
    });

    const { response } = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Open Settings', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      title: config.title,
      message: config.message,
      detail: config.detail,
    });

    if (response === 0) {
      // Open system preferences / settings
      if (process.platform === 'darwin') {
        await shell.openExternal(
          `x-apple.systempreferences:com.apple.preference.security?${config.pane}`
        );
        this.log('info', `Opened system preferences for ${type}`);
      } else if (process.platform === 'win32') {
        await shell.openExternal(config.winSettings);
        this.log('info', `Opened Windows settings for ${type}`);
      }
      return true;
    }

    return false;
  }

  // ==========================================================================
  // API Key Errors
  // ==========================================================================

  /**
   * Handle API key errors - invalid, missing, or expired
   */
  handleApiKeyError(error?: Error): void {
    const errorMessage = error?.message || 'API key validation failed';

    this.log('error', 'API key error', {
      component: 'ErrorHandler',
      operation: 'handleApiKeyError',
      error: errorMessage,
    });

    // Notify renderer to show settings
    this.emitToRenderer(IPC_CHANNELS.SHOW_SETTINGS, { tab: 'api-key' });

    // Show notification
    this.notifyUser('API Key Invalid', 'Please check your OpenAI API key in settings.');

    // Also show dialog for critical operations
    dialog.showMessageBox({
      type: 'warning',
      title: 'API Key Required',
      message: 'Your OpenAI API key is missing or invalid.',
      detail:
        `${PUBLIC_BRAND_NAME} uses OpenAI for post-session narration transcription. ` +
        'Please enter a valid API key in Settings.\n\n' +
        'Create a key at platform.openai.com/api-keys',
      buttons: ['Open Settings', 'OK'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        this.emitToRenderer(IPC_CHANNELS.SHOW_SETTINGS, { tab: 'api-key' });
      }
    });
  }

  // ==========================================================================
  // Network Errors
  // ==========================================================================

  /**
   * Handle network errors with user-friendly messaging
   */
  handleNetworkError(error: Error, context: ErrorContext): void {
    this.log('error', 'Network error', {
      component: context.component,
      operation: context.operation,
      error: error.message,
      data: context.data,
    });

    // Emit to renderer for UI updates
    this.emitToRenderer(IPC_CHANNELS.NETWORK_ERROR, {
      message: 'Connection issue detected',
      isBuffering: true,
    });

    // Show non-intrusive notification
    this.notifyUser(
      'Connection Issue',
      'Check your internet connection. Audio is being buffered locally.'
    );
  }

  /**
   * Handle network recovery
   */
  handleNetworkRecovery(): void {
    this.log('info', 'Network connection restored', {
      component: 'ErrorHandler',
      operation: 'handleNetworkRecovery',
    });

    this.emitToRenderer(IPC_CHANNELS.NETWORK_RESTORED, {});
    this.notifyUser('Connection Restored', 'Transcription service reconnected.');
  }

  // ==========================================================================
  // Capture Errors
  // ==========================================================================

  /**
   * Handle screen capture errors
   * These are usually non-critical - we can continue the session
   */
  handleCaptureError(error: Error, context: ErrorContext): void {
    this.log('warn', 'Capture failed', {
      component: context.component,
      operation: context.operation,
      error: error.message,
      data: context.data,
    });

    // Don't show notification for capture errors - they're expected sometimes
    // (e.g., window closed, minimized, etc.)

    // Just emit to renderer for potential UI feedback
    this.emitToRenderer(IPC_CHANNELS.CAPTURE_WARNING, {
      message: 'Screenshot capture skipped',
      reason: error.message,
    });
  }

  // ==========================================================================
  // Audio Errors
  // ==========================================================================

  /**
   * Handle audio capture errors
   */
  handleAudioError(error: Error, context: ErrorContext): void {
    this.log('error', 'Audio error', {
      component: context.component,
      operation: context.operation,
      error: error.message,
      data: context.data,
    });

    // Check if it's a permission error
    if (
      error.message.includes('permission') ||
      error.message.includes('denied') ||
      error.message.includes('NotAllowedError')
    ) {
      this.handlePermissionError('microphone');
      return;
    }

    // Check if it's a device error
    if (
      error.message.includes('device') ||
      error.message.includes('NotFoundError') ||
      error.message.includes('NotReadableError')
    ) {
      this.notifyUser(
        'Microphone Error',
        'Could not access microphone. Please check your audio device.'
      );
      return;
    }

    // Generic audio error
    this.emitToRenderer(IPC_CHANNELS.AUDIO_ERROR, {
      message: error.message,
    });
  }

  // ==========================================================================
  // Transcription Errors
  // ==========================================================================

  /**
   * Handle transcription service errors
   */
  handleTranscriptionError(error: Error, context: ErrorContext): void {
    this.log('error', 'Transcription error', {
      component: context.component,
      operation: context.operation,
      error: error.message,
      data: context.data,
    });

    // Check for auth errors
    if (this.isAuthError(error)) {
      this.handleApiKeyError(error);
      return;
    }

    // Check for rate limit errors
    if (this.isRateLimitError(error)) {
      this.notifyUser('Rate Limited', 'Too many requests. Please wait a moment before retrying.');
      return;
    }

    // Network errors
    if (this.isNetworkError(error)) {
      this.handleNetworkError(error, context);
      return;
    }

    // Generic transcription error
    this.emitToRenderer(IPC_CHANNELS.TRANSCRIPTION_ERROR, {
      message: 'Transcription service error',
      detail: error.message,
    });
  }

  // ==========================================================================
  // File System Errors
  // ==========================================================================

  /**
   * Handle file system errors
   */
  handleFileError(error: Error, context: ErrorContext): void {
    this.log('error', 'File system error', {
      component: context.component,
      operation: context.operation,
      error: error.message,
      data: context.data,
    });

    const nodeError = error as NodeJS.ErrnoException;

    switch (nodeError.code) {
      case 'ENOENT':
        this.notifyUser('File Not Found', 'The requested file or directory does not exist.');
        break;
      case 'EACCES':
      case 'EPERM':
        this.notifyUser(
          'Permission Denied',
          'Cannot access this file. Check folder permissions.'
        );
        break;
      case 'ENOSPC':
        this.notifyUser(
          'Disk Full',
          'Not enough disk space. Please free up some space and try again.'
        );
        break;
      default:
        this.notifyUser('File Error', `Could not complete file operation: ${error.message}`);
    }
  }

  // ==========================================================================
  // Critical Errors
  // ==========================================================================

  /**
   * Handle critical errors that require app restart
   */
  handleCriticalError(error: Error, context: ErrorContext): void {
    this.log('error', 'CRITICAL ERROR', {
      component: context.component,
      operation: context.operation,
      error: error.message,
      stack: error.stack,
      data: context.data,
    });

    // Flush logs immediately
    this.flushLogs();

    // Show blocking dialog
    dialog
      .showMessageBox({
        type: 'error',
        title: 'Something Went Wrong',
        message: `An error occurred in ${context.component}`,
        detail:
          `${error.message}\n\n` +
          'Your session data has been saved.\n' +
          'Please restart the app to continue.',
        buttons: ['Restart', 'Quit'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          app.relaunch();
        }
        app.quit();
      });
  }

  // ==========================================================================
  // Notifications
  // ==========================================================================

  /**
   * Show a non-blocking notification to the user
   */
  notifyUser(title: string, message: string): void {
    // Rate limit notifications to prevent spam
    const now = Date.now();
    if (now - this.lastNotificationAt < this.NOTIFICATION_RATE_LIMIT_MS) {
      return;
    }
    this.lastNotificationAt = now;

    // First try to use renderer notification
    this.emitToRenderer(IPC_CHANNELS.NOTIFICATION, { title, message });

    // Also show system notification if supported
    if (Notification.isSupported()) {
      new Notification({
        title: `${PUBLIC_BRAND_NAME}: ${title}`,
        body: message,
        silent: true,
      }).show();
    }
  }

  // ==========================================================================
  // Logging
  // ==========================================================================

  /**
   * Log a message with context
   */
  log(
    level: LogLevel,
    message: string,
    context?: Partial<ErrorContext> & { error?: string; stack?: string }
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      component: context?.component,
      operation: context?.operation,
      data: context?.data,
      error: context?.error,
      stack: context?.stack,
    };

    // Console output with color
    const colors = {
      debug: '\x1b[90m', // gray
      info: '\x1b[36m', // cyan
      warn: '\x1b[33m', // yellow
      error: '\x1b[31m', // red
    };
    const reset = '\x1b[0m';
    const prefix = `${colors[level]}[${level.toUpperCase()}]${reset}`;
    const componentStr = context?.component ? ` [${context.component}]` : '';

    console.log(`${prefix}${componentStr} ${message}`, context?.data || '');

    // Buffer for file output
    this.logBuffer.push(JSON.stringify(entry));

    // Flush immediately on error
    if (level === 'error') {
      this.flushLogs();
    }
  }

  /**
   * Flush buffered logs to disk
   */
  private async flushLogs(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    const logs = this.logBuffer.splice(0);

    try {
      await fs.appendFile(this.logPath, logs.join('\n') + '\n', 'utf-8');
    } catch (error) {
      // Log write failure - output to console only
      console.error('[ErrorHandler] Failed to write logs:', error);
    }
  }

  /**
   * Check if log rotation is needed
   */
  private async checkLogRotation(): Promise<void> {
    try {
      const stats = await fs.stat(this.logPath);

      if (stats.size > MAX_LOG_SIZE_BYTES) {
        await this.rotateLogs();
      }
    } catch (error) {
      // File doesn't exist yet or other error - ignore
    }
  }

  /**
   * Rotate logs - keep last N lines
   */
  private async rotateLogs(): Promise<void> {
    try {
      const content = await fs.readFile(this.logPath, 'utf-8');
      const lines = content.split('\n');

      if (lines.length > MAX_LOG_LINES) {
        // Keep last MAX_LOG_LINES/2 lines
        const keepLines = lines.slice(-(MAX_LOG_LINES / 2));
        await fs.writeFile(this.logPath, keepLines.join('\n'), 'utf-8');
        this.log('info', 'Log file rotated', { component: 'ErrorHandler' });
      }
    } catch (error) {
      console.error('[ErrorHandler] Log rotation failed:', error);
    }
  }

  /**
   * Get recent logs for error reporting
   */
  async getRecentLogs(lines: number = 100): Promise<LogEntry[]> {
    try {
      const content = await fs.readFile(this.logPath, 'utf-8');
      const logLines = content.trim().split('\n').slice(-lines);

      return logLines
        .filter((line) => line.trim())
        .map((line) => {
          try {
            return JSON.parse(line) as LogEntry;
          } catch {
            return { timestamp: '', level: 'info' as LogLevel, message: line };
          }
        });
    } catch {
      return [];
    }
  }

  /**
   * Get log file path for support
   */
  getLogPath(): string {
    return this.logPath;
  }

  // ==========================================================================
  // Error Classification Helpers
  // ==========================================================================

  private isAuthError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('401') ||
      message.includes('unauthorized') ||
      message.includes('invalid api key') ||
      message.includes('authentication') ||
      message.includes('forbidden')
    );
  }

  private isRateLimitError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('429') || message.includes('rate limit') || message.includes('too many')
    );
  }

  private isNetworkError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('socket')
    );
  }

  /**
   * Categorize an error for logging/reporting
   */
  categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();

    if (message.includes('permission') || message.includes('denied')) {
      return 'permission';
    }
    if (this.isAuthError(error)) {
      return 'api_key';
    }
    if (this.isNetworkError(error)) {
      return 'network';
    }
    if (message.includes('capture') || message.includes('screenshot')) {
      return 'capture';
    }
    if (message.includes('transcri')) {
      return 'transcription';
    }
    if (
      message.includes('audio') ||
      message.includes('microphone') ||
      message.includes('media')
    ) {
      return 'audio';
    }
    if (
      message.includes('file') ||
      message.includes('directory') ||
      message.includes('enoent') ||
      message.includes('eacces')
    ) {
      return 'file';
    }

    return 'unknown';
  }

  // ==========================================================================
  // IPC Helper
  // ==========================================================================

  /**
   * Send event to renderer
   */
  private emitToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }

    // Final log flush
    await this.flushLogs();

    this.mainWindow = null;
    this.isInitialized = false;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const errorHandler = new ErrorHandler();
export default ErrorHandler;
