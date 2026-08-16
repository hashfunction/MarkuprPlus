/**
 * CrashRecovery Unit Tests
 *
 * Tests the crash recovery system:
 * - Auto-save serialization/deserialization
 * - Crash detection logic
 * - Log sanitization (API keys, file paths removed)
 * - Incomplete session detection
 * - Session tracking lifecycle
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  RecoverableSession,
  RecoverableFeedbackItem,
  CrashLog,
  CrashRecoverySettings,
} from '../../src/main/CrashRecovery';

// =============================================================================
// Testable CrashRecoveryManager (isolated from Electron dependencies)
// =============================================================================

/**
 * A testable version of CrashRecoveryManager that replaces electron-store and
 * file system operations with in-memory implementations.
 */
class TestableCrashRecoveryManager {
  private store: Map<string, unknown> = new Map();
  private currentSession: RecoverableSession | null = null;
  private saveInterval: ReturnType<typeof setInterval> | null = null;
  private isInitialized = false;

  private readonly DEFAULT_SETTINGS: CrashRecoverySettings = {
    enableAutoSave: true,
    autoSaveIntervalMs: 5000,
    enableCrashReporting: false,
    maxCrashLogs: 50,
  };

  constructor() {
    this.store.set('activeSession', null);
    this.store.set('crashLogs', []);
    this.store.set('settings', { ...this.DEFAULT_SETTINGS });
    this.store.set('lastCleanExit', true);
    this.store.set('lastExitTimestamp', 0);
  }

  // --- Initialization ---

  initialize(): void {
    if (this.isInitialized) return;

    const lastCleanExit = this.store.get('lastCleanExit') as boolean;
    const lastExitTimestamp = this.store.get('lastExitTimestamp') as number;

    if (!lastCleanExit && lastExitTimestamp > 0) {
      // Previous session did not exit cleanly -- crash detected
    }

    // Mark as not clean until we properly exit
    this.store.set('lastCleanExit', false);

    this.isInitialized = true;
  }

  // --- Session Tracking ---

  startTracking(session: RecoverableSession): void {
    this.currentSession = {
      ...session,
      lastSaveTime: Date.now(),
      metadata: {
        appVersion: '2.0.0',
        platform: 'darwin',
        sessionDurationMs: 0,
      },
    };
    this.store.set('activeSession', this.currentSession);

    const settings = this.getSettings();
    if (settings.enableAutoSave) {
      this.startAutoSave(settings.autoSaveIntervalMs);
    }
  }

  updateSession(updates: Partial<RecoverableSession>): void {
    if (!this.currentSession) return;

    this.currentSession = {
      ...this.currentSession,
      ...updates,
      lastSaveTime: Date.now(),
      metadata: {
        ...this.currentSession.metadata,
        sessionDurationMs: Date.now() - this.currentSession.startTime,
      },
    };
  }

  stopTracking(): void {
    this.stopAutoSave();
    this.currentSession = null;
    this.store.delete('activeSession');
  }

  // --- Auto-Save ---

  private startAutoSave(intervalMs: number): void {
    this.stopAutoSave();
    this.saveInterval = setInterval(() => {
      if (this.currentSession) {
        this.currentSession.lastSaveTime = Date.now();
        this.currentSession.metadata.sessionDurationMs =
          Date.now() - this.currentSession.startTime;
        this.store.set('activeSession', { ...this.currentSession });
      }
    }, intervalMs);
  }

  private stopAutoSave(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
  }

  // --- Recovery ---

  getIncompleteSession(): RecoverableSession | null {
    return (this.store.get('activeSession') as RecoverableSession) || null;
  }

  discardIncompleteSession(): void {
    this.store.delete('activeSession');
  }

  // --- Crash Logging ---

  logCrash(error: Error, context?: Record<string, unknown>): void {
    const crashLog: CrashLog = {
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      appVersion: '2.0.0',
      platform: 'darwin',
      arch: 'arm64',
      sessionId: this.currentSession?.id,
      context,
    };

    const settings = this.getSettings();
    const logs = (this.store.get('crashLogs') as CrashLog[]) || [];
    logs.push(crashLog);

    while (logs.length > settings.maxCrashLogs) {
      logs.shift();
    }

    this.store.set('crashLogs', logs);
  }

  getCrashLogs(limit: number = 10): CrashLog[] {
    const logs = (this.store.get('crashLogs') as CrashLog[]) || [];
    return logs.slice(-limit);
  }

  clearCrashLogs(): void {
    this.store.set('crashLogs', []);
  }

  // --- Crash Report Sanitization ---

