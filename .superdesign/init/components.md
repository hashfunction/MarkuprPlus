# Shared UI Components

Framework: React 18 + TypeScript. The application uses custom React primitives, inline style objects, CSS custom properties, and a project-local utility-class stylesheet rather than an external component library.

## ApiKeyInput

- Source: `src/renderer/components/primitives/ApiKeyInput.tsx`
- Purpose: Secure API-key field with visibility, testing, validation, and status feedback.

```tsx
import React from 'react';
import { useTheme } from '../../hooks/useTheme';
import { styles } from '../settings/settingsStyles';

export interface ApiKeyState {
  value: string;
  visible: boolean;
  testing: boolean;
  valid: boolean | null;
  error: string | null;
}

export const ApiKeyInput: React.FC<{
  label: string;
  description?: string;
  serviceName: string;
  apiKey: ApiKeyState;
  onApiKeyChange: (value: string) => void;
  onToggleVisibility: () => void;
  onTest: () => void;
}> = ({ label, description, serviceName, apiKey, onApiKeyChange, onToggleVisibility, onTest }) => {
  const { colors } = useTheme();
  return (
  <div style={styles.settingRowVertical}>
    <div style={styles.settingInfo}>
      <span style={styles.settingLabel}>{label}</span>
      {description && <span style={styles.settingDescription}>{description}</span>}
    </div>
    <div style={styles.apiKeyContainer}>
      <div style={styles.apiKeyInputWrapper}>
        <input
          type={apiKey.visible ? 'text' : 'password'}
          value={apiKey.value}
          onChange={(e) => onApiKeyChange(e.target.value)}
          placeholder={`Enter your ${serviceName} API key`}
          style={{
            ...styles.apiKeyInput,
            borderColor: apiKey.error ? colors.status.error : apiKey.valid ? colors.status.success : colors.border.default,
          }}
        />
        <button style={styles.apiKeyVisibilityButton} onClick={onToggleVisibility} title={apiKey.visible ? 'Hide' : 'Show'}>
          {apiKey.visible ? (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M2.636 9.364S4.91 5.182 9 5.182s6.364 4.182 6.364 4.182-2.273 4.182-6.364 4.182-6.364-4.182-6.364-4.182z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M2 2l14 14M7.455 7.455a2 2 0 002.828 2.828M14.182 10.727c.6-.527.975-.961 1.182-1.363-1.636-3.273-4.364-5.182-6.364-5.182-.545 0-1.09.127-1.636.382M3.818 5.273C2.818 6.073 2.273 6.909 2 7.636c1.636 3.273 4.364 5.182 6.364 5.182.818 0 1.636-.255 2.454-.727"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>
      <button
        style={{
          ...styles.apiKeyTestButton,
          backgroundColor: apiKey.testing ? colors.bg.tertiary : apiKey.valid ? colors.status.success : colors.accent.default,
          cursor: !apiKey.value ? 'not-allowed' : 'pointer',
          opacity: !apiKey.value ? 0.5 : 1,
        }}
        onClick={onTest}
        disabled={!apiKey.value}
      >
        {apiKey.testing ? (
          <span style={styles.spinner} />
        ) : apiKey.valid ? (
          <>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 2.25a4.75 4.75 0 104.39 2.92"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path d="M10.7 2.3h1.2v1.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Retest
          </>
        ) : (
          'Test Connection'
        )}
      </button>
    </div>
    {apiKey.error && <span style={styles.apiKeyError}>{apiKey.error}</span>}
    {apiKey.valid && <span style={styles.apiKeySuccess}>API key verified and saved securely.</span>}
  </div>
  );
};
```

## ColorPicker

- Source: `src/renderer/components/primitives/ColorPicker.tsx`
- Purpose: Theme accent picker with presets and a custom color input.

