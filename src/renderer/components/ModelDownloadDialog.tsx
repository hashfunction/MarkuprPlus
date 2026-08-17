/**
 * ModelDownloadDialog.tsx - Whisper Model Download Prompt
 *
 * Shown on first launch when no Whisper model is downloaded.
 * Allows users to download the recommended model for offline transcription.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useContainedDialogFocus } from '../hooks/useContainedDialogFocus';
import { getContrastColor, useTheme } from '../hooks/useTheme';

// ============================================================================
// Types
// ============================================================================

interface ModelDownloadDialogProps {
  onComplete: () => void;
  onSkip: () => void;
}

export interface ModelInfo {
  name: string;
  filename: string;
  sizeMB: number;
  ramRequired: string;
  quality: string;
  isDownloaded: boolean;
}

export interface DownloadProgress {
  model: string;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  speedBps: number;
  estimatedSecondsRemaining: number;
}

export type DialogState = 'prompt' | 'downloading' | 'complete' | 'error';

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

export interface ModelDownloadDialogViewProps {
  state: DialogState;
  selectedModel: string;
  models: ModelInfo[];
  showAdvanced: boolean;
  progress: DownloadProgress | null;
  error: string | null;
  onSelectModel: (model: string) => void;
  onToggleAdvanced: () => void;
  onDownload: () => void | Promise<void>;
  onSkip: () => void;
  onCancel: () => void;
  onComplete: () => void;
}

export const ModelDownloadDialogView: React.FC<ModelDownloadDialogViewProps> = ({
  state,
  selectedModel,
  models,
  showAdvanced,
  progress,
  error,
  onSelectModel,
  onToggleAdvanced,
  onDownload,
  onSkip,
  onCancel,
  onComplete,
}) => {
  const { colors } = useTheme();
  const dialogRef = useContainedDialogFocus<HTMLDivElement>(true);
  const selectedModelInfo = models.find((model) => model.name === selectedModel);
  const selectedSize = selectedModelInfo?.sizeMB || 75;
  const title = state === 'prompt'
    ? 'Download Speech Recognition Model'
    : state === 'downloading'
      ? 'Downloading Model...'
      : state === 'complete'
        ? 'Download Complete!'
        : 'Download Failed';

  return (
    <div className="ff-contained-dialog-layer" style={styles.overlay}>
      <div
        ref={dialogRef}
        className="ff-contained-dialog"
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="markuprx-model-download-title"
        tabIndex={-1}
      >
        <div className="ff-contained-dialog__body" style={styles.content}>
          <div
            aria-hidden="true"
            style={{
              ...styles.stateIcon,
              color: state === 'error'
                ? colors.status.error
                : state === 'complete'
                  ? colors.status.success
                  : colors.accent.default,
            }}
          >
            {state === 'prompt' ? '↓' : state === 'downloading' ? '…' : state === 'complete' ? '✓' : '!'}
          </div>

          <h2 id="markuprx-model-download-title" style={styles.title}>{title}</h2>

          {state === 'prompt' && (
            <>
              <p style={styles.description}>
                MarkuprX needs to download a speech recognition model ({selectedSize}MB) to
                transcribe your voice offline. This is a one-time download.
              </p>
              {showAdvanced && (
                <fieldset style={styles.modelSelector}>
                  <legend style={styles.modelLabel}>Select Model</legend>
                  <div style={styles.modelOptions}>
                    {models.map((model) => (
                      <button
                        key={model.name}
                        type="button"
                        aria-pressed={selectedModel === model.name}
                        style={{
                          ...styles.modelOption,
                          borderColor: selectedModel === model.name
                            ? colors.accent.default
                            : colors.border.default,
                          backgroundColor: selectedModel === model.name
                            ? colors.accent.subtle
                            : colors.surface.inset,
                        }}
                        onClick={() => onSelectModel(model.name)}
                      >
                        <span style={styles.modelOptionHeader}>
                          <span style={styles.modelName}>{model.name}</span>
                          {model.isDownloaded && (
                            <span style={styles.downloadedBadge}>Downloaded</span>
                          )}
                        </span>
                        <span style={styles.modelDetails}>
                          <span>{model.sizeMB}MB · {model.ramRequired} RAM</span>
                          <span style={styles.modelQuality}>{model.quality}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              <button type="button" style={styles.advancedToggle} onClick={onToggleAdvanced}>
                {showAdvanced ? 'Hide options' : 'Choose different model'}
              </button>
            </>
          )}

          {state === 'downloading' && (
            <div style={styles.progressDetails}>
              <progress
                aria-label="Model download progress"
                max={100}
                value={progress?.percent || 0}
                style={styles.progressBar}
              />
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
          )}

          {state === 'complete' && (
            <p style={styles.description}>
              The speech recognition model has been downloaded successfully. MarkuprX can now
              transcribe your voice offline.
            </p>
          )}

          {state === 'error' && (
            <div role="alert" style={styles.errorBox}>
              {error || 'The model could not be downloaded. Please try again.'}
            </div>
          )}
        </div>

        <div className="ff-contained-dialog__actions" style={styles.dialogActions}>
          {state === 'prompt' && (
            <>
              <button type="button" style={styles.skipButton} onClick={onSkip}>
                Skip for now (recording disabled)
              </button>
              <button
                type="button"
                style={{
                  ...styles.primaryButton,
                  color: getContrastColor(colors.accent.default),
                }}
                onClick={onDownload}
              >
                Download Now ({selectedSize}MB)
              </button>
            </>
          )}
          {state === 'downloading' && (
            <button type="button" style={styles.cancelButton} onClick={onCancel}>
              Cancel Download
            </button>
          )}
          {state === 'complete' && (
            <button
              type="button"
              style={{
                ...styles.successButton,
                background: colors.status.success,
                color: getContrastColor(colors.status.success),
              }}
              onClick={onComplete}
            >
              Start Using MarkuprX
            </button>
          )}
          {state === 'error' && (
            <>
              <button type="button" style={styles.skipButton} onClick={onSkip}>
                Skip for now
              </button>
              <button
                type="button"
                style={{
                  ...styles.primaryButton,
                  color: getContrastColor(colors.accent.default),
                }}
                onClick={onDownload}
              >
                Try Again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const ModelDownloadDialog: React.FC<ModelDownloadDialogProps> = ({
  onComplete,
  onSkip,
}) => {
  const [state, setState] = useState<DialogState>('prompt');
  const [selectedModel, setSelectedModel] = useState<string>('tiny');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  return (
    <ModelDownloadDialogView
      state={state}
      selectedModel={selectedModel}
      models={models}
      showAdvanced={showAdvanced}
      progress={progress}
      error={error}
      onSelectModel={setSelectedModel}
      onToggleAdvanced={() => setShowAdvanced((value) => !value)}
      onDownload={handleDownload}
      onSkip={onSkip}
      onCancel={handleCancel}
      onComplete={onComplete}
    />
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
    zIndex: 50,
  },

  modal: {
    width: '100%',
    maxWidth: 436,
    maxHeight: '100%',
    minWidth: 0,
    minHeight: 0,
    backgroundColor: 'var(--bg-elevated)',
    WebkitAppRegion: 'no-drag',
  },

  content: {
    flex: '1 1 auto',
    minWidth: 0,
    minHeight: 0,
    padding: '28px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    overflowX: 'hidden',
    overflowY: 'auto',
    overflowWrap: 'anywhere',
  },

  dialogActions: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },

  stateIcon: {
    display: 'grid',
    placeItems: 'center',
    width: 56,
    height: 56,
    marginBottom: 16,
    border: '2px solid currentColor',
    borderRadius: '50%',
    backgroundColor: 'var(--surface-inset)',
    fontSize: 28,
    fontWeight: 700,
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
    minWidth: 0,
    padding: 0,
    border: 0,
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
    minWidth: 0,
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
    flexWrap: 'wrap',
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
    flexWrap: 'wrap',
    gap: 12,
    minWidth: 0,
    fontSize: 12,
    color: 'var(--text-tertiary)',
  },

  modelQuality: {
    color: 'var(--text-secondary)',
  },

  progressDetails: {
    width: '100%',
    maxWidth: 280,
    marginBottom: 24,
  },

  progressRow: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    minWidth: 0,
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
    minWidth: 0,
    overflowWrap: 'anywhere',
  },

  progressBar: {
    width: '100%',
    marginBottom: 16,
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
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
};

export default ModelDownloadDialog;
