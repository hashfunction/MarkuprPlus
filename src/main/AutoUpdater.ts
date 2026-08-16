/**
 * MarkuprX - Auto Updater Manager
 *
 * Handles automatic updates using electron-updater with GitHub Releases.
 *
 * Features:
 * - Check for updates on app launch
 * - Background download of updates
 * - Show release notes to user
 * - User-controlled restart for installation
 * - Download progress indicator
 *
 * The update flow:
 * 1. App launches -> check for updates
 * 2. Update available -> notify renderer with version & release notes
 * 3. User clicks "Download" -> download in background with progress
 * 4. Download complete -> notify renderer that update is ready
 * 5. User clicks "Restart Now" -> quit and install
 */

import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
type UpdateCheckResult = electronUpdater.UpdateCheckResult;
type UpdateInfo = electronUpdater.UpdateInfo;
type ProgressInfo = electronUpdater.ProgressInfo;
import { BrowserWindow, ipcMain, app } from 'electron';
import { existsSync } from 'fs';
import { join } from 'path';
import electronLog from 'electron-log';
const log = electronLog.default ?? electronLog;
import { IPC_CHANNELS, type UpdateStatusPayload, type UpdateStatusType } from '../shared/types';

// =============================================================================
// Types
// =============================================================================

interface UpdateManagerState {
  status: UpdateStatusType;
  currentVersion: string;
  availableVersion?: string;
  releaseNotes?: string | null;
  downloadProgress?: number;
}

interface UpdateCheckOptions {
  userInitiated?: boolean;
}

// =============================================================================
// AutoUpdater Manager Class
// =============================================================================

class AutoUpdaterManager {
  private mainWindow: BrowserWindow | null = null;
  private state: UpdateManagerState;
  private initialized = false;
  private updaterAvailable = false;
  private autoCheckEnabled = true;
  private isChecking = false;
  private activeCheckUserInitiated = false;
  private startupCheckTimer: NodeJS.Timeout | null = null;
  private periodicCheckTimer: NodeJS.Timeout | null = null;
  private readonly STARTUP_CHECK_DELAY_MS = 5000;
  private readonly PERIODIC_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

  constructor() {
    this.state = {
      status: 'idle',
      currentVersion: app.getVersion(),
    };
  }

  /**
   * Initialize the auto-updater with a reference to the main window
   */
  initialize(window: BrowserWindow): void {
    if (this.initialized) {
      console.warn('[AutoUpdater] Already initialized');
      return;
    }

    this.mainWindow = window;
    this.initialized = true;
    this.updaterAvailable = this.canUseUpdater();

    // Set up IPC handlers even if updater is unavailable, so renderer calls remain safe.
    this.setupIPCHandlers();

    if (!this.updaterAvailable) {
      log.info('[AutoUpdater] Updater disabled (unpackaged app or missing app-update.yml)');
      this.updateState('not-available');
      return;
    }

    // Configure logging
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    log.info('[AutoUpdater] Initializing auto-updater');

    // Configure update behavior
    autoUpdater.autoDownload = false; // Let user decide when to download
    autoUpdater.autoInstallOnAppQuit = true; // Install on quit if downloaded
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = false;

    // Set up event handlers
    this.setupEventHandlers();

    this.scheduleAutoChecks();

    log.info('[AutoUpdater] Initialized successfully');
  }

  setAutoCheckEnabled(enabled: boolean): void {
    this.autoCheckEnabled = enabled;
    log.info(`[AutoUpdater] Auto-check ${enabled ? 'enabled' : 'disabled'}`);

    if (!this.initialized || !this.updaterAvailable) {
      return;
    }

    this.scheduleAutoChecks();
  }

  private scheduleAutoChecks(): void {
    this.clearAutoCheckTimers();

    if (!this.autoCheckEnabled) {
      return;
    }

    this.startupCheckTimer = setTimeout(() => {
      void this.checkForUpdates({ userInitiated: false });
    }, this.STARTUP_CHECK_DELAY_MS);

    this.periodicCheckTimer = setInterval(() => {
      void this.checkForUpdates({ userInitiated: false });
    }, this.PERIODIC_CHECK_INTERVAL_MS);
  }