```tsx
import React, { useState } from 'react';
import { accentColors } from '../../styles/theme';
import { useTheme } from '../../hooks/useTheme';
import { styles } from '../settings/settingsStyles';

export const ACCENT_COLORS = [
  { name: accentColors.blue.name, value: accentColors.blue.default },
  { name: accentColors.violet.name, value: accentColors.violet.default },
  { name: accentColors.pink.name, value: accentColors.pink.default },
  { name: accentColors.red.name, value: accentColors.red.default },
  { name: accentColors.orange.name, value: accentColors.orange.default },
  { name: accentColors.amber.name, value: accentColors.amber.default },
  { name: accentColors.emerald.name, value: accentColors.emerald.default },
  { name: accentColors.teal.name, value: accentColors.teal.default },
  { name: accentColors.cyan.name, value: accentColors.cyan.default },
];

export const ColorPicker: React.FC<{
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ label, description, value, onChange }) => {
  const [customColor, setCustomColor] = useState(value);
  const { colors } = useTheme();

  const normalizedValue = value.toLowerCase();
  const isPreset = ACCENT_COLORS.some((c) => c.value.toLowerCase() === normalizedValue);

  return (
    <div style={styles.settingRowVertical}>
      <div style={styles.settingInfo}>
        <span style={styles.settingLabel}>{label}</span>
        {description && <span style={styles.settingDescription}>{description}</span>}
      </div>
      <div style={styles.colorPickerContainer}>
        {ACCENT_COLORS.map((color) => (
          <button
            key={color.value}
            style={{
              ...styles.colorSwatch,
              backgroundColor: color.value,
              boxShadow: normalizedValue === color.value.toLowerCase() ? `0 0 0 2px ${colors.bg.primary}, 0 0 0 4px ${color.value}` : 'none',
            }}
            onClick={() => onChange(color.value)}
            title={color.name}
            aria-label={`Select ${color.name} accent color`}
          />
        ))}
        <div style={styles.customColorContainer}>
          <input
            type="color"
            aria-label="Choose a custom accent color"
            value={isPreset ? customColor : value}
            onChange={(e) => {
              setCustomColor(e.target.value);
              onChange(e.target.value);
            }}
            style={styles.customColorInput}
            title="Custom color"
          />
          <span style={styles.customColorLabel}>Custom</span>
        </div>
      </div>
    </div>
  );
};
```

## DangerButton

- Source: `src/renderer/components/primitives/DangerButton.tsx`
- Purpose: Two-step confirmation action for destructive settings.

```tsx
import React, { useState, useCallback } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { styles } from '../settings/settingsStyles';

export const DangerButton: React.FC<{
  label: string;
  description?: string;
  buttonText: string;
  onConfirm: () => void;
  confirmText?: string;
}> = ({ label, description, buttonText, onConfirm, confirmText }) => {
  const [confirming, setConfirming] = useState(false);
  const { colors } = useTheme();

  const handleClick = useCallback(() => {
    if (confirming) {
      onConfirm();
      setConfirming(false);
    } else {
      setConfirming(true);
      // Auto-reset after 3 seconds
      setTimeout(() => setConfirming(false), 3000);
    }
  }, [confirming, onConfirm]);

  return (
    <div style={styles.settingRow}>
      <div style={styles.settingInfo}>
        <span style={styles.settingLabel}>{label}</span>
        {description && <span style={styles.settingDescription}>{description}</span>}
      </div>
      <button
        style={{
          ...styles.dangerButton,
          backgroundColor: confirming ? colors.status.error : colors.status.errorSubtle,
          color: confirming ? colors.text.inverse : colors.status.error,
          borderColor: confirming ? colors.status.error : colors.status.errorSubtle,
        }}
        onClick={handleClick}
      >
        {confirming ? confirmText || 'Click again to confirm' : buttonText}
      </button>
    </div>
  );
};
```

## DirectoryPicker

- Source: `src/renderer/components/primitives/DirectoryPicker.tsx`
- Purpose: Output-directory field and browse action.

```tsx
import React, { useCallback } from 'react';
import { styles } from '../settings/settingsStyles';

export const DirectoryPicker: React.FC<{
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ label, description, value, onChange }) => {
  const handleBrowse = useCallback(async () => {
    try {
      const result = await window.markuprx.settings.selectDirectory();
      if (result) {
        onChange(result);
      }
    } catch {
      // User cancelled or error
    }
  }, [onChange]);

  return (
    <div style={styles.settingRow}>
      <div style={styles.settingInfo}>
        <span style={styles.settingLabel}>{label}</span>
        {description && <span style={styles.settingDescription}>{description}</span>}
      </div>
      <div style={styles.directoryPicker}>
        <input
          type="text"
          value={value}
          readOnly
          style={styles.directoryInput}
          placeholder="Select output directory..."
        />
        <button style={styles.browseButton} onClick={handleBrowse}>
          Browse...
        </button>
      </div>
    </div>
  );
};
```

