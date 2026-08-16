/**
 * markuprx Premium Theme System
 *
 * Design tokens for a premium, Apple/Linear quality experience.
 * Supports dark/light/system modes with customizable accent colors.
 */

// ============================================================================
// Color Tokens
// ============================================================================

export interface ThemeColors {
  // Backgrounds - layered for depth
  bg: {
    primary: string;      // Main app background
    secondary: string;    // Cards, panels
    tertiary: string;     // Nested elements
    elevated: string;     // Floating elements (modals, dropdowns)
    overlay: string;      // Overlay backdrop
    subtle: string;       // Very subtle backgrounds (hover states)
  };

  // Text - hierarchy through opacity/tone
  text: {
    primary: string;      // Main content
    secondary: string;    // Supporting content
    tertiary: string;     // Disabled/placeholder
    inverse: string;      // Text on accent colors
    link: string;         // Interactive text
  };

  // Borders - subtle but present
  border: {
    default: string;      // Standard borders
    subtle: string;       // Barely visible borders
    strong: string;       // Emphasized borders
    focus: string;        // Focus rings
  };

  // Semantic status colors
  status: {
    success: string;
    successSubtle: string;
    warning: string;
    warningSubtle: string;
    error: string;
    errorSubtle: string;
    info: string;
    infoSubtle: string;
  };

  // Accent - user customizable primary color
  accent: {
    default: string;      // Primary accent
    hover: string;        // Hover state
    active: string;       // Active/pressed state
    subtle: string;       // 10% opacity for backgrounds
    muted: string;        // 20% opacity for emphasis
  };

  // Special surfaces
  surface: {
    glass: string;        // Glass morphism background
    glassBorder: string;  // Glass border
    highlight: string;    // Subtle highlight
    inset: string;        // Inset/recessed areas
  };
}

// Dark theme - Premium slate palette
export const darkTheme: ThemeColors = {
  bg: {
    primary: '#0a0f1a',      // Deep space blue-black
    secondary: '#111827',    // Elevated surface
    tertiary: '#1f2937',     // Nested elements
    elevated: '#1a2332',     // Floating surfaces
    overlay: 'rgba(0, 0, 0, 0.75)',
    subtle: 'rgba(255, 255, 255, 0.03)',
  },
  text: {
    primary: '#f9fafb',      // Almost white
    secondary: '#9ca3af',    // Cool gray
    tertiary: '#9ca3af',     // Muted, while retaining WCAG AA contrast on dark surfaces
    inverse: '#0a0f1a',      // For accent buttons
    link: '#60a5fa',         // Soft blue
  },
  border: {
    default: 'rgba(255, 255, 255, 0.08)',
    subtle: 'rgba(255, 255, 255, 0.04)',
    strong: 'rgba(255, 255, 255, 0.15)',
    focus: 'rgba(96, 165, 250, 0.5)',
  },
  status: {
    success: '#34d399',      // Emerald
    successSubtle: 'rgba(52, 211, 153, 0.15)',
    warning: '#fbbf24',      // Amber
    warningSubtle: 'rgba(251, 191, 36, 0.15)',
    error: '#f87171',        // Red
    errorSubtle: 'rgba(248, 113, 113, 0.15)',
    info: '#60a5fa',         // Blue
    infoSubtle: 'rgba(96, 165, 250, 0.15)',
  },
  accent: {
    default: '#3b82f6',      // Vibrant blue
    hover: '#2563eb',
    active: '#1d4ed8',
    subtle: 'rgba(59, 130, 246, 0.12)',
    muted: 'rgba(59, 130, 246, 0.25)',
  },
  surface: {
    glass: 'rgba(17, 24, 39, 0.8)',
    glassBorder: 'rgba(255, 255, 255, 0.06)',
    highlight: 'rgba(255, 255, 255, 0.02)',
    inset: 'rgba(0, 0, 0, 0.3)',
  },
};

// Light theme - Clean and airy
export const lightTheme: ThemeColors = {
  bg: {
    primary: '#ffffff',
    secondary: '#f9fafb',    // Warm gray
    tertiary: '#f3f4f6',     // Nested
    elevated: '#ffffff',
    overlay: 'rgba(0, 0, 0, 0.5)',
    subtle: 'rgba(0, 0, 0, 0.02)',
  },
  text: {
    primary: '#111827',      // Near black
    secondary: '#4b5563',    // Gray
    tertiary: '#626b78',     // Muted, with WCAG AA contrast on light and tinted surfaces
    inverse: '#ffffff',
    link: '#2563eb',         // Blue
  },
  border: {
    default: 'rgba(0, 0, 0, 0.08)',
    subtle: 'rgba(0, 0, 0, 0.04)',
    strong: 'rgba(0, 0, 0, 0.15)',
    focus: 'rgba(37, 99, 235, 0.4)',
  },
  status: {
    success: '#047857',      // Accessible emerald on light and subtly tinted surfaces
    successSubtle: 'rgba(5, 150, 105, 0.1)',
    warning: '#92400e',      // Accessible amber-brown on light and subtly tinted surfaces
    warningSubtle: 'rgba(217, 119, 6, 0.1)',
    error: '#dc2626',        // Red
    errorSubtle: 'rgba(220, 38, 38, 0.1)',
    info: '#2563eb',         // Blue
    infoSubtle: 'rgba(37, 99, 235, 0.1)',
  },
  accent: {
    default: '#2563eb',
    hover: '#1d4ed8',
    active: '#1e40af',
    subtle: 'rgba(37, 99, 235, 0.08)',
    muted: 'rgba(37, 99, 235, 0.18)',
  },
  surface: {
    glass: 'rgba(255, 255, 255, 0.85)',
    glassBorder: 'rgba(0, 0, 0, 0.06)',
    highlight: 'rgba(255, 255, 255, 0.7)',
    inset: 'rgba(0, 0, 0, 0.03)',
  },
};

