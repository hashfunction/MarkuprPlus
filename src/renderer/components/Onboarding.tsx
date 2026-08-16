/**
 * markupR Onboarding Wizard
 *
 * The first impression that makes users say "wow".
 *
 * Flow:
 * 1. Welcome - Animated logo, tagline, Get Started button
 * 2. Microphone - Permission request with audio level preview
 * 3. Screen Recording - Permission request with system settings link
 * 4. OpenAI API Key - Input, test, success/error feedback
 * 5. Optional Anthropic API Key - Input, test, success/error feedback
 * 6. Success - Confetti celebration, Start Recording button
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTheme } from '../hooks/useTheme';

// ============================================================================
// Types
// ============================================================================

interface OnboardingProps {
  onComplete: () => void;
  onSkip: () => void;
}

type OnboardingStep = 'welcome' | 'microphone' | 'screen' | 'openai' | 'anthropic' | 'success';

interface PermissionStatus {
  microphone: 'unknown' | 'pending' | 'granted' | 'denied';
  screen: 'unknown' | 'pending' | 'granted' | 'denied';
}

interface ApiKeyStatus {
  value: string;
  testing: boolean;
  valid: boolean | null;
  error: string | null;
}

const API_TEST_TIMEOUT_MS = 15000;
const API_SAVE_TIMEOUT_MS = 12000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

// ============================================================================
// Confetti Particle System
// ============================================================================

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  size: number;
  opacity: number;
}

const getConfettiColors = (colors: ReturnType<typeof import('../hooks/useTheme').useTheme>['colors']) => [
  colors.accent.default,
  colors.status.success,
  colors.status.warning,
  colors.status.error,
  colors.text.link,
  colors.accent.hover,
  colors.status.info,
  colors.status.success,
];

const createParticle = (id: number, centerX: number, centerY: number): Particle => ({
  id,
  x: centerX,
  y: centerY,
  vx: (Math.random() - 0.5) * 20,
  vy: Math.random() * -15 - 10,
  rotation: Math.random() * 360,
  rotationSpeed: (Math.random() - 0.5) * 20,
  color: '',
  size: Math.random() * 8 + 4,
  opacity: 1,
});

const ConfettiCanvas: React.FC<{ active: boolean }> = ({ active }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>();
  const { colors } = useTheme();

  const confettiColors = useMemo(() => getConfettiColors(colors), [colors]);

  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!active || prefersReducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Create initial burst of particles with theme colors
    const themedCreateParticle = (id: number, cx: number, cy: number): Particle => ({
      ...createParticle(id, cx, cy),
      color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
    });

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    particlesRef.current = Array.from({ length: 150 }, (_, i) =>
      themedCreateParticle(i, centerX, centerY)
    );

    const animate = () => {
      if (!ctx || !canvas) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current = particlesRef.current.filter((p) => {
        // Update physics
        p.vy += 0.5; // gravity
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        p.opacity -= 0.008;

        // Draw particle
        if (p.opacity > 0) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.globalAlpha = p.opacity;
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          ctx.restore();
        }

        return p.opacity > 0 && p.y < canvas.height + 50;
      });

      if (particlesRef.current.length > 0) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [active, prefersReducedMotion]);

  if (!active || prefersReducedMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 100,
      }}
    />
  );
};

// ============================================================================
// Audio Level Visualizer
// ============================================================================

const AudioLevelMeter: React.FC<{ active: boolean }> = ({ active }) => {
  const [levels, setLevels] = useState<number[]>(Array(20).fill(0));
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>();
  const { colors } = useTheme();

  useEffect(() => {
    if (!active) {
      // Cleanup
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      setLevels(Array(20).fill(0));
      return;
    }

    const startVisualization = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        analyserRef.current = analyser;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateLevels = () => {
          if (!analyserRef.current) return;

          analyserRef.current.getByteFrequencyData(dataArray);

          // Sample 20 frequency bins
          const newLevels = Array.from({ length: 20 }, (_, i) => {
            const index = Math.floor((i / 20) * dataArray.length);
            return dataArray[index] / 255;
          });

          setLevels(newLevels);
          animationRef.current = requestAnimationFrame(updateLevels);
        };

        updateLevels();
      } catch {
        // Permission denied or error - show flat bars
        setLevels(Array(20).fill(0.1));
      }
    };

    startVisualization();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [active]);

  return (
    <div style={styles.audioMeter}>
      {levels.map((level, i) => (
        <div
          key={i}
          style={{
            ...styles.audioBar,
            height: `${Math.max(4, level * 48)}px`,
            backgroundColor: level > 0.6 ? colors.status.success : level > 0.3 ? colors.accent.default : colors.text.tertiary,
            opacity: 0.5 + level * 0.5,
          }}
        />
      ))}
    </div>
  );
};

// ============================================================================
// Step Components
// ============================================================================

const WelcomeStep: React.FC<{ onNext: () => void; onSkip: () => void }> = ({
  onNext,
  onSkip,
}) => {
  const [mounted, setMounted] = useState(false);
  const { colors } = useTheme();

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      style={{
        ...styles.stepContent,
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Animated Logo */}
      <div
        style={{
          ...styles.logoContainer,
          transform: mounted ? 'scale(1)' : 'scale(0.8)',
          transition: 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <div style={styles.logoGlow} />
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          {/* Recording circle */}
          <circle cx="40" cy="40" r="35" fill="url(#gradient1)" />
          {/* Inner microphone icon */}
          <path
            d="M40 20c-4.4 0-8 3.6-8 8v12c0 4.4 3.6 8 8 8s8-3.6 8-8V28c0-4.4-3.6-8-8-8z"
            fill={colors.text.inverse}
            opacity="0.9"
          />
          <path
            d="M54 36v4c0 7.7-6.3 14-14 14s-14-6.3-14-14v-4h-4v4c0 9.4 7.2 17.2 16 18v6h-6v4h16v-4h-6v-6c8.8-.8 16-8.6 16-18v-4h-4z"
            fill={colors.text.inverse}
            opacity="0.9"
          />
          <defs>
            <linearGradient id="gradient1" x1="5" y1="5" x2="75" y2="75">
              <stop stopColor={colors.accent.default} />
              <stop offset="1" stopColor={colors.text.link} />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Title */}
      <h1 style={styles.title}>Welcome to markupR</h1>

      {/* Tagline */}
      <p style={styles.tagline}>
        Capture developer feedback with voice narration and intelligent screenshots.
        <br />
        AI-ready documentation in seconds.
      </p>

      <div style={styles.quickSteps}>
        <div style={styles.quickStep}>
          <span style={styles.quickStepNumber}>1</span>
          <span style={styles.quickStepText}>Record and narrate your walkthrough.</span>
        </div>
        <div style={styles.quickStep}>
          <span style={styles.quickStepNumber}>2</span>
          <span style={styles.quickStepText}>Mark shots when needed. Markers confirm instantly.</span>
        </div>
        <div style={styles.quickStep}>
          <span style={styles.quickStepNumber}>3</span>
          <span style={styles.quickStepText}>Stop recording. AI aligns transcript + frames into a report.</span>
        </div>
      </div>

      {/* Get Started Button */}
      <button style={styles.primaryButton} onClick={onNext}>
        Get Started
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          style={{ marginLeft: 8 }}
        >
          <path
            d="M7.5 15l5-5-5-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Skip Option */}
      <button style={styles.skipButton} onClick={onSkip}>
        Skip setup, configure later
      </button>
    </div>
  );
};

