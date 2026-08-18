/**
 * MenuManager - Native macOS Menu Bar Integration
 *
 * Creates a polished, native-feeling menu bar experience for MarkuprX:
 * - Standard macOS menus (File, Edit, View, Window, Help)
 * - Proper keyboard shortcuts matching Apple HIG
 * - Recent Sessions submenu with quick access
 * - Dynamic menu updates based on app state
 * - Theme switching via View menu
 * - Product website access via Help menu
 *
 * This module follows the singleton pattern used throughout MarkuprX.
 */

import { Menu, app, shell, BrowserWindow, MenuItemConstructorOptions } from 'electron';
import { PUBLIC_BRAND_NAME, PUBLIC_WEBSITE_URL } from '../shared/publicBrand';
import { sessionController } from './SessionController';
import { getSettingsManager } from './settings/SettingsManager';
import { IPC_CHANNELS, type PublicSettings } from '../shared/types';

// =============================================================================
// Types
// =============================================================================

/**
 * Recent session entry for the File > Recent Sessions submenu
 */
export interface RecentSession {
  id: string;
  name: string;
  path: string;
  date: Date;
}

/**
 * Menu action that can be triggered from menus
 */
export type MenuAction =
  | 'toggle-recording'
  | 'show-settings'
  | 'show-history'
  | 'show-export'
  | 'show-shortcuts'
  | 'open-session'
  | 'open-session-path';

/**
 * Callback for menu actions
 */
type MenuActionCallback = (action: MenuAction, data?: unknown) => void;

function reportWebsiteLaunchFailure(error: unknown): void {
  try {
    console.error(
      `[MenuManager] Failed to open the ${PUBLIC_BRAND_NAME} website:`,
      error,
    );
  } catch {
    // A logging failure must not destabilize the native menu handler.
  }
}

function openPublicWebsite(): void {
  try {
    void shell.openExternal(PUBLIC_WEBSITE_URL).catch(reportWebsiteLaunchFailure);
  } catch (error: unknown) {
    reportWebsiteLaunchFailure(error);
  }
}

// =============================================================================
// MenuManager Class
// =============================================================================

export class MenuManager {
  private mainWindow: BrowserWindow | null = null;
  private recentSessions: RecentSession[] = [];
  private actionCallback: MenuActionCallback | null = null;
  private stateChangeCleanup: (() => void) | null = null;

  /**
   * Initialize the menu manager with the main window
   * Sets up menus and subscribes to state changes for dynamic updates
   */
  initialize(window: BrowserWindow): void {
    this.mainWindow = window;
    this.buildMenu();

    // Subscribe to session state changes to update menu dynamically
    // SessionController uses event callbacks, not an observable pattern
    // We'll rebuild the menu when the renderer notifies us of state changes
    console.log('[MenuManager] Initialized with main window');
  }

  /**
   * Set callback for menu actions
   * The main process can use this to handle menu interactions
   */
  onAction(callback: MenuActionCallback): () => void {
    this.actionCallback = callback;
    return () => {
      this.actionCallback = null;
    };
  }

  /**
   * Update the recent sessions list and rebuild menu
   * @param sessions - Array of recent sessions (max 10 will be kept)
   */
  setRecentSessions(sessions: RecentSession[]): void {
    this.recentSessions = sessions.slice(0, 10);
    this.buildMenu();
  }

  /**
   * Add a single session to recent sessions
   * @param session - Session to add to the front of the list
   */
  addRecentSession(session: RecentSession): void {
    // Remove if already exists (by id or path)
    this.recentSessions = this.recentSessions.filter(
      (s) => s.id !== session.id && s.path !== session.path
    );
    // Add to front
    this.recentSessions.unshift(session);
    // Limit to 10
    if (this.recentSessions.length > 10) {
      this.recentSessions.splice(10);
    }
    this.buildMenu();
  }

  /**
   * Trigger a menu rebuild (call when app state changes)
   */
  refresh(): void {
    this.buildMenu();
  }

  /**
   * Build the complete application menu
   */
  private buildMenu(): void {
    const isRecording = sessionController.getStatus().state === 'recording';
    const isMac = process.platform === 'darwin';

    const template: MenuItemConstructorOptions[] = [
      // =========================================================================
      // App Menu (macOS only)
      // =========================================================================
      ...(isMac
        ? [
            {
              label: app.name,
              submenu: [
                { role: 'about' as const },
                { type: 'separator' as const },
                {
                  label: 'Preferences...',
                  accelerator: 'Cmd+,',
                  click: () => this.handleAction('show-settings'),
                },
                { type: 'separator' as const },
                { role: 'services' as const },
                { type: 'separator' as const },
                { role: 'hide' as const },
                { role: 'hideOthers' as const },
                { role: 'unhide' as const },
                { type: 'separator' as const },
                { role: 'quit' as const },
              ],
            } as MenuItemConstructorOptions,
          ]
        : []),

      // =========================================================================
      // File Menu
      // =========================================================================
      {
        label: 'File',
        submenu: [
          {
            label: isRecording ? 'Stop Recording' : 'New Recording',
            accelerator: 'CmdOrCtrl+Shift+F',
            click: () => this.handleAction('toggle-recording'),
          },
          { type: 'separator' },
          {
            label: 'Open Session...',
            accelerator: 'CmdOrCtrl+O',
            click: () => this.handleAction('open-session'),
          },
          {
            label: 'Recent Sessions',
            submenu: this.buildRecentSessionsMenu(),
          },
          { type: 'separator' },
          {
            label: 'Session History',
            accelerator: 'CmdOrCtrl+H',
            click: () => this.handleAction('show-history'),
          },
          { type: 'separator' },
          {
            label: 'Export...',
            accelerator: 'CmdOrCtrl+E',
            enabled: !isRecording,
            click: () => this.handleAction('show-export'),
          },
          { type: 'separator' },
          ...(isMac ? [] : [{ role: 'quit' as const }]),
        ],
      },

      // =========================================================================
      // Edit Menu
      // =========================================================================
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          ...(isMac
            ? [
                { role: 'pasteAndMatchStyle' as const },
                { role: 'delete' as const },
                { role: 'selectAll' as const },
                { type: 'separator' as const },
                {
                  label: 'Speech',
                  submenu: [
                    { role: 'startSpeaking' as const },
                    { role: 'stopSpeaking' as const },
                  ],
                },
              ]
            : [
                { role: 'delete' as const },
                { type: 'separator' as const },
                { role: 'selectAll' as const },
              ]),
        ],
      },

