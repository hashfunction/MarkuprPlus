/**
 * CrashRecoveryDialog - Recovery UI for incomplete sessions
 *
 * Shows when MarkuprX detects an incomplete session from a previous
 * crash or abnormal exit. Offers the user the choice to recover or discard.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { ReviewSession } from '../../shared/types';
import { getContrastColor, useTheme } from '../hooks/useTheme';

// ============================================================================
// Types
// ============================================================================

export interface RecoverableSession {
  id: string;
  startTime: number;
  lastSaveTime: number;
  feedbackItems: RecoverableFeedbackItem[];
  transcriptionBuffer: string;
  sourceId: string;
  sourceName: string;
  screenshotCount: number;
  markedIssueCount: number;
  pendingMarkedIssue: boolean;
  metadata?: {
    appVersion: string;
    platform: string;
    sessionDurationMs: number;
  };
}

export interface RecoverableFeedbackItem {
  id: string;
  timestamp: number;
  text: string;
  confidence: number;
  hasScreenshot: boolean;
  screenshotId?: string;
}

export interface CrashRecoveryDialogProps {
  session: RecoverableSession;
  onRecover: () => void | Promise<void>;
  onDiscard: () => void | Promise<void>;
}

export interface CrashRecoveryResult {
  success: boolean;
  error?: string;
  reportPath?: string;
  sessionDir?: string;
  reviewSession?: ReviewSession;
  session?: {
    id: string;
    startTime: number;
    endTime?: number;
    screenshotCount: number;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatTimeSince(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days !== 1 ? 's' : ''}`;
  }
  if (hours > 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  return 'just now';
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ============================================================================
// Component
// ============================================================================

export function CrashRecoveryDialog({
  session,
  onRecover,
  onDiscard,
}: CrashRecoveryDialogProps): React.ReactElement {
  const [isRecovering, setIsRecovering] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [hoveredBtn, setHoveredBtn] = useState<'recover' | 'discard' | null>(null);
  const { colors } = useTheme();

  const timeSince = Date.now() - session.lastSaveTime;
  const formattedTime = formatTimeSince(timeSince);
  const sessionDuration = session.metadata?.sessionDurationMs ||
    (session.lastSaveTime - session.startTime);
  const recoveryButtonBackground = isRecovering || hoveredBtn === 'recover'
    ? colors.accent.hover
    : colors.accent.default;
  const recoveryButtonText = getContrastColor(recoveryButtonBackground) === 'black'
    ? '#000000'
    : '#ffffff';

  const handleRecover = useCallback(async () => {
    setIsRecovering(true);
    try {
      await onRecover();
    } catch (error) {
      console.error('Recovery failed:', error);
      setIsRecovering(false);
    }
  }, [onRecover]);

  const handleDiscard = useCallback(async () => {
    setIsDiscarding(true);
    try {
      await onDiscard();
    } catch (error) {
      console.error('Discard failed:', error);
      setIsDiscarding(false);
    }
  }, [onDiscard]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isRecovering || isDiscarding) return;

      if (e.key === 'Enter' || e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleRecover();
      } else if (e.key === 'Escape' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        handleDiscard();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecovering, isDiscarding, handleRecover, handleDiscard]);

  const spinnerSvg = (
    <svg style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} fill="none" viewBox="0 0 24 24">
      <circle
        style={{ opacity: 0.25 }}
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        style={{ opacity: 0.75 }}
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: colors.bg.overlay,
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
      padding: 12,
      overflowY: 'auto',
    }}>
      {/* spin keyframe provided by animations.css */}

      {/* Dialog Container */}
      <div
        style={{
          backgroundColor: colors.bg.secondary,
          border: `1px solid ${colors.border.default}`,
          borderRadius: 16,
          padding: 24,
          maxWidth: 448,
          width: '100%',
          maxHeight: 'calc(100vh - 24px)',
          overflowY: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
        role="dialog"
        aria-labelledby="recovery-title"
        aria-describedby="recovery-description"
      >
        {/* Icon */}
        <div style={{
          width: 64,
          height: 64,
          margin: '0 auto 16px',
          borderRadius: '50%',
          backgroundColor: colors.status.warningSubtle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <svg
            style={{ width: 32, height: 32, color: colors.status.warning }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Title */}
        <h2
          id="recovery-title"
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: colors.text.primary,
            textAlign: 'center',
            marginBottom: 8,
          }}
        >
          Recover Previous Session?
        </h2>

        {/* Description */}
        <p
          id="recovery-description"
          style={{
            color: colors.text.secondary,
            textAlign: 'center',
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          MarkuprX found an incomplete session from{' '}
          <span style={{ color: colors.text.primary, fontWeight: 500 }}>{formattedTime} ago</span>.
        </p>

        {/* Session Info Card */}
        <div style={{
          backgroundColor: colors.bg.tertiary,
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
        }}>
          {[
            { label: 'Source', value: session.sourceName || 'Unknown' },
            { label: 'Feedback items', value: String(session.feedbackItems.length) },
            { label: 'Marked issues', value: String(session.markedIssueCount) },
            ...(session.pendingMarkedIssue
              ? [{ label: 'Uncommitted drawing', value: 'Not included' }]
              : []),
            { label: 'Screenshots', value: String(session.screenshotCount) },
            { label: 'Duration', value: formatDuration(sessionDuration) },
          ].map((row, i, arr) => (
            <div key={row.label} style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 14,
              marginBottom: i < arr.length - 1 ? 8 : 0,
            }}>
              <span style={{ color: colors.text.secondary }}>{row.label}:</span>
              <span style={{
                color: colors.text.primary,
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginLeft: 8,
                maxWidth: 200,
              }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {/* Expandable Details */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          style={{
            width: '100%',
            fontSize: 14,
            color: colors.text.secondary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            marginBottom: 16,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            transition: 'color 150ms ease',
          }}
        >
          <svg
            style={{
              width: 16,
              height: 16,
              transition: 'transform 200ms ease',
              transform: showDetails ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
          {showDetails ? 'Hide details' : 'Show details'}
        </button>

        {/* Expandable Content */}
        {showDetails && (
          <div style={{
            backgroundColor: colors.surface.inset,
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            fontSize: 12,
            maxHeight: 192,
            overflowY: 'auto',
            display: 'grid',
            gap: 8,
          }}>
            {[
              { label: 'Session ID', value: `${session.id.slice(0, 8)}...`, mono: true },
              { label: 'Started', value: formatDate(session.startTime) },
              { label: 'Last saved', value: formatDate(session.lastSaveTime) },
              ...(session.metadata ? [
                { label: 'App version', value: session.metadata.appVersion },
                { label: 'Platform', value: session.metadata.platform },
              ] : []),
            ].map((row) => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: colors.text.tertiary }}>{row.label}:</span>
                <span style={{
                  color: colors.text.secondary,
                  ...(row.mono ? { fontFamily: "'SF Mono', Menlo, Monaco, monospace" } : {}),
                }}>
                  {row.value}
                </span>
              </div>
            ))}

            {/* Preview first few feedback items */}
            {session.feedbackItems.length > 0 && (
              <div style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: `1px solid ${colors.border.default}`,
              }}>
                <p style={{ color: colors.text.tertiary, marginBottom: 8 }}>Recent feedback:</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
                  {session.feedbackItems.slice(0, 3).map((item, index) => (
                    <li key={item.id || index} style={{
                      color: colors.text.secondary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {item.hasScreenshot && (
                        <span style={{ color: colors.text.link, marginRight: 4 }} title="Has screenshot">
                          [img]
                        </span>
                      )}
                      {item.text || '[No text]'}
                    </li>
                  ))}
                  {session.feedbackItems.length > 3 && (
                    <li style={{ color: colors.text.tertiary, fontStyle: 'italic' }}>
                      ...and {session.feedbackItems.length - 3} more
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Warning about data loss */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          fontSize: 12,
          color: colors.status.warning,
          marginBottom: 24,
          backgroundColor: colors.status.warningSubtle,
          borderRadius: 8,
          padding: 12,
        }}>
          <svg
            style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>
            Discarding will permanently delete this session data.
            Recovery will save your feedback and committed marked issues as a report.
          </span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={handleDiscard}
            disabled={isRecovering || isDiscarding}
            onMouseEnter={() => setHoveredBtn('discard')}
            onMouseLeave={() => setHoveredBtn(null)}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: 8,
              fontWeight: 500,
              fontSize: 14,
              border: 'none',
              cursor: isDiscarding ? 'wait' : (isRecovering ? 'not-allowed' : 'pointer'),
              opacity: (isRecovering || isDiscarding) ? 0.5 : 1,
              transition: 'all 200ms ease',
              backgroundColor: isDiscarding
                ? colors.bg.tertiary
                : (hoveredBtn === 'discard' ? colors.bg.tertiary : 'transparent'),
              color: isDiscarding
                ? colors.text.secondary
                : (hoveredBtn === 'discard' ? colors.text.primary : colors.text.secondary),
            }}
          >
            {isDiscarding ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {spinnerSvg}
                Discarding...
              </span>
            ) : (
              <>
                Discard
                <span style={{ fontSize: 12, color: colors.text.tertiary, marginLeft: 4 }}>(D)</span>
              </>
            )}
          </button>

          <button
            onClick={handleRecover}
            disabled={isRecovering || isDiscarding}
            onMouseEnter={() => setHoveredBtn('recover')}
            onMouseLeave={() => setHoveredBtn(null)}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: 8,
              fontWeight: 500,
              fontSize: 14,
              border: 'none',
              cursor: isRecovering ? 'wait' : (isDiscarding ? 'not-allowed' : 'pointer'),
              opacity: (isRecovering || isDiscarding) ? 0.5 : 1,
              transition: 'all 200ms ease',
              backgroundColor: recoveryButtonBackground,
              color: recoveryButtonText,
            }}
          >
            {isRecovering ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {spinnerSvg}
                Recovering...
              </span>
            ) : (
              <>
                Recover Session
                <span style={{ fontSize: 12, marginLeft: 4 }}>(R)</span>
              </>
            )}
          </button>
        </div>

        {/* Keyboard hint */}
        <p style={{ textAlign: 'center', fontSize: 12, color: colors.text.tertiary, marginTop: 16 }}>
          Press <kbd style={{
            padding: '2px 6px',
            backgroundColor: colors.bg.tertiary,
            borderRadius: 4,
            color: colors.text.secondary,
          }}>Enter</kbd> to recover or{' '}
          <kbd style={{
            padding: '2px 6px',
            backgroundColor: colors.bg.tertiary,
            borderRadius: 4,
            color: colors.text.secondary,
          }}>Esc</kbd> to discard
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Hook for managing crash recovery state
// ============================================================================

export interface UseCrashRecoveryReturn {
  incompleteSession: RecoverableSession | null;
  isCheckingRecovery: boolean;
  recoverSession: () => Promise<CrashRecoveryResult | undefined>;
  discardSession: () => Promise<void>;
  clearRecoveryState: () => void;
}

export function useCrashRecovery(): UseCrashRecoveryReturn {
  const [incompleteSession, setIncompleteSession] =
    useState<RecoverableSession | null>(null);
  const [isCheckingRecovery, setIsCheckingRecovery] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    // Check for incomplete session on mount
    const checkForIncompleteSession = async () => {
      try {
        // Listen for crash recovery notification from main process
        unsubscribe = window.markuprx?.crashRecovery.onIncompleteFound(
          (data) => {
            if (data.session) {
              // Map from IPC type to local type
              setIncompleteSession({
                id: data.session.id,
                startTime: data.session.startTime,
                lastSaveTime: data.session.lastSaveTime,
                feedbackItems: data.session.feedbackItems.map((item) => ({
                  id: item.id,
                  timestamp: item.timestamp,
                  text: item.text,
                  confidence: item.confidence,
                  hasScreenshot: item.hasScreenshot,
                })),
                transcriptionBuffer: '',
                sourceId: '',
                sourceName: data.session.sourceName,
                screenshotCount: data.session.screenshotCount,
                markedIssueCount: data.session.markedIssueCount ?? 0,
                pendingMarkedIssue: data.session.pendingMarkedIssue ?? false,
              });
            }
          }
        );

        // Request check from main process
        const result = await window.markuprx?.crashRecovery.check();

        if (result?.session) {
          // Map from IPC type to local type
          setIncompleteSession({
            id: result.session.id,
            startTime: result.session.startTime,
            lastSaveTime: result.session.lastSaveTime,
            feedbackItems: result.session.feedbackItems.map((item) => ({
              id: item.id,
              timestamp: item.timestamp,
              text: item.text,
              confidence: item.confidence,
              hasScreenshot: item.hasScreenshot,
              screenshotId: item.screenshotId,
            })),
            transcriptionBuffer: '',
            sourceId: '',
            sourceName: result.session.sourceName,
            screenshotCount: result.session.screenshotCount,
            markedIssueCount: result.session.markedIssueCount ?? 0,
            pendingMarkedIssue: result.session.pendingMarkedIssue ?? false,
            metadata: result.session.metadata,
          });
        }
      } catch (error) {
        console.error('Failed to check for incomplete session:', error);
      } finally {
        setIsCheckingRecovery(false);
      }
    };

    checkForIncompleteSession();

    // Cleanup listener on unmount
    return () => {
      unsubscribe?.();
    };
  }, []);

  const recoverSession = async () => {
    if (incompleteSession) {
      const result = await window.markuprx?.crashRecovery.recover(incompleteSession.id);
      if (!result?.success) {
        throw new Error(result?.error || 'Unable to recover the session.');
      }
      setIncompleteSession(null);
      return result;
    }
    return undefined;
  };

  const discardSession = async () => {
    await window.markuprx?.crashRecovery.discard();
    setIncompleteSession(null);
  };

  const clearRecoveryState = () => {
    setIncompleteSession(null);
  };

  return {
    incompleteSession,
    isCheckingRecovery,
    recoverSession,
    discardSession,
    clearRecoveryState,
  };
}

// Default export for convenience
export default CrashRecoveryDialog;
