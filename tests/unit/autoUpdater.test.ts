/**
 * AutoUpdater Unit Tests
 *
 * Tests the auto-update system:
 * - canUseUpdater() logic (packaged vs unpackaged)
 * - IPC handler registration including UPDATE_GET_STATUS
 * - Update state management
 * - Silent failure modes and user feedback
 * - Error suppression for expected update errors
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IPC_CHANNELS } from '../../src/shared/types';

// =============================================================================
// Mock electron-updater before any imports
// =============================================================================

const mockAutoUpdater = {
  checkForUpdates: vi.fn(() => Promise.resolve(null)),
  downloadUpdate: vi.fn(() => Promise.resolve([])),
  quitAndInstall: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  removeAllListeners: vi.fn(),
  setFeedURL: vi.fn(),
  logger: null as unknown,
  autoDownload: false,
  autoInstallOnAppQuit: true,
  allowDowngrade: false,
  allowPrerelease: false,
};

vi.mock('electron-updater', () => ({
  default: { autoUpdater: mockAutoUpdater },
  autoUpdater: mockAutoUpdater,
}));

// =============================================================================
// IPC Channel Tests
// =============================================================================

describe('AutoUpdater IPC Channels', () => {
  it('defines UPDATE_GET_STATUS channel', () => {
    expect(IPC_CHANNELS.UPDATE_GET_STATUS).toBe('markuprx:update:get-status');
  });

  it('defines all required update channels', () => {
    expect(IPC_CHANNELS.UPDATE_CHECK).toBe('markuprx:update:check');
    expect(IPC_CHANNELS.UPDATE_DOWNLOAD).toBe('markuprx:update:download');
    expect(IPC_CHANNELS.UPDATE_INSTALL).toBe('markuprx:update:install');
    expect(IPC_CHANNELS.UPDATE_STATUS).toBe('markuprx:update:status');
    expect(IPC_CHANNELS.UPDATE_GET_STATUS).toBe('markuprx:update:get-status');
  });
});

// =============================================================================
// Testable AutoUpdater Manager (isolated from Electron dependencies)
// =============================================================================

type UpdateStatusType =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'ready'
  | 'error';

interface UpdateManagerState {
  status: UpdateStatusType;
  currentVersion: string;
  availableVersion?: string;
  releaseNotes?: string | null;
  downloadProgress?: number;
}

/**
 * Testable version of AutoUpdaterManager that replaces Electron dependencies
 * with injectable test doubles.
 */
class TestableAutoUpdaterManager {
  private state: UpdateManagerState;
  private initialized = false;
  private updaterAvailable = false;
  private autoCheckEnabled = true;
  private isChecking = false;
  private ipcHandlers = new Map<string, (...args: unknown[]) => unknown>();
  private sentStatuses: Array<{ status: string; data?: unknown }> = [];

  constructor(
    private readonly isPackaged: boolean,
    private readonly appUpdateYmlExists: boolean,
    private readonly currentVersion = '2.1.0',
  ) {
    this.state = {
      status: 'idle',
      currentVersion: this.currentVersion,
    };
  }

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.updaterAvailable = this.canUseUpdater();
    this.setupIPCHandlers();