## DropdownSetting

- Source: `src/renderer/components/primitives/Dropdown.tsx`
- Purpose: Labeled select control for settings.

```tsx
import React, { useId } from 'react';
import { styles } from '../settings/settingsStyles';

export const DropdownSetting: React.FC<{
  label: string;
  description?: string;
  value: string | number;
  options: { value: string | number; label: string }[];
  onChange: (value: string | number) => void;
  disabled?: boolean;
}> = ({ label, description, value, options, onChange, disabled }) => {
  const controlId = useId();
  const descriptionId = useId();
  return (
    <div style={styles.settingRow}>
      <div style={styles.settingInfo}>
        <label htmlFor={controlId} style={styles.settingLabel}>{label}</label>
        {description && <span id={descriptionId} style={styles.settingDescription}>{description}</span>}
      </div>
      <select
        id={controlId}
        aria-describedby={description ? descriptionId : undefined}
        style={{
          ...styles.select,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};
```

## KeyRecorder

- Source: `src/renderer/components/primitives/KeyRecorder.tsx`
- Purpose: Keyboard shortcut capture and conflict display.

```tsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { styles } from '../settings/settingsStyles';

export const KeyRecorder: React.FC<{
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  conflict?: string | null;
}> = ({ label, description, value, onChange, conflict }) => {
  const [recording, setRecording] = useState(false);
  const { colors } = useTheme();
  const inputRef = useRef<HTMLButtonElement>(null);
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');

  const formatHotkey = useCallback((hotkey: string): string => {
    return hotkey
      .replace('CommandOrControl', isMac ? 'Cmd' : 'Ctrl')
      .replace('Command', 'Cmd')
      .replace('Control', 'Ctrl')
      .replace('Alt', isMac ? 'Option' : 'Alt')
      .replace('Shift', 'Shift')
      .replace(/\+/g, ' + ');
  }, [isMac]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!recording) return;

      e.preventDefault();
      e.stopPropagation();

      const modifiers: string[] = [];
      if (e.metaKey || e.ctrlKey) modifiers.push('CommandOrControl');
      if (e.altKey) modifiers.push('Alt');
      if (e.shiftKey) modifiers.push('Shift');

      // Ignore modifier-only keys
      const key = e.key;
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) {
        return;
      }

      // Build hotkey string
      const hotkeyKey = key.length === 1 ? key.toUpperCase() : key;
      const hotkey = [...modifiers, hotkeyKey].join('+');

      onChange(hotkey);
      setRecording(false);
    },
    [recording, onChange]
  );

  useEffect(() => {
    if (recording) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [recording, handleKeyDown]);

  // Cancel recording on click outside
  useEffect(() => {
    if (!recording) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setRecording(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [recording]);

  return (
    <div style={styles.settingRow}>
      <div style={styles.settingInfo}>
        <span style={styles.settingLabel}>{label}</span>
        {description && <span style={styles.settingDescription}>{description}</span>}
        {conflict && (
          <span style={styles.conflictWarning}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 4.5v3M7 9.5h.005"
                stroke={colors.status.warning}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M6.134 1.944L1.06 10.5a1 1 0 00.866 1.5h10.148a1 1 0 00.866-1.5L7.866 1.944a1 1 0 00-1.732 0z"
                stroke={colors.status.warning}
                strokeWidth="1.5"
              />
            </svg>
            Conflicts with: {conflict}
          </span>
        )}
      </div>
      <button
        ref={inputRef}
        style={{
          ...styles.keyRecorder,
          borderColor: recording ? colors.accent.default : conflict ? colors.status.warning : colors.border.default,
          backgroundColor: recording ? colors.accent.subtle : colors.surface.inset,
        }}
        onClick={() => setRecording(true)}
      >
        {recording ? (
          <span style={styles.keyRecorderRecording}>Press keys...</span>
        ) : (
          <span style={styles.keyRecorderValue}>{formatHotkey(value)}</span>
        )}
      </button>
    </div>
  );
};
```

