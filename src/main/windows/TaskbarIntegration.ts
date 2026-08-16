/**
 * Windows Taskbar Integration for MarkuprX
 *
 * Provides:
 * - Jump list with recent sessions
 * - Taskbar progress indicator during processing
 * - Thumbnail toolbar buttons (Record, Pause, Stop)
 * - Windows toast notifications
 *
 * @module windows/TaskbarIntegration
 */

import { app, BrowserWindow, nativeImage, Notification, shell } from 'electron';
import * as path from 'path';
import electronLog from 'electron-log';
const log = electronLog.default ?? electronLog;

// Types for Windows taskbar integration
interface ThumbnailToolbarButton {
  tooltip: string;
  icon: Electron.NativeImage;
  click: () => void;
  flags?: ('enabled' | 'disabled' | 'dismissonclick' | 'nobackground' | 'hidden' | 'noninteractive')[];
}

export interface SessionInfo {
  id: string;
  name: string;
  path: string;
  timestamp: Date;
}

export type RecordingState = 'idle' | 'recording' | 'paused' | 'processing';

export class TaskbarIntegration {
  private mainWindow: BrowserWindow | null = null;
  private recentSessions: SessionInfo[] = [];
  private currentState: RecordingState = 'idle';
  private assetsPath: string;

  constructor() {
    this.assetsPath = app.isPackaged
      ? path.join(process.resourcesPath, 'assets')
      : path.join(__dirname, '../../../assets');

    log.info('[TaskbarIntegration] Initialized');
  }

  /**
   * Initialize taskbar integration with the main window
   */
  public initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;

    if (process.platform !== 'win32') {
      log.info('[TaskbarIntegration] Not on Windows, skipping initialization');
      return;
    }

