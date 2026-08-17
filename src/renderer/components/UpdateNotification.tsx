/**
 * MarkuprX - Update Notification Component
 *
 * Uses explicit inline styles so update UI remains readable even without utility CSS.
 * This prevents malformed giant-error layouts in packaged builds.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { PUBLIC_BRAND_NAME } from '../../shared/publicBrand';
import type { UpdateStatusPayload, UpdateStatusType } from '../../shared/types';

interface UpdateState {
  status: UpdateStatusType;
  version?: string;
  releaseNotes?: string | null;
  percent?: number;
  message?: string;
}

const containerStyle: CSSProperties = {
  position: 'fixed',
  right: 16,
  bottom: 16,
  width: 360,
  maxWidth: 'calc(100vw - 32px)',
  zIndex: 9000,
};

const cardBaseStyle: CSSProperties = {
  color: '#f4f7ff',
  borderRadius: 14,
  padding: 14,
  border: '1px solid rgba(255, 255, 255, 0.22)',
  boxShadow: '0 16px 34px rgba(0, 0, 0, 0.4)',
  backdropFilter: 'blur(8px)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const titleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.2,
};

const subtitleStyle: CSSProperties = {
  marginTop: 2,
  fontSize: 12,
  color: 'rgba(239, 244, 255, 0.86)',
  lineHeight: 1.35,
};

const iconBoxStyle: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  background: 'rgba(255, 255, 255, 0.2)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const iconStyle: CSSProperties = {
  width: 18,
  height: 18,
};

const actionsRowStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  marginTop: 12,
};

const primaryButtonStyle: CSSProperties = {
  flex: 1,
  minHeight: 34,
  borderRadius: 9,
  border: '1px solid rgba(255, 255, 255, 0.38)',
  background: 'rgba(255, 255, 255, 0.22)',
  color: '#ffffff',
  fontSize: 13,
  fontWeight: 600,
  padding: '8px 10px',
  cursor: 'pointer',
};

const secondaryButtonStyle: CSSProperties = {
  minHeight: 34,
  borderRadius: 9,
  border: '1px solid rgba(255, 255, 255, 0.28)',
  background: 'rgba(255, 255, 255, 0.1)',
  color: 'rgba(239, 244, 255, 0.9)',
  fontSize: 13,
  fontWeight: 500,
  padding: '8px 10px',
  cursor: 'pointer',
};

export function UpdateNotification(): React.ReactElement | null {
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle' });
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    const init = async (): Promise<void> => {
      try {
        const checkForUpdates = await window.markuprx.settings.get('checkForUpdates');
        if (!checkForUpdates || !isMounted) {
          setIsDismissed(true);
          return;
        }
      } catch {
        // Keep default behavior if settings read fails.
      }

      try {
        const current = await window.markuprx.updates.getStatus();
        if (!isMounted) return;

        if (!current.updaterAvailable) {
          setUpdate({ status: 'not-available' });
          setIsDismissed(true);
        } else {
          setUpdate({
            status: normalizeUpdateStatus(current.status),
            version: current.availableVersion ?? undefined,
            releaseNotes: current.releaseNotes ?? null,
            percent: current.downloadProgress ?? undefined,
          });
        }
      } catch {
        // Non-fatal: continue with live events only.
      }

      unsubscribe = window.markuprx.updates.onStatus((status: UpdateStatusPayload) => {
        if (status.status === 'error' && typeof status.message === 'string') {
          if (isLocalBuildMetadataError(status.message) || isTransientNetworkError(status.message)) {
            setUpdate({ status: 'not-available' });
            setIsDismissed(true);
            return;
          }
        }

        setUpdate({
          status: status.status,
          version: status.version,
          releaseNotes: status.releaseNotes,
          percent: status.percent,
          message: status.message,
        });

        if (status.status === 'available' || status.status === 'ready') {
          setIsExpanded(true);
          setIsDismissed(false);
        }
      });
    };

    void init();

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, []);

  const handleDownload = useCallback(() => {
    window.markuprx.updates.download();
  }, []);

  const handleInstall = useCallback(() => {
    window.markuprx.updates.install();
  }, []);

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
  }, []);

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  if (
    update.status === 'idle' ||
    update.status === 'checking' ||
    update.status === 'not-available' ||
    (update.status === 'error' && !update.message) ||
    isDismissed
  ) {
    return null;
  }

  const availableCardStyle: CSSProperties = {
    ...cardBaseStyle,
    background: 'linear-gradient(135deg, rgba(29, 78, 216, 0.96), rgba(37, 99, 235, 0.96))',
  };

  const downloadingCardStyle: CSSProperties = {
    ...cardBaseStyle,
    background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.96), rgba(30, 41, 59, 0.96))',
  };

  const readyCardStyle: CSSProperties = {
    ...cardBaseStyle,
    background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.96), rgba(22, 163, 74, 0.96))',
  };

  const errorCardStyle: CSSProperties = {
    ...cardBaseStyle,
    background: 'linear-gradient(135deg, rgba(185, 28, 28, 0.96), rgba(220, 38, 38, 0.96))',
  };

  return (
    <div style={containerStyle}>
      {update.status === 'available' && (
        <div style={availableCardStyle}>
          <div style={{ ...rowStyle, alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={rowStyle}>
              <div style={iconBoxStyle}>
                <svg style={iconStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </div>
              <div>
                <h4 style={titleStyle}>Update Available</h4>
                <p style={subtitleStyle}>Version {update.version}</p>
              </div>
            </div>
            <button
              onClick={handleToggleExpand}
              style={{ ...secondaryButtonStyle, minHeight: 30, padding: '4px 8px' }}
              aria-label={isExpanded ? 'Collapse release notes' : 'Expand release notes'}
            >
              {isExpanded ? 'Hide' : 'Notes'}
            </button>
          </div>

          {isExpanded && update.releaseNotes && (
            <div
              style={{
                marginTop: 10,
                maxHeight: 146,
                overflowY: 'auto',
                borderRadius: 10,
                padding: 10,
                background: 'rgba(0, 0, 0, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
              }}
            >
              <p style={{ fontSize: 11, fontWeight: 600, opacity: 0.85, marginBottom: 6, letterSpacing: 0.4 }}>
                WHAT&apos;S NEW
              </p>
              <ReleaseNotes notes={update.releaseNotes} />
            </div>
          )}

          <div style={actionsRowStyle}>
            <button onClick={handleDownload} style={{ ...primaryButtonStyle, background: '#ffffff', color: '#1d4ed8' }}>
              Download Now
            </button>
            <button onClick={handleDismiss} style={secondaryButtonStyle}>
              Later
            </button>
          </div>
        </div>
      )}

      {update.status === 'downloading' && (
        <div style={downloadingCardStyle}>
          <div style={{ ...rowStyle, marginBottom: 10 }}>
            <div style={iconBoxStyle}>
              <svg style={iconStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div>
              <h4 style={titleStyle}>Downloading Update</h4>
              <p style={subtitleStyle}>Please wait</p>
            </div>
          </div>
          <div style={{ height: 8, borderRadius: 999, overflow: 'hidden', background: 'rgba(148, 163, 184, 0.25)' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.max(0, Math.min(100, update.percent || 0))}%`,
                background: 'linear-gradient(90deg, #3b82f6, #22d3ee)',
                transition: 'width 220ms ease-out',
              }}
            />
          </div>
          <p style={{ marginTop: 8, fontSize: 12, color: 'rgba(239, 244, 255, 0.85)', textAlign: 'right' }}>
            {Math.round(update.percent || 0)}% complete
          </p>
        </div>
      )}

      {update.status === 'ready' && (
        <div style={readyCardStyle}>
          <div style={{ ...rowStyle, marginBottom: 10 }}>
            <div style={iconBoxStyle}>
              <svg style={iconStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h4 style={titleStyle}>Update Ready</h4>
              <p style={subtitleStyle}>Version {update.version} is ready to install</p>
            </div>
          </div>
          <p style={{ fontSize: 13, color: 'rgba(239, 244, 255, 0.92)', marginBottom: 12 }}>
            Restart {PUBLIC_BRAND_NAME} to apply the update. Your work will be saved.
          </p>
          <button onClick={handleInstall} style={{ ...primaryButtonStyle, background: '#ffffff', color: '#047857' }}>
            Restart Now
          </button>
        </div>
      )}

      {update.status === 'error' && update.message && (
        <div style={errorCardStyle}>
          <div style={rowStyle}>
            <div style={iconBoxStyle}>
              <svg style={iconStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h4 style={titleStyle}>Update Failed</h4>
              <p style={subtitleStyle}>{update.message}</p>
            </div>
          </div>
          <div style={actionsRowStyle}>
            <button onClick={() => void window.markuprx.updates.check()} style={primaryButtonStyle}>
              Try Again
            </button>
            <button onClick={handleDismiss} style={secondaryButtonStyle}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function isLocalBuildMetadataError(message: string): boolean {
  return /(app-update\.yml|latest\.yml|enoent)/i.test(message);
}

function isTransientNetworkError(message: string): boolean {
  return /(err_internet_disconnected|err_network_changed|err_name_not_resolved|econnrefused|eai_again|enotfound|timed out|timeout|failed to fetch|network request failed)/i.test(
    message,
  );
}

function ReleaseNotes({ notes }: { notes: string }): React.ReactElement {
  const lines = notes
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 30);

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {lines.map((line, i) => (
        <p key={`${line}-${i}`} style={{ fontSize: 12, lineHeight: 1.45, color: 'rgba(239, 244, 255, 0.92)' }}>
          {line.replace(/^[-*]\s+/, '• ')}
        </p>
      ))}
    </div>
  );
}

function normalizeUpdateStatus(status: string): UpdateStatusType {
  switch (status) {
    case 'checking':
    case 'available':
    case 'not-available':
    case 'downloading':
    case 'ready':
    case 'error':
      return status;
    default:
      return 'idle';
  }
}

export default UpdateNotification;
