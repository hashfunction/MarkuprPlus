/**
 * CrashRecovery - Session Recovery and Error Reporting for markuprx
 *
 * Provides:
 * - Auto-save session state every 5 seconds during recording (max 5s data loss)
 * - Detection of incomplete sessions on startup
 * - Recovery dialog coordination with renderer
 * - Persistent crash logs for debugging
 * - Optional anonymous crash reporting (user consent)
 */

import { app, BrowserWindow } from 'electron';
import Store from 'electron-store';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import {
  IPC_CHANNELS,
  type MarkedIssuePayload,
} from '../shared/types';
import type { TranscriptEvent } from './transcription/types';
import { errorHandler } from './ErrorHandler';
import type { MarkedIssueAccumulatorSnapshot } from './capture/MarkedIssueAccumulator';

// ============================================================================
// Types
// ============================================================================

/**
 * Serializable session data for crash recovery
 * Contains all necessary data to restore a session without Buffer objects
 */
export interface RecoverableSession {
  id: string;
  startTime: number;
  lastSaveTime: number;
  feedbackItems: RecoverableFeedbackItem[];
  transcriptionBuffer: string;
  /** Final/interim transcript events retained for report recovery after a crash. */
  transcriptEvents?: TranscriptEvent[];
  sourceId: string;
  sourceName: string;
  screenshotCount: number;
  markedIssues?: MarkedIssuePayload[];
  markedIssueAccumulator?: MarkedIssueAccumulatorSnapshot;
  metadata: {
    appVersion: string;
    platform: string;
    sessionDurationMs: number;
  };
}

export interface RecoverableFeedbackItem {
  id: string;
  timestamp: number;
  text: string;
  confidence: number;
  hasScreenshot: boolean;
  screenshotId?: string;
}

export interface CrashLog {
  timestamp: string;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
  appVersion: string;
  platform: string;
  arch: string;
  sessionId?: string;
  context?: Record<string, unknown>;
}

export interface CrashRecoverySettings {
  enableAutoSave: boolean;
  autoSaveIntervalMs: number;
  enableCrashReporting: boolean; // User consent for anonymous reporting
  maxCrashLogs: number;
}

// ============================================================================
// Store Schema
// ============================================================================

interface CrashRecoveryStoreSchema {
  activeSession: RecoverableSession | null;
  crashLogs: CrashLog[];
  settings: CrashRecoverySettings;
  lastCleanExit: boolean;
  lastExitTimestamp: number;
}

const DEFAULT_SETTINGS: CrashRecoverySettings = {
  enableAutoSave: true,
  autoSaveIntervalMs: 5000, // 5 seconds (max 5 seconds potential data loss per spec)
  enableCrashReporting: false, // Opt-in by default
  maxCrashLogs: 50,
};

let crashRecoveryStore: Store<CrashRecoveryStoreSchema> | null = null;

function getCrashRecoveryStore(): Store<CrashRecoveryStoreSchema> {
  if (!crashRecoveryStore) {
    crashRecoveryStore = new Store<CrashRecoveryStoreSchema>({
      name: 'markuprx-crash-recovery',
      defaults: {
        activeSession: null,
        crashLogs: [],
        settings: DEFAULT_SETTINGS,
        lastCleanExit: true,
        lastExitTimestamp: 0,
      },
      clearInvalidConfig: true,
    });
  }
  return crashRecoveryStore;
}

// ============================================================================
// CrashRecoveryManager Class
// ============================================================================

export class CrashRecoveryManager {
  private saveInterval: NodeJS.Timeout | null = null;
  private currentSession: RecoverableSession | null = null;
  private mainWindow: BrowserWindow | null = null;
  private isInitialized = false;
  private crashLogPath: string;

