/**
 * WindowsTaskbar - Windows-specific taskbar integration for MarkuprX
 *
 * Provides native Windows taskbar features:
 * - Jump lists with recent sessions and quick actions
 * - Taskbar progress bar during export/processing
 * - Overlay icons for recording/processing states
 * - Thumbnail toolbar buttons for quick actions
 * - Frame flashing for completion notifications
 * - Custom thumbnail clip regions
 *
 * All methods are no-ops on non-Windows platforms.
 */

import { BrowserWindow, app, nativeImage } from 'electron';
import { join } from 'path';

export interface RecentSession {
  id: string;
  name: string;
  path: string;
  date: Date;
}

export interface TaskbarActionCallback {
  onRecord: () => void;
  onStop: () => void;
  onScreenshot: () => void;
  onSettings: () => void;
}

type OverlayState = 'recording' | 'processing' | 'none';
type ProgressMode = 'none' | 'normal' | 'indeterminate' | 'error' | 'paused';

// Local interface for ThumbarButton since Electron types may vary
interface ThumbarButton {
  tooltip: string;
  icon: Electron.NativeImage;
  flags?: ('enabled' | 'disabled' | 'dismissonclick' | 'nobackground' | 'hidden' | 'noninteractive')[];
  click: () => void;
}

export class WindowsTaskbar {
  private mainWindow: BrowserWindow;
  private isWindows: boolean;
  private recentSessions: RecentSession[] = [];
  private currentOverlayState: OverlayState = 'none';
  private isRecording = false;
  private actionCallbacks: TaskbarActionCallback | null = null;
  private assetsPath: string;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.isWindows = process.platform === 'win32';

    // Assets are in build/ directory during development, resources/ in production
    this.assetsPath = app.isPackaged
      ? join(process.resourcesPath, 'build')
      : join(app.getAppPath(), 'build');

