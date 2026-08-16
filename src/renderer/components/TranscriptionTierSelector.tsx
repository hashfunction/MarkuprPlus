/**
 * TranscriptionTierSelector - UI for selecting transcription tier
 *
 * Displays available transcription tiers with their status:
 * - Tier 1: Local Whisper (default, good quality, requires model download)
 * - Tier 2: Timer Only (fallback, no transcription)
 *
 * Key UX principles:
 * - Local Whisper is the DEFAULT tier (no API key needed)
 * - Clear visual hierarchy showing availability and quality
 * - Model download progress for Whisper
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../hooks/useTheme';
import type {
  TranscriptionTier as SharedTranscriptionTier,
  TranscriptionTierStatus,
  WhisperDownloadProgressPayload,
} from '../../shared/types';

// ============================================================================
// Types
// ============================================================================

export type TranscriptionTier = Exclude<SharedTranscriptionTier, 'auto'>;
type TierStatus = TranscriptionTierStatus;
type DownloadProgress = WhisperDownloadProgressPayload;

interface TierInfo {
  name: string;
  description: string;
  accuracy: string;
  latency: string;
  requirements: string;
  icon: React.ReactNode;
  badge?: string;
}

interface TranscriptionTierSelectorProps {
  /**
   * Currently selected/active tier
   */
  currentTier: TranscriptionTier | null;

  /**
   * Callback when tier is selected
   */
  onTierSelect: (tier: TranscriptionTier) => void;

  /**
   * Compact mode for inline display
   */
  compact?: boolean;
}

// ============================================================================
// Tier Information
// ============================================================================

