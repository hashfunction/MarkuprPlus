import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANALYSIS_PROVIDERS,
  DEFAULT_SETTINGS,
  isValidAnalysisModelSelections,
  normalizeAnalysisProvider,
} from '../../src/shared/types';

describe('analysis provider settings', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('normalizes legacy provider IDs and rejects unknown values', () => {
    expect(normalizeAnalysisProvider('codex')).toBe('codex-cli');
    expect(normalizeAnalysisProvider('anthropic')).toBe('anthropic-api');
    expect(normalizeAnalysisProvider('rules')).toBe('rules');
    expect(normalizeAnalysisProvider('unsupported')).toBe('anthropic-api');
  });

  it('defines the complete normalized provider set and empty model defaults', () => {
    expect(ANALYSIS_PROVIDERS).toEqual([
      'rules',
      'anthropic-api',
      'codex-cli',
      'claude-cli',
      'ollama',
      'lmstudio',
    ]);
    expect(DEFAULT_SETTINGS.analysisProvider).toBe('anthropic-api');
    expect(DEFAULT_SETTINGS.analysisModelsByProvider).toEqual({});
  });

  it('defaults upgraded installations to normalized Anthropic analysis', async () => {
    const { createSettingsManager } = await import('../../src/main/settings/SettingsManager');

    const settings = createSettingsManager();

    expect(settings.get('analysisProvider')).toBe('anthropic-api');
  });

  it('persists supported providers and rejects unsupported values', async () => {
    const { createSettingsManager } = await import('../../src/main/settings/SettingsManager');

    const settings = createSettingsManager();
    settings.set('analysisProvider', 'codex-cli');
    expect(settings.get('analysisProvider')).toBe('codex-cli');

    settings.set('analysisProvider', 'unsupported' as never);
    expect(settings.get('analysisProvider')).toBe('codex-cli');

    settings.set('analysisProvider', 'rules');
    expect(settings.get('analysisProvider')).toBe('rules');
  });

  it('persists valid per-provider model selections', async () => {
    const { createSettingsManager } = await import('../../src/main/settings/SettingsManager');
    const settings = createSettingsManager();
    const selections = {
      ollama: 'qwen2.5:7b',
      'codex-cli': 'gpt-5.6-terra',
      'claude-cli': 'sonnet',
    } as const;

    settings.set('analysisModelsByProvider', selections);

    expect(settings.get('analysisModelsByProvider')).toEqual(selections);
  });

  it('rejects invalid model-selection maps and bounded model IDs', () => {
    expect(isValidAnalysisModelSelections({ ollama: 'qwen2.5:7b' })).toBe(true);
    expect(isValidAnalysisModelSelections({ rules: 'not-a-model-provider' })).toBe(false);
    expect(isValidAnalysisModelSelections({ ollama: '' })).toBe(false);
    expect(isValidAnalysisModelSelections({ ollama: 'bad\nmodel' })).toBe(false);
    expect(isValidAnalysisModelSelections({ ollama: 'x'.repeat(201) })).toBe(false);
  });
});
