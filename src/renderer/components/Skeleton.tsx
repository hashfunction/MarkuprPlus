/**
 * Skeleton Loading Components
 *
 * Premium shimmer-effect loading placeholders that match the markuprx design system.
 * Use these to indicate loading states while maintaining visual hierarchy.
 */

import React from 'react';

// ============================================================================
// Types
// ============================================================================

interface SkeletonProps {
  /** Width of the skeleton (CSS value) */
  width?: string | number;
  /** Height of the skeleton (CSS value) */
  height?: string | number;
  /** Border radius (CSS value or true for default 8px) */
  rounded?: boolean | string | number;
  /** Use circular shape */
  circle?: boolean;
  /** Animation type */
  animation?: 'shimmer' | 'pulse' | 'none';
  /** Additional CSS class */
  className?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
}

interface SkeletonTextProps {
  /** Number of lines to render */
  lines?: number;
  /** Width of the last line (creates natural variation) */
  lastLineWidth?: string | number;
  /** Gap between lines */
  gap?: number;
  /** Animation type */
  animation?: 'shimmer' | 'pulse' | 'none';
}

interface SkeletonCardProps {
  /** Show thumbnail placeholder */
  showThumbnail?: boolean;
  /** Number of text lines */
  lines?: number;
  /** Show avatar */
  showAvatar?: boolean;
  /** Animation type */
  animation?: 'shimmer' | 'pulse' | 'none';
}

// ============================================================================
// Base Skeleton Component
// ============================================================================

export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  rounded = true,
  circle = false,
  animation = 'shimmer',
  className = '',
  style = {},
}) => {
  const getBorderRadius = () => {
    if (circle) return '50%';
    if (rounded === true) return 8;
    if (rounded === false) return 0;
    return rounded;
  };

  const animationClass =
    animation === 'shimmer'
      ? 'ff-skeleton'
      : animation === 'pulse'
      ? 'ff-skeleton-pulse'
      : '';

  return (
    <div
      className={`${animationClass} ${className}`}
      style={{
        width: width ?? '100%',
        height: height ?? 16,
        borderRadius: getBorderRadius(),
        backgroundColor: 'rgba(55, 65, 81, 0.3)',
        ...style,
      }}
    />
  );
};

// ============================================================================
// Skeleton Text (Multiple lines)
// ============================================================================

export const SkeletonText: React.FC<SkeletonTextProps> = ({
  lines = 3,
  lastLineWidth = '70%',
  gap = 8,
  animation = 'shimmer',
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          width={index === lines - 1 ? lastLineWidth : '100%'}
          height={16}
          animation={animation}
          style={{
            animationDelay: `${index * 100}ms`,
          }}
        />
      ))}
    </div>
  );
};

// ============================================================================
// Skeleton Avatar
// ============================================================================

export const SkeletonAvatar: React.FC<{
  size?: number;
  animation?: 'shimmer' | 'pulse' | 'none';
}> = ({ size = 40, animation = 'shimmer' }) => {
  return <Skeleton width={size} height={size} circle animation={animation} />;
};

// ============================================================================
// Skeleton Thumbnail
// ============================================================================

export const SkeletonThumbnail: React.FC<{
  width?: string | number;
  aspectRatio?: string;
  animation?: 'shimmer' | 'pulse' | 'none';
}> = ({ width = '100%', aspectRatio = '16/9', animation = 'shimmer' }) => {
  return (
    <Skeleton
      width={width}
      height="auto"
      rounded={8}
      animation={animation}
      style={{
        aspectRatio,
      }}
    />
  );
};

// ============================================================================
// Skeleton Button
// ============================================================================

export const SkeletonButton: React.FC<{
  width?: string | number;
  height?: number;
  animation?: 'shimmer' | 'pulse' | 'none';
}> = ({ width = 120, height = 40, animation = 'shimmer' }) => {
  return <Skeleton width={width} height={height} rounded={8} animation={animation} />;
};