## SettingsSection

- Source: `src/renderer/components/primitives/SettingsSection.tsx`
- Purpose: Shared titled settings card with optional reset action.

```tsx
import React from 'react';
import { styles } from '../settings/settingsStyles';

export const SettingsSection: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
  onReset?: () => void;
}> = ({ title, description, children, onReset }) => (
  <div style={styles.section}>
    <div style={styles.sectionHeader}>
      <div>
        <h3 style={styles.sectionTitle}>{title}</h3>
        {description && <p style={styles.sectionDescription}>{description}</p>}
      </div>
      {onReset && (
        <button style={styles.resetSectionButton} onClick={onReset} title="Reset section to defaults">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M1.75 7a5.25 5.25 0 109.006-3.668M7 3.5V1.75L9.625 4.375 7 7"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
    <div style={styles.sectionContent}>{children}</div>
  </div>
);
```

## SliderSetting

- Source: `src/renderer/components/primitives/Slider.tsx`
- Purpose: Labeled range control with formatted value.

```tsx
import React, { useId } from 'react';
import { styles } from '../settings/settingsStyles';

export const SliderSetting: React.FC<{
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
  formatValue?: (value: number) => string;
}> = ({ label, description, value, min, max, step, unit = '', onChange, disabled, formatValue }) => {
  const controlId = useId();
  const descriptionId = useId();
  const displayValue = formatValue ? formatValue(value) : `${value}${unit}`;

  return (
    <div style={styles.settingRow}>
      <div style={styles.settingInfo}>
        <label htmlFor={controlId} style={styles.settingLabel}>{label}</label>
        {description && <span id={descriptionId} style={styles.settingDescription}>{description}</span>}
      </div>
      <div style={styles.sliderContainer}>
        <span style={styles.sliderValue}>{displayValue}</span>
        <input
          id={controlId}
          aria-describedby={description ? descriptionId : undefined}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          style={{
            ...styles.slider,
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        />
      </div>
    </div>
  );
};
```

## ToggleSetting

- Source: `src/renderer/components/primitives/Toggle.tsx`
- Purpose: Accessible labeled toggle control.

```tsx
import React, { useId } from 'react';
import { styles } from '../settings/settingsStyles';

const TOGGLE_TRACK_WIDTH = 44;
const TOGGLE_KNOB_SIZE = 18;
const TOGGLE_KNOB_INSET = 3;
const TOGGLE_TRAVEL_DISTANCE = TOGGLE_TRACK_WIDTH - TOGGLE_KNOB_SIZE - TOGGLE_KNOB_INSET * 2;

export const ToggleSetting: React.FC<{
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}> = ({ label, description, value, onChange, disabled }) => {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <div style={styles.settingRow}>
      <div style={styles.settingInfo}>
        <span id={labelId} style={styles.settingLabel}>{label}</span>
        {description && <span id={descriptionId} style={styles.settingDescription}>{description}</span>}
      </div>
      <button
        type="button"
        style={{
          ...styles.toggle,
          backgroundColor: value ? 'var(--accent-default)' : 'var(--bg-tertiary)',
          borderColor: value ? 'var(--accent-hover)' : 'var(--border-strong)',
          boxShadow: value
            ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.14)'
            : 'inset 0 0 0 1px rgba(0, 0, 0, 0.06)',
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        role="switch"
        aria-checked={value}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <span
          aria-hidden="true"
          style={{
            ...styles.toggleKnob,
            transform: value ? `translateX(${TOGGLE_TRAVEL_DISTANCE}px)` : 'translateX(0px)',
          }}
        />
      </button>
    </div>
  );
};
```

## DonateButton

- Source: `src/renderer/components/DonateButton.tsx`
- Purpose: Reusable support link shown in app footers.

