import React, { useState, useEffect, useCallback } from 'react';
import type { AppSettings, UpdateStatusPayload } from '../../../shared/types';
import { SettingsSection, ToggleSetting, DirectoryPicker } from '../primitives';
import { styles } from './settingsStyles';

// =============================================================================
// Update Status State
// =============================================================================

interface UpdateStatusState {
  status: string;
  currentVersion: string;
  availableVersion: string | null;
  releaseNotes: string | null;
  downloadProgress: number | null;
  updaterAvailable: boolean;
}

// =============================================================================
// Software Update Section Component
// =============================================================================

const SoftwareUpdateSection: React.FC<{
  checkForUpdates: boolean;
  onCheckForUpdatesChange: (value: boolean) => void;
}> = ({ checkForUpdates, onCheckForUpdatesChange }) => {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusState | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckResult, setLastCheckResult] = useState<'up-to-date' | 'available' | 'error' | null>(null);

  // Load initial update status
  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const status = await window.markuprx.updates.getStatus();
        if (!cancelled) {
          setUpdateStatus(status);
        }
      } catch {
        // getStatus not available (older main process), show graceful fallback
      }
    };
    void load();

    // Subscribe to live update status changes
    const unsubscribe = window.markuprx.updates.onStatus((payload: UpdateStatusPayload) => {
      if (cancelled) return;
      setUpdateStatus((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          status: payload.status,
          availableVersion: payload.version ?? prev.availableVersion,
          releaseNotes: payload.releaseNotes ?? prev.releaseNotes,
          downloadProgress: payload.percent ?? prev.downloadProgress,
        };
      });

      if (payload.status === 'available') {
        setLastCheckResult('available');
        setIsChecking(false);
      } else if (payload.status === 'not-available') {
        setLastCheckResult('up-to-date');
        setIsChecking(false);
      } else if (payload.status === 'error') {
        setLastCheckResult('error');
        setIsChecking(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const handleCheckNow = useCallback(async () => {
    setIsChecking(true);
    setLastCheckResult(null);
    try {
      await window.markuprx.updates.check();
      // Result comes via the onStatus subscription above
      // Set a timeout in case no response comes
      setTimeout(() => {
        setIsChecking((prev) => {
          if (prev) {
            setLastCheckResult('up-to-date');
            return false;
          }
          return prev;
        });
      }, 10000);
    } catch {
      setIsChecking(false);
      setLastCheckResult('error');
    }
  }, []);

  const handleDownload = useCallback(async () => {
    try {
      await window.markuprx.updates.download();
    } catch {
      // Error will come through onStatus
    }
  }, []);

  const handleInstall = useCallback(async () => {
    try {
      await window.markuprx.updates.install();
    } catch {
      // Error will come through onStatus
    }
  }, []);

  const currentVersion = updateStatus?.currentVersion ?? '';
  const availableVersion = updateStatus?.availableVersion;
  const updaterAvailable = updateStatus?.updaterAvailable ?? false;
  const liveStatus = updateStatus?.status ?? 'idle';

  return (
    <SettingsSection
      title="Software Update"
      description="Keep MarkuprX up to date"
    >
      {/* Version Info */}
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Current Version</span>
          <span style={styles.settingDescription}>
            {currentVersion ? `v${currentVersion}` : 'Loading...'}
          </span>
        </div>
      </div>

      {/* Update status display */}
      {availableVersion && liveStatus === 'available' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 12,
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          borderRadius: 8,
          border: '1px solid rgba(59, 130, 246, 0.2)',
        }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: '#3b82f6',
            flexShrink: 0,
          }} />
          <div style={{ flex: 1 }}>
            <span style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}>
              Update Available: v{availableVersion}
            </span>
            <span style={{
              display: 'block',
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginTop: 2,
            }}>
              A new version of MarkuprX is ready to download.
            </span>
          </div>
          <button
            style={{
              padding: '8px 16px',
              backgroundColor: '#3b82f6',
              border: 'none',
              borderRadius: 8,
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            onClick={handleDownload}
          >
            Download
          </button>
        </div>
      )}

      {/* Download progress */}
      {liveStatus === 'downloading' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: 12,
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          borderRadius: 8,
          border: '1px solid rgba(59, 130, 246, 0.2)',
        }}>
          <span style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text-primary)',
          }}>
            Downloading update...
          </span>
          <div style={{
            height: 4,
            backgroundColor: 'rgba(124, 137, 160, 0.3)',
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              backgroundColor: '#3b82f6',
              borderRadius: 2,
              transition: 'width 0.3s ease',
              width: `${updateStatus?.downloadProgress ?? 0}%`,
            }} />
          </div>
          <span style={{
            fontSize: 12,
            color: 'var(--text-tertiary)',
            textAlign: 'right',
          }}>
            {Math.round(updateStatus?.downloadProgress ?? 0)}%
          </span>
        </div>
      )}

      {/* Ready to install */}
      {liveStatus === 'ready' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 12,
          backgroundColor: 'rgba(34, 197, 94, 0.08)',
          borderRadius: 8,
          border: '1px solid rgba(34, 197, 94, 0.2)',
        }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: '#22c55e',
            flexShrink: 0,
          }} />
          <div style={{ flex: 1 }}>
            <span style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}>
              Update Ready to Install
            </span>
            <span style={{
              display: 'block',
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginTop: 2,
            }}>
              Restart MarkuprX to apply the update. Your work will be saved.
            </span>
          </div>
          <button
            style={{
              padding: '8px 16px',
              backgroundColor: '#22c55e',
              border: 'none',
              borderRadius: 8,
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            onClick={handleInstall}
          >
            Restart Now
          </button>
        </div>
      )}

      {/* Up-to-date confirmation (after manual check) */}
      {lastCheckResult === 'up-to-date' && liveStatus !== 'available' && liveStatus !== 'ready' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          backgroundColor: 'rgba(34, 197, 94, 0.08)',
          borderRadius: 8,
          border: '1px solid rgba(34, 197, 94, 0.15)',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3.5 7l2.5 2.5 4.5-5" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 500 }}>
            You are up to date
          </span>
        </div>
      )}

      {/* Error after manual check */}
      {lastCheckResult === 'error' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          backgroundColor: 'rgba(239, 68, 68, 0.08)',
          borderRadius: 8,
          border: '1px solid rgba(239, 68, 68, 0.15)',
        }}>
          <span style={{ fontSize: 13, color: 'var(--status-error)', fontWeight: 500 }}>
            Unable to check for updates. Please try again later.
          </span>
        </div>
      )}

      {/* Updater unavailable (dev/local build) */}
      {updateStatus && !updaterAvailable && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          backgroundColor: 'rgba(245, 158, 11, 0.08)',
          borderRadius: 8,
          border: '1px solid rgba(245, 158, 11, 0.15)',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 4.5v3M7 9.5h.005" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="7" cy="7" r="5.5" stroke="#f59e0b" strokeWidth="1" />
          </svg>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            Auto-updates unavailable (local build). Download the latest release from{' '}
            <a
              href="https://github.com/eddiesanjuan/markuprx/releases"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--text-link)', textDecoration: 'underline' }}
            >
              GitHub Releases
            </a>.
          </span>
        </div>
      )}

      {/* Auto-check toggle */}
      <ToggleSetting
        label="Check Automatically"
        description="Check for updates on launch and periodically while running"
        value={checkForUpdates}
        onChange={onCheckForUpdatesChange}
        disabled={!updaterAvailable && updateStatus !== null}
      />

      {/* Check Now button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          style={{
            ...styles.secondaryButton,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            opacity: isChecking || (!updaterAvailable && updateStatus !== null) ? 0.5 : 1,
            cursor: isChecking || (!updaterAvailable && updateStatus !== null) ? 'not-allowed' : 'pointer',
          }}
          onClick={handleCheckNow}
          disabled={isChecking || (!updaterAvailable && updateStatus !== null)}
        >
          {isChecking && (
            <span style={styles.spinner} />
          )}
          {isChecking ? 'Checking...' : 'Check for Updates'}
        </button>
      </div>
    </SettingsSection>
  );
};

// =============================================================================
// General Tab (exported)
// =============================================================================

export const GeneralTab: React.FC<{
  settings: AppSettings;
  onSettingChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onResetSection: () => void;
}> = ({ settings, onSettingChange, onResetSection }) => (
  <div style={styles.tabContent}>
    <SoftwareUpdateSection
      checkForUpdates={settings.checkForUpdates}
      onCheckForUpdatesChange={(value) => onSettingChange('checkForUpdates', value)}
    />

    <SettingsSection
      title="Output"
      description="Where your feedback sessions are saved"
      onReset={onResetSection}
    >
      <DirectoryPicker
        label="Output Directory"
        description="Screenshots and markdown files will be saved here"
        value={settings.outputDirectory}
        onChange={(value) => onSettingChange('outputDirectory', value)}
      />
    </SettingsSection>

    <SettingsSection title="Startup">
      <ToggleSetting
        label="Launch at Login"
        description="Start MarkuprX automatically when you log in"
        value={settings.launchAtLogin}
        onChange={(value) => onSettingChange('launchAtLogin', value)}
      />
    </SettingsSection>
  </div>
);
