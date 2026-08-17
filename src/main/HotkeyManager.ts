/**
 * HotkeyManager - Global Hotkey Registration for MarkuprX
 *
 * Handles:
 * - Global hotkey registration that works when any app is focused
 * - Cross-platform accelerator normalization
 * - Conflict detection and fallback handling
 * - Hotkey customization via settings
 *
 * Default hotkeys:
 * - Cmd+Shift+F (Ctrl+Shift+F on Windows): Toggle recording
 * - Cmd+Shift+S (Ctrl+Shift+S on Windows): Manual screenshot
 * - Cmd+Shift+P (Ctrl+Shift+P on Windows): Pause/resume recording
 */

import { globalShortcut, app } from 'electron';
import type { HotkeyConfig } from '../shared/types';

/**
 * Available hotkey actions
 */
export type HotkeyAction = 'toggleRecording' | 'manualScreenshot' | 'pauseResume';

// HotkeyConfig is imported from '../shared/types' (single source of truth)

/**
 * Result of a hotkey registration attempt
 */
export interface HotkeyRegistrationResult {
  success: boolean;
  action: HotkeyAction;
  accelerator: string;
  fallbackUsed?: string;
  restoredAccelerator?: string;
  error?: string;
}

/**
 * HotkeyManager interface
 */
export interface IHotkeyManager {
  initialize(config?: Partial<HotkeyConfig>): HotkeyRegistrationResult[];
  register(action: HotkeyAction, accelerator: string): HotkeyRegistrationResult;
  unregister(action: HotkeyAction): void;
  unregisterAll(): void;
  getAccelerator(action: HotkeyAction): string | undefined;
  getConfig(): HotkeyConfig;
  isRegistered(action: HotkeyAction): boolean;
  onHotkey(callback: (action: HotkeyAction) => void): () => void;
}

/**
 * Default hotkey configuration
 * Using CommandOrControl for cross-platform compatibility
 */
export const DEFAULT_HOTKEY_CONFIG: HotkeyConfig = {
  toggleRecording: 'CommandOrControl+Shift+F',
  manualScreenshot: 'CommandOrControl+Shift+S',
  pauseResume: 'CommandOrControl+Shift+P',
};

/**
 * Fallback hotkeys if the primary ones are unavailable
 */
const FALLBACK_HOTKEYS: Record<HotkeyAction, string[]> = {
  toggleRecording: [
    'CommandOrControl+Shift+R',
    'CommandOrControl+Alt+F',
    'CommandOrControl+Alt+R',
  ],
  manualScreenshot: [
    'CommandOrControl+Shift+P',
    'CommandOrControl+Alt+S',
    'CommandOrControl+Alt+P',
  ],
  pauseResume: [
    'CommandOrControl+Shift+Space',
    'CommandOrControl+Alt+P',
    'CommandOrControl+Alt+Space',
  ],
};

/**
 * HotkeyManager implementation
 */
class HotkeyManagerImpl implements IHotkeyManager {
  private callbacks: Set<(action: HotkeyAction) => void> = new Set();
  private registeredKeys: Map<HotkeyAction, string> = new Map();
  private config: HotkeyConfig;
  private initialized = false;

  constructor(config?: Partial<HotkeyConfig>) {
    this.config = { ...DEFAULT_HOTKEY_CONFIG, ...config };
  }

  /**
   * Initialize the hotkey manager with default or custom config
   * Returns results for each hotkey registration attempt
   */
  initialize(config?: Partial<HotkeyConfig>): HotkeyRegistrationResult[] {
    if (this.initialized) {
      console.warn('[HotkeyManager] Already initialized, skipping...');
      return [];
    }

    this.config = {
      toggleRecording: config?.toggleRecording || this.config.toggleRecording,
      manualScreenshot: config?.manualScreenshot || this.config.manualScreenshot,
      pauseResume: config?.pauseResume || this.config.pauseResume,
    };

    const results: HotkeyRegistrationResult[] = [];

    // Register toggle recording hotkey
    results.push(this.register('toggleRecording', this.config.toggleRecording));

    // Register manual screenshot hotkey
    results.push(this.register('manualScreenshot', this.config.manualScreenshot));

    // Register pause/resume hotkey
    results.push(this.register('pauseResume', this.config.pauseResume));

    // Setup cleanup on app quit
    app.on('will-quit', () => {
      this.unregisterAll();
    });

    this.initialized = true;
    console.log('[HotkeyManager] Initialized with hotkeys:', this.getConfig());

    return results;
  }

