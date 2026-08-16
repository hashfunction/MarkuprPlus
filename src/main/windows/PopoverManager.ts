/**
 * PopoverManager - NSPopover-like window for menu bar apps
 *
 * Creates a frameless window that:
 * - Appears anchored below the tray icon
 * - Closes when clicking outside (blur)
 * - Has no shadow (draws its own)
 * - Uses vibrancy on macOS
 * - Supports different sizes per state
 */

import { BrowserWindow, screen, Tray, app } from 'electron';
import { join } from 'path';
import { protectRendererNavigation } from '../security/NavigationGuard';

/**
 * Popover sizes for different application states
 */
export const POPOVER_SIZES = {
  idle: { width: 460, height: 680 },
  recording: { width: 316, height: 90 },
  processing: { width: 320, height: 140 },
  complete: { width: 460, height: 720 },
  settings: { width: 400, height: 520 },
  error: { width: 440, height: 620 },
} as const;

export type PopoverState = keyof typeof POPOVER_SIZES;

export interface PopoverConfig {
  width: number;
  height: number;
  tray: Tray;
}

/**
 * PopoverManager class - Manages the menu bar popover window
 */
export class PopoverManager {
  private window: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private config: PopoverConfig;
  private keepVisibleOnBlur = false;
  private currentState: PopoverState = 'idle';

  constructor(config: PopoverConfig) {
    this.config = config;
    this.tray = config.tray;
  }

  /**
   * Create the popover window with proper configuration
   */
  create(): BrowserWindow {
    const preloadPath = join(app.getAppPath(), 'dist', 'preload', 'index.cjs');

    this.window = new BrowserWindow({
      width: this.config.width,
      height: this.config.height,
      show: false,
      frame: false,
      fullscreenable: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: true,
      alwaysOnTop: true,
      skipTaskbar: true,

      // macOS-specific vibrancy for native feel
      ...(process.platform === 'darwin' && {
        vibrancy: 'popover',
        visualEffectState: 'active',
        transparent: true,
        backgroundColor: '#00000000',
      }),

      // Windows/Linux fallback with transparency
      ...(process.platform !== 'darwin' && {
        transparent: true,
        backgroundColor: '#00000000',
      }),

      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    protectRendererNavigation(this.window.webContents);

    // Hide on blur (clicking outside the popover)
    this.window.on('blur', () => {
      if (this.keepVisibleOnBlur) {
        return;
      }
      this.hide();
    });

    // Prevent window from showing in Mission Control on macOS
    if (process.platform === 'darwin') {
      this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }

    console.log('[PopoverManager] Popover window created');

    return this.window;
  }

  /**
   * Show the popover anchored to the tray icon
   */
  show(): void {
    if (!this.window || this.window.isDestroyed() || !this.tray) return;

    const position = this.calculatePosition();
    this.window.setPosition(position.x, position.y, false);
    this.window.show();
    this.window.focus();

    console.log('[PopoverManager] Popover shown at', position);
  }

  /**
   * Hide the popover
   */
  hide(): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.hide();
    console.log('[PopoverManager] Popover hidden');
  }

  /**
   * Toggle popover visibility
   */
  toggle(): void {
    if (!this.window || this.window.isDestroyed()) return;

    if (this.window.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Calculate position to anchor below tray icon
   * Handles multi-monitor setups and taskbar positions
   */
  private calculatePosition(): { x: number; y: number } {
    if (!this.tray || !this.window || this.window.isDestroyed()) {
      return { x: 0, y: 0 };
    }

    const trayBounds = this.tray.getBounds();
    const windowBounds = this.window.getBounds();
    const isHudState = this.currentState === 'recording' || this.currentState === 'processing';

    if (isHudState) {
      const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      const workArea = cursorDisplay.workArea;
      const x = Math.round(workArea.x + (workArea.width - windowBounds.width) / 2);
      const y = Math.round(workArea.y + 8);
      return { x, y };
    }

    const display = screen.getDisplayMatching(trayBounds);

    // Center horizontally under tray icon
    let x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2));

    // Position below tray (macOS menu bar is at top)
    let y: number;
    if (process.platform === 'darwin') {
      // macOS: position below menu bar with small gap
      y = trayBounds.y + trayBounds.height + 4;
    } else {
      // Windows/Linux: detect taskbar position
      const taskbarOnTop = trayBounds.y < display.workArea.y + 50;
      if (taskbarOnTop) {
        // Taskbar at top - position below it
        y = trayBounds.y + trayBounds.height + 4;
      } else {
        // Taskbar at bottom - position above it
        y = trayBounds.y - windowBounds.height - 4;
      }
    }

    // Ensure window stays on screen (respects work area boundaries)
    const { workArea } = display;
    x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - windowBounds.width));
    y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - windowBounds.height));

    return { x, y };
  }

  /**
   * Get the BrowserWindow for loading content
   */
  getWindow(): BrowserWindow | null {
    return this.window;
  }

  /**
   * Check if popover is visible
   */
  isVisible(): boolean {
    return (this.window && !this.window.isDestroyed()) ? this.window.isVisible() : false;
  }

  /**
   * Resize the popover for different states
   * Re-anchors to tray if visible
   */
  resize(width: number, height: number): void {
    if (!this.window || this.window.isDestroyed()) return;

    this.window.setSize(width, height, true);

    // Reposition to stay anchored to tray
    if (this.window.isVisible()) {
      const position = this.calculatePosition();
      this.window.setPosition(position.x, position.y, false);
    }

    console.log(`[PopoverManager] Resized to ${width}x${height}`);
  }

  /**
   * Resize to a predefined state size
   */
  resizeToState(state: PopoverState): void {
    this.currentState = state;
    this.applyStateAppearance(state);
    const size = POPOVER_SIZES[state];
    this.resize(size.width, size.height);
  }

  /**
   * Keep popover visible while app focus changes.
   * Useful during active recording when users switch to other apps.
   */
  setKeepVisibleOnBlur(enabled: boolean): void {
    this.keepVisibleOnBlur = enabled;
  }

  /** Keep the compact Stop/Pause HUD above the interactive annotation layer. */
  setRecordingHudPriority(enabled: boolean): void {
    if (!this.window || this.window.isDestroyed()) return;
    try {
      this.window.setAlwaysOnTop(
        true,
        enabled ? 'screen-saver' : 'floating',
        enabled ? 1 : 0,
      );
    } catch (error) {
      console.warn('[PopoverManager] Failed to update recording HUD priority:', error);
    }
  }

  /**
   * Update the tray reference (if tray is recreated)
   */
  setTray(tray: Tray): void {
    this.tray = tray;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.window) {
      this.window.destroy();
      this.window = null;
    }
    this.tray = null;
    console.log('[PopoverManager] Destroyed');
  }

  private applyStateAppearance(state: PopoverState): void {
    if (!this.window || this.window.isDestroyed() || process.platform !== 'darwin') {
      return;
    }

    const isHudState = state === 'recording' || state === 'processing';
    try {
      // During compact HUD states, disable popover vibrancy + shadow so only
      // the overlay chip itself is visible (no boundary rectangle).
      this.window.setVibrancy(isHudState ? null : 'popover');
      this.window.setBackgroundColor('#00000000');
      if (typeof this.window.setHasShadow === 'function') {
        this.window.setHasShadow(!isHudState);
      }
    } catch (error) {
      console.warn('[PopoverManager] Failed to apply state appearance:', error);
    }
  }
}