    if (!this.isWindows) {
      console.log('[WindowsTaskbar] Not on Windows, taskbar features disabled');
    }
  }

  /**
   * Set action callbacks for thumbnail toolbar buttons
   */
  setActionCallbacks(callbacks: TaskbarActionCallback): void {
    this.actionCallbacks = callbacks;
  }

  /**
   * Initialize the taskbar with default state
   */
  initialize(): void {
    if (!this.isWindows) return;

    console.log('[WindowsTaskbar] Initializing Windows taskbar integration');

    this.setupJumpList();
    this.setupThumbnailToolbar();
    this.setOverlayIcon('none');
  }

  /**
   * Set up Windows jump list with recent sessions and tasks
   *
   * Jump list structure:
   * - Recent Sessions (user tasks)
   * - Tasks (standard actions)
   */
  setupJumpList(): void {
    if (!this.isWindows) return;

    try {
      const jumpListItems: Electron.JumpListCategory[] = [];

      // Recent Sessions category
      if (this.recentSessions.length > 0) {
        const recentItems: Electron.JumpListItem[] = this.recentSessions
          .slice(0, 10) // Max 10 recent items
          .map((session) => ({
            type: 'task' as const,
            title: session.name,
            description: `Opened ${session.date.toLocaleDateString()}`,
            program: process.execPath,
            args: `--open-session "${session.path}"`,
            iconPath: process.execPath,
            iconIndex: 0,
          }));

        jumpListItems.push({
          type: 'custom',
          name: 'Recent Sessions',
          items: recentItems,
        });
      }

      // Tasks category - quick actions
      const tasks: Electron.JumpListItem[] = [
        {
          type: 'task',
          title: 'New Recording',
          description: 'Start a new feedback recording session',
          program: process.execPath,
          args: '--new-recording',
          iconPath: process.execPath,
          iconIndex: 0,
        },
        {
          type: 'task',
          title: 'Open Settings',
          description: 'Configure MarkuprX settings',
          program: process.execPath,
          args: '--settings',
          iconPath: process.execPath,
          iconIndex: 0,
        },
      ];

      jumpListItems.push({
        type: 'tasks',
        items: tasks,
      });

      app.setJumpList(jumpListItems);
      console.log('[WindowsTaskbar] Jump list configured');
    } catch (error) {
      console.error('[WindowsTaskbar] Failed to set jump list:', error);
    }
  }

  /**
   * Update the list of recent sessions in the jump list
   */
  updateRecentSessions(sessions: RecentSession[]): void {
    this.recentSessions = sessions;
    this.setupJumpList();
  }

  /**
   * Set taskbar progress bar
   *
   * @param progress - Progress value:
   *   - 0 to 1: Normal progress percentage
   *   - -1: Indeterminate (spinning) progress
   *   - 2: Clear/remove progress bar
   */
  setProgress(progress: number): void {
    if (!this.isWindows) return;

    try {
      if (progress === 2 || progress < 0 && progress !== -1) {
        // Clear progress bar
        this.mainWindow.setProgressBar(-1);
      } else if (progress === -1) {
        // Indeterminate progress
        this.mainWindow.setProgressBar(2, { mode: 'indeterminate' });
      } else {
        // Normal progress (0-1)
        const clampedProgress = Math.max(0, Math.min(1, progress));
        this.mainWindow.setProgressBar(clampedProgress, { mode: 'normal' });
      }
    } catch (error) {
      console.error('[WindowsTaskbar] Failed to set progress:', error);
    }
  }

  /**
   * Set progress bar with specific mode
   */
  setProgressWithMode(progress: number, mode: ProgressMode): void {
    if (!this.isWindows) return;

    try {
      if (mode === 'none') {
        this.mainWindow.setProgressBar(-1);
      } else {
        const clampedProgress = Math.max(0, Math.min(1, progress));
        this.mainWindow.setProgressBar(clampedProgress, { mode });
      }
    } catch (error) {
      console.error('[WindowsTaskbar] Failed to set progress with mode:', error);
    }
  }

  /**
   * Clear the progress bar
   */
  clearProgress(): void {
    this.setProgress(2);
  }

  /**
   * Set overlay icon on the taskbar icon
   * Used to indicate recording/processing state
   */
  setOverlayIcon(state: OverlayState): void {
    if (!this.isWindows) return;

    this.currentOverlayState = state;

    try {
      if (state === 'none') {
        this.mainWindow.setOverlayIcon(null, '');
        return;
      }

      const iconName = state === 'recording'
        ? 'overlay-recording.png'
        : 'overlay-processing.png';

      const iconPath = join(this.assetsPath, iconName);

      try {
        const icon = nativeImage.createFromPath(iconPath);

        if (icon.isEmpty()) {
          // Fallback: create a simple colored icon programmatically
          const fallbackIcon = this.createFallbackOverlayIcon(state);
          const description = state === 'recording' ? 'Recording' : 'Processing';
          this.mainWindow.setOverlayIcon(fallbackIcon, description);
          console.log(`[WindowsTaskbar] Using fallback overlay icon for ${state}`);
        } else {
          const description = state === 'recording' ? 'Recording' : 'Processing';
          this.mainWindow.setOverlayIcon(icon, description);
        }
      } catch {
        // If icon file doesn't exist, create fallback
        const fallbackIcon = this.createFallbackOverlayIcon(state);
        const description = state === 'recording' ? 'Recording' : 'Processing';
        this.mainWindow.setOverlayIcon(fallbackIcon, description);
        console.log(`[WindowsTaskbar] Icon not found, using fallback for ${state}`);
      }
    } catch (error) {
      console.error('[WindowsTaskbar] Failed to set overlay icon:', error);
    }
  }

  /**
   * Create a fallback overlay icon programmatically
   */
  private createFallbackOverlayIcon(state: OverlayState): Electron.NativeImage {
    // Create a 16x16 icon using data URL
    const size = 16;
    const color = state === 'recording' ? '#FF4444' : '#4488FF';

    // Simple SVG circle
    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 1}" fill="${color}" />
      </svg>
    `;

    const base64 = Buffer.from(svg).toString('base64');
    return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${base64}`);
  }

  /**
   * Set up thumbnail toolbar buttons
   * These appear when hovering over the taskbar icon
   */
  setupThumbnailToolbar(): void {
    if (!this.isWindows) return;

    try {
      const buttons = this.createThumbnailButtons();
      this.mainWindow.setThumbarButtons(buttons);
      console.log('[WindowsTaskbar] Thumbnail toolbar configured');
    } catch (error) {
      console.error('[WindowsTaskbar] Failed to set thumbnail toolbar:', error);
    }
  }

  /**
   * Update thumbnail toolbar based on recording state
   */
  updateThumbnailToolbar(isRecording: boolean): void {
    if (!this.isWindows) return;

    this.isRecording = isRecording;

    try {
      const buttons = this.createThumbnailButtons();
      this.mainWindow.setThumbarButtons(buttons);
    } catch (error) {
      console.error('[WindowsTaskbar] Failed to update thumbnail toolbar:', error);
    }
  }

  /**
   * Create thumbnail toolbar buttons based on current state
   */
  private createThumbnailButtons(): ThumbarButton[] {
    const buttons: ThumbarButton[] = [];

    // Record/Stop button
    if (this.isRecording) {
      buttons.push({
        tooltip: 'Stop Recording',
        icon: this.loadToolbarIcon('toolbar-stop.png'),
        click: () => {
          console.log('[WindowsTaskbar] Stop button clicked');
          this.actionCallbacks?.onStop();
        },
      });
    } else {
      buttons.push({
        tooltip: 'Start Recording',
        icon: this.loadToolbarIcon('toolbar-record.png'),
        click: () => {
          console.log('[WindowsTaskbar] Record button clicked');
          this.actionCallbacks?.onRecord();
        },
      });
    }

    // Screenshot button (only enabled during recording)
    buttons.push({
      tooltip: 'Take Screenshot',
      icon: this.loadToolbarIcon('toolbar-screenshot.png'),
      flags: this.isRecording ? [] : ['disabled'],
      click: () => {
        console.log('[WindowsTaskbar] Screenshot button clicked');
        this.actionCallbacks?.onScreenshot();
      },
    });

    // Settings button
    buttons.push({
      tooltip: 'Settings',
      icon: this.loadToolbarIcon('toolbar-settings.png'),
      click: () => {
        console.log('[WindowsTaskbar] Settings button clicked');
        this.actionCallbacks?.onSettings();
      },
    });

    return buttons;
  }

  /**
   * Load a toolbar icon, with fallback to programmatic icon
   */
  private loadToolbarIcon(iconName: string): Electron.NativeImage {
    const iconPath = join(this.assetsPath, iconName);

    try {
      const icon = nativeImage.createFromPath(iconPath);

      if (!icon.isEmpty()) {
        return icon;
      }
    } catch {
      // Fall through to create fallback
    }

    // Create fallback icon
    return this.createFallbackToolbarIcon(iconName);
  }

  /**
   * Create a fallback toolbar icon programmatically
   */
  private createFallbackToolbarIcon(iconName: string): Electron.NativeImage {
    const size = 16;
    let svgContent: string;

    if (iconName.includes('record')) {
      // Red circle for record
      svgContent = `
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="#FF4444" />
        </svg>
      `;
    } else if (iconName.includes('stop')) {
      // White square for stop
      svgContent = `
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="3" width="${size - 6}" height="${size - 6}" fill="#FFFFFF" />
        </svg>
      `;
    } else if (iconName.includes('screenshot')) {
      // Camera-like icon for screenshot
      svgContent = `
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="4" width="12" height="9" rx="1" fill="none" stroke="#FFFFFF" stroke-width="1.5"/>
          <circle cx="8" cy="8" r="2" fill="#FFFFFF"/>
        </svg>
      `;
    } else if (iconName.includes('settings')) {
      // Gear-like icon for settings
      svgContent = `
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          <circle cx="${size/2}" cy="${size/2}" r="3" fill="none" stroke="#FFFFFF" stroke-width="1.5"/>
          <circle cx="${size/2}" cy="${size/2}" r="6" fill="none" stroke="#FFFFFF" stroke-width="1" stroke-dasharray="2 2"/>
        </svg>
      `;
    } else {
      // Default: simple white circle
      svgContent = `
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="#FFFFFF" />
        </svg>
      `;
    }

    const base64 = Buffer.from(svgContent).toString('base64');
    return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${base64}`);
  }

  /**
   * Flash the taskbar button to get user attention
   *
   * @param count - Number of times to flash (0 for continuous until focused)
   */
  flashFrame(count?: number): void {
    if (!this.isWindows) return;

    try {
      if (count === 0 || count === undefined) {
        // Flash until the window is focused
        this.mainWindow.flashFrame(true);

        // Stop flashing when window gains focus
        const stopFlashing = (): void => {
          this.mainWindow.flashFrame(false);
          this.mainWindow.removeListener('focus', stopFlashing);
        };
        this.mainWindow.once('focus', stopFlashing);
      } else {
        // Flash a specific number of times
        let flashCount = 0;
        const interval = setInterval(() => {
          if (flashCount >= count * 2) {
            clearInterval(interval);
            this.mainWindow.flashFrame(false);
            return;
          }

          this.mainWindow.flashFrame(flashCount % 2 === 0);
          flashCount++;
        }, 500);
      }
    } catch (error) {
      console.error('[WindowsTaskbar] Failed to flash frame:', error);
    }
  }

  /**
   * Stop flashing the taskbar button
   */
  stopFlashing(): void {
    if (!this.isWindows) return;

    try {
      this.mainWindow.flashFrame(false);
    } catch (error) {
      console.error('[WindowsTaskbar] Failed to stop flashing:', error);
    }
  }

  /**
   * Set a custom thumbnail clip region
   * Used to show a specific part of the window in the thumbnail preview
   *
   * @param region - Rectangle defining the clip region, or undefined to reset
   */
  setThumbnailClip(region?: Electron.Rectangle): void {
    if (!this.isWindows) return;

    try {
      if (region) {
        this.mainWindow.setThumbnailClip(region);
      } else {
        // Reset to full window
        this.mainWindow.setThumbnailClip({ x: 0, y: 0, width: 0, height: 0 });
      }
    } catch (error) {
      console.error('[WindowsTaskbar] Failed to set thumbnail clip:', error);
    }
  }

  /**
   * Update the taskbar state based on session state.
   * Supports the bulletproof 7-state machine.
   */
  updateSessionState(
    state: 'idle' | 'starting' | 'recording' | 'stopping' | 'processing' | 'complete' | 'error'
  ): void {
    switch (state) {
      case 'idle':
        this.setOverlayIcon('none');
        this.clearProgress();
        this.updateThumbnailToolbar(false);
        break;
      case 'starting':
        this.setOverlayIcon('processing');
        this.setProgress(-1); // Indeterminate while starting
        this.updateThumbnailToolbar(false);
        break;
      case 'recording':
        this.setOverlayIcon('recording');
        this.clearProgress();
        this.updateThumbnailToolbar(true);
        break;
      case 'stopping':
        this.setOverlayIcon('processing');
        this.setProgress(-1); // Indeterminate while stopping
        this.updateThumbnailToolbar(false);
        break;
      case 'processing':
        this.setOverlayIcon('processing');
        this.setProgress(-1); // Indeterminate
        this.updateThumbnailToolbar(false);
        break;
      case 'complete':
        this.setOverlayIcon('none');
        this.clearProgress();
        this.updateThumbnailToolbar(false);
        this.flashFrame(3); // Flash 3 times on completion
        break;
      case 'error':
        this.setOverlayIcon('none');
        this.clearProgress();
        this.updateThumbnailToolbar(false);
        this.flashFrame(2); // Flash 2 times on error
        break;
    }
  }

  /**
   * Clean up taskbar resources
   */
  destroy(): void {
    if (!this.isWindows) return;

    try {
      // Clear overlay icon
      this.mainWindow.setOverlayIcon(null, '');

      // Clear progress
      this.mainWindow.setProgressBar(-1);

      // Clear thumbnail toolbar
      this.mainWindow.setThumbarButtons([]);

      // Stop any flashing
      this.mainWindow.flashFrame(false);

      console.log('[WindowsTaskbar] Cleaned up');
    } catch (error) {
      console.error('[WindowsTaskbar] Error during cleanup:', error);
    }
  }
}

// Export singleton factory
let windowsTaskbarInstance: WindowsTaskbar | null = null;

export function createWindowsTaskbar(mainWindow: BrowserWindow): WindowsTaskbar {
  windowsTaskbarInstance = new WindowsTaskbar(mainWindow);
  return windowsTaskbarInstance;
}

export function getWindowsTaskbar(): WindowsTaskbar | null {
  return windowsTaskbarInstance;
}

export default WindowsTaskbar;
