/**
 * markuprx Theme Provider
 *
 * Provides theme context to the entire application.
 * Handles dark/light/system mode detection, accent color customization,
 * and CSS custom property injection for runtime theme switching.
 */

import React, {
  ReactNode,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import {
  ThemeMode,
  AccentColorKey,
  accentColors,
  typography,
  spacing,
  shadows,
  borderRadius,
  transitions,
  zIndex,
} from '../styles/theme';
import {
  ThemeContext,
  ThemeContextValue,
  buildTheme,
  applyCSSProperties,
  THEME_STORAGE_KEYS,
  getCSSVariable,
} from '../hooks/useTheme';

// ============================================================================
// Types
// ============================================================================

export interface ThemeProviderProps {
  children: ReactNode;
  /** Initial theme mode (default: 'dark') */
  defaultMode?: ThemeMode;
  /** Initial accent color (default: 'blue') */
  defaultAccentColor?: string;
  /** Custom storage key prefix */
  storageKeyPrefix?: string;
  /** Disable persistence to localStorage */
  disablePersistence?: boolean;
}

// ============================================================================
// Theme Provider Component
// ============================================================================

export function ThemeProvider({
  children,
  defaultMode = 'dark',
  defaultAccentColor = 'blue',
  disablePersistence = false,
}: ThemeProviderProps) {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (disablePersistence || typeof localStorage === 'undefined') {
      return defaultMode;
    }
    const stored = localStorage.getItem(THEME_STORAGE_KEYS.mode);
    return (stored as ThemeMode) || defaultMode;
  });

  const [accentColor, setAccentColorState] = useState<string>(() => {
    if (disablePersistence || typeof localStorage === 'undefined') {
      return defaultAccentColor;
    }
    const stored = localStorage.getItem(THEME_STORAGE_KEYS.accent);
    return stored || defaultAccentColor;
  });

  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // ---------------------------------------------------------------------------
  // System Theme Detection
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };

    // Listen for system theme changes
    mediaQuery.addEventListener('change', handleChange);

    // Sync initial state
    setSystemPrefersDark(mediaQuery.matches);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Build Theme
  // ---------------------------------------------------------------------------

  const { isDark, colors, cssProperties } = useMemo(
    () =>
      buildTheme({
        mode,
        accentColor,
        systemPrefersDark,
      }),
    [mode, accentColor, systemPrefersDark]
  );

  // ---------------------------------------------------------------------------
  // Apply Theme to DOM
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Apply CSS custom properties
    applyCSSProperties(cssProperties);

    // Update body classes for CSS selectors
    const body = document.body;
    body.classList.remove('theme-dark', 'theme-light');
    body.classList.add(isDark ? 'theme-dark' : 'theme-light');

    // Update data attribute for CSS selectors
    document.documentElement.setAttribute(
      'data-theme',
      isDark ? 'dark' : 'light'
    );

    // Update color-scheme for native elements
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }, [cssProperties, isDark]);

  // ---------------------------------------------------------------------------
  // Setters with Persistence
  // ---------------------------------------------------------------------------

  const setMode = useCallback(
    (newMode: ThemeMode) => {
      setModeState(newMode);
      if (!disablePersistence && typeof localStorage !== 'undefined') {
        localStorage.setItem(THEME_STORAGE_KEYS.mode, newMode);
      }
    },
    [disablePersistence]
  );

  const setAccentColor = useCallback(
    (newColor: string) => {
      setAccentColorState(newColor);
      if (!disablePersistence && typeof localStorage !== 'undefined') {
        localStorage.setItem(THEME_STORAGE_KEYS.accent, newColor);
      }
    },
    [disablePersistence]
  );

  const toggleMode = useCallback(() => {
    const nextMode: ThemeMode =
      mode === 'dark' ? 'light' : mode === 'light' ? 'system' : 'dark';
    setMode(nextMode);
  }, [mode, setMode]);

  // Electron settings are the canonical appearance store. localStorage remains
  // a fast startup cache, while this sync covers app restarts, imports, and resets.
  useEffect(() => {
    let active = true;
    const syncFromSettings = async () => {
      try {
        const settings = await window.markuprx?.settings?.getAll();
        if (!active || !settings) return;
        if (settings.theme === 'dark' || settings.theme === 'light' || settings.theme === 'system') {
          setMode(settings.theme);
        }
        if (typeof settings.accentColor === 'string') {
          setAccentColor(settings.accentColor);
        }
      } catch (error) {
        console.warn('[ThemeProvider] Failed to load appearance settings:', error);
      }
    };
    const handleSettingsUpdate = (event: Event) => {
      const updateType = (event as CustomEvent<{ type?: string }>).detail?.type;
      if (
        updateType === 'appearance'
        || updateType === 'import'
        || updateType === 'reset'
        || updateType === 'partial-reset'
      ) {
        void syncFromSettings();
      }
    };

    void syncFromSettings();
    window.addEventListener('markuprx:settings-updated', handleSettingsUpdate);
    return () => {
      active = false;
      window.removeEventListener('markuprx:settings-updated', handleSettingsUpdate);
    };
  }, [setMode, setAccentColor]);

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  const getAccentColors = useCallback(() => accentColors, []);

  const getCSSVar = useCallback((name: string) => {
    return getCSSVariable(name.startsWith('--') ? name : `--${name}`);
  }, []);

  // ---------------------------------------------------------------------------
  // Context Value
  // ---------------------------------------------------------------------------

  const contextValue: ThemeContextValue = useMemo(
    () => ({
      // State
      mode,
      accentColor,
      isDark,
      colors,

      // Setters
      setMode,
      setAccentColor,
      toggleMode,

      // Design tokens
      typography,
      spacing,
      shadows,
      borderRadius,
      transitions,
      zIndex,

      // Utilities
      getAccentColors,
      getCSSVar,
    }),
    [
      mode,
      accentColor,
      isDark,
      colors,
      setMode,
      setAccentColor,
      toggleMode,
      getAccentColors,
      getCSSVar,
    ]
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

// ============================================================================
// Theme Toggle Button Component
// ============================================================================

export interface ThemeToggleProps {
  /** Size of the toggle button */
  size?: 'sm' | 'md' | 'lg';
  /** Custom class name */
  className?: string;
  /** Show label text */
  showLabel?: boolean;
}

/**
 * A ready-to-use theme toggle button
 */
export function ThemeToggle({
  size = 'md',
  className = '',
  showLabel = false,
}: ThemeToggleProps) {
  const { mode, isDark, toggleMode } = React.useContext(ThemeContext)!;

  const sizes = {
    sm: { button: 32, icon: 16 },
    md: { button: 40, icon: 20 },
    lg: { button: 48, icon: 24 },
  };

  const { button: buttonSize, icon: iconSize } = sizes[size];

  const modeLabels: Record<ThemeMode, string> = {
    dark: 'Dark',
    light: 'Light',
    system: 'System',
  };

  return (
    <button
      onClick={toggleMode}
      className={className}
      title={`Theme: ${modeLabels[mode]} (click to toggle)`}
      aria-label={`Current theme: ${modeLabels[mode]}. Click to toggle.`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        width: showLabel ? 'auto' : buttonSize,
        height: buttonSize,
        padding: showLabel ? '0 12px' : 0,
        borderRadius: borderRadius.lg,
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border-default)',
        color: 'var(--text-primary)',
        cursor: 'pointer',
        transition: transitions.all,
      }}
    >
      {/* Icon */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          transition: 'transform 300ms ease',
          transform: isDark ? 'rotate(0deg)' : 'rotate(180deg)',
        }}
      >
        {mode === 'system' ? (
          // System icon (computer)
          <>
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </>
        ) : isDark ? (
          // Moon icon
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        ) : (
          // Sun icon
          <>
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </>
        )}
      </svg>

      {showLabel && <span style={{ fontSize: typography.fontSize.sm }}>{modeLabels[mode]}</span>}
    </button>
  );
}

