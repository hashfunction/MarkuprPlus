import { describe, expect, it } from 'vitest';
import {
  PROVIDER_OPTIONS,
  providerOptionsForDistribution,
  getModelControlMode,
  getModelDefaultLabel,
  getSelectedModelLabel,
  normalizeSavedModel,
} from '../../src/renderer/components/settings/analysisProviderOptions';
import type { AnalysisProviderStatus } from '../../src/shared/types';

describe('analysis provider options', () => {
  it('shows the comprehensive CLI provider catalog before local and cloud fallbacks', () => {
    expect(PROVIDER_OPTIONS.map(({ id }) => id)).toEqual([
      'codex-cli',
      'claude-cli',
      'opencode-cli',
      'cursor-cli',
      'qwen-cli',
      'goose-cli',
      'amp-cli',
      'kiro-cli',
      'aider-cli',
      'ollama',
      'lmstudio',
      'anthropic-api',
      'rules',
    ]);
    expect(PROVIDER_OPTIONS.map(({ connectionBadge }) => connectionBadge)).toEqual([
      'CLI', 'CLI', 'CLI', 'CLI', 'CLI', 'CLI', 'CLI', 'CLI', 'CLI',
      'Local', 'Local', 'Cloud', 'Local',
    ]);
  });

  it('hides CLI cards in the Store distribution', () => {
    expect(providerOptionsForDistribution('mas').map(({ id }) => id)).toEqual([
      'ollama',
      'lmstudio',
      'anthropic-api',
      'rules',
    ]);
    expect(providerOptionsForDistribution('direct').map(({ id }) => id)).toEqual(
      PROVIDER_OPTIONS.map(({ id }) => id),
    );
  });

  it('selects the safe model-control mode for each provider kind', () => {
    expect(getModelControlMode('ollama')).toBe('discovered-only');
    expect(getModelControlMode('lmstudio')).toBe('discovered-only');
    expect(getModelControlMode('codex-cli')).toBe('default-or-custom');
    expect(getModelControlMode('claude-cli')).toBe('default-or-custom');
    expect(getModelControlMode('anthropic-api')).toBe('default-or-custom');
    expect(getModelControlMode('amp-cli')).toBe('none');
    expect(getModelControlMode('kiro-cli')).toBe('none');
    expect(getModelControlMode('rules')).toBe('none');
  });

  it('uses provider-specific default model labels', () => {
    expect(getModelDefaultLabel('codex-cli')).toBe('Codex default');
    expect(getModelDefaultLabel('claude-cli')).toBe('Claude Code default');
    expect(getModelDefaultLabel('anthropic-api')).toBe('Anthropic default');
  });

  it('recognizes a saved custom model without discarding it', () => {
    const status: AnalysisProviderStatus = {
      id: 'codex-cli',
      name: 'Codex CLI',
      connection: 'cli',
      installed: true,
      ready: true,
      models: [{ id: '', name: 'Codex default', source: 'default' }],
    };
    expect(getSelectedModelLabel('codex-cli', status, 'gpt-custom')).toBe('gpt-custom (custom)');
    expect(normalizeSavedModel('  gpt-custom  ')).toBe('gpt-custom');
    expect(normalizeSavedModel('   ')).toBeNull();
  });

  it('uses a discovered model name when the saved ID is known', () => {
    const status: AnalysisProviderStatus = {
      id: 'ollama',
      name: 'Ollama',
      connection: 'local',
      installed: true,
      ready: true,
      models: [{ id: 'qwen2.5:7b', name: 'Qwen 2.5 7B', source: 'discovered' }],
    };
    expect(getSelectedModelLabel('ollama', status, 'qwen2.5:7b')).toBe('Qwen 2.5 7B');
  });
});
