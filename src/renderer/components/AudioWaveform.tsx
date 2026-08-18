/**
 * Audio Waveform Visualization Component
 *
 * Professional audio tool quality visualization featuring:
 * - Real-time waveform display (bars, wave, line styles)
 * - Voice activity detection indicator
 * - Smooth 60fps requestAnimationFrame-based animation
 * - Peak level detection with decay
 * - Compact mode for RecordingOverlay integration
 *
 * Designed to feel like a premium DAW or podcast recording app
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTheme } from '../hooks/useTheme';

// =============================================================================
// Types
// =============================================================================

export interface AudioWaveformProps {
  /** Current audio level normalized 0-1 */
  audioLevel: number;
  /** Whether voice/speech is currently detected */
  isVoiceActive: boolean;
  /** Visualization style */
  style?: 'bars' | 'wave' | 'line';
  /** Component size preset */
  size?: 'compact' | 'normal' | 'large';
  /** Accent color for active state (CSS color string) */
  accentColor?: string;
  /** Secondary color for inactive state */
  inactiveColor?: string;
  /** Number of bars/samples to display */
  resolution?: number;
  /** Show peak hold indicator */
  showPeak?: boolean;
  /** Custom className for container */
  className?: string;
}

interface WaveformStyleProps {
  levels: number[];
  isVoiceActive: boolean;
  accentColor: string;
  inactiveColor: string;
  peakLevel: number;
  showPeak: boolean;
  peakColor: string;
  peakWarningColor: string;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Hook that returns waveform-specific colors from the theme system.
 * Replaces the former module-level COLORS constant.
 */
function useWaveformColors() {
  const { colors } = useTheme();
  return useMemo(
    () => ({
      active: colors.status.success,
      inactive: colors.text.tertiary,
      peak: colors.status.error,
      peakWarning: colors.status.warning,
      background: 'rgba(31, 41, 55, 0.5)',
      textSecondary: colors.text.secondary,
    }),
    [colors]
  );
}

const SIZE_CONFIG = {
  compact: { height: 16, width: 64, barCount: 8, barWidth: 2, gap: 2 },
  normal: { height: 48, width: 192, barCount: 32, barWidth: 4, gap: 2 },
  large: { height: 96, width: 320, barCount: 64, barWidth: 3, gap: 2 },
};

// Smoothing factor for level transitions (higher = smoother but slower)
const SMOOTHING_FACTOR = 0.15;
// Peak hold time in milliseconds
const PEAK_HOLD_TIME = 1500;
// Peak decay rate per frame
const PEAK_DECAY_RATE = 0.02;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generates a bell curve distribution for bar heights
 * Creates natural-looking center-weighted visualization
 */
function generateBellCurve(index: number, total: number): number {
  const center = total / 2;
  const distance = Math.abs(index - center) / center;
  // Gaussian-like falloff
  return Math.exp(-2 * distance * distance);
}

/**
 * Applies smoothing between current and target values
 */
function smoothValue(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Bars Style Waveform
 * Classic audio meter with vertical bars, center-weighted distribution
 */
function BarsWaveform({
  levels,
  isVoiceActive,
  accentColor,
  inactiveColor,
  peakLevel,
  showPeak,
  peakColor,
  peakWarningColor,
}: WaveformStyleProps) {
  const barCount = levels.length;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        height: '100%',
        width: '100%',
        padding: '0 4px',
      }}
    >
      {levels.map((level, i) => {
        // Apply bell curve distribution for natural look
        const bellWeight = generateBellCurve(i, barCount);
        const adjustedLevel = level * bellWeight;

        // Determine color based on level and voice activity
        let barColor = inactiveColor;
        if (isVoiceActive) {
          if (adjustedLevel > 0.9) {
            barColor = peakColor;
          } else if (adjustedLevel > 0.75) {
            barColor = peakWarningColor;
          } else {
            barColor = accentColor;
          }
        }

        return (
          <div
            key={i}
            style={{
              width: 4,
              minHeight: 4,
              height: `${Math.max(8, adjustedLevel * 100)}%`,
              backgroundColor: barColor,
              borderRadius: 2,
              transition: 'height 50ms ease-out, background-color 100ms ease',
              opacity: isVoiceActive ? 1 : 0.6,
            }}
          />
        );
      })}

