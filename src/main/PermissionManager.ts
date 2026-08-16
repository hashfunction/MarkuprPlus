/**
 * PermissionManager - Centralized macOS System Permission Handling for MarkuprX
 *
 * Handles:
 * - Startup permission verification
 * - User-friendly permission request dialogs
 * - Direct links to System Preferences
 * - Graceful degradation when permissions denied
 */

import { systemPreferences, dialog, shell, BrowserWindow, app } from 'electron';
import { errorHandler } from './ErrorHandler';

// ============================================================================
// Types
// ============================================================================

export type PermissionType = 'microphone' | 'screen' | 'accessibility';

export type MediaAccessStatus = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';
export type AccessibilityStatus = 'granted' | 'denied' | 'unknown';

export interface PermissionState {
  microphone: MediaAccessStatus;
  screen: MediaAccessStatus;
  accessibility: AccessibilityStatus;
}

export interface PermissionCheckResult {
  allGranted: boolean;
  missing: PermissionType[];
  state: PermissionState;
}

// ============================================================================
// Constants
// ============================================================================

const PERMISSION_DESCRIPTIONS: Record<PermissionType, {
  title: string;
  description: string;
  required: boolean;
  systemPrefsPane: string;
}> = {
  microphone: {
    title: 'Microphone Access',
    description: 'MarkuprX needs microphone access to capture your voice feedback and transcribe it in real-time.',
    required: true,
    systemPrefsPane: 'Privacy_Microphone',
  },
  screen: {
    title: 'Screen Recording',
    description: 'MarkuprX needs screen recording permission to capture screenshots when you pause speaking.',
    required: true,
    systemPrefsPane: 'Privacy_ScreenCapture',
  },
  accessibility: {
    title: 'Accessibility',
    description: 'MarkuprX uses accessibility features for global hotkeys. This is optional but recommended.',
    required: false,
    systemPrefsPane: 'Privacy_Accessibility',
  },
};

// ============================================================================
// PermissionManager Class
// ============================================================================

class PermissionManager {
  private mainWindow: BrowserWindow | null = null;

  /**
   * Set the main window reference for dialogs
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  // ==========================================================================
  // Permission Checking
  // ==========================================================================

  /**
   * Check all required permissions on startup
   * Returns detailed state for each permission
   */
  async checkAllPermissions(): Promise<PermissionCheckResult> {
    const state: PermissionState = {
      microphone: await this.getPermissionStatus('microphone') as MediaAccessStatus,
      screen: await this.getPermissionStatus('screen') as MediaAccessStatus,
      accessibility: await this.getPermissionStatus('accessibility') as AccessibilityStatus,
    };

    const missing: PermissionType[] = [];

    // Check required permissions
    if (state.microphone !== 'granted') {
      missing.push('microphone');
    }
    if (state.screen !== 'granted') {
      missing.push('screen');
    }

    const result: PermissionCheckResult = {
      allGranted: missing.length === 0,
      missing,
      state,
    };

    errorHandler.log('info', 'Permission check completed', {
      component: 'PermissionManager',
      operation: 'checkAllPermissions',
      data: {
        microphone: state.microphone,
        screen: state.screen,
        accessibility: state.accessibility,
        allGranted: result.allGranted,
      },
    });

    return result;
  }

  /**
   * Get the current status of a specific permission
   */
  async getPermissionStatus(type: PermissionType): Promise<MediaAccessStatus | AccessibilityStatus> {
    if (process.platform !== 'darwin') {
      // Non-macOS platforms don't have these system-level permissions
      return 'granted';
    }

    try {
      switch (type) {
        case 'microphone': {
          const status = systemPreferences.getMediaAccessStatus('microphone');
          return status as MediaAccessStatus;
        }
        case 'screen': {
          const status = systemPreferences.getMediaAccessStatus('screen');
          return status as MediaAccessStatus;
        }
        case 'accessibility': {
          const trusted = systemPreferences.isTrustedAccessibilityClient(false);
          return trusted ? 'granted' : 'denied';
        }
        default:
          return 'unknown';
      }
    } catch (error) {
      errorHandler.log('error', `Failed to get permission status for ${type}`, {
        component: 'PermissionManager',
        operation: 'getPermissionStatus',
        error: (error as Error).message,
      });
      return 'unknown';
    }
  }

  /**
   * Check if a specific permission is granted
   */
  async isGranted(type: PermissionType): Promise<boolean> {
    const status = await this.getPermissionStatus(type);
    return status === 'granted';
  }

  // ==========================================================================
  // Permission Requesting
  // ==========================================================================

  /**
   * Request a specific permission
   * Returns true if granted, false otherwise
   */
  async requestPermission(type: PermissionType): Promise<boolean> {
    if (process.platform !== 'darwin') {
      return true;
    }

    const currentStatus = await this.getPermissionStatus(type);

    // Already granted
    if (currentStatus === 'granted') {
      return true;
    }

    errorHandler.log('info', `Requesting ${type} permission`, {
      component: 'PermissionManager',
      operation: 'requestPermission',
      data: { currentStatus },
    });

    switch (type) {
      case 'microphone':
        return this.requestMicrophonePermission(currentStatus);
      case 'screen':
        return this.requestScreenPermission(currentStatus);
      case 'accessibility':
        return this.requestAccessibilityPermission();
      default:
        return false;
    }
  }

