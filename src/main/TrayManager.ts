/**
 * TrayManager - System tray icon management for MarkuprX
 *
 * Handles:
 * - 5 visual states: idle, recording, processing, complete, error
 * - Context menu with actions
 * - Click behavior (toggle recording on macOS)
 * - Tooltips showing current state
 * - Processing animation (rotating dashed circle)
 * - Recording pulse animation support (opacity-based)
 * - Complete state with green checkmark
 */

import { Tray, Menu, nativeImage, app, NativeImage, shell } from 'electron';
import { join } from 'path';
import type { TrayState } from '../shared/types';
import { formatHotkeyForDisplay } from '../shared/hotkeys';

/**
 * Interface for TrayManager operations
 */
export interface ITrayManager {
  initialize(): void;
  setState(state: TrayState): void;
  setTooltip(text: string): void;
  destroy(): void;
  onClick(callback: () => void): void;
  onSettingsClick(callback: () => void): void;
  getTray(): Tray | null;
}

/**
 * Build tooltip messages for each tray state.
 * Uses platform-aware hotkey display (Cmd on macOS, Ctrl on Windows/Linux).
 */
function buildStateTooltips(): Record<TrayState, string> {
  const toggleKey = formatHotkeyForDisplay('toggleRecording');
  return {
    idle: `MarkuprX - Ready (${toggleKey})`,
    recording: `MarkuprX - Recording... (${toggleKey} to stop)`,
    processing: 'MarkuprX - Processing...',
    complete: 'MarkuprX - Feedback captured!',
    error: 'MarkuprX - Error (click for details)',
  };
}

const DONATE_URL = 'https://ko-fi.com/eddiesanjuan';

/**
 * TrayManager implementation
 */
class TrayManagerImpl implements ITrayManager {
  private tray: Tray | null = null;
  private contextMenu: Menu | null = null;
  private currentState: TrayState = 'idle';
  private clickCallbacks: Array<() => void> = [];
  private settingsCallbacks: Array<() => void> = [];
  private animationInterval: NodeJS.Timeout | null = null;
  private animationFrame: number = 0;
  private iconCache: Map<string, NativeImage> = new Map();
  private completeTimeout: NodeJS.Timeout | null = null;

  /**
   * Get the path to an icon asset
   * On macOS, uses Template images for automatic dark/light mode handling
   */
  private getIconPath(state: TrayState, frame?: number): string {
    const isMac = process.platform === 'darwin';
    const suffix = isMac ? 'Template' : '';
    const frameSuffix = frame !== undefined ? `-${frame}` : '';

    // Path relative to the built main process directory
    // In production: dist/main/index.js -> assets/
    // In development: similar structure
    const assetsPath = app.isPackaged
      ? join(process.resourcesPath, 'assets')
      : join(__dirname, '../../assets');

    return join(assetsPath, `tray-${state}${frameSuffix}${suffix}.png`);
  }

  /**
   * Load and cache an icon, creating a placeholder if the file doesn't exist
   */
  private loadIcon(state: TrayState, frame?: number): NativeImage {
    const cacheKey = `${state}-${frame ?? 'default'}`;

    if (this.iconCache.has(cacheKey)) {
      return this.iconCache.get(cacheKey)!;
    }

    const iconPath = this.getIconPath(state, frame);
    let icon: NativeImage;

    try {
      icon = nativeImage.createFromPath(iconPath);

      // If the icon is empty, create a placeholder
      if (icon.isEmpty()) {
        icon = this.createPlaceholderIcon(state);
      }
    } catch {
      // Create placeholder if file doesn't exist
      icon = this.createPlaceholderIcon(state);
    }

    // Resize for menu bar (16x16 on macOS, 16x16 or 32x32 on others)
    const size = process.platform === 'darwin' ? 16 : 16;
    icon = icon.resize({ width: size, height: size });
    if (process.platform === 'darwin') {
      icon.setTemplateImage(true);
    }

    this.iconCache.set(cacheKey, icon);
    return icon;
  }

