import React from 'react';
import type { AnalysisProvider, AnalysisProviderStatus } from '../../../shared/types';
import { SettingsSection } from '../primitives';
import { useTheme } from '../../hooks/useTheme';
import { styles } from './settingsStyles';

const PROVIDERS: Array<{
  id: AnalysisProvider;
  title: string;
  description: string;
  badge?: string;
}> = [
  {
    id: 'codex-cli',
    title: 'Codex CLI',
    description: 'Use your installed Codex CLI and existing ChatGPT login.',
    badge: 'Recommended',
  },
  {
    id: 'anthropic-api',
    title: 'Anthropic API',
    description: 'Analyze reports with an Anthropic API key stored by markupR.',
  },
  {
    id: 'rules',
    title: 'Local rules only',
    description: 'Generate a useful local report without an AI CLI or API key.',
  },
];

function describeStatus(provider: AnalysisProvider, status?: AnalysisProviderStatus): string {
  if (provider === 'rules') return 'Ready · no credentials required';
  if (!status) return 'Checking availability…';
  if (status.ready) {
    const details = [status.version, status.executablePath].filter(Boolean).join(' · ');
    return details ? `Ready · ${details}` : 'Ready';
  }
  return status.diagnostic ?? 'Not ready';
}

export const AnalysisProviderSelector: React.FC<{
  provider: AnalysisProvider;
  statuses: AnalysisProviderStatus[];
  isScanning: boolean;
  onSelect: (provider: AnalysisProvider) => void;
  onRefresh: () => void;
}> = ({ provider, statuses, isScanning, onSelect, onRefresh }) => {
  const { colors } = useTheme();

  return (
    <SettingsSection
      title="AI Analysis Provider"
      description="Choose how markupR turns each capture into an enhanced report."
    >
      <div role="radiogroup" aria-label="AI analysis provider" style={{ display: 'grid', gap: 10 }}>
        {PROVIDERS.map((option) => {
          const selected = provider === option.id;
          const status = statuses.find((candidate) => candidate.id === option.id);
          const ready = option.id === 'rules' || status?.ready === true;

          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(option.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: '18px 1fr auto',
                alignItems: 'start',
                gap: 10,
                width: '100%',
                padding: 12,
                borderRadius: 10,
                border: `1px solid ${selected ? colors.accent.default : colors.border.default}`,
                background: selected ? colors.accent.subtle : colors.bg.subtle,
                color: colors.text.primary,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 14,
                  height: 14,
                  marginTop: 2,
                  borderRadius: '50%',
                  border: `2px solid ${selected ? colors.accent.default : colors.border.strong}`,
                  boxShadow: selected ? `inset 0 0 0 3px ${colors.bg.secondary}` : 'none',
                  background: selected ? colors.accent.default : 'transparent',
                }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{option.title}</span>
                  {option.badge && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: colors.accent.default, textTransform: 'uppercase' }}>
                      {option.badge}
                    </span>
                  )}
                </span>
                <span style={{ display: 'block', marginTop: 3, fontSize: 12, color: colors.text.secondary }}>
                  {option.description}
                </span>
                <span
                  style={{
                    display: 'block',
                    marginTop: 6,
                    fontSize: 11,
                    lineHeight: 1.4,
                    color: ready ? colors.status.success : colors.status.warning,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {describeStatus(option.id, status)}
                </span>
              </span>
              {selected && <span style={{ fontSize: 11, color: colors.accent.default, fontWeight: 600 }}>Selected</span>}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" style={styles.secondaryButton} onClick={onRefresh} disabled={isScanning}>
          {isScanning ? 'Scanning…' : 'Refresh CLI Detection'}
        </button>
      </div>
    </SettingsSection>
  );
};