  /**
   * Register a global hotkey for an action
   * Will try fallback accelerators if the primary fails
   */
  register(action: HotkeyAction, accelerator: string): HotkeyRegistrationResult {
    const previousAccelerator = this.registeredKeys.get(action);

    // Unregister existing if any
    this.unregister(action);

    // Normalize the accelerator
    const normalizedAccelerator = this.normalizeAccelerator(accelerator);

    // Try to register the primary accelerator
    const success = this.tryRegister(action, normalizedAccelerator);

    if (success) {
      return {
        success: true,
        action,
        accelerator: normalizedAccelerator,
      };
    }

    // Primary failed, try fallbacks
    console.warn(
      `[HotkeyManager] Failed to register ${normalizedAccelerator} for ${action}, trying fallbacks...`
    );

    const fallbacks = FALLBACK_HOTKEYS[action] || [];
    for (const fallback of fallbacks) {
      const normalizedFallback = this.normalizeAccelerator(fallback);
      const fallbackSuccess = this.tryRegister(action, normalizedFallback);

      if (fallbackSuccess) {
        return {
          success: true,
          action,
          accelerator: normalizedFallback,
          fallbackUsed: normalizedFallback,
        };
      }
    }

    // All attempts failed. Restore the exact accelerator that was live before
    // this replacement so callers never receive a failed update that silently
    // disabled the action.
    if (previousAccelerator) {
      if (this.tryRegister(action, previousAccelerator)) {
        return {
          success: false,
          action,
          accelerator: normalizedAccelerator,
          restoredAccelerator: previousAccelerator,
          error:
            `Failed to register hotkey. ${normalizedAccelerator} and all fallbacks are unavailable. ` +
            `Previous hotkey ${previousAccelerator} was restored.`,
        };
      }

      const restoreError =
        `Could not restore previous hotkey ${previousAccelerator} for ${action}; ` +
        'the action is currently unregistered.';
      console.error(`[HotkeyManager] ${restoreError}`);
      return {
        success: false,
        action,
        accelerator: normalizedAccelerator,
        error:
          `Failed to register hotkey. ${normalizedAccelerator} and all fallbacks are unavailable. ` +
          restoreError,
      };
    }

    return {
      success: false,
      action,
      accelerator: normalizedAccelerator,
      error: `Failed to register hotkey. ${normalizedAccelerator} and all fallbacks are unavailable.`,
    };
  }

  /**
   * Attempt to register an accelerator
   */
  private tryRegister(action: HotkeyAction, accelerator: string): boolean {
    try {
      // Check if already registered globally
      if (globalShortcut.isRegistered(accelerator)) {
        console.warn(`[HotkeyManager] Accelerator ${accelerator} is already registered globally`);
        return false;
      }

      const success = globalShortcut.register(accelerator, () => {
        console.log(`[HotkeyManager] Hotkey triggered: ${action}`);
        this.emitHotkey(action);
      });

      if (success) {
        this.registeredKeys.set(action, accelerator);
        this.config[action] = accelerator;
        console.log(`[HotkeyManager] Registered ${accelerator} for ${action}`);
      }

      return success;
    } catch (error) {
      console.error(`[HotkeyManager] Error registering ${accelerator}:`, error);
      return false;
    }
  }

  /**
   * Unregister a hotkey for an action
   */
  unregister(action: HotkeyAction): void {
    const accelerator = this.registeredKeys.get(action);
    if (accelerator) {
      try {
        globalShortcut.unregister(accelerator);
        this.registeredKeys.delete(action);
        console.log(`[HotkeyManager] Unregistered ${accelerator} for ${action}`);
      } catch (error) {
        console.error(`[HotkeyManager] Error unregistering ${accelerator}:`, error);
      }
    }
  }

  /**
   * Unregister all hotkeys
   */
  unregisterAll(): void {
    const entries = Array.from(this.registeredKeys.entries());
    for (const [action, accelerator] of entries) {
      try {
        globalShortcut.unregister(accelerator);
        console.log(`[HotkeyManager] Unregistered ${accelerator} for ${action}`);
      } catch (error) {
        console.error(`[HotkeyManager] Error unregistering ${accelerator}:`, error);
      }
    }
    this.registeredKeys.clear();
    console.log('[HotkeyManager] All hotkeys unregistered');
  }

  /**
   * Get the registered accelerator for an action
   */
  getAccelerator(action: HotkeyAction): string | undefined {
    return this.registeredKeys.get(action);
  }