  /**
   * Create a placeholder icon when the actual icon file doesn't exist
   * Uses simple shapes to represent each state
   */
  private createPlaceholderIcon(state: TrayState): NativeImage {
    // Create a 32x32 data URL icon (will be resized later)
    // These are simple SVG-based placeholders
    const size = 32;
    const canvas = this.createIconCanvas(state, size);

    return nativeImage.createFromDataURL(canvas);
  }

  /**
   * Generate a data URL for a simple icon based on state
   */
  private createIconCanvas(state: TrayState, size: number): string {
    const center = size / 2;
    const radius = size / 2 - 2;

    let svg: string;

    switch (state) {
      case 'idle':
        // Circle outline (ready to record)
        svg = `
          <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
            <circle cx="${center}" cy="${center}" r="${radius}"
                    fill="none" stroke="#666666" stroke-width="2"/>
          </svg>
        `;
        break;

      case 'recording':
        // Filled red circle (recording active)
        svg = `
          <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
            <circle cx="${center}" cy="${center}" r="${radius}" fill="#FF3B30"/>
          </svg>
        `;
        break;

      case 'processing':
        // Spinning indicator (processing)
        svg = `
          <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
            <circle cx="${center}" cy="${center}" r="${radius}"
                    fill="none" stroke="#666666" stroke-width="2" stroke-dasharray="8 4"/>
          </svg>
        `;
        break;

      case 'complete':
        // Green circle with checkmark (success state)
        svg = `
          <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
            <circle cx="${center}" cy="${center}" r="${radius}" fill="#10B981"/>
            <path d="M${center - 4} ${center}l3 3 5-5" stroke="white" stroke-width="2"
                  fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        `;
        break;

      case 'error':
        // Warning triangle (error state)
        svg = `
          <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
            <polygon points="${center},4 ${size - 4},${size - 4} 4,${size - 4}"
                     fill="#FF9500" stroke="#FF9500" stroke-width="1"/>
            <text x="${center}" y="${size - 8}" text-anchor="middle"
                  fill="white" font-size="16" font-weight="bold">!</text>
          </svg>
        `;
        break;

      default:
        // Fallback circle
        svg = `
          <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
            <circle cx="${center}" cy="${center}" r="${radius}" fill="#999999"/>
          </svg>
        `;
    }

    // Convert SVG to data URL
    const base64 = Buffer.from(svg.trim()).toString('base64');
    return `data:image/svg+xml;base64,${base64}`;
  }

  /**
   * Initialize the system tray
   */
  initialize(): void {
    if (this.tray) {
      console.warn('[TrayManager] Already initialized');
      return;
    }

    const icon = this.loadIcon('idle');
    this.tray = new Tray(icon);

    this.tray.setToolTip(buildStateTooltips().idle);
    this.updateContextMenu();

    if (process.platform === 'darwin') {
      // Use mouse-up so we can strictly separate left click (popover) and right click (context menu).
      // This prevents the "menu + popover both open" behavior seen when macOS emits both click variants.
      this.tray.on('mouse-up', (event) => {
        const button = (event as { button?: number }).button;
        if (button === 2) {
          this.tray?.popUpContextMenu(this.contextMenu ?? undefined);
          return;
        }
        this.clickCallbacks.forEach((cb) => cb());
      });
    } else {
      // On Windows/Linux, regular click opens/toggles app; right-click menu is handled by setContextMenu.
      this.tray.on('click', () => {
        this.clickCallbacks.forEach((cb) => cb());
      });
    }

    console.log('[TrayManager] Initialized');
  }