```tsx
/**
 * markuprx Donate Button
 *
 * A clean, minimal donate link with subtle native macOS styling.
 * Coffee icon + rotating messages with restrained emphasis.
 * Messages rotate on each app launch (not during a session).
 * Links to Ko-fi for support.
 */

import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
  DONATE_URL,
  getCurrentDonateMessage,
  incrementDonateMessageIndex,
} from '../donateMessages';
import { useTheme } from '../hooks/useTheme';

// ============================================================================
// Types
// ============================================================================

export interface DonateButtonProps {
  /** Additional CSS class name */
  className?: string;
  /** Override the default message (for testing) */
  message?: string;
  /** Custom style overrides */
  style?: React.CSSProperties;
}

// ============================================================================
// Component
// ============================================================================

/**
 * DonateButton - Clean, minimal support link
 *
 * Displays a coffee emoji + rotating message in coral color.
 * Subtle styling - just a small link at bottom of popover.
 */
export const DonateButton: React.FC<DonateButtonProps> = ({
  className,
  message: messageProp,
  style: styleProp,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const { colors } = useTheme();

  // Track if we've already incremented this session
  const hasIncrementedRef = useRef(false);

  // Get the current message on mount
  const message = useMemo(() => {
    return messageProp || getCurrentDonateMessage();
  }, [messageProp]);

  // Increment the message index for next app launch (once per session)
  useEffect(() => {
    if (!hasIncrementedRef.current && !messageProp) {
      incrementDonateMessageIndex();
      hasIncrementedRef.current = true;
    }
  }, [messageProp]);

  const handleClick = () => {
    // Open Ko-fi in default browser
    window.open(DONATE_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        ...styles.button,
        color: isHovered ? colors.accent.default : colors.text.secondary,
        borderColor: isHovered ? colors.border.focus : colors.border.default,
        backgroundColor: isHovered ? colors.accent.subtle : colors.bg.subtle,
        ...styleProp,
      }}
      className={className}
      aria-label={message}
    >
      <span style={styles.emoji} aria-hidden="true">&#9749;</span>
      <span style={styles.text}>{message}</span>
    </button>
  );
};

// ============================================================================
// Styles
// ============================================================================

type ExtendedCSSProperties = React.CSSProperties & {
  WebkitAppRegion?: 'drag' | 'no-drag';
};

const styles: Record<string, ExtendedCSSProperties> = {
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '6px 10px',
    borderWidth: 1,
    borderStyle: 'solid',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 550,
    cursor: 'pointer',
    transition: 'color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease',
    whiteSpace: 'nowrap',
    minHeight: 30,
    WebkitAppRegion: 'no-drag',
  },

  emoji: {
    fontSize: 12,
    lineHeight: 1,
  },

  text: {
    lineHeight: 1,
  },
};

export default DonateButton;
```

## StatusIndicator

- Source: `src/renderer/components/StatusIndicator.tsx`
- Purpose: Session-state indicator used in the portrait home shell.

```tsx
/**
 * Status Indicator Component
 *
 * Shows the current recording/processing status with visual feedback
 */

import React from 'react';
import type { SessionStatus } from '../../shared/types';
import { useTheme } from '../hooks/useTheme';

interface StatusIndicatorProps {
  status: SessionStatus;
  error?: string | null;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, error }) => {
  const { colors } = useTheme();

  const getColor = (): string => {
    switch (status) {
      case 'recording':
        return colors.status.error;
      case 'processing':
        return colors.status.warning;
      case 'complete':
        return colors.status.success;
      case 'error':
        return colors.status.error;
      default:
        return '#8e8e93';
    }
  };

  const getText = (): string => {
    switch (status) {
      case 'recording':
        return 'Recording...';
      case 'processing':
        return 'Processing...';
      case 'complete':
        return 'Copied to clipboard!';
      case 'error':
        return error || 'Error occurred';
      default:
        return 'Ready';
    }
  };

  const color = getColor();

  return (
    <div style={styles.container} role="status" aria-live={status === 'error' ? 'assertive' : 'polite'}>
      <div
        style={{
          ...styles.dot,
          backgroundColor: color,
          boxShadow: status === 'recording' ? `0 0 8px ${color}` : 'none',
          animation: status === 'recording' ? 'pulse 1.5s ease-in-out infinite' : 'none',
        }}
      />
      <span style={styles.text}>{getText()}</span>
      {/* pulse keyframe provided by animations.css */}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    transition: 'all 0.2s ease',
  },
  text: {
    color: '#eef3ff',
    fontSize: 13,
    fontWeight: 500,
  },
};

export default StatusIndicator;
```