const MicrophoneStep: React.FC<{
  status: PermissionStatus['microphone'];
  onRequestPermission: () => void;
  onNext: () => void;
  onBack: () => void;
}> = ({ status, onRequestPermission, onNext, onBack }) => {
  const [isRechecking, setIsRechecking] = useState(false);
  const { colors } = useTheme();

  // Recheck permission after user returns from System Preferences
  const handleRecheck = async () => {
    setIsRechecking(true);
    try {
      onRequestPermission();
    } finally {
      setTimeout(() => setIsRechecking(false), 500);
    }
  };

  return (
    <div style={styles.stepContent}>
      {/* Illustration */}
      <div style={styles.illustrationContainer}>
        <div
          style={{
            ...styles.iconCircle,
            backgroundColor: status === 'granted' ? colors.status.successSubtle : colors.accent.subtle,
            borderColor: status === 'granted' ? colors.status.success : colors.accent.default,
          }}
        >
          {status === 'granted' ? (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path
                d="M18 24l4 4 8-8"
                stroke={colors.status.success}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path
                d="M24 8c-3.3 0-6 2.7-6 6v9c0 3.3 2.7 6 6 6s6-2.7 6-6v-9c0-3.3-2.7-6-6-6z"
                stroke={colors.accent.default}
                strokeWidth="2.5"
                fill="none"
              />
              <path
                d="M36 20v3c0 6.6-5.4 12-12 12s-12-5.4-12-12v-3"
                stroke={colors.accent.default}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <path
                d="M24 35v5M18 40h12"
                stroke={colors.accent.default}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>
      </div>

      {/* Title */}
      <h2 style={styles.stepTitle}>Microphone Access</h2>

      {/* Explanation */}
      <p style={styles.stepDescription}>
        markupR needs microphone access to transcribe your voice narration as you
        walk through your feedback. Your audio is processed locally and securely.
      </p>

      {/* Audio Level Preview */}
      {status === 'granted' && (
        <div style={styles.previewBox}>
          <span style={styles.previewLabel}>Speak to test your microphone</span>
          <AudioLevelMeter active={status === 'granted'} />
        </div>
      )}

      {/* macOS System Preferences Instructions for denied */}
      {status === 'denied' && (
        <div style={styles.instructionBox}>
          <div style={styles.instructionHeader}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
              <path
                d="M10 6v4m0 4h.01M19 10a9 9 0 11-18 0 9 9 0 0118 0z"
                stroke={colors.status.error}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <span style={{ ...styles.instructionTitle, color: colors.status.error }}>Permission Denied</span>
          </div>
          <ol style={styles.instructionList}>
            <li>Click &quot;Open System Settings&quot; below</li>
            <li>Find &quot;markupR&quot; in the list</li>
            <li>Toggle the switch ON</li>
            <li>Click &quot;Check Again&quot; to verify</li>
          </ol>
        </div>
      )}

      {/* Permission Button */}
      {status !== 'granted' && (
        <div style={styles.buttonGroup}>
          <button
            style={{
              ...styles.primaryButton,
              backgroundColor: status === 'denied' ? colors.status.error : colors.accent.default,
            }}
            onClick={onRequestPermission}
            disabled={status === 'pending'}
          >
            {status === 'pending' && (
              <span style={styles.spinner} />
            )}
            {status === 'denied'
              ? 'Open System Settings'
              : 'Allow Microphone Access'}
          </button>

          {status === 'denied' && (
            <button
              style={styles.secondaryButton}
              onClick={handleRecheck}
              disabled={isRechecking}
            >
              {isRechecking ? (
                <span style={styles.spinner} />
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginRight: 6 }}>
                    <path
                      d="M14 8A6 6 0 1 1 8 2m0 0v3m0-3h3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Check Again
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Continue Button */}
      {status === 'granted' && (
        <button style={styles.primaryButton} onClick={onNext}>
          Continue
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            style={{ marginLeft: 8 }}
          >
            <path
              d="M7.5 15l5-5-5-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {/* Back Button */}
      <button style={styles.backButton} onClick={onBack}>
        Back
      </button>
    </div>
  );
};

const ScreenRecordingStep: React.FC<{
  status: PermissionStatus['screen'];
  onRequestPermission: () => void;
  onNext: () => void;
  onBack: () => void;
}> = ({ status, onRequestPermission, onNext, onBack }) => {
  const [isRechecking, setIsRechecking] = useState(false);
  const { colors } = useTheme();

  // Recheck permission after user returns from System Preferences
  const handleRecheck = async () => {
    setIsRechecking(true);
    try {
      onRequestPermission();
    } finally {
      setTimeout(() => setIsRechecking(false), 500);
    }
  };

  return (
    <div style={styles.stepContent}>
      {/* Illustration */}
      <div style={styles.illustrationContainer}>
        <div
          style={{
            ...styles.iconCircle,
            backgroundColor: status === 'granted' ? colors.status.successSubtle : colors.accent.subtle,
            borderColor: status === 'granted' ? colors.status.success : colors.accent.default,
          }}
        >
          {status === 'granted' ? (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path
                d="M18 24l4 4 8-8"
                stroke={colors.status.success}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect
                x="6"
                y="10"
                width="36"
                height="24"
                rx="3"
                stroke={colors.accent.default}
                strokeWidth="2.5"
                fill="none"
              />
              <path d="M14 38h20" stroke={colors.accent.default} strokeWidth="2.5" strokeLinecap="round" />
              <path d="M24 34v4" stroke={colors.accent.default} strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="24" cy="22" r="4" stroke={colors.accent.default} strokeWidth="2" fill="none" />
            </svg>
          )}
        </div>
      </div>

      {/* Title */}
      <h2 style={styles.stepTitle}>Screen Recording</h2>

      {/* Explanation */}
      <p style={styles.stepDescription}>
        MarkuprX records the selected screen or window and saves each marked area with
        the narration that explains it. Grant Screen Recording permission to enable video,
        screenshots, and live markup.
      </p>

      {/* macOS System Preferences Instructions */}
      {status === 'denied' && (
        <div style={styles.instructionBox}>
          <div style={styles.instructionHeader}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
              <path
                d="M10 6v4m0 4h.01M19 10a9 9 0 11-18 0 9 9 0 0118 0z"
                stroke={colors.status.warning}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <span style={styles.instructionTitle}>Manual Setup Required</span>
          </div>
          <ol style={styles.instructionList}>
            <li>Click &quot;Open System Settings&quot; below</li>
            <li>Find &quot;markupR&quot; in the list</li>
            <li>Toggle the switch ON</li>
            <li>Click &quot;Check Again&quot; to verify</li>
          </ol>
          <p style={styles.instructionNote}>
            Note: You may need to restart markupR after enabling.
          </p>
        </div>
      )}

      {/* Permission Button */}
      {status !== 'granted' && (
        <div style={styles.buttonGroup}>
          <button
            style={{
              ...styles.primaryButton,
              backgroundColor: status === 'denied' ? colors.status.warning : colors.accent.default,
            }}
            onClick={onRequestPermission}
            disabled={status === 'pending'}
          >
            {status === 'pending' && <span style={styles.spinner} />}
            {status === 'denied'
              ? 'Open System Settings'
              : 'Allow Screen Recording'}
          </button>

          {status === 'denied' && (
            <button
              style={styles.secondaryButton}
              onClick={handleRecheck}
              disabled={isRechecking}
            >
              {isRechecking ? (
                <span style={styles.spinner} />
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginRight: 6 }}>
                    <path
                      d="M14 8A6 6 0 1 1 8 2m0 0v3m0-3h3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Check Again
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Success Preview */}
      {status === 'granted' && (
        <div style={styles.successBox}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              stroke={colors.status.success}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span>Screen recording enabled! markupR can now capture screenshots.</span>
        </div>
      )}

      {/* Continue Button */}
      {status === 'granted' && (
        <button style={styles.primaryButton} onClick={onNext}>
          Continue
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            style={{ marginLeft: 8 }}
          >
            <path
              d="M7.5 15l5-5-5-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {/* Back Button */}
      <button style={styles.backButton} onClick={onBack}>
        Back
      </button>
    </div>
  );
};

const ApiKeyStep: React.FC<{
  title: string;
  helpText: React.ReactNode;
  placeholder: string;
  apiKey: ApiKeyStatus;
  onApiKeyChange: (value: string) => void;
  onTestApiKey: () => void;
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
  skipLabel: string;
}> = ({
  title,
  helpText,
  placeholder,
  apiKey,
  onApiKeyChange,
  onTestApiKey,
  onNext,
  onSkip,
  onBack,
  skipLabel,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { colors } = useTheme();

  useEffect(() => {
    // Focus input on mount
    inputRef.current?.focus();
  }, []);

  return (
    <div style={styles.stepContent}>
      {/* Illustration */}
      <div style={styles.illustrationContainer}>
        <div
          style={{
            ...styles.iconCircle,
            backgroundColor: apiKey.valid ? colors.status.successSubtle : colors.accent.subtle,
            borderColor: apiKey.valid ? colors.status.success : colors.accent.default,
          }}
        >
          {apiKey.valid ? (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path
                d="M18 24l4 4 8-8"
                stroke={colors.status.success}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path
                d="M32 20l-8-8-8 8M16 28l8 8 8-8"
                stroke={colors.accent.default}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="24"
                cy="24"
                r="4"
                stroke={colors.accent.default}
                strokeWidth="2.5"
                fill="none"
              />
            </svg>
          )}
        </div>
      </div>

      {/* Title */}
      <h2 style={styles.stepTitle}>{title}</h2>

      {/* Explanation */}
      <p style={styles.stepDescription}>{helpText}</p>

      {/* API Key Input */}
      <div style={styles.inputGroup}>
        <input
          ref={inputRef}
          type="password"
          placeholder={placeholder}
          value={apiKey.value}
          onChange={(e) => onApiKeyChange(e.target.value)}
          style={{
            ...styles.input,
            borderColor: apiKey.error ? colors.status.error : apiKey.valid ? colors.status.success : colors.border.default,
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && apiKey.value.length > 10) {
              onTestApiKey();
            }
          }}
        />
        {apiKey.value && (
          <button
            style={{
              ...styles.testButton,
              backgroundColor: apiKey.testing ? colors.bg.tertiary : colors.accent.default,
            }}
            onClick={onTestApiKey}
            disabled={apiKey.value.length < 10}
          >
            {apiKey.testing ? (
              <span style={styles.spinner} />
            ) : apiKey.valid ? (
              'Verified!'
            ) : (
              'Test Key'
            )}
          </button>
        )}
      </div>

      {/* Error Message */}
      {apiKey.error && (
        <div style={styles.errorBox}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M10 6v4m0 4h.01M19 10a9 9 0 11-18 0 9 9 0 0118 0z"
              stroke={colors.status.error}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <span>{apiKey.error}</span>
        </div>
      )}

      {/* Success Message */}
      {apiKey.valid && (
        <div style={styles.successBox}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              stroke={colors.status.success}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span>API key verified! You&apos;re ready to go.</span>
        </div>
      )}

      {/* Continue Button */}
      <button
        style={{
          ...styles.primaryButton,
          opacity: apiKey.valid ? 1 : 0.5,
          cursor: apiKey.valid ? 'pointer' : 'not-allowed',
        }}
        onClick={onNext}
        disabled={!apiKey.valid}
      >
        Continue
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          style={{ marginLeft: 8 }}
        >
          <path
            d="M7.5 15l5-5-5-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Skip */}
      <button style={styles.skipButton} onClick={onSkip}>
        {skipLabel}
      </button>

      {/* Back Button */}
      <button style={styles.backButton} onClick={onBack}>
        Back
      </button>
    </div>
  );
};

const SuccessStep: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [showConfetti, setShowConfetti] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { colors } = useTheme();
  const isMac = typeof navigator !== 'undefined'
    && navigator.platform.toUpperCase().includes('MAC');
  const recordShortcut = isMac ? '⌘⇧F' : 'Ctrl+Shift+F';
  const annotationModifier = isMac ? 'Command (⌘)' : 'Control (Ctrl)';

  useEffect(() => {
    // Trigger animations after mount
    const mountTimer = setTimeout(() => setMounted(true), 50);
    const confettiTimer = setTimeout(() => setShowConfetti(true), 300);

    return () => {
      clearTimeout(mountTimer);
      clearTimeout(confettiTimer);
    };
  }, []);

  return (
    <>
      <ConfettiCanvas active={showConfetti} />

      <div
        style={{
          ...styles.stepContent,
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.95)',
          transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Success Icon */}
        <div style={styles.successIconContainer}>
          <div
            style={{
              ...styles.successIconOuter,
              backgroundColor: colors.status.successSubtle,
              borderColor: colors.status.success,
              transform: mounted ? 'scale(1)' : 'scale(0)',
              transition: 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s',
            }}
          >
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <path
                d="M20 32l8 8 16-16"
                stroke={colors.status.success}
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  strokeDasharray: 50,
                  strokeDashoffset: mounted ? 0 : 50,
                  transition: 'stroke-dashoffset 0.6s ease-out 0.5s',
                }}
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h2 style={{ ...styles.stepTitle, color: colors.status.success }}>You&apos;re All Set!</h2>

        {/* Summary */}
        <p style={styles.stepDescription}>
          MarkuprX is ready. Press <kbd style={styles.kbd}>{recordShortcut}</kbd> to start,
          then speak naturally. Hold <kbd style={styles.kbd}>{annotationModifier}</kbd> and
          drag to mark the current screen. Release the key, then click normally to save and
          clear that issue while the click still reaches the app underneath. Repeat for as
          many separate issues as you need.
        </p>

        {/* Feature Summary */}
        <div style={styles.featureSummary}>
          <div style={styles.featureItem}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 12l2 2 4-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span>Voice transcription ready</span>
          </div>
          <div style={styles.featureItem}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 12l2 2 4-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span>Each marked screen is saved as a separate issue</span>
          </div>
          <div style={styles.featureItem}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 12l2 2 4-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span>Each issue keeps its matching narration and screenshot</span>
          </div>
        </div>

        {/* Start Button */}
        <button
          style={{
            ...styles.primaryButton,
            backgroundColor: colors.status.success,
          }}
          onClick={onComplete}
        >
          Start Your First Recording
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            style={{ marginLeft: 8 }}
          >
            <path
              d="M6 4l10 6-10 6V4z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>
    </>
  );
};

// ============================================================================
// Progress Dots
// ============================================================================

const STEPS: OnboardingStep[] = ['welcome', 'microphone', 'screen', 'openai', 'anthropic', 'success'];

const ProgressDots: React.FC<{ currentStep: OnboardingStep }> = ({ currentStep }) => {
  const currentIndex = STEPS.indexOf(currentStep);
  const { colors } = useTheme();

  return (
    <div style={styles.progressContainer} role="navigation" aria-label="Setup progress">
      {STEPS.filter((s) => s !== 'welcome' && s !== 'success').map((step) => {
        const stepIndex = STEPS.indexOf(step);
        const isActive = stepIndex === currentIndex;
        const isCompleted = stepIndex < currentIndex;

        return (
          <div
            key={step}
            style={{
              ...styles.progressDot,
              backgroundColor: isCompleted ? colors.status.success : isActive ? colors.accent.default : colors.bg.tertiary,
              transform: isActive ? 'scale(1.2)' : 'scale(1)',
            }}
            aria-label={`Step ${stepIndex}: ${step}${isCompleted ? ' (completed)' : isActive ? ' (current)' : ''}`}
          >
            {isCompleted && (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path
                  d="M2 5l2 2 4-4"
                  stroke={colors.text.inverse}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// Main Onboarding Component
// ============================================================================

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
  const [permissions, setPermissions] = useState<PermissionStatus>({
    microphone: 'unknown',
    screen: 'unknown',
  });
  const [openAiApiKey, setOpenAiApiKey] = useState<ApiKeyStatus>({
    value: '',
    testing: false,
    valid: null,
    error: null,
  });
  const [anthropicApiKey, setAnthropicApiKey] = useState<ApiKeyStatus>({
    value: '',
    testing: false,
    valid: null,
    error: null,
  });
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('left');

  // Navigate to next step
  const goToStep = useCallback((step: OnboardingStep, direction: 'left' | 'right' = 'left') => {
    setSlideDirection(direction);
    setCurrentStep(step);
  }, []);

  // Keyboard navigation: Enter/Right = next, Escape/Left = back
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const stepIndex = STEPS.indexOf(currentStep);

      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        if (currentStep === 'welcome') goToStep('microphone');
        else if (currentStep === 'microphone' && permissions.microphone === 'granted') goToStep('screen');
        else if (currentStep === 'screen' && permissions.screen === 'granted') goToStep('openai');
        else if (currentStep === 'openai' && openAiApiKey.valid) goToStep('anthropic');
        else if (currentStep === 'anthropic' && anthropicApiKey.valid) goToStep('success');
        else if (currentStep === 'success') onComplete();
      } else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
        e.preventDefault();
        if (stepIndex > 0 && currentStep !== 'welcome') {
          goToStep(STEPS[stepIndex - 1], 'right');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, permissions, openAiApiKey.valid, anthropicApiKey.valid, goToStep, onComplete]);

  // Check initial permission status on mount
  useEffect(() => {
    const checkInitialPermissions = async () => {
      try {
        const permissionStatus = await window.markupr.permissions.getAll();
        setPermissions({
          microphone: permissionStatus.microphone ? 'granted' : 'unknown',
          screen: permissionStatus.screen ? 'granted' : 'unknown',
        });
      } catch {
        // Permissions API not available, leave as unknown
      }
    };

    checkInitialPermissions();
  }, []);

  // Request microphone permission
  const requestMicrophonePermission = useCallback(async () => {
    setPermissions((prev) => ({ ...prev, microphone: 'pending' }));

    try {
      // First check via main process (macOS system permissions)
      const isGranted = await window.markupr.permissions.check('microphone');
      if (isGranted) {
        setPermissions((prev) => ({ ...prev, microphone: 'granted' }));
        return;
      }

      // Request via main process first (triggers macOS prompt)
      const mainGranted = await window.markupr.permissions.request('microphone');

      if (mainGranted) {
        // Verify with browser API as well
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        setPermissions((prev) => ({ ...prev, microphone: 'granted' }));
      } else {
        setPermissions((prev) => ({ ...prev, microphone: 'denied' }));
      }
    } catch {
      setPermissions((prev) => ({ ...prev, microphone: 'denied' }));
    }
  }, []);

  // Request screen recording permission via preload API
  const requestScreenPermission = useCallback(async () => {
    setPermissions((prev) => ({ ...prev, screen: 'pending' }));

    try {
      // First check if already granted
      const isGranted = await window.markupr.permissions.check('screen');
      if (isGranted) {
        setPermissions((prev) => ({ ...prev, screen: 'granted' }));
        return;
      }

      // Request permission - this will open System Preferences on macOS
      const granted = await window.markupr.permissions.request('screen');

      if (granted) {
        setPermissions((prev) => ({ ...prev, screen: 'granted' }));
      } else {
        // Permission was denied or user needs to enable manually
        setPermissions((prev) => ({ ...prev, screen: 'denied' }));
      }
    } catch {
      setPermissions((prev) => ({ ...prev, screen: 'denied' }));
    }
  }, []);

  // Test OpenAI API key
  const testOpenAiApiKey = useCallback(async () => {
    setOpenAiApiKey((prev) => ({ ...prev, testing: true, error: null }));

    try {
      const candidateKey = openAiApiKey.value.trim();
      const validation = await withTimeout(
        window.markupr.settings.testApiKey('openai', candidateKey),
        API_TEST_TIMEOUT_MS,
        'OpenAI API test timed out. Please try again.'
      );

      if (validation.valid) {
        const saved = await withTimeout(
          window.markupr.settings.setApiKey('openai', candidateKey),
          API_SAVE_TIMEOUT_MS,
          'Saving OpenAI key timed out. Please try again.'
        );
        if (!saved) {
          setOpenAiApiKey((prev) => ({
            ...prev,
            valid: false,
            error: 'OpenAI key validated, but local save verification failed. Relaunch app and try again.',
          }));
          return;
        }

        setOpenAiApiKey((prev) => ({ ...prev, valid: true }));
        window.dispatchEvent(
          new CustomEvent('markupr:settings-updated', {
            detail: { type: 'api-key', provider: 'openai', source: 'onboarding' },
          }),
        );
      } else {
        setOpenAiApiKey((prev) => ({
          ...prev,
          valid: false,
          error: validation.error || 'OpenAI API key test failed. Please try again.',
        }));
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      setOpenAiApiKey((prev) => ({
        ...prev,
        valid: false,
        error: `Failed to test OpenAI key: ${detail}`,
      }));
    } finally {
      setOpenAiApiKey((prev) => ({ ...prev, testing: false }));
    }
  }, [openAiApiKey.value]);

  // Test Anthropic API key
  const testAnthropicApiKey = useCallback(async () => {
    setAnthropicApiKey((prev) => ({ ...prev, testing: true, error: null }));

    try {
      const candidateKey = anthropicApiKey.value.trim();
      const validation = await withTimeout(
        window.markupr.settings.testApiKey('anthropic', candidateKey),
        API_TEST_TIMEOUT_MS,
        'Anthropic API test timed out. Please try again.'
      );

      if (validation.valid) {
        const saved = await withTimeout(
          window.markupr.settings.setApiKey('anthropic', candidateKey),
          API_SAVE_TIMEOUT_MS,
          'Saving Anthropic key timed out. Please try again.'
        );
        if (!saved) {
          setAnthropicApiKey((prev) => ({
            ...prev,
            valid: false,
            error: 'Anthropic key validated, but local save verification failed. Relaunch app and try again.',
          }));
          return;
        }

        setAnthropicApiKey((prev) => ({ ...prev, valid: true }));
        window.dispatchEvent(
          new CustomEvent('markupr:settings-updated', {
            detail: { type: 'api-key', provider: 'anthropic', source: 'onboarding' },
          }),
        );
      } else {
        setAnthropicApiKey((prev) => ({
          ...prev,
          valid: false,
          error: validation.error || 'Anthropic API key test failed. Please try again.',
        }));
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      setAnthropicApiKey((prev) => ({
        ...prev,
        valid: false,
        error: `Failed to test Anthropic key: ${detail}`,
      }));
    } finally {
      setAnthropicApiKey((prev) => ({ ...prev, testing: false }));
    }
  }, [anthropicApiKey.value]);

  // Render current step
  const renderStep = () => {
    switch (currentStep) {
      case 'welcome':
        return <WelcomeStep onNext={() => goToStep('microphone')} onSkip={onSkip} />;

      case 'microphone':
        return (
          <MicrophoneStep
            status={permissions.microphone}
            onRequestPermission={requestMicrophonePermission}
            onNext={() => goToStep('screen')}
            onBack={() => goToStep('welcome', 'right')}
          />
        );

      case 'screen':
        return (
          <ScreenRecordingStep
            status={permissions.screen}
            onRequestPermission={requestScreenPermission}
            onNext={() => goToStep('openai')}
            onBack={() => goToStep('microphone', 'right')}
          />
        );

      case 'openai':
        return (
          <ApiKeyStep
            title="OpenAI API Key"
            helpText={
              <>
                markupR uses OpenAI for post-session narration transcription. Create an API key at{' '}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.link}
                >
                  platform.openai.com
                </a>{' '}
                (or skip and configure local transcription later).
              </>
            }
            placeholder="Enter your OpenAI API key"
            apiKey={openAiApiKey}
            onApiKeyChange={(value) =>
              setOpenAiApiKey((prev) => ({ ...prev, value, valid: null, error: null }))
            }
            onTestApiKey={testOpenAiApiKey}
            onNext={() => goToStep('anthropic')}
            onSkip={() => goToStep('anthropic')}
            onBack={() => goToStep('screen', 'right')}
            skipLabel="Skip for now — use local transcription"
          />
        );

      case 'anthropic':
        return (
          <ApiKeyStep
            title="Report Generation (Optional)"
            helpText={
              <>
                Choose Codex CLI, Claude Code CLI, Ollama, LM Studio, Anthropic API, or Local Rules later in Settings {'>'} Advanced. If you want Anthropic API, create a key at{' '}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.link}
                >
                  console.anthropic.com
                </a>{' '}
                (or skip and configure in Settings &gt; Advanced later).
              </>
            }
            placeholder="Enter your Anthropic API key"
            apiKey={anthropicApiKey}
            onApiKeyChange={(value) =>
              setAnthropicApiKey((prev) => ({ ...prev, value, valid: null, error: null }))
            }
            onTestApiKey={testAnthropicApiKey}
            onNext={() => goToStep('success')}
            onSkip={() => goToStep('success')}
            onBack={() => goToStep('openai', 'right')}
            skipLabel="Skip — configure report generation later"
          />
        );

      case 'success':
        return <SuccessStep onComplete={onComplete} />;

      default:
        return null;
    }
  };

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-label="Setup wizard">
      <div style={styles.backdrop} />

      <div style={styles.modal}>
        {/* Progress Dots */}
        {currentStep !== 'welcome' && currentStep !== 'success' && (
          <ProgressDots currentStep={currentStep} />
        )}

        {/* ARIA live region for step announcements */}
        <div aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
          {currentStep === 'welcome' && 'Welcome to markupR setup'}
          {currentStep === 'microphone' && 'Step 1 of 4: Microphone access'}
          {currentStep === 'screen' && 'Step 2 of 4: Screen recording'}
          {currentStep === 'openai' && 'Step 3 of 4: OpenAI API key'}
          {currentStep === 'anthropic' && 'Step 4 of 4: Optional report generation setup'}
          {currentStep === 'success' && 'Setup complete'}
        </div>

        {/* Step Content with Animation */}
        <div
          key={currentStep}
          style={{
            ...styles.stepWrapper,
            animation: `pageSlideIn${slideDirection === 'left' ? 'Left' : 'Right'} 0.4s ease-out`,
          }}
        >
          {renderStep()}
        </div>
      </div>

      {/* pageSlideInLeft, pageSlideInRight, spin, pulse, glowPulse keyframes provided by animations.css */}
    </div>
  );
};

// ============================================================================
// Styles
// ============================================================================

type ExtendedCSSProperties = React.CSSProperties & {
  WebkitAppRegion?: 'drag' | 'no-drag';
};

const styles: Record<string, ExtendedCSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },

  backdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'var(--bg-overlay)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
  },

  modal: {
    position: 'relative',
    width: '100%',
    maxWidth: 480,
    margin: 24,
    backgroundColor: 'var(--bg-elevated)',
    borderRadius: 24,
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--border-subtle)',
    overflow: 'hidden',
    WebkitAppRegion: 'no-drag',
  },

  stepWrapper: {
    padding: '48px 40px',
  },

  stepContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },

  // Logo
  logoContainer: {
    position: 'relative',
    marginBottom: 32,
  },

  logoGlow: {
    position: 'absolute',
    inset: -20,
    background: 'radial-gradient(circle, var(--accent-muted) 0%, transparent 70%)',
    animation: 'glowPulse 3s ease-in-out infinite',
  },

  // Typography
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 16,
    letterSpacing: '-0.02em',
  },

  tagline: {
    fontSize: 15,
    lineHeight: 1.6,
    color: 'var(--text-secondary)',
    marginBottom: 20,
    maxWidth: 360,
  },

  quickSteps: {
    width: '100%',
    maxWidth: 360,
    marginBottom: 28,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    textAlign: 'left',
  },

  quickStep: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
    backgroundColor: 'var(--surface-inset)',
  },

  quickStepNumber: {
    width: 20,
    height: 20,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    backgroundColor: 'var(--accent-default)',
    color: 'var(--text-inverse)',
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  },

  quickStepText: {
    fontSize: 13,
    lineHeight: 1.45,
    color: 'var(--text-secondary)',
  },

  stepTitle: {
    fontSize: 24,
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: 12,
    letterSpacing: '-0.01em',
  },

  stepDescription: {
    fontSize: 14,
    lineHeight: 1.6,
    color: 'var(--text-secondary)',
    marginBottom: 24,
    maxWidth: 340,
  },

  // Buttons
  primaryButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 280,
    padding: '14px 24px',
    backgroundColor: 'var(--accent-default)',
    border: 'none',
    borderRadius: 12,
    color: 'var(--text-inverse)',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },

  skipButton: {
    marginTop: 16,
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--text-tertiary)',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'color 0.2s ease',
  },

  backButton: {
    marginTop: 12,
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--text-tertiary)',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'color 0.2s ease',
  },

  testButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px 16px',
    backgroundColor: 'var(--accent-default)',
    border: 'none',
    borderRadius: 8,
    color: 'var(--text-inverse)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    minWidth: 90,
  },

  // Icons
  illustrationContainer: {
    marginBottom: 24,
  },

  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: '50%',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s ease',
  },

  // Audio Meter
  audioMeter: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
    height: 48,
    padding: '12px 0',
  },

  audioBar: {
    width: 4,
    borderRadius: 2,
    transition: 'height 0.05s ease, background-color 0.2s ease',
  },

  // Inputs
  inputGroup: {
    display: 'flex',
    gap: 8,
    width: '100%',
    maxWidth: 360,
    marginBottom: 16,
  },

  input: {
    flex: 1,
    padding: '12px 16px',
    backgroundColor: 'var(--surface-inset)',
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 14,
    transition: 'border-color 0.2s ease',
  },

  // Boxes
  previewBox: {
    width: '100%',
    maxWidth: 320,
    padding: 16,
    backgroundColor: 'var(--surface-inset)',
    borderRadius: 12,
    marginBottom: 24,
  },

  previewLabel: {
    display: 'block',
    fontSize: 12,
    color: 'var(--text-tertiary)',
    marginBottom: 12,
  },

  warningBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    width: '100%',
    maxWidth: 360,
    padding: 12,
    backgroundColor: 'var(--status-warning-subtle)',
    border: '1px solid var(--status-warning)',
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 13,
    color: 'var(--status-warning)',
    textAlign: 'left',
  },

  successBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 360,
    padding: 12,
    backgroundColor: 'var(--status-success-subtle)',
    border: '1px solid var(--status-success)',
    borderRadius: 8,
    marginBottom: 24,
    fontSize: 13,
    color: 'var(--status-success)',
    textAlign: 'left',
  },

  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    maxWidth: 360,
    padding: 12,
    backgroundColor: 'var(--status-error-subtle)',
    border: '1px solid var(--status-error)',
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 13,
    color: 'var(--status-error)',
    textAlign: 'left',
  },

  // Instruction box for permission setup
  instructionBox: {
    width: '100%',
    maxWidth: 360,
    padding: 16,
    backgroundColor: 'var(--status-warning-subtle)',
    border: '1px solid var(--status-warning)',
    borderRadius: 12,
    marginBottom: 20,
    textAlign: 'left',
  },

  instructionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },

  instructionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--status-warning)',
  },

  instructionList: {
    margin: 0,
    paddingLeft: 20,
    fontSize: 13,
    color: 'var(--text-secondary)',
    lineHeight: 1.8,
  },

  instructionNote: {
    marginTop: 12,
    fontSize: 12,
    color: 'var(--text-secondary)',
    fontStyle: 'italic',
  },

  // Button group for multiple actions
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    width: '100%',
    maxWidth: 280,
  },

  secondaryButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    padding: '12px 24px',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-strong)',
    borderRadius: 12,
    color: 'var(--text-secondary)',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },

  // Success Step
  successIconContainer: {
    marginBottom: 24,
  },

  successIconOuter: {
    width: 96,
    height: 96,
    borderRadius: '50%',
    backgroundColor: 'var(--status-success-subtle)',
    border: '2px solid var(--status-success)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  featureSummary: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 32,
  },

  featureItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    color: 'var(--status-success)',
  },

  kbd: {
    display: 'inline-block',
    padding: '2px 8px',
    backgroundColor: 'var(--surface-inset)',
    borderRadius: 4,
    fontSize: 12,
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-strong)',
  },

  link: {
    color: 'var(--text-link)',
    textDecoration: 'none',
  },

  // Progress
  progressContainer: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 24,
    paddingBottom: 0,
  },

  progressDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s ease',
  },

  // Spinner
  spinner: {
    width: 16,
    height: 16,
    border: '2px solid var(--border-subtle)',
    borderTopColor: 'var(--text-inverse)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};

export default Onboarding;
