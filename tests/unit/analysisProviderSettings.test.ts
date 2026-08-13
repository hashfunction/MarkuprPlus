import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('analysis provider settings', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('defaults upgraded installations to Anthropic analysis', async () => {
    const { createSettingsManager } = await import('../../src/main/settings/SettingsManager');

    const settings = createSettingsManager();

    expect(settings.get('analysisProvider')).toBe('anthropic');
  });

  it('persists supported providers and rejects unsupported values', async () => {
    const { createSettingsManager } = await import('../../src/main/settings/SettingsManager');

    const settings = createSettingsManager();
    settings.set('analysisProvider', 'codex');
    expect(settings.get('analysisProvider')).toBe('codex');

    settings.set('analysisProvider', 'unsupported' as never);
    expect(settings.get('analysisProvider')).toBe('codex');

    settings.set('analysisProvider', 'rules');
    expect(settings.get('analysisProvider')).toBe('rules');
  });
});
