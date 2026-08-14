import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../../../src/main/SessionController';
import type { ISettingsManager } from '../../../src/main/settings/SettingsManager';
import type {
  AnalysisModelSelections,
  AnalysisProvider,
  AppSettings,
} from '../../../src/shared/types';
import type { AIAnalysisResult } from '../../../src/main/ai/types';
import {
  processSession,
  type PipelineDependencies,
} from '../../../src/main/ai/AIPipelineManager';
import { AnalysisProviderRegistry } from '../../../src/main/ai/providers/AnalysisProviderRegistry';
import type { AnalysisProviderAdapter } from '../../../src/main/ai/providers/types';

const sessionFixture: Session = {
  id: 'pipeline-session',
  startTime: 1_700_000_000_000,
  endTime: 1_700_000_005_000,
  state: 'complete',
  sourceId: 'screen:0:0',
  feedbackItems: [],
  transcriptBuffer: [{
    text: 'The save button is hard to find',
    isFinal: true,
    confidence: 0.95,
    timestamp: 1_700_000_001,
    tier: 'whisper',
  }],
  screenshotBuffer: [],
  metadata: { sourceName: 'Editor', startTime: 1_700_000_000_000 },
};

function analysis(summary: string): AIAnalysisResult {
  return {
    summary,
    items: [{
      title: 'Save button is hidden',
      category: 'UX Issue',
      priority: 'High',
      quote: 'The save button is hard to find',
      screenshotIndices: [],
      actionItem: 'Move the save button into the primary toolbar.',
      area: 'Editor toolbar',
    }],
    themes: [],
    positiveNotes: [],
    metadata: { totalItems: 1, criticalCount: 0, highCount: 1 },
  };
}

function settings(
  provider: AnalysisProvider,
  models: AnalysisModelSelections = {},
): ISettingsManager {
  return {
    get: ((key: keyof AppSettings) => {
      if (key === 'analysisProvider') return provider;
      if (key === 'analysisModelsByProvider') return models;
      return undefined;
    }) as ISettingsManager['get'],
    set: () => undefined,
    getAll: () => ({
      analysisProvider: provider,
      analysisModelsByProvider: models,
    } as AppSettings),
    reset: () => undefined,
    getApiKey: async () => null,
    setApiKey: async () => undefined,
    deleteApiKey: async () => undefined,
    hasApiKey: async () => false,
    onChange: () => () => undefined,
    migrate: () => undefined,
    registerIpcHandlers: () => undefined,
  };
}

function adapter(
  id: AnalysisProviderAdapter['id'],
  name: string,
  connection: AnalysisProviderAdapter['connection'],
  analyze: AnalysisProviderAdapter['analyze'],
): AnalysisProviderAdapter & { analyze: ReturnType<typeof vi.fn> } {
  return {
    id,
    name,
    connection,
    discover: async () => ({
      id,
      name,
      connection,
      installed: true,
      authenticated: true,
      ready: true,
    }),
    analyze: vi.fn(analyze),
  };
}

function dependencies(adapters: AnalysisProviderAdapter[]): PipelineDependencies {
  return {
    createProviderRegistry: () => new AnalysisProviderRegistry(adapters),
  };
}

describe('AIPipelineManager provider routing', () => {
  it.each([
    ['codex-cli', 'Codex CLI', 'cli', 'gpt-5.6-terra'],
    ['claude-cli', 'Claude Code CLI', 'cli', 'sonnet'],
    ['ollama', 'Ollama', 'local', 'qwen2.5:7b'],
    ['lmstudio', 'LM Studio', 'local', 'qwen2.5-7b-instruct'],
  ] as const)(
    'uses only %s with its selected report model',
    async (provider, label, connection, model) => {
      const selected = adapter(
        provider,
        label,
        connection,
        async () => analysis(`${label} found one usability issue.`),
      );
      const unrelated = adapter(
        provider === 'codex-cli' ? 'claude-cli' : 'codex-cli',
        'Unrelated provider',
        'cli',
        async () => { throw new Error('must not run'); },
      );

      const result = await processSession(sessionFixture, {
        settingsManager: settings(provider, { [provider]: model }),
        dependencies: dependencies([selected, unrelated]),
      });

      expect(selected.analyze).toHaveBeenCalledWith(sessionFixture, model);
      expect(unrelated.analyze).not.toHaveBeenCalled();
      expect(result.document.content).toContain(`${label} found one usability issue.`);
      expect(result.document.content).toContain(`${label} (${model})`);
      expect(result.pipelineOutput).toMatchObject({
        aiEnhanced: true,
        provider,
        requestedProvider: provider,
        requestedModel: model,
        actualProvider: provider,
        actualModel: model,
        connection,
        providerLabel: label,
      });
    },
  );

  it('uses the Anthropic API adapter only when selected', async () => {
    const anthropic = adapter(
      'anthropic-api',
      'Anthropic API',
      'cloud',
      async () => analysis('Anthropic found one issue.'),
    );
    const result = await processSession(sessionFixture, {
      settingsManager: settings('anthropic-api', {
        'anthropic-api': 'claude-sonnet-custom',
      }),
      dependencies: dependencies([anthropic]),
    });

    expect(anthropic.analyze).toHaveBeenCalledWith(sessionFixture, 'claude-sonnet-custom');
    expect(result.pipelineOutput).toMatchObject({
      requestedProvider: 'anthropic-api',
      actualProvider: 'anthropic-api',
      connection: 'cloud',
    });
  });

  it('returns local rules without constructing a provider registry', async () => {
    const createProviderRegistry = vi.fn(() => new AnalysisProviderRegistry([]));
    const result = await processSession(sessionFixture, {
      settingsManager: settings('rules'),
      dependencies: { createProviderRegistry },
    });

    expect(createProviderRegistry).not.toHaveBeenCalled();
    expect(result.pipelineOutput).toMatchObject({
      aiEnhanced: false,
      tier: 'free',
      provider: 'rules',
      requestedProvider: 'rules',
      requestedModel: null,
      actualProvider: 'rules',
      actualModel: null,
      connection: 'local',
    });
    expect(result.pipelineOutput.fallbackReason).toBeUndefined();
  });

  it('falls back visibly to Local Rules without invoking another AI provider', async () => {
    const ollama = adapter(
      'ollama',
      'Ollama',
      'local',
      async () => { throw new Error('Ollama unavailable\n> injected\u0000'); },
    );
    const codex = adapter(
      'codex-cli',
      'Codex CLI',
      'cli',
      async () => analysis('must not run'),
    );

    const result = await processSession(sessionFixture, {
      settingsManager: settings('ollama', { ollama: 'qwen2.5:7b' }),
      dependencies: dependencies([ollama, codex]),
    });

    expect(codex.analyze).not.toHaveBeenCalled();
    expect(result.pipelineOutput).toMatchObject({
      aiEnhanced: false,
      provider: 'ollama',
      requestedProvider: 'ollama',
      requestedModel: 'qwen2.5:7b',
      actualProvider: 'rules',
      actualModel: null,
      connection: 'local',
      fallbackReason: 'Ollama unavailable > injected',
    });
    expect(result.document.content).toContain('AI analysis unavailable; Local Rules used');
    expect(result.document.content).toContain('Ollama unavailable &gt; injected');
    expect(result.document.content).not.toContain('\u0000');
  });
});