      // =========================================================================
      // View Menu
      // =========================================================================
      {
        label: 'View',
        submenu: [
          {
            label: 'Toggle Audio Waveform',
            type: 'checkbox',
            checked: this.getSetting('showAudioWaveform'),
            click: () => this.toggleSetting('showAudioWaveform'),
          },
          { type: 'separator' },
          {
            label: 'Theme',
            submenu: [
              {
                label: 'Dark',
                type: 'radio',
                checked: this.getSetting('theme') === 'dark',
                click: () => this.setSetting('theme', 'dark'),
              },
              {
                label: 'Light',
                type: 'radio',
                checked: this.getSetting('theme') === 'light',
                click: () => this.setSetting('theme', 'light'),
              },
              {
                label: 'System',
                type: 'radio',
                checked: this.getSetting('theme') === 'system',
                click: () => this.setSetting('theme', 'system'),
              },
            ],
          },
          { type: 'separator' },
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },

      // =========================================================================
      // Window Menu
      // =========================================================================
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          ...(isMac
            ? [
                { type: 'separator' as const },
                { role: 'front' as const },
                { type: 'separator' as const },
                { role: 'window' as const },
              ]
            : [{ role: 'close' as const }]),
        ],
      },

      // =========================================================================
      // Help Menu
      // =========================================================================
      {
        label: 'Help',
        role: 'help',
        submenu: [
          {
            label: 'Keyboard Shortcuts',
            accelerator: 'CmdOrCtrl+/',
            click: () => this.handleAction('show-shortcuts'),
          },
          { type: 'separator' },
          {
            label: `${PUBLIC_BRAND_NAME} Website`,
            click: openPublicWebsite,
          },
          { type: 'separator' },
          {
            label: `Version ${app.getVersion()}`,
            enabled: false,
          },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  /**
   * Build the Recent Sessions submenu items
   */
  private buildRecentSessionsMenu(): MenuItemConstructorOptions[] {
    if (this.recentSessions.length === 0) {
      return [{ label: 'No Recent Sessions', enabled: false }];
    }

    const sessionItems: MenuItemConstructorOptions[] = this.recentSessions.map(
      (session) => ({
        label: `${session.name} - ${this.formatDate(session.date)}`,
        click: () => this.openSessionByPath(session.path),
      })
    );

    return [
      ...sessionItems,
      { type: 'separator' as const },
      {
        label: 'Clear Recent',
        click: () => this.clearRecentSessions(),
      },
    ];
  }

  /**
   * Format a date for display in the menu
   */
  private formatDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString(undefined, { weekday: 'long' });
    } else {
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
    }
  }

  // ===========================================================================
  // Settings Helpers
  // ===========================================================================

  /**
   * Get a setting value with fallback
   */
  private getSetting<K extends keyof PublicSettings>(
    key: K
  ): PublicSettings[K] {
    try {
      return getSettingsManager().get(key);
    } catch {
      // Return sensible defaults if settings not available
      const defaults: Record<string, unknown> = {
        showAudioWaveform: true,
        theme: 'system',
      };
      return defaults[key] as PublicSettings[K];
    }
  }

  /**
   * Set a setting and rebuild menu
   */
  private setSetting<K extends keyof PublicSettings>(
    key: K,
    value: PublicSettings[K]
  ): void {
    try {
      getSettingsManager().set(key, value);
      this.buildMenu();
      // Notify renderer of setting change
      this.sendToRenderer(IPC_CHANNELS.SETTINGS_CHANGED, { key, value });
    } catch (error) {
      console.error(`[MenuManager] Failed to set setting ${key}:`, error);
    }
  }

  /**
   * Toggle a boolean setting
   */
  private toggleSetting(
    key: 'showAudioWaveform'
  ): void {
    const current = this.getSetting(key);
    this.setSetting(key, !current);
  }

  // ===========================================================================
  // Action Handlers
  // ===========================================================================

  /**
   * Handle a menu action
   */
  private handleAction(action: MenuAction, data?: unknown): void {
    // Emit to callback if registered
    if (this.actionCallback) {
      this.actionCallback(action, data);
    }

    // Also send to renderer for UI updates
    this.sendToRenderer(`menu:${action}`, data);
  }

  /**
   * Open a session by its file path
   */
  private openSessionByPath(path: string): void {
    this.handleAction('open-session-path', { path });
  }

  /**
   * Clear all recent sessions
   */
  private clearRecentSessions(): void {
    this.recentSessions = [];
    this.buildMenu();
  }

  // ===========================================================================
  // IPC Communication
  // ===========================================================================

  /**
   * Send an event to the renderer process
   */
  private sendToRenderer(channel: string, data?: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.stateChangeCleanup) {
      this.stateChangeCleanup();
      this.stateChangeCleanup = null;
    }
    this.mainWindow = null;
    this.actionCallback = null;
    this.recentSessions = [];
    console.log('[MenuManager] Destroyed');
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const menuManager = new MenuManager();
export default menuManager;