  constructor() {
    this.crashLogPath = path.join(app.getPath('logs'), 'crash-logs.json');
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the crash recovery manager
   * Should be called early in app startup
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    errorHandler.log('info', 'CrashRecovery initializing', {
      component: 'CrashRecovery',
      operation: 'initialize',
    });

    // Check if last exit was clean
    const lastCleanExit = getCrashRecoveryStore().get('lastCleanExit');
    const lastExitTimestamp = getCrashRecoveryStore().get('lastExitTimestamp');

    if (!lastCleanExit && lastExitTimestamp > 0) {
      errorHandler.log('warn', 'Previous session did not exit cleanly', {
        component: 'CrashRecovery',
        operation: 'initialize',
        data: { lastExitTimestamp },
      });
    }

    // Mark as not clean until we properly exit
    getCrashRecoveryStore().set('lastCleanExit', false);

    // Check for incomplete session
    const incomplete = getCrashRecoveryStore().get('activeSession');
    if (incomplete) {
      errorHandler.log('info', 'Found incomplete session from previous run', {
        component: 'CrashRecovery',
        operation: 'initialize',
        data: {
          sessionId: incomplete.id,
          feedbackCount: incomplete.feedbackItems.length,
          lastSaveTime: new Date(incomplete.lastSaveTime).toISOString(),
        },
      });
    }

    // Set up exit handlers
    this.setupExitHandlers();

    // Migrate crash logs from file if they exist
    await this.migrateCrashLogsFromFile();

    this.isInitialized = true;

    errorHandler.log('info', 'CrashRecovery initialized successfully', {
      component: 'CrashRecovery',
      operation: 'initialize',
    });
  }

  /**
   * Set up handlers for clean and unclean exits
   */
  private setupExitHandlers(): void {
    // Clean exit handlers
    app.on('before-quit', () => {
      this.handleCleanExit();
    });

    app.on('will-quit', () => {
      this.handleCleanExit();
    });

    // Uncaught exception handler
    process.on('uncaughtException', (error) => {
      this.handleUncaughtException(error);
    });

    // Unhandled promise rejection handler
    process.on('unhandledRejection', (reason) => {
      const error =
        reason instanceof Error ? reason : new Error(String(reason));
      this.handleUncaughtException(error, 'unhandledRejection');
    });
  }

  /**
   * Handle clean application exit
   */
  private handleCleanExit(): void {
    errorHandler.log('info', 'Clean exit initiated', {
      component: 'CrashRecovery',
      operation: 'handleCleanExit',
    });

    // Stop auto-save
    this.stopAutoSave();

    // A persisted session is an unresolved user choice. Normal completion
    // clears it through stopTracking(), while Recover/Discard clear it through
    // their explicit handlers. Merely quitting the dialog must preserve it.

    // Mark clean exit
    getCrashRecoveryStore().set('lastCleanExit', true);
    getCrashRecoveryStore().set('lastExitTimestamp', Date.now());
  }

  /**
   * Handle uncaught exceptions
   */
  private handleUncaughtException(
    error: Error,
    type: string = 'uncaughtException'
  ): void {
    errorHandler.log('error', `Uncaught exception: ${type}`, {
      component: 'CrashRecovery',
      operation: 'handleUncaughtException',
      error: error.message,
      stack: error.stack,
    });

    // Save crash log synchronously to ensure it completes before process exits
    this.logCrashSync(error, { type });

    // Force save current session state
    if (this.currentSession) {
      this.currentSession.lastSaveTime = Date.now();
      getCrashRecoveryStore().set('activeSession', this.currentSession);
      errorHandler.log('info', 'Session state saved before crash', {
        component: 'CrashRecovery',
        operation: 'handleUncaughtException',
        data: { sessionId: this.currentSession.id },
      });
    }
  }

  // ==========================================================================
  // Session Tracking
  // ==========================================================================

