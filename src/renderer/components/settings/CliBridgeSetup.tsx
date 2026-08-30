import React, { useState } from 'react';
import type { CliBridgeConnectionStatus } from '../../../shared/types';
import { SettingsSection } from '../primitives';
import { useTheme } from '../../hooks/useTheme';
import { styles } from './settingsStyles';

export const CLI_BRIDGE_SETUP_COMMANDS = [
  'npm install -g markuprx@latest',
  'markuprx bridge install',
  'markuprx bridge token',
] as const;

export interface CliBridgeStatusPresentation {
  label: string;
  detail: string;
  tone: 'neutral' | 'success' | 'warning';
}

export function getCliBridgeStatusPresentation(
  status: CliBridgeConnectionStatus | null,
): CliBridgeStatusPresentation {
  if (!status) {
    return { label: 'Checking bridge…', detail: 'Checking this Mac.', tone: 'neutral' };
  }
  switch (status.state) {
    case 'connected': {
      const providers = status.providers ?? [];
      const ready = providers.filter(({ ready: providerReady }) => providerReady).length;
      return {
        label: 'Connected',
        detail: `${ready} of ${providers.length} CLI providers ready`,
        tone: 'success',
      };
    }
    case 'offline':
      return {
        label: 'Bridge offline',
        detail: status.diagnostic || 'Run markuprx bridge start.',
        tone: 'warning',
      };
    case 'incompatible':
      return {
        label: 'Update required',
        detail: status.diagnostic || 'Update the companion CLI Bridge.',
        tone: 'warning',
      };
    case 'not-paired':
      return {
        label: status.paired ? 'Pairing rejected' : 'Not paired',
        detail: status.diagnostic || 'Paste the bridge token below.',
        tone: 'warning',
      };
    case 'not-applicable':
      return {
        label: 'Built in',
        detail: status.diagnostic || 'CLI providers run directly in this build.',
        tone: 'success',
      };
  }
}

export const CliBridgeSetup: React.FC<{
  status: CliBridgeConnectionStatus | null;
  token: string;
  busy: boolean;
  onTokenChange: (token: string) => void;
  onPair: () => void;
  onRefresh: () => void;
  onForget: () => void;
}> = ({ status, token, busy, onTokenChange, onPair, onRefresh, onForget }) => {
  const { colors } = useTheme();
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  if (status?.state === 'not-applicable') return null;
  const presentation = getCliBridgeStatusPresentation(status);
  const toneColor = presentation.tone === 'success'
    ? colors.status.success
    : presentation.tone === 'warning'
      ? colors.status.warning
      : colors.text.secondary;

  const copyCommand = async (command: string) => {
    await window.markuprx.copyToClipboard(command);
    setCopiedCommand(command);
    window.setTimeout(() => setCopiedCommand((current) => current === command ? null : current), 1_500);
  };

  return (
    <SettingsSection
      title="CLI Integrations"
      description="Connect the App Store app to AI CLIs already installed and signed in on this Mac."
    >
      <div style={{ display: 'grid', gap: 8 }}>
        {CLI_BRIDGE_SETUP_COMMANDS.map((command, index) => (
          <div
            key={command}
            style={{
              display: 'grid',
              gridTemplateColumns: '20px minmax(0, 1fr) auto',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span aria-hidden="true" style={{ color: colors.text.tertiary, fontSize: 11 }}>
              {index + 1}
            </span>
            <code style={{
              minWidth: 0,
              padding: '7px 9px',
              borderRadius: 7,
              background: colors.bg.tertiary,
              color: colors.text.primary,
              fontSize: 11,
              overflowWrap: 'anywhere',
              userSelect: 'text',
            }}>
              {command}
            </code>
            <button
              type="button"
              style={styles.secondaryButton}
              aria-label={`Copy ${command}`}
              onClick={() => void copyCommand(command)}
            >
              {copiedCommand === command ? 'Copied' : 'Copy'}
            </button>
          </div>
        ))}
      </div>

      <div aria-live="polite" style={{ display: 'grid', gap: 3 }}>
        <span style={{ ...styles.settingLabel, color: toneColor }}>{presentation.label}</span>
        <span style={styles.settingDescription}>{presentation.detail}</span>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onPair();
        }}
        style={{ display: 'grid', gap: 8 }}
      >
        <label htmlFor="cli-bridge-token" style={styles.settingLabel}>Pairing token</label>
        <input
          id="cli-bridge-token"
          type="password"
          value={token}
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste the token from step 3"
          aria-describedby="cli-bridge-token-help"
          onChange={(event) => onTokenChange(event.target.value)}
          style={{ ...styles.apiKeyInput, width: '100%', boxSizing: 'border-box' }}
        />
        <span id="cli-bridge-token-help" style={styles.settingDescription}>
          The token is verified first, then stored in your macOS Keychain. It is never shown again.
        </span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="submit"
            style={styles.secondaryButton}
            disabled={busy || token.trim().length === 0}
          >
            {busy ? 'Connecting…' : status?.paired ? 'Replace pairing' : 'Pair bridge'}
          </button>
          <button type="button" style={styles.secondaryButton} disabled={busy} onClick={onRefresh}>
            Refresh status
          </button>
          {status?.paired && (
            <button type="button" style={styles.secondaryButton} disabled={busy} onClick={onForget}>
              Disconnect
            </button>
          )}
        </div>
      </form>

      <span style={styles.settingDescription}>
        The companion handles only structured report requests from this app on localhost. The App Store app does not execute shell commands.
      </span>
    </SettingsSection>
  );
};