const TIER_INFO: Partial<Record<TranscriptionTier, TierInfo>> = {
  whisper: {
    name: 'Local Whisper',
    description: 'On-device AI transcription - works offline, no API key needed',
    accuracy: '90%+ accuracy',
    latency: '1-3s latency',
    requirements: '~75MB model download, low RAM',
    badge: 'Recommended',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
        <path d="M12 8v4l2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
  'timer-only': {
    name: 'Timer Only',
    description: 'Manual screenshots on a timer, no voice transcription',
    accuracy: 'No transcription',
    latency: 'N/A',
    requirements: 'None - always available',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="2" />
        <path d="M12 9v4l2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 5V3M9 3h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
};

// ============================================================================
// Component
// ============================================================================

export const TranscriptionTierSelector: React.FC<TranscriptionTierSelectorProps> = ({
  currentTier,
  onTierSelect,
  compact = false,
}) => {
  const { colors } = useTheme();
  const [tierStatuses, setTierStatuses] = useState<TierStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Define loadTierStatuses before useEffect to satisfy hooks rules
  const loadTierStatuses = useCallback(async () => {
    setLoading(true);
    try {
      const statuses = await window.markuprx.transcription.getTierStatuses();
      setTierStatuses(statuses);
    } catch (error) {
      console.error('Failed to load tier statuses:', error);
      // Fallback statuses
      setTierStatuses([
        { tier: 'whisper', available: true },
        { tier: 'timer-only', available: true },
      ]);
    }
    setLoading(false);
  }, []);

  const handleDownloadModel = useCallback(async () => {
    setIsDownloading(true);
    try {
      const result = await window.markuprx.transcription.downloadModel('tiny');
      if (!result.success) {
        throw new Error(result.error || 'Failed to start model download.');
      }
    } catch (error) {
      console.error('Download failed:', error);
      setIsDownloading(false);
    }
  }, []);

  const handleCancelDownload = useCallback(async () => {
    try {
      await window.markuprx.transcription.cancelDownload('tiny');
    } catch (error) {
      console.error('Cancel failed:', error);
    }
    setIsDownloading(false);
    setDownloadProgress(null);
  }, []);

  // Load tier statuses on mount
  useEffect(() => {
    loadTierStatuses();

    // Subscribe to model download progress
    const unsubscribe = window.markuprx.transcription.onModelProgress((progress: DownloadProgress) => {
      setDownloadProgress(progress);
      if (progress.percent >= 100) {
        setIsDownloading(false);
        setDownloadProgress(null);
        loadTierStatuses(); // Refresh statuses
      }
    });

    return () => {
      unsubscribe();
    };
  }, [loadTierStatuses]);

  const formatSpeed = (bps: number): string => {
    if (bps > 1024 * 1024) {
      return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    if (bps > 1024) {
      return `${(bps / 1024).toFixed(0)} KB/s`;
    }
    return `${bps} B/s`;
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <span style={styles.spinner} />
          <span>Loading transcription options...</span>
        </div>
      </div>
    );
  }

  // Order: Whisper (recommended default), Timer fallback
  const orderedTiers: TranscriptionTier[] = ['whisper', 'timer-only'];
  const visibleTiers = orderedTiers.filter(tier =>
    tierStatuses.some(s => s.tier === tier)
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Transcription Service</h3>
        <p style={styles.subtitle}>
          Choose how MarkuprX transcribes your voice. Local options work without an internet connection.
        </p>
      </div>

      <div style={styles.tierList}>
        {visibleTiers.map(tierId => {
          const status = tierStatuses.find(s => s.tier === tierId);
          const info = TIER_INFO[tierId];
          if (!info) return null;
          const isSelected = currentTier === tierId;
          const isAvailable = status?.available ?? false;
          const needsModelDownload = tierId === 'whisper' && status?.reason?.includes('not downloaded');

          return (
            <div key={tierId} style={styles.tierWrapper}>
              <button
                onClick={() => isAvailable && onTierSelect(tierId)}
                disabled={!isAvailable}
                style={{
                  ...styles.tierCard,
                  borderColor: isSelected ? colors.accent.default : 'rgba(255, 255, 255, 0.1)',
                  backgroundColor: isSelected ? colors.accent.subtle : 'rgba(31, 41, 55, 0.5)',
                  opacity: !isAvailable && !needsModelDownload ? 0.5 : 1,
                  cursor: isAvailable ? 'pointer' : 'not-allowed',
                }}
              >
                <div style={styles.tierHeader}>
                  <div style={{ ...styles.tierIcon, color: isSelected ? colors.accent.default : colors.text.secondary }}>
                    {info.icon}
                  </div>
                  <div style={styles.tierInfo}>
                    <div style={styles.tierNameRow}>
                      <span style={styles.tierName}>{info.name}</span>
                      {info.badge && (
                        <span
                          style={{
                            ...styles.tierBadge,
                            backgroundColor: colors.status.success,
                          }}
                        >
                          {info.badge}
                        </span>
                      )}
                      {isSelected && (
                        <span style={styles.activeBadge}>Active</span>
                      )}
                    </div>
                    <p style={styles.tierDescription}>{info.description}</p>
                  </div>
                </div>

                {!compact && (
                  <div style={styles.tierMeta}>
                    <span style={styles.metaItem}>{info.accuracy}</span>
                    <span style={styles.metaSeparator}>|</span>
                    <span style={styles.metaItem}>{info.latency}</span>
                    <span style={styles.metaSeparator}>|</span>
                    <span style={styles.metaItem}>{info.requirements}</span>
                  </div>
                )}

                {!isAvailable && status?.reason && !needsModelDownload && (
                  <div style={styles.unavailableReason}>
                    <WarningIcon />
                    <span>{status.reason}</span>
                  </div>
                )}
              </button>

              {/* Whisper model download prompt */}
              {needsModelDownload && (
                <div style={styles.downloadPrompt}>
                  {isDownloading && downloadProgress ? (
                    <div style={styles.downloadProgress}>
                      <div style={styles.progressBar}>
                        <div
                          style={{
                            ...styles.progressFill,
                            width: `${downloadProgress.percent}%`,
                          }}
                        />
                      </div>
                      <div style={styles.progressInfo}>
                        <span>{downloadProgress.percent}%</span>
                        <span style={styles.progressSpeed}>
                          {formatSpeed(downloadProgress.speedBps)} - {formatTime(downloadProgress.estimatedSecondsRemaining)} remaining
                        </span>
                      </div>
                      <button
                        style={styles.cancelButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelDownload();
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div style={styles.downloadCta}>
                      <div style={styles.downloadInfo}>
                        <DownloadIcon />
                        <span>Download required (~75MB) for local transcription</span>
                      </div>
                      <button
                        style={styles.downloadButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadModel();
                        }}
                      >
                        Download Model
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info note about defaults */}
      <div style={styles.infoNote}>
        <InfoIcon />
        <span>
          Local Whisper is the default - it works offline with no API key.
          Add an OpenAI API key in Advanced settings for reliable post-session transcription.
        </span>
      </div>
    </div>
  );
};

// ============================================================================
// Icons
// ============================================================================

const WarningIcon = () => {
  const { colors } = useTheme();
  return (
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
  );
};

const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M8 2v8M8 10l-3-3M8 10l3-3M3 14h10"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7 6v4M7 4h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },

  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },

  title: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: 0,
  },

  subtitle: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    margin: 0,
    lineHeight: 1.5,
  },

  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
    color: 'var(--text-secondary)',
    fontSize: 13,
  },

  spinner: {
    width: 16,
    height: 16,
    border: '2px solid rgba(255, 255, 255, 0.2)',
    borderTopColor: 'var(--accent-default)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },

  tierList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },

  tierWrapper: {
    display: 'flex',
    flexDirection: 'column',
  },

  tierCard: {
    width: '100%',
    padding: 16,
    borderRadius: 10,
    border: '1px solid',
    backgroundColor: 'rgba(31, 41, 55, 0.5)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    textAlign: 'left',
    transition: 'all 0.15s ease',
    cursor: 'pointer',
  },

  tierHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
  },

  tierIcon: {
    flexShrink: 0,
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },

  tierInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },

  tierNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },

  tierName: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },

  tierBadge: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-inverse)',
    padding: '2px 6px',
    borderRadius: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  activeBadge: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--accent-default)',
    backgroundColor: 'var(--accent-muted)',
    padding: '2px 6px',
    borderRadius: 4,
  },

  tierDescription: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    margin: 0,
    lineHeight: 1.4,
  },

  tierMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    color: 'var(--text-tertiary)',
    flexWrap: 'wrap',
  },

  metaItem: {
    whiteSpace: 'nowrap',
  },

  metaSeparator: {
    color: 'rgba(255, 255, 255, 0.2)',
  },

  unavailableReason: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    color: 'var(--status-warning)',
    marginTop: 4,
  },

  downloadPrompt: {
    margin: '8px 0 0 52px',
    padding: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 8,
    border: '1px solid rgba(16, 185, 129, 0.2)',
  },

  downloadCta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  downloadInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: 'var(--status-success)',
  },

  downloadButton: {
    padding: '6px 12px',
    backgroundColor: 'var(--status-success)',
    border: 'none',
    borderRadius: 6,
    color: 'var(--text-inverse)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
    whiteSpace: 'nowrap',
  },

  downloadProgress: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },

  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: 'var(--status-success)',
    borderRadius: 2,
    transition: 'width 0.2s ease',
  },

  progressInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
    color: 'var(--status-success)',
  },

  progressSpeed: {
    color: 'var(--text-tertiary)',
  },

  cancelButton: {
    alignSelf: 'flex-start',
    padding: '4px 8px',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    color: 'var(--text-secondary)',
    fontSize: 11,
    cursor: 'pointer',
  },

  infoNote: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: 'var(--accent-subtle)',
    borderRadius: 8,
    border: '1px solid rgba(59, 130, 246, 0.1)',
    fontSize: 11,
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  },
};

export default TranscriptionTierSelector;