  /**
   * Start tracking a new session for crash recovery
   */
  startTracking(session: RecoverableSession): void {
    errorHandler.log('info', 'Starting session tracking', {
      component: 'CrashRecovery',
      operation: 'startTracking',
      data: { sessionId: session.id },
    });

    this.currentSession = {
      ...session,
      transcriptEvents: structuredClone(session.transcriptEvents ?? []),
      markedIssues: structuredClone(session.markedIssues ?? []),
      ...(session.markedIssueAccumulator
        ? { markedIssueAccumulator: structuredClone(session.markedIssueAccumulator) }
        : {}),
      lastSaveTime: Date.now(),
      metadata: {
        appVersion: app.getVersion(),
        platform: process.platform,
        sessionDurationMs: 0,
      },
    };

    // Save immediately
    getCrashRecoveryStore().set('activeSession', this.currentSession);

    // Start auto-save interval
    const settings = this.getSettings();
    if (settings.enableAutoSave) {
      this.startAutoSave(settings.autoSaveIntervalMs);
    }
  }

  /**
   * Update the tracked session with new data
   */
  updateSession(updates: Partial<RecoverableSession>): void {
    if (!this.currentSession) {
      errorHandler.log('warn', 'Attempted to update non-existent session', {
        component: 'CrashRecovery',
        operation: 'updateSession',
      });
      return;
    }

    this.currentSession = {
      ...this.currentSession,
      ...updates,
      ...(updates.transcriptEvents
        ? { transcriptEvents: structuredClone(updates.transcriptEvents) }
        : {}),
      ...(updates.markedIssues
        ? { markedIssues: structuredClone(updates.markedIssues) }
        : {}),
      ...(updates.markedIssueAccumulator
        ? { markedIssueAccumulator: structuredClone(updates.markedIssueAccumulator) }
        : {}),
      lastSaveTime: Date.now(),
      metadata: {
        ...this.currentSession.metadata,
        sessionDurationMs: Date.now() - this.currentSession.startTime,
      },
    };
  }

  /**
   * Stop tracking the current session (normal completion)
   */
  stopTracking(): void {
    errorHandler.log('info', 'Stopping session tracking', {
      component: 'CrashRecovery',
      operation: 'stopTracking',
      data: { sessionId: this.currentSession?.id },
    });

    this.stopAutoSave();
    this.currentSession = null;
    getCrashRecoveryStore().delete('activeSession');
  }

  // ==========================================================================
  // Auto-Save
  // ==========================================================================

  /**
   * Start the auto-save interval
   */
  private startAutoSave(intervalMs: number): void {
    this.stopAutoSave();

    this.saveInterval = setInterval(() => {
      if (this.currentSession) {
        try {
          this.currentSession.lastSaveTime = Date.now();
          this.currentSession.metadata.sessionDurationMs =
            Date.now() - this.currentSession.startTime;
          getCrashRecoveryStore().set('activeSession', this.currentSession);

          errorHandler.log('debug', 'Auto-saved session state', {
            component: 'CrashRecovery',
            operation: 'autoSave',
            data: {
              sessionId: this.currentSession.id,
              feedbackCount: this.currentSession.feedbackItems.length,
            },
          });
        } catch (err) {
          console.error('[CrashRecovery] Auto-save failed:', err);
        }
      }
    }, intervalMs);
  }

  /**
   * Stop the auto-save interval
   */
  private stopAutoSave(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
  }

  // ==========================================================================
  // Recovery
  // ==========================================================================

  /**
   * Check if there's an incomplete session to recover
   */
  getIncompleteSession(): RecoverableSession | null {
    const session = getCrashRecoveryStore().get('activeSession');
    return session ? structuredClone(session) : null;
  }

  /**
   * Discard an incomplete session
   */
  discardIncompleteSession(): void {
    const session = getCrashRecoveryStore().get('activeSession');
    if (session) {
      errorHandler.log('info', 'Discarding incomplete session', {
        component: 'CrashRecovery',
        operation: 'discardIncompleteSession',
        data: {
          sessionId: session.id,
          feedbackCount: session.feedbackItems.length,
        },
      });
    }
    getCrashRecoveryStore().delete('activeSession');
  }