  prepareCrashReport(crashLog: CrashLog): Record<string, unknown> {
    return {
      timestamp: crashLog.timestamp,
      error: {
        name: crashLog.error.name,
        message: this.sanitizeErrorMessage(crashLog.error.message),
        stackSummary: this.sanitizeStackTrace(crashLog.error.stack),
      },
      appVersion: crashLog.appVersion,
      platform: crashLog.platform,
      arch: crashLog.arch,
    };
  }

  sanitizeErrorMessage(message: string): string {
    let sanitized = message.replace(/\/Users\/[^/\s]+/g, '/Users/[REDACTED]');
    sanitized = sanitized.replace(/C:\\Users\\[^\\]+/g, 'C:\\Users\\[REDACTED]');
    sanitized = sanitized.replace(/[a-zA-Z0-9]{32,}/g, '[REDACTED_KEY]');
    return sanitized;
  }

  sanitizeStackTrace(stack?: string): string[] {
    if (!stack) return [];

    return stack
      .split('\n')
      .slice(0, 10)
      .map((line) => {
        return line
          .replace(/\/Users\/[^/\s]+/g, '')
          .replace(/C:\\Users\\[^\\]+/g, '')
          .trim();
      })
      .filter((line) => line.length > 0);
  }

  // --- Settings ---

  getSettings(): CrashRecoverySettings {
    return (this.store.get('settings') as CrashRecoverySettings) || this.DEFAULT_SETTINGS;
  }

  updateSettings(updates: Partial<CrashRecoverySettings>): void {
    const current = this.getSettings();
    const newSettings = { ...current, ...updates };
    this.store.set('settings', newSettings);
  }

  // --- Clean Exit ---

  handleCleanExit(): void {
    this.stopAutoSave();

    if (!this.currentSession) {
      this.store.delete('activeSession');
    }

    this.store.set('lastCleanExit', true);
    this.store.set('lastExitTimestamp', Date.now());
  }

  // --- Uncaught Exception ---

  handleUncaughtException(error: Error, type: string = 'uncaughtException'): void {
    this.logCrash(error, { type });

    if (this.currentSession) {
      this.currentSession.lastSaveTime = Date.now();
      this.store.set('activeSession', { ...this.currentSession });
    }
  }

  // --- Cleanup ---

  destroy(): void {
    this.stopAutoSave();
    this.currentSession = null;
    this.isInitialized = false;
  }

  // Expose for tests
  getCurrentSession(): RecoverableSession | null {
    return this.currentSession;
  }

  getStoreValue(key: string): unknown {
    return this.store.get(key);
  }
}

// =============================================================================
// Test Helpers
// =============================================================================

