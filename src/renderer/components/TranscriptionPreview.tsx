/**
 * Transcript Results Viewer
 *
 * Displays completed transcript segments after post-processing.
 * This replaces the previous real-time subtitle overlay with a static
 * display of finalized transcript content.
 *
 * Features:
 * - Static display of completed transcript segments
 * - Scrollable container for long transcripts
 * - Position options retained for layout flexibility
 * - Premium typography with optional dark mode
 */

import React, { useMemo } from 'react';
import { useTheme } from '../hooks/useTheme';

const MAX_RENDER_SEGMENTS = 100;

export interface TranscriptSegment {
  /** Unique identifier for the segment */
  id: string;
  /** The transcribed text */
  text: string;
  /** Start time in milliseconds (relative to session start) */
  startTime: number;
  /** End time in milliseconds (relative to session start) */
  endTime: number;
  /** Transcription confidence (0-1) */
  confidence: number;
}

export interface TranscriptionPreviewProps {
  /** Completed transcript segments to display */
  segments: TranscriptSegment[];
  /** Whether the component is visible */
  isVisible: boolean;
  /** Callback when user toggles visibility */
  onToggle?: () => void;
  /** Whether to use dark mode styling */
  isDarkMode?: boolean;
  /** Maximum height before scrolling (px) */
  maxHeight?: number;
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export const TranscriptionPreview: React.FC<TranscriptionPreviewProps> = ({
  segments,
  isVisible,
  onToggle,
  isDarkMode = false,
  maxHeight = 300,
}) => {
  const { colors } = useTheme();
  const visibleSegments = useMemo(
    () => (segments.length > MAX_RENDER_SEGMENTS ? segments.slice(-MAX_RENDER_SEGMENTS) : segments),
    [segments]
  );

  const theme = useMemo(
    () => ({
      bg: isDarkMode ? 'rgba(0, 0, 0, 0.80)' : 'rgba(255, 255, 255, 0.94)',
      text: colors.text.primary,
      textMuted: colors.text.secondary,
      border: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(60, 60, 67, 0.15)',
      timestampBg: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(120, 120, 128, 0.08)',
    }),
    [isDarkMode]
  );

  if (!isVisible || segments.length === 0) return null;

  return (
    <div
      style={{
        borderRadius: 12,
        border: `1px solid ${theme.border}`,
        backgroundColor: theme.bg,
        overflow: 'hidden',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
      role="region"
      aria-label="Transcript results"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: theme.textMuted,
          }}
        >
          Transcript ({segments.length} segment{segments.length !== 1 ? 's' : ''})
          {segments.length > visibleSegments.length && ` · showing latest ${visibleSegments.length}`}
        </span>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            style={{
              fontSize: 11,
              color: theme.textMuted,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 6px',
            }}
          >
            Hide
          </button>
        )}
      </div>

      <div
        style={{
          maxHeight,
          overflowY: 'auto',
          padding: '8px 14px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {visibleSegments.map((segment) => (
          <div key={segment.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                color: theme.textMuted,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
                padding: '3px 6px',
                borderRadius: 4,
                backgroundColor: theme.timestampBg,
                flexShrink: 0,
                marginTop: 2,
              }}
            >
              {formatTimestamp(segment.startTime)}
            </span>
            <p
              translate="no"
              style={{
                fontSize: 13,
                lineHeight: 1.45,
                color: theme.text,
                margin: 0,
              }}
            >
              {segment.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Legacy alias - TranscriptionPreviewAnimated is no longer used.
 * Kept as a re-export of the static viewer for backwards compatibility
 * with any imports that reference it.
 */
export const TranscriptionPreviewAnimated = TranscriptionPreview;

export default TranscriptionPreview;