// ============================================================================
// Skeleton Card (Composite)
// ============================================================================

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  showThumbnail = true,
  lines = 2,
  showAvatar = false,
  animation = 'shimmer',
}) => {
  return (
    <div style={styles.card}>
      {showThumbnail && (
        <SkeletonThumbnail animation={animation} />
      )}
      <div style={styles.cardContent}>
        {showAvatar && (
          <div style={styles.avatarRow}>
            <SkeletonAvatar size={32} animation={animation} />
            <div style={{ flex: 1 }}>
              <Skeleton width="60%" height={14} animation={animation} />
            </div>
          </div>
        )}
        <Skeleton
          width="80%"
          height={18}
          animation={animation}
          style={{ marginBottom: 8 }}
        />
        <SkeletonText lines={lines} animation={animation} />
      </div>
    </div>
  );
};

// ============================================================================
// Skeleton List Item
// ============================================================================

export const SkeletonListItem: React.FC<{
  showIcon?: boolean;
  showAction?: boolean;
  animation?: 'shimmer' | 'pulse' | 'none';
}> = ({ showIcon = true, showAction = false, animation = 'shimmer' }) => {
  return (
    <div style={styles.listItem}>
      {showIcon && <SkeletonAvatar size={24} animation={animation} />}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Skeleton width="70%" height={14} animation={animation} />
        <Skeleton width="40%" height={12} animation={animation} />
      </div>
      {showAction && <SkeletonButton width={80} height={32} animation={animation} />}
    </div>
  );
};

// ============================================================================
// Skeleton Feedback Item (markuprx specific)
// ============================================================================

export const SkeletonFeedbackItem: React.FC<{
  showThumbnail?: boolean;
  animation?: 'shimmer' | 'pulse' | 'none';
}> = ({ showThumbnail = true, animation = 'shimmer' }) => {
  return (
    <div style={styles.feedbackItem}>
      {/* Drag handle */}
      <div style={styles.dragHandle}>
        <Skeleton width={12} height={20} rounded={2} animation={animation} />
      </div>

      {/* Content */}
      <div style={{ flex: 1 }}>
        {/* Header with tags */}
        <div style={styles.feedbackHeader}>
          <Skeleton width={60} height={16} animation={animation} />
          <Skeleton width={50} height={20} rounded={6} animation={animation} />
          <Skeleton width={50} height={20} rounded={6} animation={animation} />
        </div>

        {/* Transcription */}
        <SkeletonText lines={2} lastLineWidth="60%" gap={6} animation={animation} />

        {/* Thumbnails */}
        {showThumbnail && (
          <div style={styles.thumbnailRow}>
            <Skeleton width={60} height={45} rounded={6} animation={animation} />
            <Skeleton width={60} height={45} rounded={6} animation={animation} />
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Skeleton Window Source (Window Selector specific)
// ============================================================================

export const SkeletonWindowSource: React.FC<{
  animation?: 'shimmer' | 'pulse' | 'none';
}> = ({ animation = 'shimmer' }) => {
  return (
    <div style={styles.windowSource}>
      <Skeleton width={104} height={64} rounded={8} animation={animation} />
      <Skeleton width="80%" height={11} animation={animation} />
      <Skeleton width={12} height={12} circle animation={animation} />
    </div>
  );
};

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: 'rgba(31, 41, 55, 0.6)',
    borderRadius: 12,
    border: '1px solid rgba(75, 85, 99, 0.3)',
    overflow: 'hidden',
  },
  cardContent: {
    padding: 16,
  },
  avatarRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    backgroundColor: 'rgba(31, 41, 55, 0.4)',
    borderRadius: 8,
  },
  feedbackItem: {
    display: 'flex',
    gap: 12,
    padding: 16,
    backgroundColor: 'rgba(31, 41, 55, 0.6)',
    borderRadius: 12,
    border: '1px solid rgba(75, 85, 99, 0.3)',
  },
  dragHandle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
  },
  feedbackHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  thumbnailRow: {
    display: 'flex',
    gap: 8,
    marginTop: 12,
  },
  windowSource: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    border: '2px solid transparent',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    gap: 8,
  },
};

// ============================================================================
// Exports
// ============================================================================

export default Skeleton;
