/**
 * Window Selector Component
 *
 * A modal dialog for selecting which window or screen to capture.
 * Displays thumbnails in a grid with keyboard navigation support.
 * Designed to feel like a native macOS picker - premium and responsive.
 *
 * Features:
 * - Multi-monitor layout diagram showing physical arrangement
 * - Per-display DPI indicators (HiDPI badge)
 * - Keyboard navigation
 *
 * Animations:
 * - Spring physics dialog entrance
 * - Staggered grid item entrance
 * - Smooth hover/selection transitions
 * - Button press effects
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { CaptureSource, DisplayInfo } from '../../shared/types';
import { SkeletonWindowSource } from './Skeleton';
import { useTheme } from '../hooks/useTheme';

interface WindowSelectorProps {
  sources: CaptureSource[];
  onSelect: (source: CaptureSource) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

// =============================================================================
// Monitor Layout Component
// =============================================================================

interface MonitorLayoutProps {
  displays: DisplayInfo[];
  selectedSourceId: string | null;
  onSelect: (sourceId: string) => void;
  sources: CaptureSource[];
}

/**
 * Visual diagram showing the physical arrangement of monitors
 * Users can click on a monitor to select it for capture
 */
const MonitorLayout: React.FC<MonitorLayoutProps> = ({
  displays,
  selectedSourceId,
  onSelect,
  sources,
}) => {
  const { colors } = useTheme();
  // Calculate the bounding box of all displays
  const layoutBounds = useMemo(() => {
    if (displays.length === 0) {
      return { minX: 0, minY: 0, width: 1920, height: 1080 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    displays.forEach((d) => {
      minX = Math.min(minX, d.bounds.x);
      minY = Math.min(minY, d.bounds.y);
      maxX = Math.max(maxX, d.bounds.x + d.bounds.width);
      maxY = Math.max(maxY, d.bounds.y + d.bounds.height);
    });

    return {
      minX,
      minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }, [displays]);

  // Scale factor to fit the layout in the container
  const containerWidth = 280;
  const containerHeight = 160;
  const padding = 16;

  const scale = useMemo(() => {
    const availableWidth = containerWidth - padding * 2;
    const availableHeight = containerHeight - padding * 2;

    const scaleX = availableWidth / layoutBounds.width;
    const scaleY = availableHeight / layoutBounds.height;

    return Math.min(scaleX, scaleY, 0.15); // Cap at 15% to prevent oversized displays
  }, [layoutBounds]);

  // Find the source ID for a given display index
  const getSourceIdForDisplay = (displayIndex: number): string | null => {
    // Screen source IDs are typically "screen:INDEX:0"
    const screenSource = sources.find(
      (s) => s.type === 'screen' && s.id === `screen:${displayIndex}:0`
    );
    return screenSource?.id || null;
  };

  if (displays.length <= 1) {
    return null; // Don't show layout for single monitor
  }

  return (
    <div style={monitorLayoutStyles.container}>
      <div style={monitorLayoutStyles.label}>Monitor Arrangement</div>
      <div style={monitorLayoutStyles.layoutArea}>
        {displays.map((display, index) => {
          const sourceId = getSourceIdForDisplay(index);
          const isSelected = sourceId === selectedSourceId;
          const isHiDPI = display.scaleFactor > 1;

          // Calculate position within the container
          const x = (display.bounds.x - layoutBounds.minX) * scale + padding;
          const y = (display.bounds.y - layoutBounds.minY) * scale + padding;
          const w = display.bounds.width * scale;
          const h = display.bounds.height * scale;

          return (
            <button
              key={display.id}
              onClick={() => sourceId && onSelect(sourceId)}
              disabled={!sourceId}
              style={{
                ...monitorLayoutStyles.monitor,
                left: x,
                top: y,
                width: w,
                height: h,
                borderColor: isSelected ? colors.accent.default : colors.border.strong,
                backgroundColor: isSelected
                  ? 'rgba(59, 130, 246, 0.2)'
                  : 'rgba(55, 65, 81, 0.5)',
                cursor: sourceId ? 'pointer' : 'not-allowed',
                opacity: sourceId ? 1 : 0.5,
              }}
              title={`${display.label} (${display.bounds.width}x${display.bounds.height}${isHiDPI ? ' @' + display.scaleFactor + 'x' : ''})`}
            >
              {/* Display label */}
              <span style={monitorLayoutStyles.monitorLabel}>
                {display.isPrimary && (
                  <span style={monitorLayoutStyles.primaryStar}>&#9733;</span>
                )}
                {index + 1}
              </span>

              {/* HiDPI indicator */}
              {isHiDPI && (
                <span style={monitorLayoutStyles.hiDpiBadge}>
                  {display.scaleFactor}x
                </span>
              )}

              {/* Selection checkmark */}
              {isSelected && (
                <span style={monitorLayoutStyles.checkmark}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2 6L5 9L10 3"
                      stroke={colors.accent.default}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div style={monitorLayoutStyles.hint}>
        Click a monitor to capture it
      </div>
    </div>
  );
};

const monitorLayoutStyles: Record<string, React.CSSProperties> = {
  container: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 12,
    border: '1px solid rgba(255, 255, 255, 0.06)',
  },
  label: {
    color: 'var(--text-tertiary)',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 8,
  },
  layoutArea: {
    position: 'relative',
    width: 280,
    height: 160,
    margin: '0 auto',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
  monitor: {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    border: '2px solid',
    transition: 'all 0.15s ease',
    outline: 'none',
    padding: 0,
  },
  monitorLabel: {
    color: 'var(--text-primary)',
    fontSize: 11,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  primaryStar: {
    color: 'var(--status-warning)',
    fontSize: 10,
  },
  hiDpiBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(139, 92, 246, 0.8)',
    color: 'var(--text-inverse)',
    fontSize: 8,
    fontWeight: 600,
    padding: '1px 3px',
    borderRadius: 3,
  },
  checkmark: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  hint: {
    color: 'var(--text-tertiary)',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 8,
  },
};

export const WindowSelector: React.FC<WindowSelectorProps> = ({
  sources,
  onSelect,
  onCancel,
  isLoading = false,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  // Calculate grid columns for keyboard navigation
  const getColumnsCount = useCallback(() => {
    if (!gridRef.current) return 3;
    const gridWidth = gridRef.current.offsetWidth;
    // Each item is ~140px (128px + gap)
    return Math.max(1, Math.floor(gridWidth / 140));
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const cols = getColumnsCount();

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          setFocusIndex((i) => Math.min(i + 1, sources.length - 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setFocusIndex((i) => Math.max(i - 1, 0));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusIndex((i) => Math.min(i + cols, sources.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusIndex((i) => Math.max(i - cols, 0));
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (sources[focusIndex]) {
            setSelectedId(sources[focusIndex].id);
            onSelect(sources[focusIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onCancel();
          break;
        case 'Tab':
          // Allow tab to cycle through sources
          e.preventDefault();
          if (e.shiftKey) {
            setFocusIndex((i) => (i > 0 ? i - 1 : sources.length - 1));
          } else {
            setFocusIndex((i) => (i < sources.length - 1 ? i + 1 : 0));
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sources, focusIndex, onSelect, onCancel, getColumnsCount]);

  // Auto-select first screen source (Entire Screen) by default
  useEffect(() => {
    if (sources.length > 0 && !selectedId) {
      const firstScreen = sources.find((s) => s.type === 'screen');
      const firstSource = firstScreen || sources[0];
      setSelectedId(firstSource.id);
      const index = sources.findIndex((s) => s.id === firstSource.id);
      if (index >= 0) setFocusIndex(index);
    }
  }, [sources, selectedId]);

  // Scroll focused item into view
  useEffect(() => {
    const focusedElement = document.querySelector(`[data-source-index="${focusIndex}"]`);
    if (focusedElement) {
      focusedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusIndex]);

  const handleSourceClick = useCallback((source: CaptureSource, index: number) => {
    setSelectedId(source.id);
    setFocusIndex(index);
  }, []);

  const handleStartRecording = useCallback(() => {
    const source = sources.find((s) => s.id === selectedId);
    if (source) {
      onSelect(source);
    }
  }, [sources, selectedId, onSelect]);

  // Separate screens and windows for better organization
  const screens = sources.filter((s) => s.type === 'screen');
  const windows = sources.filter((s) => s.type === 'window');

  // Extract display info from screen sources for multi-monitor layout
  const displays = useMemo(() => {
    return screens
      .filter((s) => s.display)
      .map((s) => s.display as DisplayInfo);
  }, [screens]);

  // Handler for monitor layout selection
  const handleMonitorSelect = useCallback((sourceId: string) => {
    setSelectedId(sourceId);
    const index = sources.findIndex((s) => s.id === sourceId);
    if (index >= 0) setFocusIndex(index);
  }, [sources]);

  return (
    <div style={styles.overlay} className="ff-backdrop-enter">
      <div style={styles.modal} className="ff-dialog-enter">
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Select Window to Capture</h2>
          <p style={styles.subtitle}>
            Choose a screen or window, then start recording
          </p>
        </div>

        {isLoading ? (
          <div style={styles.content}>
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Screens</h3>
              <div style={styles.grid}>
                <SkeletonWindowSource animation="shimmer" />
                <SkeletonWindowSource animation="shimmer" />
              </div>
            </div>
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Windows</h3>
              <div style={styles.grid}>
                <SkeletonWindowSource animation="shimmer" />
                <SkeletonWindowSource animation="shimmer" />
                <SkeletonWindowSource animation="shimmer" />
              </div>
            </div>
          </div>
        ) : (
          <div style={styles.content}>
            {/* Multi-Monitor Layout Diagram */}
            {displays.length > 1 && (
              <MonitorLayout
                displays={displays}
                selectedSourceId={selectedId}
                onSelect={handleMonitorSelect}
                sources={sources}
              />
            )}

            {/* Screens Section */}
            {screens.length > 0 && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Screens</h3>
                <div ref={gridRef} style={styles.grid}>
                  {screens.map((source, staggerIdx) => {
                    const globalIndex = sources.findIndex((s) => s.id === source.id);
                    return (
                      <SourceItem
                        key={source.id}
                        source={source}
                        isSelected={selectedId === source.id}
                        isFocused={focusIndex === globalIndex}
                        index={globalIndex}
                        staggerIndex={staggerIdx}
                        onClick={() => handleSourceClick(source, globalIndex)}
                        onDoubleClick={() => onSelect(source)}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Windows Section */}
            {windows.length > 0 && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Windows</h3>
                <div style={styles.grid}>
                  {windows.map((source, staggerIdx) => {
                    const globalIndex = sources.findIndex((s) => s.id === source.id);
                    return (
                      <SourceItem
                        key={source.id}
                        source={source}
                        isSelected={selectedId === source.id}
                        isFocused={focusIndex === globalIndex}
                        index={globalIndex}
                        staggerIndex={screens.length + staggerIdx}
                        onClick={() => handleSourceClick(source, globalIndex)}
                        onDoubleClick={() => onSelect(source)}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {sources.length === 0 && (
              <div style={styles.emptyState}>
                <span style={styles.emptyIcon}>No sources available</span>
                <p style={styles.emptyText}>
                  Unable to find any screens or windows to capture.
                  <br />
                  Please check your screen recording permissions.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={styles.footer}>
          <div style={styles.hint}>
            <span style={styles.hintKey}>Arrow keys</span> to navigate
            <span style={styles.hintSeparator}>|</span>
            <span style={styles.hintKey}>Enter</span> to select
            <span style={styles.hintSeparator}>|</span>
            <span style={styles.hintKey}>Esc</span> to cancel
          </div>
          <div style={styles.buttonGroup}>
            <button
              style={styles.cancelButton}
              className="ff-btn-press ff-transition-colors"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              style={{
                ...styles.startButton,
                ...((!selectedId || isLoading) ? styles.startButtonDisabled : {}),
              }}
              className={`ff-btn-press ${selectedId && !isLoading ? 'ff-success-pulse' : ''}`}
              onClick={handleStartRecording}
              disabled={!selectedId || isLoading}
            >
              Start Recording
            </button>
          </div>
        </div>
      </div>

      {/* pulse, spin, pageZoomIn keyframes provided by animations.css */}
    </div>
  );
};

/**
 * Individual source item component with staggered entrance animation
 */
interface SourceItemProps {
  source: CaptureSource;
  isSelected: boolean;
  isFocused: boolean;
  index: number;
  staggerIndex: number;
  onClick: () => void;
  onDoubleClick: () => void;
}

const SourceItem: React.FC<SourceItemProps> = ({
  source,
  isSelected,
  isFocused,
  index,
  staggerIndex,
  onClick,
  onDoubleClick,
}) => {
  const { colors } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const itemStyle: React.CSSProperties = {
    ...styles.sourceItem,
    ...(isSelected ? styles.sourceItemSelected : {}),
    ...(isFocused ? styles.sourceItemFocused : {}),
    ...(isHovered && !isSelected ? styles.sourceItemHovered : {}),
    // Staggered entrance animation
    animationDelay: `${staggerIndex * 40}ms`,
    // Button press effect
    transform: isPressed ? 'scale(0.97)' : isSelected ? 'scale(1.02)' : 'scale(1)',
  };

  const getSourceIcon = () => {
    if (source.type === 'screen') {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );
    }
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <circle cx="6" cy="6" r="1" fill="currentColor" />
        <circle cx="9" cy="6" r="1" fill="currentColor" />
        <circle cx="12" cy="6" r="1" fill="currentColor" />
      </svg>
    );
  };

  return (
    <button
      data-source-index={index}
      className="ff-list-item-enter-scale"
      style={itemStyle}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsPressed(false);
      }}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
    >
      {/* Thumbnail with hover scale effect */}
      <div
        style={{
          ...styles.thumbnail,
          transform: isHovered ? 'scale(1.02)' : 'scale(1)',
          transition: 'transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {source.thumbnail ? (
          <img
            src={source.thumbnail}
            alt={source.name}
            style={styles.thumbnailImage}
            draggable={false}
          />
        ) : (
          <div style={styles.thumbnailPlaceholder}>
            {getSourceIcon()}
          </div>
        )}
      </div>

      {/* Name with resolution info for screens */}
      <div translate="no" style={styles.sourceName}>
        {source.type === 'screen' ? (
          <span style={styles.sourceNameWithBadge}>
            {source.display?.label || source.name}
            {source.display && source.display.scaleFactor > 1 && (
              <span style={styles.hiDpiBadgeInline}>
                {source.display.scaleFactor}x
              </span>
            )}
          </span>
        ) : (
          source.name
        )}
      </div>

      {/* Resolution info for screens */}
      {source.type === 'screen' && source.display && (
        <div style={styles.resolutionInfo}>
          {source.display.bounds.width} x {source.display.bounds.height}
        </div>
      )}

      {/* Selection indicator with scale animation */}
      <div
        style={{
          ...styles.selectionDot,
          ...(isSelected ? styles.selectionDotSelected : {}),
          transform: isSelected ? 'scale(1)' : 'scale(0.8)',
          transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {isSelected && (
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="none"
            style={{ position: 'absolute', top: 2, left: 2 }}
          >
            <path
              d="M1.5 4L3 5.5L6.5 2"
              stroke={colors.text.inverse}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="ff-success-check"
            />
          </svg>
        )}
      </div>
    </button>
  );
};

// Extended CSS properties for webkit
type ExtendedCSSProperties = React.CSSProperties & {
  WebkitAppRegion?: 'drag' | 'no-drag';
};

const styles: Record<string, ExtendedCSSProperties> = {
  // Overlay
  overlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(4px)',
    zIndex: 50,
    animation: 'pageZoomIn 0.15s ease-out',
  },

  // Modal container
  modal: {
    backgroundColor: 'rgba(17, 24, 39, 0.98)',
    borderRadius: 16,
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1)',
    width: '100%',
    maxWidth: 640,
    maxHeight: '80vh',
    margin: 16,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    WebkitAppRegion: 'no-drag',
  },

  // Header
  header: {
    padding: '20px 24px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  title: {
    color: 'var(--text-primary)',
    fontSize: 18,
    fontWeight: 600,
    margin: 0,
    letterSpacing: '-0.01em',
  },
  subtitle: {
    color: 'var(--text-secondary)',
    fontSize: 13,
    margin: '6px 0 0',
  },

  // Content area
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 24px',
  },

  // Section
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: 'var(--text-tertiary)',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    margin: '0 0 12px',
  },

  // Grid
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))',
    gap: 12,
  },

  // Source item
  sourceItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    border: '2px solid transparent',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    outline: 'none',
  },
  sourceItemHovered: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  sourceItemSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: 'var(--accent-default)',
  },
  sourceItemFocused: {
    boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.5)',
  },

  // Thumbnail
  thumbnail: {
    width: 104,
    height: 64,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    marginBottom: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  thumbnailPlaceholder: {
    color: 'var(--text-tertiary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Source name
  sourceName: {
    color: 'var(--text-primary)',
    fontSize: 11,
    fontWeight: 500,
    textAlign: 'center',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%',
    padding: '0 4px',
    marginBottom: 4,
  },
  sourceNameWithBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  },
  hiDpiBadgeInline: {
    backgroundColor: 'rgba(139, 92, 246, 0.8)',
    color: 'var(--text-inverse)',
    fontSize: 8,
    fontWeight: 600,
    padding: '1px 4px',
    borderRadius: 3,
    flexShrink: 0,
  },
  resolutionInfo: {
    color: 'var(--text-tertiary)',
    fontSize: 9,
    textAlign: 'center',
    marginBottom: 4,
  },

  // Selection dot
  selectionDot: {
    width: 12,
    height: 12,
    borderRadius: '50%',
    border: '2px solid var(--border-strong)',
    backgroundColor: 'transparent',
    transition: 'all 0.15s ease',
  },
  selectionDotSelected: {
    borderColor: 'var(--accent-default)',
    backgroundColor: 'var(--accent-default)',
  },

  // Loading state
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    gap: 16,
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid rgba(255, 255, 255, 0.1)',
    borderTopColor: 'var(--accent-default)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    color: 'var(--text-secondary)',
    fontSize: 13,
  },

  // Empty state
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    textAlign: 'center',
  },
  emptyIcon: {
    color: 'var(--text-tertiary)',
    fontSize: 14,
    fontWeight: 500,
    marginBottom: 8,
  },
  emptyText: {
    color: 'var(--text-tertiary)',
    fontSize: 13,
    lineHeight: 1.5,
    margin: 0,
  },

  // Footer
  footer: {
    padding: '16px 24px 20px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },

  // Keyboard hints
  hint: {
    color: 'var(--text-tertiary)',
    fontSize: 11,
    textAlign: 'center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  hintKey: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: '2px 6px',
    borderRadius: 4,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontWeight: 500,
  },
  hintSeparator: {
    color: 'var(--border-strong)',
  },

  // Buttons
  buttonGroup: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    padding: '10px 20px',
    borderRadius: 8,
    border: 'none',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    color: 'var(--text-primary)',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  startButton: {
    padding: '10px 24px',
    borderRadius: 8,
    border: 'none',
    backgroundColor: 'var(--accent-default)',
    color: 'var(--text-inverse)',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  startButtonDisabled: {
    backgroundColor: 'var(--bg-tertiary)',
    color: 'var(--text-tertiary)',
    cursor: 'not-allowed',
  },
};

export default WindowSelector;
