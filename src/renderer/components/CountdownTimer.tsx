/**
 * Countdown Timer Component
 *
 * Cinematic 3-2-1 countdown before recording starts.
 * Features:
 * - Large animated numbers with scale/fade transitions
 * - Optional subtle tick sounds via Web Audio API
 * - Skip button (Escape or Space to skip)
 * - Configurable duration (0, 3, or 5 seconds)
 *
 * Design: Full-screen overlay with dramatic, focused presentation
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { hasActiveContainedDialog } from '../hooks/useContainedDialogFocus';
import { useTheme } from '../hooks/useTheme';
import { useReducedMotion } from '../hooks/useAnimation';

export interface CountdownTimerProps {
  /** Countdown duration in seconds (0 skips countdown entirely) */
  duration: 0 | 3 | 5;
  /** Called when countdown completes or is skipped */
  onComplete: () => void;
  /** Called when user explicitly skips the countdown */
  onSkip: () => void;
  /** Enable subtle tick sounds on each count */
  enableSound?: boolean;
  /** Theme mode */
  isDarkMode?: boolean;
}

type CountdownPhase = 'counting' | 'go' | 'done';

// Audio context singleton to avoid multiple instances
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  if (!audioContext) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioContext = new AudioContextClass();
    }
  }

  return audioContext;
}

/**
 * Play a subtle tick sound for countdown numbers
 */
function playTickSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume context if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  // Crisp, subtle tick
  oscillator.frequency.value = 880; // A5
  oscillator.type = 'sine';

  gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.08);
}

/**
 * Play a "go" sound when recording starts
 */
function playGoSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  // Ascending tone for "Recording!"
  oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
  oscillator.frequency.exponentialRampToValueAtTime(1318.5, ctx.currentTime + 0.15); // E6
  oscillator.type = 'sine';

  gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.25);
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
  duration,
  onComplete,
  onSkip,
  enableSound = false,
  isDarkMode = true,
}) => {
  const { colors } = useTheme();
  const prefersReducedMotion = useReducedMotion();
  const [count, setCount] = useState<number>(duration);
  const [phase, setPhase] = useState<CountdownPhase>('counting');
  const [isExiting, setIsExiting] = useState(false);

  const hasPlayedInitialRef = useRef(false);
  const completeCalledRef = useRef(false);

  // Skip if duration is 0 or user prefers reduced motion
  useEffect(() => {
    if ((duration === 0 || prefersReducedMotion) && !completeCalledRef.current) {
      completeCalledRef.current = true;
      onComplete();
    }
  }, [duration, prefersReducedMotion, onComplete]);

  // Play initial tick when countdown starts
  useEffect(() => {
    if (duration > 0 && enableSound && !hasPlayedInitialRef.current) {
      hasPlayedInitialRef.current = true;
      playTickSound();
    }
  }, [duration, enableSound]);

  // Countdown logic
  useEffect(() => {
    if (duration === 0 || phase === 'done') return;

    if (count > 0) {
      const timer = setTimeout(() => {
        setCount((c) => {
          const newCount = c - 1;
          // Play tick for next number
          if (newCount > 0 && enableSound) {
            playTickSound();
          }
          return newCount;
        });
      }, 1000);

      return () => clearTimeout(timer);
    } else if (phase === 'counting') {
      // Transition to "Recording!" message
      setPhase('go');
      if (enableSound) {
        playGoSound();
      }

      // Brief "Recording!" display, then complete
      const goTimer = setTimeout(() => {
        setIsExiting(true);
        setTimeout(() => {
          setPhase('done');
          if (!completeCalledRef.current) {
            completeCalledRef.current = true;
            onComplete();
          }
        }, 300); // Exit animation duration
      }, 700);

      return () => clearTimeout(goTimer);
    }
  }, [count, phase, duration, enableSound, onComplete]);

  // Handle skip action
  const handleSkip = useCallback(() => {
    if (phase === 'done') return;

    setIsExiting(true);
    setTimeout(() => {
      setPhase('done');
      if (!completeCalledRef.current) {
        completeCalledRef.current = true;
        onSkip();
      }
    }, 150);
  }, [phase, onSkip]);

  // Keyboard support (Escape or Space to skip)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (hasActiveContainedDialog()) return;
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        handleSkip();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSkip]);

  // Don't render if duration is 0, reduced motion preferred, or phase is done
  if (duration === 0 || prefersReducedMotion || phase === 'done') return null;

  // Theme colors
  const theme = {
    overlayBg: isDarkMode ? 'rgba(0, 0, 0, 0.85)' : 'rgba(0, 0, 0, 0.75)',
    numberColor: colors.text.inverse,
    numberGlow: isDarkMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.5)',
    recordingColor: colors.status.error,
    recordingGlow: 'rgba(239, 68, 68, 0.5)',
    skipText: isDarkMode ? 'rgba(156, 163, 175, 0.8)' : 'rgba(156, 163, 175, 0.9)',
    skipTextHover: isDarkMode ? 'rgba(209, 213, 219, 1)' : 'rgba(255, 255, 255, 1)',
  };

  return (
    <>
      {/* Keyframe animations */}
      <style>
        {`
          @keyframes countdown-number-enter {
            0% {
              opacity: 0;
              transform: scale(0.3);
            }
            30% {
              opacity: 1;
              transform: scale(1.15);
            }
            50% {
              transform: scale(0.95);
            }
            70% {
              transform: scale(1.02);
            }
            100% {
              transform: scale(1);
            }
          }

          @keyframes countdown-number-pulse {
            0%, 100% {
              transform: scale(1);
              text-shadow: 0 0 60px ${theme.numberGlow};
            }
            50% {
              transform: scale(1.02);
              text-shadow: 0 0 80px ${theme.numberGlow}, 0 0 120px ${theme.numberGlow};
            }
          }

          @keyframes countdown-number-exit {
            0% {
              opacity: 1;
              transform: scale(1);
            }
            100% {
              opacity: 0;
              transform: scale(1.8);
            }
          }

          @keyframes countdown-recording-pulse {
            0%, 100% {
              opacity: 1;
              transform: scale(1);
            }
            50% {
              opacity: 0.8;
              transform: scale(1.1);
            }
          }

          @keyframes countdown-dot-ping {
            0% {
              transform: scale(1);
              opacity: 0.8;
            }
            75%, 100% {
              transform: scale(2.5);
              opacity: 0;
            }
          }

          @keyframes countdown-overlay-enter {
            0% {
              opacity: 0;
              backdrop-filter: blur(0px);
            }
            100% {
              opacity: 1;
              backdrop-filter: blur(12px);
            }
          }

          @keyframes countdown-overlay-exit {
            0% {
              opacity: 1;
            }
            100% {
              opacity: 0;
            }
          }

          @keyframes countdown-recording-enter {
            0% {
              opacity: 0;
              transform: scale(0.8);
            }
            100% {
              opacity: 1;
              transform: scale(1);
            }
          }

          .countdown-number {
            animation: countdown-number-enter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
                       countdown-number-pulse 1s ease-in-out 0.4s infinite;
          }

          .countdown-number-exiting {
            animation: countdown-number-exit 0.25s ease-out forwards;
          }

          .ff-countdown-skip:focus-visible {
            outline: 2px solid ${theme.numberColor};
            outline-offset: 4px;
            border-radius: 6px;
          }
        `}
      </style>

      {/* Full-screen overlay */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: theme.overlayBg,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          animation: isExiting
            ? 'countdown-overlay-exit 0.3s ease-out forwards'
            : 'countdown-overlay-enter 0.3s ease-out forwards',
        }}
      >
        <div
          className="ff-countdown-content"
          style={{
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 24,
            maxWidth: 'calc(100% - 24px)',
            maxHeight: 'calc(100% - 24px)',
            minWidth: 0,
            overflow: 'auto',
            boxSizing: 'border-box',
          }}
        >
          {/* Screen reader announcement */}
          <div aria-live="assertive" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
            {phase === 'counting' ? `${count}` : phase === 'go' ? 'Recording started' : ''}
          </div>

          {/* Countdown number */}
          {phase === 'counting' && (
            <div
              key={count}
              className="countdown-number"
              aria-hidden="true"
              style={{
                fontSize: 'min(40vw, 280px)',
                fontWeight: 800,
                color: theme.numberColor,
                lineHeight: 1,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                textShadow: `0 0 60px ${theme.numberGlow}`,
                userSelect: 'none',
              }}
            >
              {count}
            </div>
          )}

          {/* "Recording!" message */}
          {phase === 'go' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 16,
                animation: 'countdown-recording-enter 0.3s ease-out forwards',
              }}
            >
              {/* Pulsing recording dot */}
              <div
                style={{
                  position: 'relative',
                  width: 24,
                  height: 24,
                }}
              >
                {/* Ping effect */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: theme.recordingColor,
                    borderRadius: '50%',
                    animation: 'countdown-dot-ping 1s cubic-bezier(0, 0, 0.2, 1) infinite',
                  }}
                />
                {/* Solid dot */}
                <div
                  style={{
                    position: 'relative',
                    width: 24,
                    height: 24,
                    backgroundColor: theme.recordingColor,
                    borderRadius: '50%',
                    boxShadow: `0 0 20px ${theme.recordingGlow}`,
                    animation: 'countdown-recording-pulse 1s ease-in-out infinite',
                  }}
                />
              </div>

              {/* "Recording!" text */}
              <div
                style={{
                  fontSize: 'min(10vw, 48px)',
                  fontWeight: 700,
                  color: theme.recordingColor,
                  letterSpacing: '-0.02em',
                  textShadow: `0 0 30px ${theme.recordingGlow}`,
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  userSelect: 'none',
                }}
              >
                Recording!
              </div>
            </div>
          )}

          {/* Skip instructions */}
          {phase === 'counting' && (
            <button
              className="ff-countdown-skip"
              onClick={handleSkip}
              style={{
                marginTop: 32,
                padding: '8px 16px',
                backgroundColor: 'transparent',
                border: 'none',
                color: theme.skipText,
                fontSize: 14,
                cursor: 'pointer',
                transition: 'color 0.2s ease',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = theme.skipTextHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = theme.skipText;
              }}
              onFocus={(e) => {
                e.currentTarget.style.color = theme.skipTextHover;
              }}
              onBlur={(e) => {
                e.currentTarget.style.color = theme.skipText;
              }}
            >
              Press <kbd style={{
                padding: '2px 6px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: 4,
                fontFamily: 'inherit',
                fontSize: 12,
                border: '1px solid rgba(255, 255, 255, 0.2)',
              }}>Esc</kbd> or <kbd style={{
                padding: '2px 6px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: 4,
                fontFamily: 'inherit',
                fontSize: 12,
                border: '1px solid rgba(255, 255, 255, 0.2)',
              }}>Space</kbd> to skip
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default CountdownTimer;