      {/* Peak indicator line */}
      {showPeak && peakLevel > 0.1 && (
        <div
          style={{
            position: 'absolute',
            left: 4,
            right: 4,
            height: 2,
            bottom: `${peakLevel * 100}%`,
            backgroundColor: peakLevel > 0.9 ? peakColor : peakWarningColor,
            borderRadius: 1,
            opacity: 0.8,
            transition: 'bottom 50ms ease-out',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}

/**
 * Wave Style Waveform
 * Canvas-based smooth waveform with fill gradient
 */
function WaveWaveform({
  levels,
  isVoiceActive,
  accentColor,
  inactiveColor,
}: WaveformStyleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Handle high-DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const centerY = height / 2;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw waveform path
    ctx.beginPath();
    ctx.moveTo(0, centerY);

    const sliceWidth = width / (levels.length - 1);

    // Upper wave (positive values)
    levels.forEach((value, i) => {
      const x = i * sliceWidth;
      const amplitude = value * (height / 2) * 0.9; // Leave margin
      const y = centerY - amplitude;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        // Use quadratic curves for smoothness
        const prevX = (i - 1) * sliceWidth;
        ctx.quadraticCurveTo(prevX + sliceWidth / 2, centerY - levels[i - 1] * (height / 2) * 0.9, x, y);
      }
    });

    // Mirror for lower wave (creates symmetric waveform)
    for (let i = levels.length - 1; i >= 0; i--) {
      const x = i * sliceWidth;
      const amplitude = levels[i] * (height / 2) * 0.9;
      const y = centerY + amplitude;

      if (i === levels.length - 1) {
        ctx.lineTo(x, y);
      } else {
        const nextX = (i + 1) * sliceWidth;
        ctx.quadraticCurveTo(nextX - sliceWidth / 2, centerY + levels[i + 1] * (height / 2) * 0.9, x, y);
      }
    }

    ctx.closePath();

    // Create gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    const baseColor = isVoiceActive ? accentColor : inactiveColor;
    gradient.addColorStop(0, `${baseColor}40`);
    gradient.addColorStop(0.5, `${baseColor}60`);
    gradient.addColorStop(1, `${baseColor}40`);

    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw center line
    ctx.strokeStyle = isVoiceActive ? accentColor : inactiveColor;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(0, centerY);
    levels.forEach((value, i) => {
      const x = i * sliceWidth;
      const amplitude = value * (height / 2) * 0.8;

      if (i === 0) {
        ctx.moveTo(x, centerY);
      } else {
        // Create slight variance for organic feel
        const variance = (Math.random() > 0.5 ? 1 : -1) * 0.5;
        ctx.lineTo(x, centerY - amplitude * variance);
      }
    });
    ctx.stroke();
  }, [levels, isVoiceActive, accentColor, inactiveColor]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
    </div>
  );
}

/**
 * Line Style Waveform
 * Simple animated line with glow effect - good for minimal UIs
 */
function LineWaveform({
  levels,
  isVoiceActive,
  accentColor,
  inactiveColor,
  peakLevel,
  peakColor,
}: WaveformStyleProps) {
  const currentLevel = levels[levels.length - 1] || 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        width: '100%',
        padding: '0 8px',
        position: 'relative',
      }}
    >
      {/* Background track */}
      <div
        style={{
          position: 'absolute',
          left: 8,
          right: 8,
          height: 4,
          backgroundColor: 'rgba(75, 85, 99, 0.3)',
          borderRadius: 2,
        }}
      />

      {/* Active level bar */}
      <div
        style={{
          position: 'absolute',
          left: 8,
          height: 4,
          width: `${Math.max(0, Math.min(100, currentLevel * 100))}%`,
          maxWidth: 'calc(100% - 16px)',
          backgroundColor: isVoiceActive ? accentColor : inactiveColor,
          borderRadius: 2,
          transition: 'width 50ms ease-out',
          boxShadow: isVoiceActive ? `0 0 8px ${accentColor}60` : 'none',
        }}
      />

      {/* Peak marker */}
      {peakLevel > 0.1 && (
        <div
          style={{
            position: 'absolute',
            left: `calc(8px + min(${peakLevel * 100}%, calc(100% - 18px)))`,
            width: 4,
            height: 8,
            backgroundColor: peakLevel > 0.9 ? peakColor : accentColor,
            borderRadius: 1,
            opacity: 0.9,
            transition: 'left 50ms ease-out',
          }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function AudioWaveform({
  audioLevel,
  isVoiceActive,
  style = 'bars',
  size = 'normal',
  accentColor: accentColorProp,
  inactiveColor: inactiveColorProp,
  resolution,
  showPeak = true,
  className,
}: AudioWaveformProps) {
  const waveformColors = useWaveformColors();
  const accentColor = accentColorProp ?? waveformColors.active;
  const inactiveColor = inactiveColorProp ?? waveformColors.inactive;

  const config = SIZE_CONFIG[size];
  const barCount = resolution || config.barCount;

  // State for accumulated levels (creates trailing effect)
  const [levels, setLevels] = useState<number[]>(() => new Array(barCount).fill(0));
  // Peak level with hold and decay
  const [peakLevel, setPeakLevel] = useState(0);
  // Smoothed current level for fluid animation
  const smoothedLevelRef = useRef(0);

  // Animation frame reference
  const animationRef = useRef<number>();
  const lastUpdateRef = useRef<number>(0);
  const peakHoldTimeRef = useRef<number>(0);

  // Smooth level updates at 60fps
  const updateLevels = useCallback((timestamp: number) => {
    // Throttle to ~60fps
    if (timestamp - lastUpdateRef.current < 16) {
      animationRef.current = requestAnimationFrame(updateLevels);
      return;
    }
    lastUpdateRef.current = timestamp;

    // Smooth the incoming audio level
    smoothedLevelRef.current = smoothValue(smoothedLevelRef.current, audioLevel, SMOOTHING_FACTOR);

    setLevels((prev) => {
      const newLevels = [...prev.slice(1), smoothedLevelRef.current];
      return newLevels;
    });

    // Update peak with hold and decay
    setPeakLevel((prevPeak) => {
      if (smoothedLevelRef.current > prevPeak) {
        peakHoldTimeRef.current = timestamp;
        return smoothedLevelRef.current;
      } else if (timestamp - peakHoldTimeRef.current > PEAK_HOLD_TIME) {
        // Decay peak after hold time
        return Math.max(0, prevPeak - PEAK_DECAY_RATE);
      }
      return prevPeak;
    });

    animationRef.current = requestAnimationFrame(updateLevels);
  }, [audioLevel]);

  // Start animation loop
  useEffect(() => {
    animationRef.current = requestAnimationFrame(updateLevels);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [updateLevels]);

  // Style props passed to sub-components
  const styleProps: WaveformStyleProps = useMemo(
    () => ({
      levels,
      isVoiceActive,
      accentColor,
      inactiveColor,
      peakLevel,
      showPeak,
      peakColor: waveformColors.peak,
      peakWarningColor: waveformColors.peakWarning,
    }),
    [levels, isVoiceActive, accentColor, inactiveColor, peakLevel, showPeak, waveformColors.peak, waveformColors.peakWarning]
  );

  // Container styles
  const containerStyle: React.CSSProperties = {
    width: size === 'large' ? '100%' : config.width,
    height: config.height,
    backgroundColor: waveformColors.background,
    borderRadius: size === 'compact' ? 8 : 12,
    overflow: 'hidden',
    position: 'relative',
    transition: 'box-shadow 200ms ease',
    boxShadow: isVoiceActive
      ? `0 0 0 1px ${accentColor}30, 0 0 12px ${accentColor}20`
      : '0 0 0 1px rgba(75, 85, 99, 0.3)',
  };

  return (
    <div style={containerStyle} className={className}>
      {/* Waveform visualization */}
      {style === 'bars' && <BarsWaveform {...styleProps} />}
      {style === 'wave' && <WaveWaveform {...styleProps} />}
      {style === 'line' && <LineWaveform {...styleProps} />}

      {/* Voice activity indicator dot */}
      {isVoiceActive && (
        <div
          style={{
            position: 'absolute',
            top: size === 'compact' ? 2 : 4,
            right: size === 'compact' ? 2 : 4,
            width: size === 'compact' ? 4 : 6,
            height: size === 'compact' ? 4 : 6,
            borderRadius: '50%',
            backgroundColor: waveformColors.active,
            boxShadow: `0 0 4px ${waveformColors.active}`,
            animation: 'pulseScale 1.5s ease-in-out infinite',
          }}
        />
      )}

      {/* pulseScale keyframe provided by animations.css */}
    </div>
  );
}

// =============================================================================
// Compact Audio Indicator
// =============================================================================

interface CompactAudioIndicatorProps {
  /** Current audio level normalized 0-1 */
  audioLevel: number;
  /** Whether voice/speech is currently detected */
  isVoiceActive: boolean;
  /** Accent color for active state */
  accentColor?: string;
  /** Color for inactive bars */
  inactiveColor?: string;
  /** Number of bars */
  barCount?: number;
  /** Width of each bar in pixels */
  barWidth?: number;
  /** Gap between bars in pixels */
  barGap?: number;
  /** Container height in pixels */
  meterHeight?: number;
  /** Minimum bar height in pixels */
  minBarHeight?: number;
  /** Maximum bar height in pixels */
  maxBarHeight?: number;
}

/**
 * Compact Audio Indicator
 * Minimal 5-bar indicator designed for RecordingOverlay integration
 * Shows real-time audio level with voice activity feedback
 */
export function CompactAudioIndicator({
  audioLevel,
  isVoiceActive,
  accentColor: accentColorProp,
  inactiveColor: inactiveColorProp,
  barCount = 5,
  barWidth = 2,
  barGap = 1,
  meterHeight = 16,
  minBarHeight = 4,
  maxBarHeight = 16,
}: CompactAudioIndicatorProps) {
  const waveformColors = useWaveformColors();
  const accentColor = accentColorProp ?? waveformColors.active;
  const inactiveColor = inactiveColorProp ?? waveformColors.inactive;
  const [smoothedLevel, setSmoothedLevel] = useState(0);
  const [phase, setPhase] = useState(0);
  const animationRef = useRef<number>();
  const levelRef = useRef(0);

  // Smooth level updates
  useEffect(() => {
    levelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    const animate = () => {
      setSmoothedLevel((prev) => smoothValue(prev, levelRef.current, 0.2));
      setPhase((prev) => prev + 0.22);
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Generate bars with staggered thresholds
  const bars = useMemo(() => {
    return Array.from({ length: barCount }, (_, i) => {
      const motionBoost = isVoiceActive
        ? Math.max(0, Math.sin(phase + i * 0.92) * 0.16 + 0.18)
        : Math.max(0, Math.sin(phase + i * 0.74) * 0.045 + 0.03);
      const effectiveLevel = Math.min(
        1,
        Math.max(isVoiceActive ? 0.05 : 0.015, smoothedLevel + motionBoost + (isVoiceActive ? 0.06 : 0))
      );
      const threshold = i / barCount;
      const isActive = effectiveLevel > threshold;
      const intensity = isActive ? Math.min(1, (effectiveLevel - threshold) * barCount) : 0;

      // Height varies by position (taller in center)
      const centerRadius = Math.max(1, (barCount - 1) / 2);
      const centerBonus = 1 - Math.abs(i - (barCount - 1) / 2) / centerRadius;
      const centerMaxHeight = minBarHeight + centerBonus * (maxBarHeight - minBarHeight);
      const height = minBarHeight + intensity * (centerMaxHeight - minBarHeight);

      return {
        height,
        isActive,
        intensity,
      };
    });
  }, [
    barCount,
    isVoiceActive,
    maxBarHeight,
    minBarHeight,
    phase,
    smoothedLevel,
  ]);

  return (
    <div
      role="meter"
      aria-label="Microphone level"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.max(0, Math.min(1, audioLevel)) * 100)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: barGap,
        height: meterHeight,
        padding: '0 2px',
      }}
    >
      {bars.map((bar, i) => (
        <div
          key={i}
          style={{
            width: barWidth,
            height: bar.height,
            borderRadius: 1,
            backgroundColor: isVoiceActive && bar.isActive ? accentColor : inactiveColor,
            opacity: bar.isActive ? 0.9 + bar.intensity * 0.1 : 0.4,
            transition: 'height 50ms ease-out, background-color 100ms ease, opacity 100ms ease',
          }}
        />
      ))}
    </div>
  );
}

// =============================================================================
// Audio Level Meter (VU-style)
// =============================================================================

interface AudioLevelMeterProps {
  /** Current audio level normalized 0-1 */
  level: number;
  /** Whether voice is active */
  isVoiceActive: boolean;
  /** Orientation */
  orientation?: 'horizontal' | 'vertical';
  /** Show dB labels */
  showLabels?: boolean;
  /** Size preset */
  size?: 'small' | 'medium' | 'large';
}

/**
 * Professional VU-style level meter
 * Shows current level, peak hold, and dB scale
 */
export function AudioLevelMeter({
  level,
  isVoiceActive,
  orientation = 'horizontal',
  showLabels = false,
  size = 'medium',
}: AudioLevelMeterProps) {
  const waveformColors = useWaveformColors();
  const [smoothedLevel, setSmoothedLevel] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);
  const peakHoldTimeRef = useRef(0);
  const animationRef = useRef<number>();

  // Convert linear to dB (clamped range)
  const levelToDb = (l: number): number => {
    if (l <= 0) return -60;
    return Math.max(-60, Math.min(0, 20 * Math.log10(l)));
  };

  // Animation loop
  useEffect(() => {
    const animate = (timestamp: number) => {
      // Smooth level
      setSmoothedLevel((prev) => smoothValue(prev, level, 0.15));

      // Peak with hold
      setPeakLevel((prevPeak) => {
        if (level > prevPeak) {
          peakHoldTimeRef.current = timestamp;
          return level;
        } else if (timestamp - peakHoldTimeRef.current > PEAK_HOLD_TIME) {
          return Math.max(0, prevPeak - PEAK_DECAY_RATE);
        }
        return prevPeak;
      });

      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [level]);

  // Size configuration
  const sizeConfig = {
    small: { width: 80, height: 8, labelSize: 8 },
    medium: { width: 120, height: 12, labelSize: 10 },
    large: { width: 200, height: 16, labelSize: 12 },
  };
  const config = sizeConfig[size];

  const isVertical = orientation === 'vertical';
  const meterWidth = isVertical ? config.height : config.width;
  const meterHeight = isVertical ? config.width : config.height;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isVertical ? 'column' : 'row',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {/* Meter track */}
      <div
        style={{
          position: 'relative',
          width: meterWidth,
          height: meterHeight,
          backgroundColor: 'rgba(31, 41, 55, 0.6)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        {/* Level segments (gradient effect) */}
        <div
          style={{
            position: 'absolute',
            [isVertical ? 'bottom' : 'left']: 0,
            [isVertical ? 'left' : 'top']: 0,
            [isVertical ? 'width' : 'height']: '100%',
            [isVertical ? 'height' : 'width']: `${smoothedLevel * 100}%`,
            background: isVoiceActive
              ? `linear-gradient(${isVertical ? 'to top' : 'to right'},
                  ${waveformColors.active} 0%,
                  ${waveformColors.active} 75%,
                  ${waveformColors.peakWarning} 90%,
                  ${waveformColors.peak} 100%)`
              : waveformColors.inactive,
            transition: `${isVertical ? 'height' : 'width'} 50ms ease-out`,
          }}
        />

        {/* Peak indicator */}
        <div
          style={{
            position: 'absolute',
            [isVertical ? 'bottom' : 'left']: `calc(${peakLevel * 100}% - 2px)`,
            [isVertical ? 'left' : 'top']: 0,
            [isVertical ? 'width' : 'height']: '100%',
            [isVertical ? 'height' : 'width']: 2,
            backgroundColor: peakLevel > 0.9 ? waveformColors.peak : waveformColors.peakWarning,
            opacity: peakLevel > 0.1 ? 0.9 : 0,
            transition: `${isVertical ? 'bottom' : 'left'} 50ms ease-out, opacity 100ms ease`,
          }}
        />
      </div>

      {/* dB labels */}
      {showLabels && (
        <span
          style={{
            fontSize: config.labelSize,
            fontFamily: 'ui-monospace, monospace',
            color: smoothedLevel > 0.9 ? waveformColors.peak : waveformColors.textSecondary,
            minWidth: 36,
            textAlign: 'right',
          }}
        >
          {levelToDb(smoothedLevel).toFixed(1)} dB
        </span>
      )}
    </div>
  );
}

// =============================================================================
// Default Export
// =============================================================================

export default AudioWaveform;