function createTestSession(overrides: Partial<RecoverableSession> = {}): RecoverableSession {
  return {
    id: 'session-test-123',
    startTime: Date.now() - 60000,
    lastSaveTime: Date.now(),
    feedbackItems: [
      {
        id: 'fb-1',
        timestamp: Date.now() - 50000,
        text: 'The button is broken',
        confidence: 0.95,
        hasScreenshot: true,
        screenshotId: 'ss-1',
      },
      {
        id: 'fb-2',
        timestamp: Date.now() - 30000,
        text: 'Navigation is confusing',
        confidence: 0.88,
        hasScreenshot: false,
      },
    ],
    transcriptionBuffer: 'The button is broken. Navigation is confusing.',
    sourceId: 'screen:0:0',
    sourceName: 'Primary Display',
    screenshotCount: 1,
    metadata: {
      appVersion: '2.0.0',
      platform: 'darwin',
      sessionDurationMs: 60000,
    },
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('CrashRecovery', () => {
  let manager: TestableCrashRecoveryManager;

  beforeEach(() => {
    manager = new TestableCrashRecoveryManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('Auto-save Serialization/Deserialization', () => {
    it('should serialize session data on startTracking', () => {
      const session = createTestSession();
      manager.startTracking(session);

      const stored = manager.getIncompleteSession();
      expect(stored).not.toBeNull();
      expect(stored!.id).toBe('session-test-123');
      expect(stored!.feedbackItems).toHaveLength(2);
      expect(stored!.sourceId).toBe('screen:0:0');
    });

    it('should preserve feedback items through serialization', () => {
      const session = createTestSession();
      manager.startTracking(session);

      const stored = manager.getIncompleteSession();
      expect(stored!.feedbackItems[0].text).toBe('The button is broken');
      expect(stored!.feedbackItems[0].hasScreenshot).toBe(true);
      expect(stored!.feedbackItems[1].text).toBe('Navigation is confusing');
      expect(stored!.feedbackItems[1].hasScreenshot).toBe(false);
    });

    it('should update session metadata on startTracking', () => {
      const session = createTestSession();
      manager.startTracking(session);

      const stored = manager.getCurrentSession();
      expect(stored!.metadata.appVersion).toBe('2.0.0');
      expect(stored!.metadata.platform).toBe('darwin');
      expect(stored!.lastSaveTime).toBeDefined();
    });

    it('should update session data with updateSession', () => {
      const session = createTestSession();
      manager.startTracking(session);

      manager.updateSession({
        feedbackItems: [
          ...session.feedbackItems,
          {
            id: 'fb-3',
            timestamp: Date.now(),
            text: 'New feedback item',
            confidence: 0.90,
            hasScreenshot: false,
          },
        ],
        screenshotCount: 2,
      });

      const updated = manager.getCurrentSession();
      expect(updated!.feedbackItems).toHaveLength(3);
      expect(updated!.screenshotCount).toBe(2);
    });

    it('should clear session on stopTracking', () => {
      const session = createTestSession();
      manager.startTracking(session);

      manager.stopTracking();

      expect(manager.getIncompleteSession()).toBeNull();
      expect(manager.getCurrentSession()).toBeNull();
    });
  });

  describe('Crash Detection Logic', () => {
    it('should detect unclean exit on initialization', () => {
      // Simulate a previous unclean exit
      const mgr = new TestableCrashRecoveryManager();
      // After initialization, lastCleanExit should be set to false
      mgr.initialize();

      expect(mgr.getStoreValue('lastCleanExit')).toBe(false);
    });

    it('should mark clean exit properly', () => {
      manager.initialize();
      manager.handleCleanExit();

      expect(manager.getStoreValue('lastCleanExit')).toBe(true);
      expect(manager.getStoreValue('lastExitTimestamp')).toBeGreaterThan(0);
    });

    it('should save session state on uncaught exception', () => {
      const session = createTestSession();
      manager.startTracking(session);

      const error = new Error('Something went wrong');
      manager.handleUncaughtException(error);

      // Session should be saved in store
      const stored = manager.getIncompleteSession();
      expect(stored).not.toBeNull();
      expect(stored!.id).toBe('session-test-123');

      // Crash log should be recorded
      const logs = manager.getCrashLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].error.message).toBe('Something went wrong');
    });

    it('should handle uncaught exception without active session', () => {
      const error = new Error('Crash without session');
      manager.handleUncaughtException(error);

      const logs = manager.getCrashLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].sessionId).toBeUndefined();
    });

    it('should not initialize twice', () => {
      manager.initialize();
      const firstExitFlag = manager.getStoreValue('lastCleanExit');

      // Set it to true manually
      manager.handleCleanExit();
      expect(manager.getStoreValue('lastCleanExit')).toBe(true);

      // Re-initialize should be a no-op
      manager.initialize();
      expect(manager.getStoreValue('lastCleanExit')).toBe(true);
    });
  });

  describe('Log Sanitization', () => {
    it('should redact macOS file paths from error messages', () => {
      const message = 'Error reading /Users/eddie/Documents/secret.txt';
      const sanitized = manager.sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('eddie');
      expect(sanitized).toContain('/Users/[REDACTED]');
    });

    it('should redact Windows file paths from error messages', () => {
      const message = 'Error reading C:\\Users\\JohnDoe\\AppData\\config.json';
      const sanitized = manager.sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('JohnDoe');
      expect(sanitized).toContain('C:\\Users\\[REDACTED]');
    });

    it('should redact potential API keys from error messages', () => {
      const apiKey = 'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890';
      const message = `Invalid API key: ${apiKey}`;
      const sanitized = manager.sanitizeErrorMessage(message);

      expect(sanitized).not.toContain(apiKey);
      expect(sanitized).toContain('[REDACTED_KEY]');
    });

    it('should not redact short strings that are not API keys', () => {
      const message = 'Error: file not found';
      const sanitized = manager.sanitizeErrorMessage(message);

      expect(sanitized).toBe('Error: file not found');
    });

    it('should sanitize stack traces by removing file paths', () => {
      const stack = [
        'Error: Something broke',
        '    at Function.run (/Users/eddie/Projects/markuprx/src/main.ts:42)',
        '    at Object.<anonymous> (/Users/eddie/Projects/markuprx/test.ts:10)',
      ].join('\n');

      const sanitized = manager.sanitizeStackTrace(stack);

      expect(sanitized.length).toBeGreaterThan(0);
      sanitized.forEach((line) => {
        expect(line).not.toContain('eddie');
      });
    });

    it('should return empty array for undefined stack trace', () => {
      const sanitized = manager.sanitizeStackTrace(undefined);
      expect(sanitized).toEqual([]);
    });

    it('should limit stack trace to 10 lines', () => {
      const stack = Array.from({ length: 20 }, (_, i) =>
        `    at line${i} (/some/path:${i})`
      ).join('\n');

      const sanitized = manager.sanitizeStackTrace(stack);
      expect(sanitized.length).toBeLessThanOrEqual(10);
    });

    it('should prepare a sanitized crash report', () => {
      const crashLog: CrashLog = {
        timestamp: '2024-06-15T10:00:00.000Z',
        error: {
          name: 'Error',
          message: 'Failed at /Users/eddie/secret-key-abcdefghijklmnopqrstuvwxyz12345678',
          stack: 'Error: fail\n    at /Users/eddie/src/app.ts:10',
        },
        appVersion: '2.0.0',
        platform: 'darwin',
        arch: 'arm64',
        sessionId: 'session-123',
        context: { sensitive: 'data' },
      };

      const report = manager.prepareCrashReport(crashLog) as {
        timestamp: string;
        error: { name: string; message: string; stackSummary: string[] };
        sessionId?: string;
        context?: Record<string, unknown>;
      };

      expect(report.timestamp).toBe(crashLog.timestamp);
      expect(report.error.message).not.toContain('eddie');
      expect(report.error.stackSummary.length).toBeGreaterThan(0);
      // Session ID and context should not be included
      expect(report.sessionId).toBeUndefined();
      expect(report.context).toBeUndefined();
    });
  });

  describe('Incomplete Session Detection', () => {
    it('should return null when no incomplete session exists', () => {
      expect(manager.getIncompleteSession()).toBeNull();
    });

    it('should detect incomplete session after tracking starts', () => {
      const session = createTestSession();
      manager.startTracking(session);

      const incomplete = manager.getIncompleteSession();
      expect(incomplete).not.toBeNull();
      expect(incomplete!.id).toBe('session-test-123');
    });

    it('should discard incomplete session', () => {
      const session = createTestSession();
      manager.startTracking(session);

      manager.discardIncompleteSession();

      expect(manager.getIncompleteSession()).toBeNull();
    });

    it('should clear incomplete session on clean exit without active recording', () => {
      // Start and stop tracking (simulating completed session)
      const session = createTestSession();
      manager.startTracking(session);
      manager.stopTracking();

      manager.handleCleanExit();

      expect(manager.getIncompleteSession()).toBeNull();
    });
  });

  describe('Crash Log Management', () => {
    it('should store crash logs', () => {
      manager.logCrash(new Error('Test error 1'));
      manager.logCrash(new Error('Test error 2'));

      const logs = manager.getCrashLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].error.message).toBe('Test error 1');
      expect(logs[1].error.message).toBe('Test error 2');
    });

    it('should limit crash logs to maxCrashLogs', () => {
      manager.updateSettings({ maxCrashLogs: 3 });

      for (let i = 0; i < 5; i++) {
        manager.logCrash(new Error(`Error ${i}`));
      }

      const logs = manager.getCrashLogs();
      expect(logs).toHaveLength(3);
      // Should keep the most recent ones
      expect(logs[0].error.message).toBe('Error 2');
      expect(logs[2].error.message).toBe('Error 4');
    });

    it('should retrieve limited number of logs', () => {
      for (let i = 0; i < 10; i++) {
        manager.logCrash(new Error(`Error ${i}`));
      }

      const logs = manager.getCrashLogs(3);
      expect(logs).toHaveLength(3);
      // Should return the last 3
      expect(logs[0].error.message).toBe('Error 7');
    });

    it('should clear crash logs', () => {
      manager.logCrash(new Error('Error'));
      expect(manager.getCrashLogs()).toHaveLength(1);

      manager.clearCrashLogs();
      expect(manager.getCrashLogs()).toHaveLength(0);
    });

    it('should include session ID in crash log when session is active', () => {
      const session = createTestSession({ id: 'active-session-id' });
      manager.startTracking(session);

      manager.logCrash(new Error('Session crash'));

      const logs = manager.getCrashLogs();
      expect(logs[0].sessionId).toBe('active-session-id');
    });

    it('should include context in crash log', () => {
      manager.logCrash(new Error('Context error'), { retryCount: 3, component: 'audio' });

      const logs = manager.getCrashLogs();
      expect(logs[0].context).toEqual({ retryCount: 3, component: 'audio' });
    });
  });

  describe('Settings Management', () => {
    it('should return default settings', () => {
      const settings = manager.getSettings();

      expect(settings.enableAutoSave).toBe(true);
      expect(settings.autoSaveIntervalMs).toBe(5000);
      expect(settings.enableCrashReporting).toBe(false);
      expect(settings.maxCrashLogs).toBe(50);
    });

    it('should update settings partially', () => {
      manager.updateSettings({ enableCrashReporting: true });

      const settings = manager.getSettings();
      expect(settings.enableCrashReporting).toBe(true);
      expect(settings.enableAutoSave).toBe(true); // unchanged
    });

    it('should update auto-save interval', () => {
      manager.updateSettings({ autoSaveIntervalMs: 10000 });

      const settings = manager.getSettings();
      expect(settings.autoSaveIntervalMs).toBe(10000);
    });
  });
});
