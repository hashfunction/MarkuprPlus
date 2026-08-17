import { PUBLIC_BRAND_NAME } from './publicBrand';

/**
 * Platform-aware hotkey definitions for MarkuprX
 *
 * Provides consistent hotkey handling across macOS, Windows, and Linux.
 * Uses Electron's accelerator format internally but converts to
 * platform-appropriate display formats.
 */

// ============================================================================
// Types
// ============================================================================

export interface HotkeyDefinition {
  id: string;
  label: string;
  description: string;
  macAccelerator: string;
  winLinuxAccelerator: string;
}

export interface DisplayKey {
  key: string;
  symbol: string;
}

// ============================================================================
// Platform Detection
// ============================================================================

/**
 * Detect if running on macOS
 * Works in both main process (process.platform) and renderer (navigator.platform)
 */
export function isMacOS(): boolean {
  const nodeProcess = (globalThis as { process?: { platform?: string } }).process;
  if (nodeProcess?.platform) {
    return nodeProcess.platform === 'darwin';
  }
  if (typeof navigator !== 'undefined' && navigator.platform) {
    return navigator.platform.toUpperCase().includes('MAC');
  }
  return false;
}

/**
 * Detect if running on Windows
 */
export function isWindows(): boolean {
  const nodeProcess = (globalThis as { process?: { platform?: string } }).process;
  if (nodeProcess?.platform) {
    return nodeProcess.platform === 'win32';
  }
  if (typeof navigator !== 'undefined' && navigator.platform) {
    return navigator.platform.toUpperCase().includes('WIN');
  }
  return false;
}

// ============================================================================
// Hotkey Definitions
// ============================================================================

/**
 * All hotkey definitions for MarkuprX
 * Uses Electron accelerator format (CommandOrControl, Shift, Alt, etc.)
 */
export const HOTKEYS: HotkeyDefinition[] = [
  {
    id: 'toggleRecording',
    label: 'Toggle Recording',
    description: 'Start or stop recording',
    macAccelerator: 'Command+Shift+F',
    winLinuxAccelerator: 'Ctrl+Shift+F',
  },
  {
    id: 'manualScreenshot',
    label: 'Manual Screenshot',
    description: 'Capture screenshot immediately',
    macAccelerator: 'Command+Shift+S',
    winLinuxAccelerator: 'Ctrl+Shift+S',
  },
  {
    id: 'pauseResume',
    label: 'Pause/Resume',
    description: 'Pause or resume recording',
    macAccelerator: 'Command+Shift+P',
    winLinuxAccelerator: 'Ctrl+Shift+P',
  },
  {
    id: 'openSettings',
    label: 'Open Settings',
    description: 'Open settings panel',
    macAccelerator: 'Command+,',
    winLinuxAccelerator: 'Ctrl+,',
  },
  {
    id: 'showHelp',
    label: 'Show Help',
    description: 'Show keyboard shortcuts',
    macAccelerator: 'Command+?',
    winLinuxAccelerator: 'Ctrl+Shift+/',
  },
  {
    id: 'quit',
    label: 'Quit',
    description: `Exit ${PUBLIC_BRAND_NAME}`,
    macAccelerator: 'Command+Q',
    winLinuxAccelerator: 'Alt+F4',
  },
];

// ============================================================================
// Key Display Mappings
// ============================================================================

/**
 * macOS key display names (plain text for maximum rendering stability)
 */
const MAC_SYMBOLS: Record<string, string> = {
  command: 'Cmd',
  cmd: 'Cmd',
  control: 'Ctrl',
  ctrl: 'Ctrl',
  option: 'Option',
  alt: 'Option',
  shift: 'Shift',
  enter: 'Enter',
  return: 'Return',
  delete: 'Delete',
  backspace: 'Delete',
  escape: 'Esc',
  esc: 'Esc',
  tab: 'Tab',
  space: 'Space',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  pageup: 'Page Up',
  pagedown: 'Page Down',
  home: 'Home',
  end: 'End',
  fn: 'Fn',
};