// ============================================================================
// Accent Color Presets
// ============================================================================

export interface AccentColor {
  default: string;
  hover: string;
  active: string;
  name: string;
}

export const accentColors = {
  blue: {
    default: '#3b82f6',
    hover: '#2563eb',
    active: '#1d4ed8',
    name: 'Ocean Blue',
  },
  indigo: {
    default: '#6366f1',
    hover: '#4f46e5',
    active: '#4338ca',
    name: 'Indigo',
  },
  violet: {
    default: '#8b5cf6',
    hover: '#7c3aed',
    active: '#6d28d9',
    name: 'Violet',
  },
  purple: {
    default: '#a855f7',
    hover: '#9333ea',
    active: '#7e22ce',
    name: 'Purple',
  },
  fuchsia: {
    default: '#d946ef',
    hover: '#c026d3',
    active: '#a21caf',
    name: 'Fuchsia',
  },
  pink: {
    default: '#ec4899',
    hover: '#db2777',
    active: '#be185d',
    name: 'Pink',
  },
  rose: {
    default: '#f43f5e',
    hover: '#e11d48',
    active: '#be123c',
    name: 'Rose',
  },
  red: {
    default: '#ef4444',
    hover: '#dc2626',
    active: '#b91c1c',
    name: 'Red',
  },
  orange: {
    default: '#f97316',
    hover: '#ea580c',
    active: '#c2410c',
    name: 'Orange',
  },
  amber: {
    default: '#f59e0b',
    hover: '#d97706',
    active: '#b45309',
    name: 'Amber',
  },
  yellow: {
    default: '#eab308',
    hover: '#ca8a04',
    active: '#a16207',
    name: 'Yellow',
  },
  lime: {
    default: '#84cc16',
    hover: '#65a30d',
    active: '#4d7c0f',
    name: 'Lime',
  },
  green: {
    default: '#22c55e',
    hover: '#16a34a',
    active: '#15803d',
    name: 'Green',
  },
  emerald: {
    default: '#10b981',
    hover: '#059669',
    active: '#047857',
    name: 'Emerald',
  },
  teal: {
    default: '#14b8a6',
    hover: '#0d9488',
    active: '#0f766e',
    name: 'Teal',
  },
  cyan: {
    default: '#06b6d4',
    hover: '#0891b2',
    active: '#0e7490',
    name: 'Cyan',
  },
  sky: {
    default: '#0ea5e9',
    hover: '#0284c7',
    active: '#0369a1',
    name: 'Sky',
  },
} as const;

export type AccentColorKey = keyof typeof accentColors;

// ============================================================================
// Typography
// ============================================================================

