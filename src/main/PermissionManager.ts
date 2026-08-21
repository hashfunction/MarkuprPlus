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
import { PUBLIC_BRAND_NAME } from '../shared/publicBrand';
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

export interface RequestPermissionOptions {
  /**
   * Skip the "permission denied" guidance dialog. Use when the caller shows its
   * own guidance, so the user is not handed two stacked dialogs in a row.
   */
  silent?: boolean;
}

export interface StartupPermissionDialogResult {
  action: 'none' | 'settings' | 'continue' | 'quit';
  /** User ticked "don't remind me again" -- callers should persist this. */
  suppressFuturePrompts: boolean;
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
    description: `${PUBLIC_BRAND_NAME} needs microphone access to capture your voice feedback and transcribe it in real-time.`,
    required: true,
    systemPrefsPane: 'Privacy_Microphone',
  },
  screen: {
    title: 'Screen Recording',
    description: `${PUBLIC_BRAND_NAME} needs screen recording permission to capture screenshots when you pause speaking.`,
    required: true,
    systemPrefsPane: 'Privacy_ScreenCapture',
  },
  accessibility: {
    title: 'Accessibility',
    description: `${PUBLIC_BRAND_NAME} uses accessibility features for global hotkeys. This is optional but recommended.`,
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
  async requestPermission(
    type: PermissionType,
    options: RequestPermissionOptions = {}
  ): Promise<boolean> {
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
        return this.requestMicrophonePermission(currentStatus, options);
      case 'screen':
        return this.requestScreenPermission(options);
      case 'accessibility':
        return this.requestAccessibilityPermission(options);
      default:
        return false;
    }
  }

  /**
   * Request microphone permission
   */
  private async requestMicrophonePermission(
    currentStatus: PermissionState['microphone'],
    options: RequestPermissionOptions = {}
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
    if (!options.silent) {
      await this.showPermissionDeniedDialog('microphone');
    }
    return false;
  }

  /**
   * Request screen recording permission.
   *
   * macOS exposes screen capture access as a binary (CGPreflightScreenCaptureAccess),
   * so getMediaAccessStatus('screen') only ever returns 'granted' or 'denied' --
   * it never returns 'not-determined' the way microphone and camera do. Gating the
   * request on 'not-determined' meant this never ran, so the app could neither
   * trigger the system prompt nor register itself in System Settings, leaving the
   * user with a dialog they had no way to satisfy.
   *
   * Attempting a real capture is what triggers the prompt on first ask, and what
   * puts the app in the Screen Recording list so there is something to toggle.
   */
  private async requestScreenPermission(
    options: RequestPermissionOptions = {}
  ): Promise<boolean> {
    try {
      const { desktopCapturer } = await import('electron');
      await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1, height: 1 },
      });

      const newStatus = systemPreferences.getMediaAccessStatus('screen');
      if (newStatus === 'granted') {
        errorHandler.log('info', 'Screen recording permission granted via system prompt', {
          component: 'PermissionManager',
        });
        return true;
      }
    } catch (error) {
      // A rejected capture is the expected path when the user has denied access.
      errorHandler.log('info', 'Screen capture probe did not yield access', {
        component: 'PermissionManager',
        operation: 'requestScreenPermission',
        error: (error as Error).message,
      });
    }

    // Need to guide user to System Preferences
    if (!options.silent) {
      await this.showPermissionDeniedDialog('screen');
    }
    return false;
  }

  /**
   * Request accessibility permission
   */
  private async requestAccessibilityPermission(
    options: RequestPermissionOptions = {}
  ): Promise<boolean> {
    // This will show the system prompt if not determined
    const result = systemPreferences.isTrustedAccessibilityClient(true);

    if (result) {
      errorHandler.log('info', 'Accessibility permission already granted', {
        component: 'PermissionManager',
      });
      return true;
    }

    // Guide user to System Preferences
    if (!options.silent) {
      await this.showPermissionDeniedDialog('accessibility');
    }
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

    // macOS caches the screen-capture check for the lifetime of the process, so
    // a grant made in System Settings stays invisible until the app relaunches.
    // Offer the relaunch directly instead of letting the user loop on a dialog
    // that keeps reappearing after they have already granted access.
    const needsRelaunch = type === 'screen' && process.platform === 'darwin';
    const relaunchLabel = `Restart ${PUBLIC_BRAND_NAME}`;
    const buttons = needsRelaunch
      ? [settingsLabel, relaunchLabel, 'Later']
      : [settingsLabel, 'Later'];

    const options: Electron.MessageBoxOptions = {
      type: 'warning',
      buttons,
      defaultId: 0,
      cancelId: buttons.length - 1,
      title: `${config.title} Required`,
      message: config.title,
      detail:
        `${config.description}\n\n` +
        'To enable this permission:\n' +
        `1. Click "${settingsLabel}"\n` +
        `2. Find ${PUBLIC_BRAND_NAME} in the list\n` +
        '3. Toggle it ON\n' +
        (needsRelaunch
          ? `4. Come back and click "${relaunchLabel}" -- macOS only applies a new\n`
            + '   screen recording grant after the app restarts.'
          : `4. You may need to restart ${PUBLIC_BRAND_NAME}`),
    };

    const { response } = this.mainWindow
      ? await dialog.showMessageBox(this.mainWindow, options)
      : await dialog.showMessageBox(options);

    if (response === 0) {
      await this.openSystemPreferences(type);
      return true;
    }

    if (needsRelaunch && response === 1) {
      errorHandler.log('info', 'Relaunching to pick up screen recording grant', {
        component: 'PermissionManager',
      });
      app.relaunch();
      app.exit(0);
      return true;
    }

    return false;
  }

  /**
   * Show a dialog on startup if required permissions are missing
   */
  async showStartupPermissionDialog(
    missing: PermissionType[]
  ): Promise<StartupPermissionDialogResult> {
    if (missing.length === 0) {
      return { action: 'none', suppressFuturePrompts: false };
    }

    const missingDescriptions = missing
      .map((type) => `- ${PERMISSION_DESCRIPTIONS[type].title}`)
      .join('\n');

    const options: Electron.MessageBoxOptions = {
      type: 'info',
      buttons: ['Set Up Permissions', 'Continue Anyway', 'Quit'],
      defaultId: 0,
      cancelId: 2,
      title: 'Permissions Needed',
      message: `${PUBLIC_BRAND_NAME} needs your permission`,
      detail:
        `To work properly, ${PUBLIC_BRAND_NAME} needs access to:\n` +
        `${missingDescriptions}\n\n` +
        'Would you like to set up permissions now?',
      checkboxLabel: "Don't remind me again",
      checkboxChecked: false,
    };

    const { response, checkboxChecked } = this.mainWindow
      ? await dialog.showMessageBox(this.mainWindow, options)
      : await dialog.showMessageBox(options);

    const suppressFuturePrompts = checkboxChecked === true;

    if (response === 0) {
      // Open settings for first missing permission
      await this.openSystemPreferences(missing[0]);
      return { action: 'settings', suppressFuturePrompts };
    }

    if (response === 2) {
      app.quit();
      return { action: 'quit', suppressFuturePrompts };
    }

    // response === 1: Continue anyway - user accepted degraded functionality
    return { action: 'continue', suppressFuturePrompts };
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