  /**
   * Update the context menu based on current state
   */
  private updateContextMenu(): void {
    if (!this.tray) return;

    const isRecording = this.currentState === 'recording';
    const isProcessing = this.currentState === 'processing';

    const menu = Menu.buildFromTemplate([
      {
        label: 'Buy Developer a Coffee',
        click: () => {
          void shell.openExternal(DONATE_URL);
        },
      },
      { type: 'separator' },
      {
        label: isRecording ? 'Stop Recording' : 'Start Recording',
        enabled: !isProcessing,
        click: () => {
          this.clickCallbacks.forEach((cb) => cb());
        },
      },
      { type: 'separator' },
      {
        label: 'Settings...',
        accelerator: 'CmdOrCtrl+,',
        click: () => {
          this.settingsCallbacks.forEach((cb) => cb());
        },
      },
      { type: 'separator' },
      {
        label: 'About MarkuprX',
        role: 'about',
      },
      { type: 'separator' },
      {
        label: 'Quit MarkuprX',
        accelerator: 'CmdOrCtrl+Q',
        click: () => {
          app.quit();
        },
      },
    ]);

    this.contextMenu = menu;

    if (process.platform === 'darwin') {
      // Keep left-click dedicated to opening the popover.
      // Showing the menu is explicit via right-click.
      this.tray.setContextMenu(null);
      return;
    }

    this.tray.setContextMenu(menu);
  }

  /**
   * Set the tray state and update icon/tooltip
   */
  setState(state: TrayState): void {
    if (!this.tray) {
      console.warn('[TrayManager] Not initialized');
      return;
    }

    this.currentState = state;

    // Stop any existing animation and clear complete timeout
    this.stopAnimation();
    if (this.completeTimeout) {
      clearTimeout(this.completeTimeout);
      this.completeTimeout = null;
    }

    // Set the appropriate icon
    const icon = this.loadIcon(state);
    this.tray.setImage(icon);

    // Set tooltip
    this.tray.setToolTip(buildStateTooltips()[state]);

    // Start animation based on state
    if (state === 'processing') {
      this.startProcessingAnimation();
    } else if (state === 'recording' && process.platform !== 'darwin') {
      this.startRecordingAnimation();
    }

    // Update context menu (Start/Stop label changes)
    this.updateContextMenu();

    console.log(`[TrayManager] State changed to: ${state}`);
  }

  /**
   * Start the processing animation (rotating icon)
   */
  private startProcessingAnimation(): void {
    if (!this.tray) return;

    // Animation: cycle through 4 rotation frames
    const frames = 4;
    this.animationFrame = 0;

    this.animationInterval = setInterval(() => {
      this.animationFrame = (this.animationFrame + 1) % frames;

      // Try to load frame-specific icon, fall back to generating one
      const icon = this.loadProcessingFrameIcon(this.animationFrame, frames);
      this.tray?.setImage(icon);
    }, 200); // 200ms per frame = 5 FPS
  }

  /**
   * Start the recording animation (pulse effect via opacity)
   * Creates a subtle pulse by alternating between full and slightly dim icons
   */
  private startRecordingAnimation(): void {
    if (!this.tray) return;

    if (process.platform === 'darwin') {
      // Template icons can disappear/flicker when rapidly swapped on macOS menu bar.
      // Keep a stable recording icon instead of pulsing.
      this.tray.setImage(this.loadIcon('recording'));
      return;
    }

    // Animation: pulse between opacity levels (simulated via icon switching)
    // We use 2 frames: normal (100%) and dimmed (60%)
    const frames = 4; // Full cycle: bright -> dim -> bright -> dim
    this.animationFrame = 0;

    this.animationInterval = setInterval(() => {
      this.animationFrame = (this.animationFrame + 1) % frames;

      // Load appropriate icon - frame 0,1 = full brightness, frame 2,3 = dimmed
      const isDim = this.animationFrame >= 2;
      const icon = this.loadRecordingFrameIcon(isDim);
      this.tray?.setImage(icon);
    }, 375); // 375ms per frame = 1.5s full cycle (matches CSS pulse animation)
  }