/**
 * Windows/Linux key display names
 */
const WIN_LINUX_NAMES: Record<string, string> = {
  command: 'Ctrl',
  cmd: 'Ctrl',
  control: 'Ctrl',
  ctrl: 'Ctrl',
  option: 'Alt',
  alt: 'Alt',
  shift: 'Shift',
  enter: 'Enter',
  return: 'Enter',
  delete: 'Del',
  backspace: 'Backspace',
  escape: 'Esc',
  esc: 'Esc',
  tab: 'Tab',
  space: 'Space',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  pageup: 'Page Up',
  pagedown: 'Page Down',
  home: 'Home',
  end: 'End',
  fn: 'Fn',
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get a hotkey definition by ID
 */
export function getHotkeyById(id: string): HotkeyDefinition | undefined {
  return HOTKEYS.find(h => h.id === id);
}

/**
 * Get the Electron accelerator string for a hotkey
 * Returns platform-appropriate accelerator
 */
export function getAccelerator(hotkeyId: string): string {
  const hotkey = getHotkeyById(hotkeyId);
  if (!hotkey) return '';

  return isMacOS() ? hotkey.macAccelerator : hotkey.winLinuxAccelerator;
}

/**
 * Get the Electron accelerator from a custom hotkey string
 * Handles both platform-specific and generic formats
 */
export function normalizeAccelerator(accelerator: string): string {
  // Replace CommandOrControl with platform-specific
  if (isMacOS()) {
    return accelerator
      .replace(/CommandOrControl/gi, 'Command')
      .replace(/CmdOrCtrl/gi, 'Cmd');
  } else {
    return accelerator
      .replace(/CommandOrControl/gi, 'Control')
      .replace(/CmdOrCtrl/gi, 'Ctrl')
      .replace(/Command/gi, 'Control')
      .replace(/Cmd/gi, 'Ctrl');
  }
}

/**
 * Parse an accelerator string into individual keys
 */
export function parseAccelerator(accelerator: string): string[] {
  return accelerator.split('+').map(k => k.trim());
}

/**
 * Get display keys for an accelerator (for UI rendering)
 * Returns keys formatted appropriately for the current platform
 */
export function getDisplayKeys(accelerator: string): string[] {
  const keys = parseAccelerator(accelerator);
  const platform = isMacOS();

  return keys.map(key => {
    const lowerKey = key.toLowerCase();

    if (platform) {
      // macOS: Use symbols
      return MAC_SYMBOLS[lowerKey] || key.toUpperCase();
    } else {
      // Windows/Linux: Use readable names
      return WIN_LINUX_NAMES[lowerKey] || key.toUpperCase();
    }
  });
}

/**
 * Get display keys for a hotkey by ID
 */
export function getDisplayKeysById(hotkeyId: string): string[] {
  const accelerator = getAccelerator(hotkeyId);
  return getDisplayKeys(accelerator);
}

/**
 * Format an accelerator for display
 * Returns a single string like "Cmd+Shift+F" or "Ctrl+Shift+F"
 */
export function formatAcceleratorForDisplay(accelerator: string): string {
  const keys = getDisplayKeys(accelerator);
  return keys.join('+');
}

/**
 * Format a hotkey for display by ID
 */
export function formatHotkeyForDisplay(hotkeyId: string): string {
  const accelerator = getAccelerator(hotkeyId);
  return formatAcceleratorForDisplay(accelerator);
}

/**
 * Convert a HotkeyConfig-style accelerator to display format
 * Handles "CommandOrControl" and other generic formats
 */
export function formatHotkeyConfigForDisplay(accelerator: string): string {
  const normalized = normalizeAccelerator(accelerator);
  return formatAcceleratorForDisplay(normalized);
}

// ============================================================================
// Exports for types compatibility
// ============================================================================

export type HotkeyId = (typeof HOTKEYS)[number]['id'];