  /**
   * Notify renderer about incomplete session
   */
  notifyRendererOfIncompleteSession(): void {
    const incomplete = this.getIncompleteSession();
    if (incomplete && this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(
        IPC_CHANNELS.CRASH_RECOVERY_FOUND,
        {
          session: {
            ...incomplete,
            markedIssueCount: incomplete.markedIssues?.length ?? 0,
            pendingMarkedIssue: Boolean(incomplete.markedIssueAccumulator?.active),
          },
        }
      );
    }
  }

  // ==========================================================================
  // Crash Logging
  // ==========================================================================

  /**
   * Log a crash for debugging
   */
  private async logCrash(
    error: Error,
    context?: Record<string, unknown>
  ): Promise<void> {
    const crashLog: CrashLog = {
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      sessionId: this.currentSession?.id,
      context,
    };

    // Store in electron-store
    const settings = this.getSettings();
    const logs = getCrashRecoveryStore().get('crashLogs') || [];
    logs.push(crashLog);

    // Keep only the most recent logs
    while (logs.length > settings.maxCrashLogs) {
      logs.shift();
    }

    getCrashRecoveryStore().set('crashLogs', logs);

    // Also write to file for external access
    await this.writeCrashLogToFile(crashLog);
  }

  /**
   * Synchronous crash logging for use in uncaughtException handlers.
   * Uses writeFileSync to ensure data is written before process exits.
   */
  private logCrashSync(
    error: Error,
    context?: Record<string, unknown>
  ): void {
    const crashLog: CrashLog = {
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      sessionId: this.currentSession?.id,
      context,
    };

    // Store in electron-store (already synchronous)
    try {
      const settings = this.getSettings();
      const logs = getCrashRecoveryStore().get('crashLogs') || [];
      logs.push(crashLog);
      while (logs.length > settings.maxCrashLogs) {
        logs.shift();
      }
      getCrashRecoveryStore().set('crashLogs', logs);
    } catch {
      // Ignore store errors in crash handler
    }

    // Write to file synchronously
    try {
      const logDir = path.dirname(this.crashLogPath);
      if (!fsSync.existsSync(logDir)) {
        fsSync.mkdirSync(logDir, { recursive: true });
      }
      let logs: CrashLog[] = [];
      try {
        const existing = fsSync.readFileSync(this.crashLogPath, 'utf-8');
        logs = JSON.parse(existing);
      } catch {
        // File doesn't exist or is invalid
      }
      logs.push(crashLog);
      while (logs.length > 50) {
        logs.shift();
      }
      fsSync.writeFileSync(this.crashLogPath, JSON.stringify(logs, null, 2));
    } catch {
      // Ignore file write errors in crash handler
    }
  }

  /**
   * Write crash log to JSON file
   */
  private async writeCrashLogToFile(crashLog: CrashLog): Promise<void> {
    try {
      const logDir = path.dirname(this.crashLogPath);
      await fs.mkdir(logDir, { recursive: true });

      let logs: CrashLog[] = [];
      try {
        const existing = await fs.readFile(this.crashLogPath, 'utf-8');
        logs = JSON.parse(existing);
      } catch {
        // File doesn't exist or is invalid
      }

      logs.push(crashLog);

      // Keep last 50 crash logs
      while (logs.length > 50) {
        logs.shift();
      }

      await fs.writeFile(this.crashLogPath, JSON.stringify(logs, null, 2));
    } catch (err) {
      console.error('[CrashRecovery] Failed to write crash log to file:', err);
    }
  }