  /**
   * Load or generate a recording animation frame
   * @param isDim Whether to show the dimmed (60% opacity) version
   */
  private loadRecordingFrameIcon(isDim: boolean): NativeImage {
    const cacheKey = `recording-frame-${isDim ? 'dim' : 'bright'}`;

    if (this.iconCache.has(cacheKey)) {
      return this.iconCache.get(cacheKey)!;
    }

    // Generate recording icon with appropriate opacity
    const size = 32;
    const center = size / 2;
    const radius = size / 2 - 2;
    const opacity = isDim ? 0.6 : 1.0;

    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${center}" cy="${center}" r="${radius}" fill="#EF4444" opacity="${opacity}"/>
      </svg>
    `;

    const base64 = Buffer.from(svg.trim()).toString('base64');
    const dataUrl = `data:image/svg+xml;base64,${base64}`;
    const icon = nativeImage.createFromDataURL(dataUrl).resize({ width: 16, height: 16 });
    if (process.platform === 'darwin') {
      icon.setTemplateImage(true);
    }

    this.iconCache.set(cacheKey, icon);
    return icon;
  }

  /**
   * Load or generate a processing animation frame
   */
  private loadProcessingFrameIcon(frame: number, totalFrames: number): NativeImage {
    const cacheKey = `processing-frame-${frame}`;

    if (this.iconCache.has(cacheKey)) {
      return this.iconCache.get(cacheKey)!;
    }

    // First try to load from file
    const iconPath = this.getIconPath('processing', frame);
    try {
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) {
        const resized = icon.resize({ width: 16, height: 16 });
        this.iconCache.set(cacheKey, resized);
        return resized;
      }
    } catch {
      // Fall through to generate
    }

    // Generate a rotating dashed circle
    const size = 32;
    const center = size / 2;
    const radius = size / 2 - 2;
    const rotation = (frame / totalFrames) * 360;

    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <g transform="rotate(${rotation} ${center} ${center})">
          <circle cx="${center}" cy="${center}" r="${radius}"
                  fill="none" stroke="#666666" stroke-width="2"
                  stroke-dasharray="6 4" stroke-linecap="round"/>
        </g>
      </svg>
    `;

    const base64 = Buffer.from(svg.trim()).toString('base64');
    const dataUrl = `data:image/svg+xml;base64,${base64}`;
    const icon = nativeImage.createFromDataURL(dataUrl).resize({ width: 16, height: 16 });
    if (process.platform === 'darwin') {
      icon.setTemplateImage(true);
    }

    this.iconCache.set(cacheKey, icon);
    return icon;
  }

  /**
   * Stop the processing animation
   */
  private stopAnimation(): void {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }
    this.animationFrame = 0;
  }

  /**
   * Set a custom tooltip
   */
  setTooltip(text: string): void {
    if (!this.tray) {
      console.warn('[TrayManager] Not initialized');
      return;
    }
    this.tray.setToolTip(text);
  }

  /**
   * Register a click callback
   */
  onClick(callback: () => void): void {
    this.clickCallbacks.push(callback);
  }

  /**
   * Register a settings click callback
   */
  onSettingsClick(callback: () => void): void {
    this.settingsCallbacks.push(callback);
  }

  /**
   * Get the Tray instance (for positioning popover)
   */
  getTray(): Tray | null {
    return this.tray;
  }

  /**
   * Destroy the tray icon and clean up
   */
  destroy(): void {
    this.stopAnimation();
    this.iconCache.clear();

    if (this.completeTimeout) {
      clearTimeout(this.completeTimeout);
      this.completeTimeout = null;
    }

    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
    this.contextMenu = null;

    this.clickCallbacks = [];
    this.settingsCallbacks = [];

    console.log('[TrayManager] Destroyed');
  }
}

// Export singleton instance
export const trayManager = new TrayManagerImpl();

// Export types and interface
export type { TrayState };
export type { ITrayManager as TrayManager };