## HotkeyHint

- Source: `src/renderer/components/HotkeyHint.tsx`
- Purpose: Platform-aware shortcut key badges.

```tsx
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
```

## Skeleton

- Source: `src/renderer/components/Skeleton.tsx`
- Purpose: Loading primitives used by session history.

```tsx
/**
 * Skeleton Loading Components
 *
 * Premium shimmer-effect loading placeholders that match the markuprx design system.
 * Use these to indicate loading states while maintaining visual hierarchy.
 */

import React from 'react';

// ============================================================================
// Types
// ============================================================================

interface SkeletonProps {
  /** Width of the skeleton (CSS value) */
  width?: string | number;
  /** Height of the skeleton (CSS value) */
  height?: string | number;
  /** Border radius (CSS value or true for default 8px) */
  rounded?: boolean | string | number;
  /** Use circular shape */
  circle?: boolean;
  /** Animation type */
  animation?: 'shimmer' | 'pulse' | 'none';
  /** Additional CSS class */
  className?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
}

interface SkeletonTextProps {
  /** Number of lines to render */
  lines?: number;
  /** Width of the last line (creates natural variation) */
  lastLineWidth?: string | number;
  /** Gap between lines */
  gap?: number;
  /** Animation type */
  animation?: 'shimmer' | 'pulse' | 'none';
}

interface SkeletonCardProps {
  /** Show thumbnail placeholder */
  showThumbnail?: boolean;
  /** Number of text lines */
  lines?: number;
  /** Show avatar */
  showAvatar?: boolean;
  /** Animation type */
  animation?: 'shimmer' | 'pulse' | 'none';
}

// ============================================================================
// Base Skeleton Component
// ============================================================================

export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  rounded = true,
  circle = false,
  animation = 'shimmer',
  className = '',
  style = {},
}) => {
  const getBorderRadius = () => {
    if (circle) return '50%';
    if (rounded === true) return 8;
    if (rounded === false) return 0;
    return rounded;
  };

  const animationClass =
    animation === 'shimmer'
      ? 'ff-skeleton'
      : animation === 'pulse'
      ? 'ff-skeleton-pulse'
      : '';

  return (
    <div
      className={`${animationClass} ${className}`}
      style={{
        width: width ?? '100%',
        height: height ?? 16,
        borderRadius: getBorderRadius(),
        backgroundColor: 'rgba(55, 65, 81, 0.3)',
        ...style,
      }}
    />
  );
};

// ============================================================================
// Skeleton Text (Multiple lines)
// ============================================================================

export const SkeletonText: React.FC<SkeletonTextProps> = ({
  lines = 3,
  lastLineWidth = '70%',
  gap = 8,
  animation = 'shimmer',
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          width={index === lines - 1 ? lastLineWidth : '100%'}
          height={16}
          animation={animation}
          style={{
            animationDelay: `${index * 100}ms`,
          }}
        />
      ))}
    </div>
  );
};

// ============================================================================
// Skeleton Avatar
// ============================================================================

export const SkeletonAvatar: React.FC<{
  size?: number;
  animation?: 'shimmer' | 'pulse' | 'none';
}> = ({ size = 40, animation = 'shimmer' }) => {
  return <Skeleton width={size} height={size} circle animation={animation} />;
};

// ============================================================================
// Skeleton Thumbnail
// ============================================================================

export const SkeletonThumbnail: React.FC<{
  width?: string | number;
  aspectRatio?: string;
  animation?: 'shimmer' | 'pulse' | 'none';
}> = ({ width = '100%', aspectRatio = '16/9', animation = 'shimmer' }) => {
  return (
    <Skeleton
      width={width}
      height="auto"
      rounded={8}
      animation={animation}
      style={{
        aspectRatio,
      }}
    />
  );
};

// ============================================================================
// Skeleton Button
// ============================================================================

export const SkeletonButton: React.FC<{
  width?: string | number;
  height?: number;
  animation?: 'shimmer' | 'pulse' | 'none';
}> = ({ width = 120, height = 40, animation = 'shimmer' }) => {
  return <Skeleton width={width} height={height} rounded={8} animation={animation} />;
};

// ============================================================================
// Skeleton Card (Composite)
// ============================================================================

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  showThumbnail = true,
  lines = 2,
  showAvatar = false,
  animation = 'shimmer',
}) => {
  return (
    <div style={styles.card}>
      {showThumbnail && (
        <SkeletonThumbnail animation={animation} />
      )}
      <div style={styles.cardContent}>
        {showAvatar && (
          <div style={styles.avatarRow}>
            <SkeletonAvatar size={32} animation={animation} />
            <div style={{ flex: 1 }}>
              <Skeleton width="60%" height={14} animation={animation} />
            </div>
          </div>
        )}
        <Skeleton
          width="80%"
          height={18}
          animation={animation}
          style={{ marginBottom: 8 }}
        />
        <SkeletonText lines={lines} animation={animation} />
      </div>
    </div>
  );
};

// ============================================================================
// Skeleton List Item
// ============================================================================

export const SkeletonListItem: React.FC<{
  showIcon?: boolean;
  showAction?: boolean;
  animation?: 'shimmer' | 'pulse' | 'none';
}> = ({ showIcon = true, showAction = false, animation = 'shimmer' }) => {
  return (
    <div style={styles.listItem}>
      {showIcon && <SkeletonAvatar size={24} animation={animation} />}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Skeleton width="70%" height={14} animation={animation} />
        <Skeleton width="40%" height={12} animation={animation} />
      </div>
      {showAction && <SkeletonButton width={80} height={32} animation={animation} />}
    </div>
  );
};

// ============================================================================
// Skeleton Feedback Item (markuprx specific)
// ============================================================================

export const SkeletonFeedbackItem: React.FC<{
  showThumbnail?: boolean;
  animation?: 'shimmer' | 'pulse' | 'none';
}> = ({ showThumbnail = true, animation = 'shimmer' }) => {
  return (
    <div style={styles.feedbackItem}>
      {/* Drag handle */}
      <div style={styles.dragHandle}>
        <Skeleton width={12} height={20} rounded={2} animation={animation} />
      </div>

      {/* Content */}
      <div style={{ flex: 1 }}>
        {/* Header with tags */}
        <div style={styles.feedbackHeader}>
          <Skeleton width={60} height={16} animation={animation} />
          <Skeleton width={50} height={20} rounded={6} animation={animation} />
          <Skeleton width={50} height={20} rounded={6} animation={animation} />
        </div>

        {/* Transcription */}
        <SkeletonText lines={2} lastLineWidth="60%" gap={6} animation={animation} />

        {/* Thumbnails */}
        {showThumbnail && (
          <div style={styles.thumbnailRow}>
            <Skeleton width={60} height={45} rounded={6} animation={animation} />
            <Skeleton width={60} height={45} rounded={6} animation={animation} />
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Skeleton Window Source (Window Selector specific)
// ============================================================================

export const SkeletonWindowSource: React.FC<{
  animation?: 'shimmer' | 'pulse' | 'none';
}> = ({ animation = 'shimmer' }) => {
  return (
    <div style={styles.windowSource}>
      <Skeleton width={104} height={64} rounded={8} animation={animation} />
      <Skeleton width="80%" height={11} animation={animation} />
      <Skeleton width={12} height={12} circle animation={animation} />
    </div>
  );
};

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: 'rgba(31, 41, 55, 0.6)',
    borderRadius: 12,
    border: '1px solid rgba(75, 85, 99, 0.3)',
    overflow: 'hidden',
  },
  cardContent: {
    padding: 16,
  },
  avatarRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    backgroundColor: 'rgba(31, 41, 55, 0.4)',
    borderRadius: 8,
  },
  feedbackItem: {
    display: 'flex',
    gap: 12,
    padding: 16,
    backgroundColor: 'rgba(31, 41, 55, 0.6)',
    borderRadius: 12,
    border: '1px solid rgba(75, 85, 99, 0.3)',
  },
  dragHandle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
  },
  feedbackHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  thumbnailRow: {
    display: 'flex',
    gap: 8,
    marginTop: 12,
  },
  windowSource: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    border: '2px solid transparent',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    gap: 8,
  },
};

// ============================================================================
// Exports
// ============================================================================

export default Skeleton;
```