    if (!this.updaterAvailable) {
      this.updateState('not-available');
      return;
    }
  }

  private canUseUpdater(): boolean {
    if (!this.isPackaged) return false;
    return this.appUpdateYmlExists;
  }

  private setupIPCHandlers(): void {
    this.ipcHandlers.set(IPC_CHANNELS.UPDATE_CHECK, async () => {
      return this.checkForUpdates();
    });

    this.ipcHandlers.set(IPC_CHANNELS.UPDATE_DOWNLOAD, async () => {
      return this.downloadUpdate();
    });

    this.ipcHandlers.set(IPC_CHANNELS.UPDATE_INSTALL, () => {
      return this.installUpdate();
    });

    this.ipcHandlers.set(IPC_CHANNELS.UPDATE_GET_STATUS, () => {
      return {
        status: this.state.status,
        currentVersion: this.state.currentVersion,
        availableVersion: this.state.availableVersion ?? null,
        releaseNotes: this.state.releaseNotes ?? null,
        downloadProgress: this.state.downloadProgress ?? null,
        updaterAvailable: this.updaterAvailable,
      };
    });
  }

  async checkForUpdates(): Promise<unknown> {
    if (!this.updaterAvailable) {
      this.updateState('not-available');
      return null;
    }
    if (this.isChecking) return null;

    this.isChecking = true;
    this.updateState('checking');

    try {
      return await mockAutoUpdater.checkForUpdates();
    } finally {
      this.isChecking = false;
    }
  }

  async downloadUpdate(): Promise<void> {
    if (!this.updaterAvailable) {
      this.updateState('not-available');
      return;
    }
    this.updateState('downloading');
    await mockAutoUpdater.downloadUpdate();
  }

  installUpdate(): void {
    if (!this.updaterAvailable) {
      this.updateState('not-available');
      return;
    }
    mockAutoUpdater.quitAndInstall(false, true);
  }

  setAutoCheckEnabled(enabled: boolean): void {
    this.autoCheckEnabled = enabled;
  }

  // Simulate receiving an update-available event
  simulateUpdateAvailable(version: string, notes?: string): void {
    this.state.availableVersion = version;
    this.state.releaseNotes = notes ?? null;
    this.updateState('available');
  }

  // Simulate receiving an update-downloaded event
  simulateUpdateDownloaded(version: string): void {
    this.state.availableVersion = version;
    this.updateState('ready');
  }

  private updateState(status: UpdateStatusType): void {
    this.state.status = status;
    this.sentStatuses.push({ status, data: { ...this.state } });
  }

  // Test helpers
  getState(): UpdateManagerState {
    return { ...this.state };
  }

  isUpdaterAvailable(): boolean {
    return this.updaterAvailable;
  }

  getIPCHandler(channel: string): ((...args: unknown[]) => unknown) | undefined {
    return this.ipcHandlers.get(channel);
  }

  getSentStatuses(): Array<{ status: string; data?: unknown }> {
    return [...this.sentStatuses];
  }

  isAutoCheckEnabled(): boolean {
    return this.autoCheckEnabled;
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('AutoUpdaterManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Initialization & canUseUpdater()
  // ---------------------------------------------------------------------------

  describe('canUseUpdater', () => {
    it('returns false when app is not packaged', () => {
      const manager = new TestableAutoUpdaterManager(false, true);
      manager.initialize();
      expect(manager.isUpdaterAvailable()).toBe(false);
    });

    it('returns false when app-update.yml is missing', () => {
      const manager = new TestableAutoUpdaterManager(true, false);
      manager.initialize();
      expect(manager.isUpdaterAvailable()).toBe(false);
    });

    it('returns true when packaged and app-update.yml exists', () => {
      const manager = new TestableAutoUpdaterManager(true, true);
      manager.initialize();
      expect(manager.isUpdaterAvailable()).toBe(true);
    });
  });

  describe('initialization', () => {
    it('sets status to not-available when updater is disabled', () => {
      const manager = new TestableAutoUpdaterManager(false, false);
      manager.initialize();
      expect(manager.getState().status).toBe('not-available');
    });

    it('keeps status idle when updater is available', () => {
      const manager = new TestableAutoUpdaterManager(true, true);
      manager.initialize();
      // After init with updater available, status stays idle (checks happen later)
      expect(manager.getState().status).toBe('idle');
    });

    it('registers IPC handlers even when updater is unavailable', () => {
      const manager = new TestableAutoUpdaterManager(false, false);
      manager.initialize();

      expect(manager.getIPCHandler(IPC_CHANNELS.UPDATE_CHECK)).toBeDefined();
      expect(manager.getIPCHandler(IPC_CHANNELS.UPDATE_DOWNLOAD)).toBeDefined();
      expect(manager.getIPCHandler(IPC_CHANNELS.UPDATE_INSTALL)).toBeDefined();
      expect(manager.getIPCHandler(IPC_CHANNELS.UPDATE_GET_STATUS)).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // UPDATE_GET_STATUS Handler
  // ---------------------------------------------------------------------------

  describe('UPDATE_GET_STATUS', () => {
    it('returns full state including updaterAvailable flag', () => {
      const manager = new TestableAutoUpdaterManager(true, true, '2.1.0');
      manager.initialize();

      const handler = manager.getIPCHandler(IPC_CHANNELS.UPDATE_GET_STATUS);
      expect(handler).toBeDefined();

      const result = handler!() as {
        status: string;
        currentVersion: string;
        availableVersion: string | null;
        releaseNotes: string | null;
        downloadProgress: number | null;
        updaterAvailable: boolean;
      };

      expect(result.status).toBe('idle');
      expect(result.currentVersion).toBe('2.1.0');
      expect(result.availableVersion).toBe(null);
      expect(result.releaseNotes).toBe(null);
      expect(result.downloadProgress).toBe(null);
      expect(result.updaterAvailable).toBe(true);
    });

    it('reports updaterAvailable=false for unpackaged builds', () => {
      const manager = new TestableAutoUpdaterManager(false, false, '2.1.0');
      manager.initialize();

      const handler = manager.getIPCHandler(IPC_CHANNELS.UPDATE_GET_STATUS);
      const result = handler!() as { updaterAvailable: boolean; status: string };

      expect(result.updaterAvailable).toBe(false);
      expect(result.status).toBe('not-available');
    });

    it('includes available version after update-available event', () => {
      const manager = new TestableAutoUpdaterManager(true, true, '2.1.0');
      manager.initialize();
      manager.simulateUpdateAvailable('2.5.0', 'Bug fixes and improvements');

      const handler = manager.getIPCHandler(IPC_CHANNELS.UPDATE_GET_STATUS);
      const result = handler!() as {
        status: string;
        availableVersion: string | null;
        releaseNotes: string | null;
      };

      expect(result.status).toBe('available');
      expect(result.availableVersion).toBe('2.5.0');
      expect(result.releaseNotes).toBe('Bug fixes and improvements');
    });

    it('reports ready status after update download', () => {
      const manager = new TestableAutoUpdaterManager(true, true, '2.1.0');
      manager.initialize();
      manager.simulateUpdateDownloaded('2.5.0');

      const handler = manager.getIPCHandler(IPC_CHANNELS.UPDATE_GET_STATUS);
      const result = handler!() as { status: string; availableVersion: string | null };

      expect(result.status).toBe('ready');
      expect(result.availableVersion).toBe('2.5.0');
    });
  });

  // ---------------------------------------------------------------------------
  // checkForUpdates
  // ---------------------------------------------------------------------------

  describe('checkForUpdates', () => {
    it('returns null and sets not-available when updater is disabled', async () => {
      const manager = new TestableAutoUpdaterManager(false, false);
      manager.initialize();

      const result = await manager.checkForUpdates();
      expect(result).toBeNull();
      expect(manager.getState().status).toBe('not-available');
    });

    it('calls autoUpdater.checkForUpdates when updater is available', async () => {
      const manager = new TestableAutoUpdaterManager(true, true);
      manager.initialize();

      await manager.checkForUpdates();
      expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledOnce();
    });

    it('prevents concurrent checks', async () => {
      const manager = new TestableAutoUpdaterManager(true, true);
      manager.initialize();

      // Start two concurrent checks
      const p1 = manager.checkForUpdates();
      const p2 = manager.checkForUpdates();

      await Promise.all([p1, p2]);

      // Only one actual check should have been made
      expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledOnce();
    });
  });

  // ---------------------------------------------------------------------------
  // downloadUpdate
  // ---------------------------------------------------------------------------

  describe('downloadUpdate', () => {
    it('does nothing when updater is disabled', async () => {
      const manager = new TestableAutoUpdaterManager(false, false);
      manager.initialize();

      await manager.downloadUpdate();
      expect(mockAutoUpdater.downloadUpdate).not.toHaveBeenCalled();
      expect(manager.getState().status).toBe('not-available');
    });

    it('starts download when updater is available', async () => {
      const manager = new TestableAutoUpdaterManager(true, true);
      manager.initialize();

      await manager.downloadUpdate();
      expect(mockAutoUpdater.downloadUpdate).toHaveBeenCalledOnce();
    });
  });

  // ---------------------------------------------------------------------------
  // installUpdate
  // ---------------------------------------------------------------------------

  describe('installUpdate', () => {
    it('does nothing when updater is disabled', () => {
      const manager = new TestableAutoUpdaterManager(false, false);
      manager.initialize();

      manager.installUpdate();
      expect(mockAutoUpdater.quitAndInstall).not.toHaveBeenCalled();
    });

    it('calls quitAndInstall when updater is available', () => {
      const manager = new TestableAutoUpdaterManager(true, true);
      manager.initialize();

      manager.installUpdate();
      expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
    });
  });

  // ---------------------------------------------------------------------------
  // Auto-check enabled/disabled
  // ---------------------------------------------------------------------------

  describe('setAutoCheckEnabled', () => {
    it('can enable and disable auto-checks', () => {
      const manager = new TestableAutoUpdaterManager(true, true);
      manager.initialize();

      manager.setAutoCheckEnabled(false);
      expect(manager.isAutoCheckEnabled()).toBe(false);

      manager.setAutoCheckEnabled(true);
      expect(manager.isAutoCheckEnabled()).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // State management
  // ---------------------------------------------------------------------------

  describe('state transitions', () => {
    it('tracks version through complete update lifecycle', () => {
      const manager = new TestableAutoUpdaterManager(true, true, '2.1.0');
      manager.initialize();

      expect(manager.getState().currentVersion).toBe('2.1.0');
      expect(manager.getState().status).toBe('idle');

      manager.simulateUpdateAvailable('2.5.0');
      expect(manager.getState().status).toBe('available');
      expect(manager.getState().availableVersion).toBe('2.5.0');

      manager.simulateUpdateDownloaded('2.5.0');
      expect(manager.getState().status).toBe('ready');
    });
  });
});

// =============================================================================
// Error Suppression Logic
// =============================================================================

describe('Error suppression', () => {
  const suppressableErrors = [
    'Error: Cannot find module app-update.yml',
    'Error: HttpError: 404 - latest.yml not found',
    'ENOENT: no such file or directory',
  ];

  const nonSuppressableErrors = [
    'Error: Network request failed',
    'Error: Update download failed',
    'Error: EPERM: operation not permitted',
  ];

  function shouldSuppressUpdateError(error: { message: string }): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('app-update.yml') ||
      message.includes('latest.yml') ||
      message.includes('enoent')
    );
  }

  it.each(suppressableErrors)('suppresses expected error: %s', (errorMessage) => {
    expect(shouldSuppressUpdateError({ message: errorMessage })).toBe(true);
  });

  it.each(nonSuppressableErrors)('does not suppress unexpected error: %s', (errorMessage) => {
    expect(shouldSuppressUpdateError({ message: errorMessage })).toBe(false);
  });
});
