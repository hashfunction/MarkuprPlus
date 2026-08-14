import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../../../src/main/SessionController';
import type { ISettingsManager } from '../../../src/main/settings/SettingsManager';
import type { AppSettings } from '../../../src/shared/types';
import type { AIAnalysisResult } from '../../../src/main/ai/types';
import {
  AnthropicApiProvider,
  AnthropicApiProviderError,
} from '../../../src/main/ai/providers/AnthropicApiProvider';

const session = { id: 'anthropic', transcriptBuffer: [], screenshotBuffer: [] } as unknown as Session;
const result = {
  summary: 'Analyzed.',
  items: [],
  themes: [],
  positiveNotes: [],
  metadata: { totalItems: 0, criticalCount: 0, highCount: 0 },
} satisfies AIAnalysisResult;

function settings(apiKey: string | null): ISettingsManager {
  return {
    get: (() => undefined) as ISettingsManager['get'],
    set: () => undefined,
    getAll: () => ({} as AppSettings),
    reset: () => undefined,
    getApiKey: async (service) => service === 'anthropic' ? apiKey : null,
    setApiKey: async () => undefined,
    deleteApiKey: async () => undefined,
    hasApiKey: async (service) => service === 'anthropic' && Boolean(apiKey),
    onChange: () => () => undefined,
    migrate: () => undefined,
    registerIpcHandlers: () => undefined,
  };
}

describe('AnthropicApiProvider', () => {
  it('discovers secure-key readiness without exposing the key', async () => {
    const provider = new AnthropicApiProvider(settings('secret-key'));
    await expect(provider.discover()).resolves.toEqual({
      id: 'anthropic-api',
      name: 'Anthropic API',
      connection: 'cloud',
      installed: true,
      authenticated: true,
      ready: true,
      models: [{ id: '', name: 'Anthropic default', source: 'default' }],
    });
  });

  it('passes the secure key and selected model only to the analyzer factory', async () => {
    const analyze = vi.fn(async () => result);
    const createAnalyzer = vi.fn(() => ({ analyze }));
    const provider = new AnthropicApiProvider(settings('secret-key'), { createAnalyzer });

    await expect(provider.analyze(session, 'claude-sonnet-custom')).resolves.toEqual(result);

    expect(createAnalyzer).toHaveBeenCalledWith('secret-key', 'claude-sonnet-custom');
    expect(analyze).toHaveBeenCalledWith(session);
  });

  it('rejects analysis when the secure key is unavailable', async () => {
    const provider = new AnthropicApiProvider(settings(null));
    await expect(provider.analyze(session)).rejects.toEqual(
      new AnthropicApiProviderError(
        'Anthropic API key is not configured.',
        'NOT_AUTHENTICATED',
      ),
    );
  });
});