// ============================================================================
// Accent Color Picker Component
// ============================================================================

export interface AccentColorPickerProps {
  /** Custom class name */
  className?: string;
  /** Layout direction */
  direction?: 'horizontal' | 'vertical';
  /** Size of color swatches */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * A ready-to-use accent color picker
 */
export function AccentColorPicker({
  className = '',
  direction = 'horizontal',
  size = 'md',
}: AccentColorPickerProps) {
  const { accentColor, setAccentColor, getAccentColors } =
    React.useContext(ThemeContext)!;

  const colors = getAccentColors();

  const sizes = {
    sm: 20,
    md: 28,
    lg: 36,
  };

  const swatchSize = sizes[size];

  return (
    <div
      className={className}
      role="radiogroup"
      aria-label="Choose accent color"
      style={{
        display: 'flex',
        flexDirection: direction === 'vertical' ? 'column' : 'row',
        flexWrap: 'wrap',
        gap: '8px',
      }}
    >
      {(Object.entries(colors) as [AccentColorKey, (typeof colors)[AccentColorKey]][]).map(
        ([key, color]) => (
          <button
            key={key}
            onClick={() => setAccentColor(key)}
            role="radio"
            aria-checked={accentColor === key}
            aria-label={color.name}
            title={color.name}
            style={{
              width: swatchSize,
              height: swatchSize,
              borderRadius: borderRadius.full,
              background: color.default,
              border:
                accentColor === key
                  ? '2px solid var(--text-primary)'
                  : '2px solid transparent',
              boxShadow:
                accentColor === key
                  ? shadows.glow(color.default, 0.5)
                  : 'none',
              cursor: 'pointer',
              transition: transitions.all,
              transform: accentColor === key ? 'scale(1.1)' : 'scale(1)',
            }}
          />
        )
      )}
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export default ThemeProvider;