  /**
   * Request microphone permission
   */
  private async requestMicrophonePermission(
    currentStatus: PermissionState['microphone']
  ): Promise<boolean> {
    // Can trigger the system prompt for 'not-determined'
    if (currentStatus === 'not-determined') {
      try {
        const granted = await systemPreferences.askForMediaAccess('microphone');
        if (granted) {
          errorHandler.log('info', 'Microphone permission granted via system prompt', {
            component: 'PermissionManager',
          });
          return true;
        }
      } catch (error) {
        errorHandler.log('error', 'Failed to request microphone permission', {
          component: 'PermissionManager',
          error: (error as Error).message,
        });
      }
    }

    // Previously denied or restricted - need manual intervention
    await this.showPermissionDeniedDialog('microphone');
    return false;
  }

  /**
   * Request screen recording permission
   * Note: macOS doesn't have a direct API to request this - we guide the user
   */
  private async requestScreenPermission(
    currentStatus: PermissionState['screen']
  ): Promise<boolean> {
    if (currentStatus === 'not-determined') {
      // Trigger the system prompt by attempting to get sources
      // This is the only way to trigger the screen recording prompt
      try {
        const { desktopCapturer } = await import('electron');
        await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 1, height: 1 },
        });

        // Check if user granted
        const newStatus = systemPreferences.getMediaAccessStatus('screen');
        if (newStatus === 'granted') {
          errorHandler.log('info', 'Screen recording permission granted via system prompt', {
            component: 'PermissionManager',
          });
          return true;
        }
      } catch {
        // Prompt was shown but user may have denied
      }
    }

    // Need to guide user to System Preferences
    await this.showPermissionDeniedDialog('screen');
    return false;
  }

  /**
   * Request accessibility permission
   */
  private async requestAccessibilityPermission(): Promise<boolean> {
    // This will show the system prompt if not determined
    const result = systemPreferences.isTrustedAccessibilityClient(true);

    if (result) {
      errorHandler.log('info', 'Accessibility permission already granted', {
        component: 'PermissionManager',
      });
      return true;
    }

    // Guide user to System Preferences
    await this.showPermissionDeniedDialog('accessibility');
    return false;
  }

  // ==========================================================================
  // User Dialogs
  // ==========================================================================

  /**
   * Show a helpful dialog when permission is denied
   * Offers to open system settings directly
   */
  private async showPermissionDeniedDialog(type: PermissionType): Promise<boolean> {
    const config = PERMISSION_DESCRIPTIONS[type];

    const settingsLabel = process.platform === 'darwin'
      ? 'Open System Settings'
      : process.platform === 'win32'
        ? 'Open Windows Settings'
        : 'Open Settings';

    const options: Electron.MessageBoxOptions = {
      type: 'warning',
      buttons: [settingsLabel, 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: `${config.title} Required`,
      message: config.title,
      detail:
        `${config.description}\n\n` +
        'To enable this permission:\n' +
        `1. Click "${settingsLabel}"\n` +
        '2. Find MarkuprX in the list\n' +
        '3. Toggle it ON\n' +
        '4. You may need to restart MarkuprX',
    };

    const { response } = this.mainWindow
      ? await dialog.showMessageBox(this.mainWindow, options)
      : await dialog.showMessageBox(options);

    if (response === 0) {
      await this.openSystemPreferences(type);
      return true;
    }

    return false;
  }

  /**
   * Show a dialog on startup if required permissions are missing
   */
  async showStartupPermissionDialog(missing: PermissionType[]): Promise<void> {
    if (missing.length === 0) return;

    const missingDescriptions = missing
      .map((type) => `- ${PERMISSION_DESCRIPTIONS[type].title}`)
      .join('\n');

    const options: Electron.MessageBoxOptions = {
      type: 'info',
      buttons: ['Set Up Permissions', 'Continue Anyway', 'Quit'],
      defaultId: 0,
      cancelId: 2,
      title: 'Permissions Needed',
      message: 'MarkuprX needs your permission',
      detail:
        'To work properly, MarkuprX needs access to:\n' +
        `${missingDescriptions}\n\n` +
        'Would you like to set up permissions now?',
    };

    const { response } = this.mainWindow
      ? await dialog.showMessageBox(this.mainWindow, options)
      : await dialog.showMessageBox(options);

    if (response === 0) {
      // Open settings for first missing permission
      await this.openSystemPreferences(missing[0]);
    } else if (response === 2) {
      app.quit();
    }
    // response === 1: Continue anyway - user accepted degraded functionality
  }

  // ==========================================================================
  // System Preferences
  // ==========================================================================

  /**
   * Open System Preferences to the appropriate pane
   */
  async openSystemPreferences(type: PermissionType): Promise<void> {
    const pane = PERMISSION_DESCRIPTIONS[type].systemPrefsPane;

    if (process.platform === 'darwin') {
      const url = `x-apple.systempreferences:com.apple.preference.security?${pane}`;
      await shell.openExternal(url);
      errorHandler.log('info', `Opened System Preferences for ${type}`, {
        component: 'PermissionManager',
        data: { url },
      });
    } else if (process.platform === 'win32') {
      // Windows privacy settings
      const settingsMap: Record<PermissionType, string> = {
        microphone: 'ms-settings:privacy-microphone',
        screen: 'ms-settings:privacy-screencapture',
        accessibility: 'ms-settings:easeofaccess',
      };
      await shell.openExternal(settingsMap[type]);
    }
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  /**
   * Get user-friendly description of permission state
   */
  getPermissionStateDescription(type: PermissionType, state: string): string {
    const settingsName = process.platform === 'darwin'
      ? 'System Settings'
      : process.platform === 'win32'
        ? 'Windows Settings'
        : 'system settings';

    switch (state) {
      case 'granted':
        return 'Enabled';
      case 'denied':
        return `Denied - click to enable in ${settingsName}`;
      case 'not-determined':
        return 'Not set - click to enable';
      case 'restricted':
        return 'Restricted by system policy';
      default:
        return 'Unknown';
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const permissionManager = new PermissionManager();
export default PermissionManager;
