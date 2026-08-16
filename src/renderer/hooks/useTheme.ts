/**
 * MarkuprX Theme Hook
 *
 * Provides theme state management and utilities for components.
 * Must be used within a ThemeProvider.
 */

import { useContext, createContext, useMemo } from 'react';
import {
  ThemeColors,
  ThemeMode,
  AccentColorKey,
  accentColors,
  darkTheme,
  lightTheme,
  typography,
  spacing,
  shadows,
  borderRadius,
  transitions,
  zIndex,
  generateCSSProperties,
} from '../styles/theme';

// ============================================================================
// Context Types
// ============================================================================

export interface ThemeContextValue {
  // Current state
  mode: ThemeMode;
  accentColor: AccentColorKey;
  isDark: boolean;
  colors: ThemeColors;

  // Setters
  setMode: (mode: ThemeMode) => void;
  setAccentColor: (color: AccentColorKey) => void;
  toggleMode: () => void;

  // Design tokens (static)
  typography: typeof typography;
  spacing: typeof spacing;
  shadows: typeof shadows;
  borderRadius: typeof borderRadius;
  transitions: typeof transitions;
  zIndex: typeof zIndex;

  // Utilities
  getAccentColors: () => typeof accentColors;
  getCSSVar: (name: string) => string;
}

// Create context with null default (must be used within provider)
export const ThemeContext = createContext<ThemeContextValue | null>(null);

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Access the theme context and utilities
 *
 * @example
 * ```tsx
 * const { isDark, colors, toggleMode, setAccentColor } = useTheme();
 *
 * // Use colors directly
 * <div style={{ background: colors.bg.primary }}>
 *
 * // Or use CSS variables
 * <div className="bg-[var(--bg-primary)]">
 * ```
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error(
      'useTheme must be used within a ThemeProvider. ' +
      'Make sure to wrap your app with <ThemeProvider>.'
    );
  }

  return context;
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Returns just the dark mode state - useful for conditional rendering
 */
export function useIsDarkMode(): boolean {
  const { isDark } = useTheme();
  return isDark;
}

/**
 * Returns the current accent color details
 */
export function useAccentColor() {
  const { accentColor } = useTheme();
  return useMemo(
    () => ({
      key: accentColor,
      ...accentColors[accentColor],
    }),
    [accentColor]
  );
}

/**
 * Get a specific color from the theme
 */
export function useThemeColor<
  Category extends keyof ThemeColors,
  Color extends keyof ThemeColors[Category]
>(category: Category, color: Color): string {
  const { colors } = useTheme();
  return colors[category][color] as string;
}

/**
 * Generate inline styles from theme values
 */
export function useThemeStyles<T extends Record<string, unknown>>(
  stylesFn: (theme: {
    colors: ThemeColors;
    isDark: boolean;
    spacing: typeof spacing;
    borderRadius: typeof borderRadius;
    shadows: typeof shadows;
    transitions: typeof transitions;
  }) => T
): T {
  const { colors, isDark } = useTheme();

  return useMemo(
    () =>
      stylesFn({
        colors,
        isDark,
        spacing,
        borderRadius,
        shadows,
        transitions,
      }),
    [colors, isDark, stylesFn]
  );
}

// ============================================================================
// Theme Builder (for provider use)
// ============================================================================

export interface ThemeBuilderOptions {
  mode: ThemeMode;
  accentColor: AccentColorKey;
  systemPrefersDark: boolean;
}

/**
 * Builds the complete theme from options
 * Used internally by ThemeProvider
 */
export function buildTheme(options: ThemeBuilderOptions) {
  const { mode, accentColor, systemPrefersDark } = options;

  // Determine if dark mode is active
  const isDark = mode === 'system' ? systemPrefersDark : mode === 'dark';

  // Get base theme
  const baseColors = isDark ? darkTheme : lightTheme;

  // Get accent color values
  const accent = accentColors[accentColor];

  // Merge accent into theme colors
  const colors: ThemeColors = {
    ...baseColors,
    accent: {
      default: accent.default,
      hover: accent.hover,
      active: accent.active,
      subtle: `${accent.default}1a`, // 10% opacity
      muted: `${accent.default}40`,  // 25% opacity
    },
  };

  // Generate CSS custom properties
  const cssProperties = generateCSSProperties(colors, accent);

  return {
    isDark,
    colors,
    cssProperties,
  };
}

// ============================================================================
// Storage Keys
// ============================================================================

export const THEME_STORAGE_KEYS = {
  mode: 'markuprx-theme-mode',
  accent: 'markuprx-theme-accent',
} as const;

// ============================================================================
// CSS Variable Helpers
// ============================================================================

/**
 * Get a CSS variable value from the document
 */
export function getCSSVariable(name: string): string {
  if (typeof document === 'undefined') return '';

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  return value;
}

/**
 * Set a CSS variable on the document
 */
export function setCSSVariable(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty(name, value);
}

/**
 * Apply all CSS properties to document root
 */
export function applyCSSProperties(properties: Record<string, string>): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  Object.entries(properties).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

// ============================================================================
// Color Utilities
// ============================================================================

/**
 * Convert hex to RGB values
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Convert RGB to hex
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Get contrasting text color (black or white) for a background
 */
export function getContrastColor(backgroundColor: string): 'white' | 'black' {
  const rgb = hexToRgb(backgroundColor);
  if (!rgb) return 'white';

  // Calculate relative luminance
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;

  return luminance > 0.5 ? 'black' : 'white';
}

/**
 * Adjust color brightness
 */
export function adjustBrightness(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const adjust = (value: number) =>
    Math.min(255, Math.max(0, Math.round(value + (value * percent) / 100)));

  return rgbToHex(adjust(rgb.r), adjust(rgb.g), adjust(rgb.b));
}

/**
 * Add alpha to a hex color
 */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

// ============================================================================
// Default Export
// ============================================================================

export default useTheme;