    this.setupJumpList();
    this.setupThumbnailToolbar();
    log.info('[TaskbarIntegration] Windows taskbar features enabled');
  }

  // ===========================================================================
  // Jump List Management
  // ===========================================================================

  /**
   * Set up the Windows Jump List with recent sessions and quick actions
   */
  private setupJumpList(): void {
    try {
      app.setJumpList([
        {
          type: 'custom',
          name: 'Quick Actions',
          items: [
            {
              type: 'task',
              title: 'New Recording',
              description: 'Start a new feedback recording session',
              program: process.execPath,
              args: '--new-recording',
              iconPath: process.execPath,
              iconIndex: 0
            },
            {
              type: 'task',
              title: 'Quick Screenshot',
              description: 'Take a quick annotated screenshot',
              program: process.execPath,
              args: '--quick-screenshot',
              iconPath: process.execPath,
              iconIndex: 0
            }
          ]
        },
        {
          type: 'recent'
        },
        {
          type: 'tasks',
          items: [
            {
              type: 'task',
              title: 'Open Settings',
              description: 'Configure MarkuprX settings',
              program: process.execPath,
              args: '--settings',
              iconPath: process.execPath,
              iconIndex: 0
            }
          ]
        }
      ]);
      log.info('[TaskbarIntegration] Jump list configured');
    } catch (error) {
      log.error('[TaskbarIntegration] Failed to set jump list:', error);
    }
  }

  /**
   * Update recent sessions in the jump list
   */
  public updateRecentSessions(sessions: SessionInfo[]): void {
    this.recentSessions = sessions.slice(0, 10); // Keep last 10

    if (process.platform !== 'win32') return;

    try {
      // Add sessions to Windows recent documents
      for (const session of this.recentSessions) {
        app.addRecentDocument(session.path);
      }

      // Rebuild jump list with updated recent sessions
      this.setupJumpList();
      log.info(`[TaskbarIntegration] Updated ${sessions.length} recent sessions`);
    } catch (error) {
      log.error('[TaskbarIntegration] Failed to update recent sessions:', error);
    }
  }

  /**
   * Clear recent sessions from jump list
   */
  public clearRecentSessions(): void {
    this.recentSessions = [];

    if (process.platform === 'win32') {
      app.clearRecentDocuments();
      this.setupJumpList();
    }
  }

  // ===========================================================================
  // Taskbar Progress Indicator
  // ===========================================================================

  /**
   * Set taskbar progress bar (0-1 range, or -1 for indeterminate)
   */
  public setProgress(progress: number): void {
    if (!this.mainWindow || process.platform !== 'win32') return;

    try {
      if (progress < 0) {
        // Indeterminate progress
        this.mainWindow.setProgressBar(2, { mode: 'indeterminate' });
      } else if (progress >= 1) {
        // Complete - briefly show green, then hide
        this.mainWindow.setProgressBar(1, { mode: 'normal' });
        setTimeout(() => {
          this.mainWindow?.setProgressBar(-1); // Hide
        }, 2000);
      } else {
        // Normal progress
        this.mainWindow.setProgressBar(progress, { mode: 'normal' });
      }
    } catch (error) {
      log.error('[TaskbarIntegration] Failed to set progress:', error);
    }
  }

  /**
   * Show error state in taskbar progress
   */
  public setProgressError(): void {
    if (!this.mainWindow || process.platform !== 'win32') return;

    try {
      this.mainWindow.setProgressBar(1, { mode: 'error' });
      setTimeout(() => {
        this.mainWindow?.setProgressBar(-1);
      }, 5000);
    } catch (error) {
      log.error('[TaskbarIntegration] Failed to set error progress:', error);
    }
  }

  /**
   * Clear taskbar progress
   */
  public clearProgress(): void {
    if (!this.mainWindow || process.platform !== 'win32') return;

    try {
      this.mainWindow.setProgressBar(-1);
    } catch (error) {
      log.error('[TaskbarIntegration] Failed to clear progress:', error);
    }
  }

  // ===========================================================================
  // Thumbnail Toolbar (Recording Controls)
  // ===========================================================================

  /**
   * Set up thumbnail toolbar with recording controls
   */
  private setupThumbnailToolbar(): void {
    if (!this.mainWindow) return;

    this.updateThumbnailToolbar('idle');
  }

  /**
   * Update thumbnail toolbar based on recording state
   */
  public updateThumbnailToolbar(state: RecordingState): void {
    if (!this.mainWindow || process.platform !== 'win32') return;

    this.currentState = state;

    try {
      const buttons = this.getToolbarButtons(state);
      this.mainWindow.setThumbarButtons(buttons);
      log.debug(`[TaskbarIntegration] Toolbar updated for state: ${state}`);
    } catch (error) {
      log.error('[TaskbarIntegration] Failed to update toolbar:', error);
    }
  }

  /**
   * Get toolbar buttons for current state
   */
  private getToolbarButtons(state: RecordingState): ThumbnailToolbarButton[] {
    const recordIcon = this.loadIcon('tray-recording.png');
    const pauseIcon = this.loadIcon('tray-idle.png');
    const stopIcon = this.loadIcon('tray-error.png');
    const processingIcon = this.loadIcon('tray-processing.png');

    switch (state) {
      case 'idle':
        return [
          {
            tooltip: 'Start Recording',
            icon: recordIcon,
            click: () => this.emitAction('start-recording'),
            flags: ['enabled']
          }
        ];

      case 'recording':
        return [
          {
            tooltip: 'Pause Recording',
            icon: pauseIcon,
            click: () => this.emitAction('pause-recording'),
            flags: ['enabled']
          },
          {
            tooltip: 'Stop Recording',
            icon: stopIcon,
            click: () => this.emitAction('stop-recording'),
            flags: ['enabled']
          }
        ];

      case 'paused':
        return [
          {
            tooltip: 'Resume Recording',
            icon: recordIcon,
            click: () => this.emitAction('resume-recording'),
            flags: ['enabled']
          },
          {
            tooltip: 'Stop Recording',
            icon: stopIcon,
            click: () => this.emitAction('stop-recording'),
            flags: ['enabled']
          }
        ];

      case 'processing':
        return [
          {
            tooltip: 'Processing...',
            icon: processingIcon,
            click: () => {},
            flags: ['disabled', 'nobackground']
          }
        ];

      default:
        return [];
    }
  }

  /**
   * Load icon from assets
   */
  private loadIcon(filename: string): Electron.NativeImage {
    try {
      const iconPath = path.join(this.assetsPath, filename);
      return nativeImage.createFromPath(iconPath);
    } catch (error) {
      log.error(`[TaskbarIntegration] Failed to load icon ${filename}:`, error);
      return nativeImage.createEmpty();
    }
  }

  /**
   * Emit action to main window
   */
  private emitAction(action: string): void {
    if (!this.mainWindow) return;
    this.mainWindow.webContents.send('taskbar-action', action);
    log.info(`[TaskbarIntegration] Action emitted: ${action}`);
  }

  // ===========================================================================
  // Windows Toast Notifications
  // ===========================================================================

  /**
   * Show a Windows toast notification
   */
  public showNotification(options: {
    title: string;
    body: string;
    silent?: boolean;
    urgency?: 'normal' | 'critical' | 'low';
    actions?: { type: 'button'; text: string; }[];
    onClick?: () => void;
  }): void {
    if (!Notification.isSupported()) {
      log.warn('[TaskbarIntegration] Notifications not supported');
      return;
    }

    try {
      const notification = new Notification({
        title: options.title,
        body: options.body,
        silent: options.silent ?? false,
        urgency: options.urgency ?? 'normal',
        icon: path.join(this.assetsPath, 'tray-idle.png'),
        timeoutType: options.urgency === 'critical' ? 'never' : 'default'
      });

      if (options.onClick) {
        notification.on('click', options.onClick);
      }

      notification.show();
      log.debug(`[TaskbarIntegration] Notification shown: ${options.title}`);
    } catch (error) {
      log.error('[TaskbarIntegration] Failed to show notification:', error);
    }
  }

  /**
   * Show recording started notification
   */
  public notifyRecordingStarted(): void {
    this.showNotification({
      title: 'Recording Started',
      body: 'MarkuprX is now capturing your feedback',
      silent: true,
      urgency: 'low'
    });
  }

  /**
   * Show recording completed notification
   */
  public notifyRecordingComplete(sessionName: string, outputPath: string): void {
    this.showNotification({
      title: 'Recording Complete',
      body: `Session "${sessionName}" saved successfully`,
      onClick: () => {
        // Open the output folder
        shell.showItemInFolder(outputPath);
      }
    });
  }

  /**
   * Show export progress notification
   */
  public notifyExportProgress(format: string): void {
    this.showNotification({
      title: 'Exporting...',
      body: `Exporting session to ${format} format`,
      silent: true,
      urgency: 'low'
    });
  }

  /**
   * Show export complete notification
   */
  public notifyExportComplete(outputPath: string): void {
    this.showNotification({
      title: 'Export Complete',
      body: 'Your feedback session has been exported',
      onClick: () => {
        shell.showItemInFolder(outputPath);
      }
    });
  }

  /**
   * Show error notification
   */
  public notifyError(title: string, message: string): void {
    this.showNotification({
      title,
      body: message,
      urgency: 'critical'
    });
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.mainWindow = null;
    this.recentSessions = [];
    log.info('[TaskbarIntegration] Destroyed');
  }
}

// Export singleton instance
export const taskbarIntegration = new TaskbarIntegration();