export const typography = {
  // Font families
  fontFamily: {
    // Primary - Inter for UI, falls back to system fonts
    sans: [
      'Inter',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(', '),
    // Monospace - JetBrains Mono for code
    mono: [
      '"JetBrains Mono"',
      '"SF Mono"',
      'Menlo',
      'Monaco',
      '"Cascadia Code"',
      '"Courier New"',
      'monospace',
    ].join(', '),
    // Display - for large headings (optional upgrade)
    display: [
      '"Inter Display"',
      'Inter',
      '-apple-system',
      'sans-serif',
    ].join(', '),
  },

  // Font sizes - modular scale (1.2 ratio)
  fontSize: {
    '2xs': '0.625rem',   // 10px
    xs: '0.75rem',       // 12px
    sm: '0.875rem',      // 14px
    base: '1rem',        // 16px
    lg: '1.125rem',      // 18px
    xl: '1.25rem',       // 20px
    '2xl': '1.5rem',     // 24px
    '3xl': '1.875rem',   // 30px
    '4xl': '2.25rem',    // 36px
    '5xl': '3rem',       // 48px
  },

  // Font weights
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  // Line heights
  lineHeight: {
    none: 1,
    tight: 1.25,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625,
    loose: 2,
  },

  // Letter spacing
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
} as const;

// ============================================================================
// Spacing Scale
// ============================================================================

export const spacing = {
  0: '0',
  px: '1px',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  1.5: '0.375rem',  // 6px
  2: '0.5rem',      // 8px
  2.5: '0.625rem',  // 10px
  3: '0.75rem',     // 12px
  3.5: '0.875rem',  // 14px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  7: '1.75rem',     // 28px
  8: '2rem',        // 32px
  9: '2.25rem',     // 36px
  10: '2.5rem',     // 40px
  11: '2.75rem',    // 44px
  12: '3rem',       // 48px
  14: '3.5rem',     // 56px
  16: '4rem',       // 64px
  20: '5rem',       // 80px
  24: '6rem',       // 96px
  28: '7rem',       // 112px
  32: '8rem',       // 128px
} as const;

// ============================================================================
// Shadows
// ============================================================================

export const shadows = {
  // Standard elevation shadows
  none: 'none',
  xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',

  // Inner shadow
  inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',

  // Colored glow effects (functions for dynamic colors)
  glow: (color: string, intensity = 0.4) =>
    `0 0 20px ${color}${Math.round(intensity * 255).toString(16).padStart(2, '0')}`,
  glowLg: (color: string, intensity = 0.3) =>
    `0 0 40px ${color}${Math.round(intensity * 255).toString(16).padStart(2, '0')}`,

  // Focus ring
  focus: (color: string) => `0 0 0 3px ${color}`,
  focusInset: (color: string) => `inset 0 0 0 2px ${color}`,
} as const;

// ============================================================================
// Border Radius
// ============================================================================

export const borderRadius = {
  none: '0',
  sm: '0.25rem',    // 4px
  md: '0.375rem',   // 6px
  DEFAULT: '0.5rem', // 8px
  lg: '0.75rem',    // 12px
  xl: '1rem',       // 16px
  '2xl': '1.5rem',  // 24px
  '3xl': '2rem',    // 32px
  full: '9999px',
} as const;

// ============================================================================
// Transitions
// ============================================================================

export const transitions = {
  // Duration
  duration: {
    fastest: '50ms',
    faster: '100ms',
    fast: '150ms',
    normal: '200ms',
    slow: '300ms',
    slower: '400ms',
    slowest: '500ms',
  },

  // Timing functions
  easing: {
    linear: 'linear',
    ease: 'ease',
    easeIn: 'ease-in',
    easeOut: 'ease-out',
    easeInOut: 'ease-in-out',
    // Premium easings
    spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
    snap: 'cubic-bezier(0, 0.7, 0.3, 1)',
  },

  // Pre-composed transitions
  all: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
  colors: 'color 150ms ease, background-color 150ms ease, border-color 150ms ease',
  opacity: 'opacity 200ms ease',
  transform: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
  shadow: 'box-shadow 200ms ease',
} as const;

// ============================================================================
// Z-Index Scale
// ============================================================================

export const zIndex = {
  behind: -1,
  base: 0,
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  overlay: 40,
  modal: 50,
  popover: 60,
  tooltip: 70,
  toast: 80,
  max: 9999,
} as const;

// ============================================================================
// Breakpoints
// ============================================================================

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// ============================================================================
// Type Helpers
// ============================================================================

export type ThemeMode = 'dark' | 'light' | 'system';

export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
  accentKey: AccentColorKey;
  typography: typeof typography;
  spacing: typeof spacing;
  shadows: typeof shadows;
  borderRadius: typeof borderRadius;
  transitions: typeof transitions;
  zIndex: typeof zIndex;
}

// ============================================================================
// CSS Custom Property Generator
// ============================================================================

/**
 * Converts theme colors to CSS custom properties
 */
export function generateCSSProperties(theme: ThemeColors, accent: AccentColor): Record<string, string> {
  return {
    // Backgrounds
    '--bg-primary': theme.bg.primary,
    '--bg-secondary': theme.bg.secondary,
    '--bg-tertiary': theme.bg.tertiary,
    '--bg-elevated': theme.bg.elevated,
    '--bg-overlay': theme.bg.overlay,
    '--bg-subtle': theme.bg.subtle,

    // Text
    '--text-primary': theme.text.primary,
    '--text-secondary': theme.text.secondary,
    '--text-tertiary': theme.text.tertiary,
    '--text-inverse': theme.text.inverse,
    '--text-link': theme.text.link,

    // Borders
    '--border-default': theme.border.default,
    '--border-subtle': theme.border.subtle,
    '--border-strong': theme.border.strong,
    '--border-focus': theme.border.focus,

    // Status
    '--status-success': theme.status.success,
    '--status-success-subtle': theme.status.successSubtle,
    '--status-warning': theme.status.warning,
    '--status-warning-subtle': theme.status.warningSubtle,
    '--status-error': theme.status.error,
    '--status-error-subtle': theme.status.errorSubtle,
    '--status-info': theme.status.info,
    '--status-info-subtle': theme.status.infoSubtle,

    // Accent (using provided accent color)
    '--accent-default': accent.default,
    '--accent-hover': accent.hover,
    '--accent-active': accent.active,
    '--accent-subtle': `${accent.default}1a`,  // 10% opacity
    '--accent-muted': `${accent.default}40`,   // 25% opacity

    // Surfaces
    '--surface-glass': theme.surface.glass,
    '--surface-glass-border': theme.surface.glassBorder,
    '--surface-highlight': theme.surface.highlight,
    '--surface-inset': theme.surface.inset,
  };
}
