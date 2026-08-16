/**
 * MarkuprX Hooks
 *
 * Re-exports all hooks for clean imports:
 * import { useStaggeredAnimation, useAnimationState, usePulse, useTheme } from './hooks';
 */

// Animation hooks
export {
  // Staggered list animations
  useStaggeredAnimation,
  // Animation lifecycle (enter/exit)
  useAnimationState,
  // Animated number counter
  useCountAnimation,
  // One-shot pulse effect
  usePulse,
  // Error shake effect
  useShake,
  // Material ripple effect
  useRipple,
  // Delayed render for staggered mounts
  useDelayedRender,
  // Animated value interpolation
  useAnimatedValue,
  // Reduced motion detection
  useReducedMotion,
  // Spring physics presets
  SPRING_PRESETS,
} from './useAnimation';

// Theme hooks
export {
  // Main theme hook
  useTheme,
  // Check if dark mode
  useIsDarkMode,
  // Get current accent color details
  useAccentColor,
  // Get specific theme color
  useThemeColor,
  // Generate styles from theme
  useThemeStyles,
  // Theme context for provider
  ThemeContext,
  // Build theme from options
  buildTheme,
  // Storage keys for persistence
  THEME_STORAGE_KEYS,
  // CSS variable utilities
  getCSSVariable,
  setCSSVariable,
  applyCSSProperties,
  // Color utilities
  hexToRgb,
  rgbToHex,
  getContrastColor,
  adjustBrightness,
  withAlpha,
} from './useTheme';

// Animation type exports
export type {
  AnimationConfig,
  StaggerConfig,
  SpringConfig,
  AnimatedItem,
  AnimationState,
} from './useAnimation';

// Theme type exports
export type {
  ThemeContextValue,
  ThemeBuilderOptions,
} from './useTheme';
