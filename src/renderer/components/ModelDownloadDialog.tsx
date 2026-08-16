/**
 * ModelDownloadDialog.tsx - Whisper Model Download Prompt
 *
 * Shown on first launch when no Whisper model is downloaded.
 * Allows users to download the recommended model for offline transcription.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../hooks/useTheme';

// ============================================================================
// Types
// ============================================================================

interface ModelDownloadDialogProps {
  onComplete: () => void;
  onSkip: () => void;
}

interface ModelInfo {
  name: string;
  filename: string;
  sizeMB: number;
  ramRequired: string;
  quality: string;
  isDownloaded: boolean;
}

interface DownloadProgress {
  model: string;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  speedBps: number;
  estimatedSecondsRemaining: number;
}

type DialogState = 'prompt' | 'downloading' | 'complete' | 'error';

// ============================================================================
// Helper Functions
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSecond: number): string {
  return formatBytes(bytesPerSecond) + '/s';
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}m ${secs}s`;
}

// ============================================================================
// useModelDownload Hook
// ============================================================================

interface UseModelDownloadResult {
  isDownloading: boolean;
  progress: DownloadProgress | null;
  error: string | null;
  downloadModel: (model: string) => Promise<void>;
  cancelDownload: (model: string) => void;
}

function useModelDownload(): UseModelDownloadResult {
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.markuprx?.whisper) return;
    // Subscribe to download events
    const unsubProgress = window.markuprx.whisper.onDownloadProgress((p) => {
      setProgress(p);
    });

    const unsubComplete = window.markuprx.whisper.onDownloadComplete(() => {
      setIsDownloading(false);
      setProgress(null);
    });

    const unsubError = window.markuprx.whisper.onDownloadError(({ error: err }) => {
      setIsDownloading(false);
      setError(err);
    });

    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
    };
  }, []);

  const downloadModel = useCallback(async (model: string) => {
    setIsDownloading(true);
    setError(null);
    setProgress(null);

    const result = await window.markuprx?.whisper?.downloadModel(model);
    if (!result?.success && result?.error) {
      setError(result.error);
      setIsDownloading(false);
    }
  }, []);

  const cancelDownload = useCallback((model: string) => {
    window.markuprx?.whisper?.cancelDownload(model);
    setIsDownloading(false);
    setProgress(null);
  }, []);

  return {
    isDownloading,
    progress,
    error,
    downloadModel,
    cancelDownload,
  };
}

// ============================================================================
// Main Component
// ============================================================================

export const ModelDownloadDialog: React.FC<ModelDownloadDialogProps> = ({
  onComplete,
  onSkip,
}) => {
  const [state, setState] = useState<DialogState>('prompt');
  const [selectedModel, setSelectedModel] = useState<string>('tiny');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { colors } = useTheme();

  const { isDownloading, progress, error, downloadModel, cancelDownload } = useModelDownload();

  // Load available models on mount
  useEffect(() => {
    if (!window.markuprx?.whisper) return;
    const loadModels = async () => {
      const availableModels = await window.markuprx.whisper.getAvailableModels();
      setModels(availableModels);
    };
    loadModels();
  }, []);

  // Update state based on download status
  useEffect(() => {
    if (isDownloading) {
      setState('downloading');
    } else if (error) {
      setState('error');
    }
  }, [isDownloading, error]);

  // Listen for download complete to transition state
  useEffect(() => {
    if (!window.markuprx?.whisper) return;
    const unsubComplete = window.markuprx.whisper.onDownloadComplete(() => {
      setState('complete');
    });
    return unsubComplete;
  }, []);

  const handleDownload = useCallback(async () => {
    await downloadModel(selectedModel);
  }, [selectedModel, downloadModel]);

  const handleCancel = useCallback(() => {
    cancelDownload(selectedModel);
    setState('prompt');
  }, [selectedModel, cancelDownload]);

  const selectedModelInfo = models.find((m) => m.name === selectedModel);

  // Render different states
  const renderContent = () => {
    switch (state) {
      case 'prompt':
        return (
          <>
            {/* Illustration */}
            <div style={styles.illustrationContainer}>
              <div style={styles.iconCircle}>
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
                  {/* Download arrow */}
                  <path
                    d="M38 28v6h-6M38 34l-6-6"
                    stroke={colors.status.success}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h2 style={styles.title}>Download Speech Recognition Model</h2>

            {/* Description */}
            <p style={styles.description}>
              MarkuprX needs to download a speech recognition model ({selectedModelInfo?.sizeMB || 75}MB)
              to transcribe your voice offline. This is a one-time download.
            </p>

            {/* Model Selection (Advanced) */}
            {showAdvanced && (
              <div style={styles.modelSelector}>
                <label style={styles.modelLabel}>Select Model:</label>
                <div style={styles.modelOptions}>
                  {models.map((model) => (
                    <button
                      key={model.name}
                      style={{
                        ...styles.modelOption,
                        borderColor: selectedModel === model.name ? colors.accent.default : colors.bg.tertiary,
                        backgroundColor: selectedModel === model.name ? colors.accent.subtle : 'transparent',
                      }}
                      onClick={() => setSelectedModel(model.name)}
                    >
                      <div style={styles.modelOptionHeader}>
                        <span style={styles.modelName}>{model.name}</span>
                        {model.isDownloaded && (
                          <span style={styles.downloadedBadge}>Downloaded</span>
                        )}
                      </div>
                      <div style={styles.modelDetails}>
                        <span>{model.sizeMB}MB</span>
                        <span style={styles.modelQuality}>{model.quality}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Toggle Advanced */}
            <button
              style={styles.advancedToggle}
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? 'Hide options' : 'Choose different model'}
            </button>

            {/* Action Buttons */}
            <div style={styles.buttonGroup}>
              <button style={styles.primaryButton} onClick={handleDownload}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ marginRight: 8 }}>
                  <path
                    d="M10 3v10m0 0l-3-3m3 3l3-3M4 17h12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Download Now ({selectedModelInfo?.sizeMB || 75}MB)
              </button>

              <button style={styles.skipButton} onClick={onSkip}>
                Skip for now (recording disabled)
              </button>
            </div>
          </>
        );

      case 'downloading':
        return (
          <>
            {/* Progress Illustration */}
            <div style={styles.illustrationContainer}>
              <div style={styles.progressCircleContainer}>
                <svg width="120" height="120" viewBox="0 0 120 120">
                  {/* Background circle */}
                  <circle
                    cx="60"
                    cy="60"
                    r="54"
                    fill="none"
                    stroke={colors.bg.tertiary}
                    strokeWidth="8"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="60"
                    cy="60"
                    r="54"
                    fill="none"
                    stroke={colors.accent.default}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(progress?.percent || 0) * 3.39} 339`}
                    transform="rotate(-90 60 60)"
                    style={{ transition: 'stroke-dasharray 0.3s ease' }}
                  />
                </svg>
                <div style={styles.progressPercent}>{progress?.percent || 0}%</div>
              </div>
            </div>

            {/* Title */}
            <h2 style={styles.title}>Downloading Model...</h2>

            {/* Progress Details */}
            <div style={styles.progressDetails}>
              <div style={styles.progressRow}>
                <span style={styles.progressLabel}>Downloaded</span>
                <span style={styles.progressValue}>
                  {formatBytes(progress?.downloadedBytes || 0)} / {formatBytes(progress?.totalBytes || 0)}
                </span>
              </div>
              <div style={styles.progressRow}>
                <span style={styles.progressLabel}>Speed</span>
                <span style={styles.progressValue}>{formatSpeed(progress?.speedBps || 0)}</span>
              </div>
              <div style={styles.progressRow}>
                <span style={styles.progressLabel}>Time remaining</span>
                <span style={styles.progressValue}>
                  {formatTime(progress?.estimatedSecondsRemaining || 0)}
                </span>
              </div>
            </div>

            {/* Cancel Button */}
            <button style={styles.cancelButton} onClick={handleCancel}>
              Cancel Download
            </button>
          </>
        );

      case 'complete':
        return (
          <>
            {/* Success Icon */}
            <div style={styles.illustrationContainer}>
              <div style={styles.successCircle}>
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <path
                    d="M16 24l6 6 12-12"
                    stroke={colors.status.success}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h2 style={{ ...styles.title, color: colors.status.success }}>Download Complete!</h2>

            {/* Description */}
            <p style={styles.description}>
              The speech recognition model has been downloaded successfully.
              MarkuprX can now transcribe your voice offline.
            </p>

            {/* Continue Button */}
            <button style={styles.successButton} onClick={onComplete}>
              Start Using MarkuprX
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ marginLeft: 8 }}>
                <path
                  d="M7.5 15l5-5-5-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </>
        );

      case 'error':
        return (
          <>
            {/* Error Icon */}
            <div style={styles.illustrationContainer}>
              <div style={styles.errorCircle}>
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <path
                    d="M24 16v8m0 8h.01"
                    stroke={colors.status.error}
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h2 style={{ ...styles.title, color: colors.status.error }}>Download Failed</h2>

            {/* Error Message */}
            <div style={styles.errorBox}>
              <span>{error}</span>
            </div>

            {/* Retry Button */}
            <div style={styles.buttonGroup}>
              <button style={styles.primaryButton} onClick={handleDownload}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ marginRight: 8 }}>
                  <path
                    d="M4 10a6 6 0 1 1 12 0m-6-6v6m0 0l-2-2m2 2l2-2"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Try Again
              </button>

              <button style={styles.skipButton} onClick={onSkip}>
                Skip for now
              </button>
            </div>
          </>
        );
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.backdrop} />
      <div style={styles.modal}>
        <div style={styles.content}>{renderContent()}</div>
      </div>
    </div>
  );
};

// ============================================================================
// useModelCheck Hook - Check if model download is needed
// ============================================================================

interface ModelCheckResult {
  isChecking: boolean;
  needsDownload: boolean;
  hasTranscriptionCapability: boolean;
}

export function useModelCheck(): ModelCheckResult {
  const [isChecking, setIsChecking] = useState(true);
  const [needsDownload, setNeedsDownload] = useState(false);
  const [hasTranscriptionCapability, setHasTranscriptionCapability] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const safetyTimeout = window.setTimeout(() => {
      if (!isMounted) return;
      console.warn('[useModelCheck] Capability check timed out, continuing startup.');
      setIsChecking(false);
    }, 7000);

    const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
      let timeoutId: number | null = null;
      const timeoutPromise = new Promise<T>((resolve) => {
        timeoutId = window.setTimeout(() => resolve(fallback), timeoutMs);
      });

      const result = await Promise.race([promise, timeoutPromise]);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      return result;
    };

    const checkModel = async () => {
      try {
        if (!window.markuprx?.whisper) {
          setNeedsDownload(true);
          return;
        }
        // Check if we have any transcription capability (OpenAI or Whisper)
        const hasCapability = await withTimeout(
          window.markuprx.whisper.hasTranscriptionCapability(),
          4000,
          false
        );
        if (!isMounted) return;
        setHasTranscriptionCapability(hasCapability);

        if (!hasCapability) {
          // Check specifically if we have a Whisper model
          const modelCheck = await withTimeout(
            window.markuprx.whisper.checkModel(),
            4000,
            {
              hasAnyModel: false,
              defaultModel: null,
              downloadedModels: [],
              recommendedModel: 'tiny',
              recommendedModelSizeMB: 75,
            }
          );
          if (!isMounted) return;
          setNeedsDownload(!modelCheck.hasAnyModel);
        } else {
          setNeedsDownload(false);
        }
      } catch (error) {
        if (!isMounted) return;
        console.error('[useModelCheck] Failed to check model status:', error);
        setNeedsDownload(true);
      } finally {
        window.clearTimeout(safetyTimeout);
        if (isMounted) {
          setIsChecking(false);
        }
      }
    };

    checkModel();

    return () => {
      isMounted = false;
      window.clearTimeout(safetyTimeout);
    };
  }, []);

  return { isChecking, needsDownload, hasTranscriptionCapability };
}

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
    // Solid background to work with transparent Electron window
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
  },

  backdrop: {
    position: 'absolute',
    inset: 0,
    // Keep backdrop for additional depth but make it subtle
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
  },

  modal: {
    position: 'relative',
    width: '100%',
    maxWidth: 420,
    margin: 24,
    // Fully opaque background for the modal
    backgroundColor: 'rgb(17, 24, 39)',
    borderRadius: 24,
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    WebkitAppRegion: 'no-drag',
  },

  content: {
    padding: '40px 32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    overflowY: 'auto',
  },

  illustrationContainer: {
    marginBottom: 24,
  },

  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: '50%',
    backgroundColor: 'var(--accent-subtle)',
    border: '2px solid var(--accent-default)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    fontSize: 22,
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: 12,
    letterSpacing: '-0.01em',
  },

  description: {
    fontSize: 14,
    lineHeight: 1.6,
    color: 'var(--text-secondary)',
    marginBottom: 24,
    maxWidth: 340,
  },

  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    width: '100%',
    maxWidth: 300,
  },

  primaryButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
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
    padding: '10px 16px',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--text-tertiary)',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'color 0.2s ease',
  },

  advancedToggle: {
    marginBottom: 24,
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--text-link)',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'color 0.2s ease',
  },

  modelSelector: {
    width: '100%',
    marginBottom: 16,
  },

  modelLabel: {
    display: 'block',
    fontSize: 13,
    color: 'var(--text-secondary)',
    marginBottom: 12,
    textAlign: 'left',
  },

  modelOptions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },

  modelOption: {
    width: '100%',
    padding: '12px 16px',
    backgroundColor: 'transparent',
    border: '1px solid var(--bg-tertiary)',
    borderRadius: 10,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textAlign: 'left',
  },

  modelOptionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },

  modelName: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-primary)',
    textTransform: 'capitalize',
  },

  downloadedBadge: {
    fontSize: 11,
    padding: '2px 8px',
    backgroundColor: 'var(--status-success-subtle)',
    color: 'var(--status-success)',
    borderRadius: 4,
  },

  modelDetails: {
    display: 'flex',
    gap: 12,
    fontSize: 12,
    color: 'var(--text-tertiary)',
  },

  modelQuality: {
    color: 'var(--text-secondary)',
  },

  // Progress state styles
  progressCircleContainer: {
    position: 'relative',
    width: 120,
    height: 120,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  progressPercent: {
    position: 'absolute',
    fontSize: 24,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },

  progressDetails: {
    width: '100%',
    maxWidth: 280,
    marginBottom: 24,
  },

  progressRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },

  progressLabel: {
    fontSize: 13,
    color: 'var(--text-tertiary)',
  },

  progressValue: {
    fontSize: 13,
    color: 'var(--text-primary)',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
  },

  cancelButton: {
    padding: '12px 24px',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-strong)',
    borderRadius: 10,
    color: 'var(--text-secondary)',
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },

  // Success state styles
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: '50%',
    backgroundColor: 'var(--status-success-subtle)',
    border: '2px solid var(--status-success)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  successButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 300,
    padding: '14px 24px',
    background: 'linear-gradient(135deg, var(--status-success) 0%, #059669 100%)',
    border: 'none',
    borderRadius: 12,
    color: 'var(--text-inverse)',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },

  // Error state styles
  errorCircle: {
    width: 96,
    height: 96,
    borderRadius: '50%',
    backgroundColor: 'var(--status-error-subtle)',
    border: '2px solid var(--status-error)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  errorBox: {
    width: '100%',
    maxWidth: 300,
    padding: 12,
    backgroundColor: 'var(--status-error-subtle)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
    marginBottom: 24,
    fontSize: 13,
    color: 'var(--status-error)',
    textAlign: 'center',
  },
};

export default ModelDownloadDialog;
