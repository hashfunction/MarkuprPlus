/**
 * HotkeyHint - Platform-aware keyboard shortcut display
 *
 * Renders keyboard shortcuts with plain-text key labels for maximum stability.
 *
 * Supports both inline (within buttons) and standalone rendering.
 */

import React, { useMemo } from 'react';
import {
  isMacOS,
  getDisplayKeys,
} from '../../shared/hotkeys';

// ============================================================================
// Types
// ============================================================================

interface HotkeyHintProps {
  /**
   * Keyboard keys to display.
   * Can be an array of keys like ['Cmd', 'Shift', 'F']
   * or a single accelerator string like 'CommandOrControl+Shift+F'
   */
  keys: string[] | string;

  /**
   * Render inline (smaller, within buttons/text) vs standalone
   */
  inline?: boolean;

  /**
   * Additional CSS class name
   */
  className?: string;

  /**
   * Custom styles
   */
  style?: React.CSSProperties;

  /**
   * Size variant
   */
  size?: 'small' | 'medium' | 'large';
}

// ============================================================================
// Key Symbol Mappings (for array input)
// ============================================================================

const MAC_SYMBOLS: Record<string, string> = {
  cmd: 'Cmd',
  command: 'Cmd',
  ctrl: 'Ctrl',
  control: 'Ctrl',
  alt: 'Option',
  option: 'Option',
  shift: 'Shift',
  enter: 'Enter',
  return: 'Return',
  delete: 'Delete',
  backspace: 'Delete',
  esc: 'Esc',
  escape: 'Esc',
  tab: 'Tab',
  space: 'Space',
};

const WIN_NAMES: Record<string, string> = {
  cmd: 'Ctrl',
  command: 'Ctrl',
  ctrl: 'Ctrl',
  control: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  enter: 'Enter',
  return: 'Enter',
  delete: 'Del',
  backspace: 'Backspace',
  esc: 'Esc',
  escape: 'Esc',
  tab: 'Tab',
  space: 'Space',
};

// ============================================================================
// Component
// ============================================================================

export const HotkeyHint: React.FC<HotkeyHintProps> = ({
  keys,
  inline = false,
  className = '',
  style,
  size = 'medium',
}) => {
  const mac = useMemo(() => isMacOS(), []);

  // Convert keys to display format
  const displayKeys = useMemo(() => {
    // If keys is a string (accelerator format), parse it
    if (typeof keys === 'string') {
      return getDisplayKeys(keys);
    }

    // If keys is an array, convert each key
    return keys.map(key => {
      const lowerKey = key.toLowerCase();

      if (mac) {
        return MAC_SYMBOLS[lowerKey] || key.toUpperCase();
      } else {
        return WIN_NAMES[lowerKey] || key.toUpperCase();
      }
    });
  }, [keys, mac]);

  // Size-based styles
  const sizeStyles = useMemo(() => {
    switch (size) {
      case 'small':
        return {
          gap: 1,
          keyMinWidth: 14,
          keyHeight: 16,
          keyPadding: '0 3px',
          fontSize: 10,
          borderRadius: 3,
        };
      case 'large':
        return {
          gap: 3,
          keyMinWidth: 24,
          keyHeight: 24,
          keyPadding: '0 6px',
          fontSize: 13,
          borderRadius: 5,
        };
      default: // medium
        return {
          gap: 2,
          keyMinWidth: 18,
          keyHeight: 18,
          keyPadding: '0 4px',
          fontSize: 11,
          borderRadius: 4,
        };
    }
  }, [size]);

  const containerStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: sizeStyles.gap,
    marginLeft: inline ? 4 : 8,
    opacity: inline ? 0.7 : 1,
    color: inline ? 'inherit' : 'var(--text-primary)',
    ...style,
  };

  const keyStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: sizeStyles.keyMinWidth,
    height: sizeStyles.keyHeight,
    padding: sizeStyles.keyPadding,
    backgroundColor: inline ? 'rgba(255, 255, 255, 0.08)' : 'var(--bg-tertiary)',
    borderRadius: sizeStyles.borderRadius,
    fontSize: sizeStyles.fontSize,
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
    fontWeight: 500,
    color: 'inherit',
    lineHeight: 1,
  };

  const separatorStyle: React.CSSProperties = {
    fontSize: sizeStyles.fontSize - 1,
    color: 'currentColor',
    opacity: 0.65,
    marginLeft: 1,
    marginRight: 1,
  };

  return (
    <span className={`hotkey-hint ${inline ? 'inline' : ''} ${className}`} style={containerStyle}>
      {displayKeys.map((key, index) => (
        <React.Fragment key={index}>
          <kbd style={keyStyle}>{key}</kbd>
          {index < displayKeys.length - 1 && (
            <span style={separatorStyle}>+</span>
          )}
        </React.Fragment>
      ))}
    </span>
  );
};

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Simple hotkey display for the toggle recording shortcut
 */
export const ToggleRecordingHint: React.FC<{ inline?: boolean }> = ({ inline }) => {
  const mac = isMacOS();
  return (
    <HotkeyHint
      keys={mac ? ['Cmd', 'Shift', 'F'] : ['Ctrl', 'Shift', 'F']}
      inline={inline}
    />
  );
};

/**
 * Simple hotkey display for manual screenshot
 */
export const ManualScreenshotHint: React.FC<{ inline?: boolean }> = ({ inline }) => {
  const mac = isMacOS();
  return (
    <HotkeyHint
      keys={mac ? ['Cmd', 'Shift', 'S'] : ['Ctrl', 'Shift', 'S']}
      inline={inline}
    />
  );
};

/**
 * Simple hotkey display for pause/resume
 */
export const PauseResumeHint: React.FC<{ inline?: boolean }> = ({ inline }) => {
  const mac = isMacOS();
  return (
    <HotkeyHint
      keys={mac ? ['Cmd', 'Shift', 'P'] : ['Ctrl', 'Shift', 'P']}
      inline={inline}
    />
  );
};

/**
 * Get platform-aware hotkey text for status/tooltip displays
 */
export function getHotkeyText(
  hotkeyId: 'toggleRecording' | 'manualScreenshot' | 'pauseResume'
): string {
  switch (hotkeyId) {
    case 'toggleRecording':
      return isMacOS() ? 'Cmd+Shift+F' : 'Ctrl+Shift+F';
    case 'manualScreenshot':
      return isMacOS() ? 'Cmd+Shift+S' : 'Ctrl+Shift+S';
    case 'pauseResume':
      return isMacOS() ? 'Cmd+Shift+P' : 'Ctrl+Shift+P';
    default:
      return '';
  }
}

export default HotkeyHint;
