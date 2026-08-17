import React from 'react';
import type {
  AnalysisModelSelections,
  AnalysisProvider,
  AnalysisProviderStatus,
  ModelAnalysisProvider,
} from '../../../shared/types';
import { SettingsSection } from '../primitives';
import { useTheme } from '../../hooks/useTheme';
import { styles } from './settingsStyles';
import {
  PROVIDER_OPTIONS,
  getModelControlMode,
  getModelDefaultLabel,
} from './analysisProviderOptions';

function describeStatus(provider: AnalysisProvider, status?: AnalysisProviderStatus): string {
  if (provider === 'rules') return 'Ready · no credentials required';
  if (!status) return 'Checking availability…';
  if (status.ready) {
    const details = [status.version, status.endpoint, status.executablePath]
      .filter(Boolean)
      .join(' · ');
    return details ? `Ready · ${details}` : 'Ready';
  }
  return status.diagnostic ?? 'Not ready';
}

export const AnalysisProviderSelector: React.FC<{
  provider: AnalysisProvider;
  modelSelections: AnalysisModelSelections;
  statuses: AnalysisProviderStatus[];
  isScanning: boolean;
  onSelect: (provider: AnalysisProvider) => void;
  onModelChange: (provider: ModelAnalysisProvider, modelId: string) => void;
  onRefresh: () => void;
}> = ({
  provider,
  modelSelections,
  statuses,
  isScanning,
  onSelect,
  onModelChange,
  onRefresh,
}) => {
  const { colors } = useTheme();
  const modelProvider = provider === 'rules' ? null : provider as ModelAnalysisProvider;
  const modelStatus = statuses.find((candidate) => candidate.id === provider);
  const modelMode = getModelControlMode(provider);
  const modelValue = modelProvider ? modelSelections[modelProvider] ?? '' : '';
  const modelListId = modelProvider ? `analysis-models-${modelProvider}` : undefined;

  return (
    <SettingsSection
      title="Report Generation"
      description="Choose the provider and model that turn each capture into a structured report."
    >
      <div role="radiogroup" aria-label="Report generation provider" style={{ display: 'grid', gap: 10 }}>
        {PROVIDER_OPTIONS.map((option) => {
          const selected = provider === option.id;
          const status = statuses.find((candidate) => candidate.id === option.id);
          const ready = option.id === 'rules' || status?.ready === true;

          return (
            <button
              key={option.id}
              className="ff-analysis-provider-option"
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
                <span
                  className="ff-analysis-provider-option__heading"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{option.title}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: colors.text.tertiary, textTransform: 'uppercase' }}>
                    {option.connectionBadge}
                  </span>
                  {option.recommended && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: colors.text.link, textTransform: 'uppercase' }}>
                      Recommended
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
              {selected && (
                <span
                  className="ff-analysis-provider-option__selected"
                  style={{ fontSize: 11, color: colors.text.link, fontWeight: 600 }}
                >
                  Selected
                </span>
              )}
            </button>
          );
        })}
      </div>

      {modelProvider && modelMode !== 'none' && (
        <div style={{ marginTop: 14 }}>
          <label
            htmlFor="analysis-model"
            style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: colors.text.primary }}
          >
            Report model
          </label>
          {modelMode === 'discovered-only' ? (
            <select
              id="analysis-model"
              value={modelValue}
              onChange={(event) => onModelChange(modelProvider, event.target.value)}
              style={{ ...styles.select, width: '100%' }}
            >
              <option value="">{getModelDefaultLabel(modelProvider)}</option>
              {(modelStatus?.models ?? []).filter(({ id }) => id).map((model) => (
                <option key={model.id} value={model.id}>{model.name}</option>
              ))}
            </select>
          ) : (
            <>
              <input
                id="analysis-model"
                list={modelListId}
                value={modelValue}
                placeholder={getModelDefaultLabel(modelProvider)}
                onChange={(event) => onModelChange(modelProvider, event.target.value)}
                style={{ ...styles.apiKeyInput, width: '100%', boxSizing: 'border-box' }}
              />
              <datalist id={modelListId}>
                {(modelStatus?.models ?? []).filter(({ id }) => id).map((model) => (
                  <option key={model.id} value={model.id}>{model.name}</option>
                ))}
              </datalist>
            </>
          )}
          <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: colors.text.secondary }}>
            {modelMode === 'discovered-only'
              ? 'Only models discovered from the local provider can be selected.'
              : 'Leave blank for the provider default, choose a suggestion, or enter a model ID.'}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" style={styles.secondaryButton} onClick={onRefresh} disabled={isScanning}>
          {isScanning ? 'Refreshing…' : 'Refresh providers'}
        </button>
      </div>
    </SettingsSection>
  );
};