  private clearAutoCheckTimers(): void {
    if (this.startupCheckTimer) {
      clearTimeout(this.startupCheckTimer);
      this.startupCheckTimer = null;
    }
    if (this.periodicCheckTimer) {
      clearInterval(this.periodicCheckTimer);
      this.periodicCheckTimer = null;
    }
  }

  /**
   * Set up auto-updater event handlers
   */
  private setupEventHandlers(): void {
    // Checking for updates
    autoUpdater.on('checking-for-update', () => {
      log.info('[AutoUpdater] Checking for update...');
      this.updateState('checking');
    });

    // Update available
    autoUpdater.on('update-available', (info: UpdateInfo) => {
      log.info(`[AutoUpdater] Update available: ${info.version}`);
      this.state.availableVersion = info.version;
      this.state.releaseNotes = this.parseReleaseNotes(info.releaseNotes);
      this.sendStatus('available', {
        version: info.version,
        releaseNotes: this.state.releaseNotes,
        releaseDate: info.releaseDate,
      });
    });

    // No update available
    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      log.info(`[AutoUpdater] No update available. Current: ${this.state.currentVersion}, Latest: ${info.version}`);
      this.updateState('not-available');
    });

    // Download progress
    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      const percent = Math.round(progress.percent);
      log.info(`[AutoUpdater] Download progress: ${percent}%`);
      this.state.downloadProgress = percent;
      this.sendStatus('downloading', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        total: progress.total,
        transferred: progress.transferred,
      });
    });

    // Update downloaded
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      log.info(`[AutoUpdater] Update downloaded: ${info.version}`);
      this.sendStatus('ready', {
        version: info.version,
        releaseNotes: this.parseReleaseNotes(info.releaseNotes),
      });
    });

    // Error handling
    autoUpdater.on('error', (error: Error) => {
      if (this.shouldSuppressUpdateError(error, this.activeCheckUserInitiated)) {
        log.warn('[AutoUpdater] Suppressing expected updater error:', error.message);
        this.updateState(this.activeCheckUserInitiated ? 'not-available' : 'idle');
        return;
      }

      log.error('[AutoUpdater] Error:', error);
      this.sendStatus('error', {
        message: this.getUserFacingUpdateErrorMessage(error),
      });
    });
  }

  /**
   * Set up IPC handlers for renderer communication
   */
  private setupIPCHandlers(): void {
    // Check for updates
    ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async () => {
      return this.checkForUpdates({ userInitiated: true });
    });

    // Download update
    ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, async () => {
      return this.downloadUpdate();
    });

    // Install update (quit and install)
    ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () => {
      return this.installUpdate();
    });

    // Get current update state (used by Settings UI)
    ipcMain.handle(IPC_CHANNELS.UPDATE_GET_STATUS, () => {
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

  /**
   * Check for available updates
   */
  async checkForUpdates(options: UpdateCheckOptions = {}): Promise<UpdateCheckResult | null> {
    const userInitiated = options.userInitiated ?? true;

    if (!this.updaterAvailable) {
      this.updateState('not-available');
      return null;
    }
    if (this.isChecking) {
      return null;
    }
    if (this.state.status === 'downloading' || (!userInitiated && this.state.status === 'ready')) {
      return null;
    }

    try {
      this.isChecking = true;
      this.activeCheckUserInitiated = userInitiated;
      log.info('[AutoUpdater] Checking for updates');
      const result = await autoUpdater.checkForUpdates();
      return result;
    } catch (error) {
      if (error instanceof Error && this.shouldSuppressUpdateError(error, userInitiated)) {
        log.warn('[AutoUpdater] Update check skipped:', error.message);
        this.updateState(userInitiated ? 'not-available' : 'idle');
        return null;
      }

      log.error('[AutoUpdater] Check for updates failed:', error);
      this.sendStatus('error', {
        message: this.getUserFacingUpdateErrorMessage(error),
      });
      return null;
    } finally {
      this.isChecking = false;
      this.activeCheckUserInitiated = false;
    }
  }

  /**
   * Download the available update
   */
  async downloadUpdate(): Promise<void> {
    if (!this.updaterAvailable) {
      this.updateState('not-available');
      return;
    }

    try {
      log.info('[AutoUpdater] Starting download');
      this.updateState('downloading');
      await autoUpdater.downloadUpdate();
    } catch (error) {
      log.error('[AutoUpdater] Download failed:', error);
      this.sendStatus('error', {
        message: this.getUserFacingUpdateErrorMessage(error),
      });
    }
  }

  /**
   * Install the downloaded update (quits app and installs)
   */
  installUpdate(): void {
    if (!this.updaterAvailable) {
      this.updateState('not-available');
      return;
    }

    log.info('[AutoUpdater] Installing update and restarting');
    // Quit and install
    // isSilent: false - show installer UI
    // isForceRunAfter: true - restart app after update
    autoUpdater.quitAndInstall(false, true);
  }

  /**
   * Update internal state and send to renderer
   */
  private updateState(status: UpdateStatusType): void {
    this.state.status = status;
    this.sendStatus(status);
  }

  /**
   * Send status update to renderer process
   */
  private sendStatus(status: UpdateStatusType, data?: Partial<UpdateStatusPayload>): void {
    const payload: UpdateStatusPayload = {
      status,
      ...data,
    };

    this.mainWindow?.webContents.send(IPC_CHANNELS.UPDATE_STATUS, payload);
  }

  /**
   * Parse release notes from various formats
   */
  private parseReleaseNotes(notes: string | UpdateInfo['releaseNotes'] | null | undefined): string | null {
    if (!notes) return null;

    if (typeof notes === 'string') {
      return notes;
    }

    // Handle array of release notes (multiple releases)
    if (Array.isArray(notes)) {
      return notes
        .map((note) => {
          if (typeof note === 'string') return note;
          return note.note || '';
        })
        .join('\n\n');
    }

    return null;
  }

  /**
   * Electron auto-updater requires a packaged app and app-update.yml.
   * Local --dir installs and dev runs do not have updater metadata.
   */
  private canUseUpdater(): boolean {
    if (!app.isPackaged) {
      return false;
    }

    const configPath = join(process.resourcesPath, 'app-update.yml');
    return existsSync(configPath);
  }

  /**
   * Suppress known local-install update errors (not actionable for users).
   */
  private shouldSuppressUpdateError(error: Error, userInitiated: boolean): boolean {
    const message = error.message.toLowerCase();
    const isLocalBuildMetadataError =
      message.includes('app-update.yml') || message.includes('latest.yml') || message.includes('enoent');

    if (isLocalBuildMetadataError) {
      return true;
    }

    // Avoid alarming users for expected connectivity hiccups during background checks.
    if (!userInitiated && this.isTransientNetworkError(message)) {
      return true;
    }

    return false;
  }

  private isTransientNetworkError(message: string): boolean {
    return (
      message.includes('err_internet_disconnected') ||
      message.includes('err_network_changed') ||
      message.includes('err_name_not_resolved') ||
      message.includes('econnrefused') ||
      message.includes('eai_again') ||
      message.includes('enotfound') ||
      message.includes('timed out') ||
      message.includes('timeout') ||
      message.includes('network request failed') ||
      message.includes('failed to fetch')
    );
  }

  private getUserFacingUpdateErrorMessage(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'Unable to check for updates right now. Please try again.';
    }

    if (this.isTransientNetworkError(error.message.toLowerCase())) {
      return 'No internet connection detected. Reconnect and try again.';
    }

    return error.message;
  }

  /**
   * Get current update state
   */
  getState(): UpdateManagerState {
    return { ...this.state };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.clearAutoCheckTimers();
    this.mainWindow = null;
    this.initialized = false;
    log.info('[AutoUpdater] Destroyed');
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const autoUpdaterManager = new AutoUpdaterManager();