  /**
   * Get the current hotkey configuration
   */
  getConfig(): HotkeyConfig {
    return { ...this.config };
  }

  /**
   * Check if a hotkey is registered for an action
   */
  isRegistered(action: HotkeyAction): boolean {
    return this.registeredKeys.has(action);
  }

  /**
   * Subscribe to hotkey events
   * Returns an unsubscribe function
   */
  onHotkey(callback: (action: HotkeyAction) => void): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Emit a hotkey event to all subscribers
   */
  private emitHotkey(action: HotkeyAction): void {
    const callbacksArray = Array.from(this.callbacks);
    for (const callback of callbacksArray) {
      try {
        callback(action);
      } catch (error) {
        console.error(`[HotkeyManager] Error in hotkey callback:`, error);
      }
    }
  }

  /**
   * Normalize accelerator string for consistency
   * Handles platform differences and common aliases
   */
  private normalizeAccelerator(accelerator: string): string {
    let normalized = accelerator.trim();

    // Normalize common aliases
    normalized = normalized
      .replace(/Cmd/gi, 'Command')
      .replace(/Ctrl/gi, 'Control')
      .replace(/Opt/gi, 'Alt')
      .replace(/Option/gi, 'Alt');

    // Ensure proper casing for Electron accelerator keys
    const parts = normalized.split('+').map((part) => {
      const lower = part.toLowerCase().trim();
      switch (lower) {
        case 'command':
          return 'Command';
        case 'control':
          return 'Control';
        case 'commandorcontrol':
          return 'CommandOrControl';
        case 'alt':
          return 'Alt';
        case 'shift':
          return 'Shift';
        case 'super':
          return 'Super';
        case 'meta':
          return 'Meta';
        default:
          // For letter keys, ensure uppercase
          if (lower.length === 1 && /[a-z]/.test(lower)) {
            return lower.toUpperCase();
          }
          // For special keys, capitalize first letter
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      }
    });

    return parts.join('+');
  }

  /**
   * Update configuration with new hotkeys
   * Will re-register affected hotkeys
   */
  updateConfig(newConfig: Partial<HotkeyConfig>): HotkeyRegistrationResult[] {
    const results: HotkeyRegistrationResult[] = [];

    if (newConfig.toggleRecording && newConfig.toggleRecording !== this.config.toggleRecording) {
      results.push(this.register('toggleRecording', newConfig.toggleRecording));
    }

    if (newConfig.manualScreenshot && newConfig.manualScreenshot !== this.config.manualScreenshot) {
      results.push(this.register('manualScreenshot', newConfig.manualScreenshot));
    }

    if (newConfig.pauseResume && newConfig.pauseResume !== this.config.pauseResume) {
      results.push(this.register('pauseResume', newConfig.pauseResume));
    }

    return results;
  }

  /**
   * Get display string for an accelerator (user-friendly format)
   */
  getDisplayString(action: HotkeyAction): string {
    const accelerator = this.registeredKeys.get(action);
    if (!accelerator) return 'Not set';

    const isMac = process.platform === 'darwin';

    return accelerator
      .replace('CommandOrControl', isMac ? '\u2318' : 'Ctrl')
      .replace('Command', '\u2318')
      .replace('Control', 'Ctrl')
      .replace('Shift', isMac ? '\u21E7' : 'Shift')
      .replace('Alt', isMac ? '\u2325' : 'Alt')
      .replace('Super', isMac ? '\u2318' : 'Win')
      .replace(/\+/g, isMac ? '' : '+');
  }
}

// Singleton instance
let hotkeyManagerInstance: HotkeyManagerImpl | null = null;

/**
 * Get or create the HotkeyManager singleton
 */
export function getHotkeyManager(config?: Partial<HotkeyConfig>): HotkeyManagerImpl {
  if (!hotkeyManagerInstance) {
    hotkeyManagerInstance = new HotkeyManagerImpl(config);
  }
  return hotkeyManagerInstance;
}

/**
 * Create a new HotkeyManager instance (for testing)
 */
export function createHotkeyManager(config?: Partial<HotkeyConfig>): HotkeyManagerImpl {
  return new HotkeyManagerImpl(config);
}

// Export the singleton for convenience
export const hotkeyManager = getHotkeyManager();

export default hotkeyManager;

// Re-export HotkeyConfig from shared/types for downstream consumers
export type { HotkeyConfig } from '../shared/types';