  /**
   * Migrate crash logs from file to store on startup
   */
  private async migrateCrashLogsFromFile(): Promise<void> {
    try {
      const content = await fs.readFile(this.crashLogPath, 'utf-8');
      const fileLogs: CrashLog[] = JSON.parse(content);
      const storeLogs = getCrashRecoveryStore().get('crashLogs') || [];

      // Merge logs, avoiding duplicates by timestamp
      const existingTimestamps = new Set(storeLogs.map((l) => l.timestamp));
      const newLogs = fileLogs.filter(
        (l) => !existingTimestamps.has(l.timestamp)
      );

      if (newLogs.length > 0) {
        const merged = [...storeLogs, ...newLogs].sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        // Keep only the most recent
        const settings = this.getSettings();
        while (merged.length > settings.maxCrashLogs) {
          merged.shift();
        }

        getCrashRecoveryStore().set('crashLogs', merged);
      }
    } catch {
      // File doesn't exist or is invalid - that's fine
    }
  }

  /**
   * Get recent crash logs
   */
  getCrashLogs(limit: number = 10): CrashLog[] {
    const logs = getCrashRecoveryStore().get('crashLogs') || [];
    return logs.slice(-limit);
  }

  /**
   * Clear crash logs
   */
  async clearCrashLogs(): Promise<void> {
    try {
      await fs.unlink(this.crashLogPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    getCrashRecoveryStore().set('crashLogs', []);
  }

  // ==========================================================================
  // Anonymous Crash Reporting
  // ==========================================================================

  /**
   * Prepare crash report for anonymous submission
   * Strips any potentially identifying information
   */
  prepareCrashReport(crashLog: CrashLog): Record<string, unknown> {
    return {
      timestamp: crashLog.timestamp,
      error: {
        name: crashLog.error.name,
        message: this.sanitizeErrorMessage(crashLog.error.message),
        // Stack trace without file paths
        stackSummary: this.sanitizeStackTrace(crashLog.error.stack),
      },
      appVersion: crashLog.appVersion,
      platform: crashLog.platform,
      arch: crashLog.arch,
      // Don't include session ID or context
    };
  }

  /**
   * Sanitize error message to remove potentially identifying info
   */
  private sanitizeErrorMessage(message: string): string {
    // Remove file paths
    let sanitized = message.replace(/\/Users\/[^/\s]+/g, '/Users/[REDACTED]');
    sanitized = sanitized.replace(/C:\\Users\\[^\\]+/g, 'C:\\Users\\[REDACTED]');

    // Remove potential API keys
    sanitized = sanitized.replace(
      /[a-zA-Z0-9]{32,}/g,
      '[REDACTED_KEY]'
    );

    return sanitized;
  }

  /**
   * Sanitize stack trace to remove file paths
   */
  private sanitizeStackTrace(stack?: string): string[] {
    if (!stack) return [];

    return stack
      .split('\n')
      .slice(0, 10) // Keep only first 10 lines
      .map((line) => {
        // Remove file paths, keep function names and line numbers
        return line
          .replace(/\/Users\/[^/\s]+/g, '')
          .replace(/C:\\Users\\[^\\]+/g, '')
          .trim();
      })
      .filter((line) => line.length > 0);
  }

  // ==========================================================================
  // Settings
  // ==========================================================================

  /**
   * Get crash recovery settings
   */
  getSettings(): CrashRecoverySettings {
    return getCrashRecoveryStore().get('settings') || DEFAULT_SETTINGS;
  }

  /**
   * Update crash recovery settings
   */
  updateSettings(updates: Partial<CrashRecoverySettings>): void {
    const current = this.getSettings();
    const newSettings = { ...current, ...updates };
    getCrashRecoveryStore().set('settings', newSettings);

    // Apply changes to active session if needed
    if (
      this.currentSession &&
      updates.autoSaveIntervalMs !== undefined
    ) {
      this.stopAutoSave();
      if (newSettings.enableAutoSave) {
        this.startAutoSave(newSettings.autoSaveIntervalMs);
      }
    }
  }

  // ==========================================================================
  // Window Management
  // ==========================================================================

  /**
   * Set the main window for IPC communication
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopAutoSave();
    this.currentSession = null;
    this.mainWindow = null;
    this.isInitialized = false;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const crashRecovery = new CrashRecoveryManager();
export default CrashRecoveryManager;
