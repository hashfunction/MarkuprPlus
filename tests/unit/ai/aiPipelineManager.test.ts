import { describe, expect, it } from 'vitest';
import type { Session } from '../../../src/main/SessionController';
import type { ISettingsManager } from '../../../src/main/settings/SettingsManager';
import type { AnalysisProvider, AppSettings } from '../../../src/shared/types';
import type { AIAnalysisResult } from '../../../src/main/ai/types';
import { processSession, type PipelineDependencies } from '../../../src/main/ai/AIPipelineManager';

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

function settings(provider: AnalysisProvider, anthropicKey: string | null = null): ISettingsManager {
  return {
    get: ((key: keyof AppSettings) => key === 'analysisProvider' ? provider : undefined) as ISettingsManager['get'],
    set: () => undefined,
    getAll: () => ({ analysisProvider: provider } as AppSettings),
    reset: () => undefined,
    getApiKey: async (service: string) => service === 'anthropic' ? anthropicKey : null,
    setApiKey: async () => undefined,
    deleteApiKey: async () => undefined,
    hasApiKey: async (service: string) => service === 'anthropic' && Boolean(anthropicKey),
    onChange: () => () => undefined,
    migrate: () => undefined,
    registerIpcHandlers: () => undefined,
  };
}

function dependencies(overrides: Partial<PipelineDependencies>): PipelineDependencies {
  return {
    createCodexAnalyzer: () => ({
      analyze: async () => { throw new Error('Codex adapter must not be selected'); },
    }),
    createClaudeAnalyzer: () => ({
      analyze: async () => { throw new Error('Anthropic adapter must not be selected'); },
    }),
    ...overrides,
  };
}

describe('AIPipelineManager provider routing', () => {
  it('uses Codex output and attribution when Codex is selected', async () => {
    const result = await processSession(sessionFixture, {
      settingsManager: settings('codex', 'unused-anthropic-key'),
      dependencies: dependencies({
        createCodexAnalyzer: () => ({ analyze: async () => analysis('Codex found one usability issue.') }),
      }),
    });

    expect(result.document.content).toContain('Codex found one usability issue.');
    expect(result.document.content).toContain('AI-analyzed by Codex CLI');
    expect(result.pipelineOutput).toMatchObject({
      aiEnhanced: true,
      tier: 'byok',
      provider: 'codex',
      providerLabel: 'Codex CLI',
    });
  });

  it('uses Anthropic only when Anthropic is selected and has a key', async () => {
    const result = await processSession(sessionFixture, {
      settingsManager: settings('anthropic', 'anthropic-key'),
      dependencies: dependencies({
        createClaudeAnalyzer: (apiKey) => {
          if (apiKey !== 'anthropic-key') throw new Error('Wrong Anthropic key');
          return { analyze: async () => analysis('Anthropic found one usability issue.') };
        },
      }),
    });

    expect(result.document.content).toContain('Anthropic found one usability issue.');
    expect(result.document.content).toContain('AI-analyzed by Claude');
    expect(result.pipelineOutput.provider).toBe('anthropic');
  });

  it('returns local rules without constructing an external analyzer', async () => {
    const result = await processSession(sessionFixture, {
      settingsManager: settings('rules', 'unused-anthropic-key'),
      dependencies: dependencies({}),
    });

    expect(result.pipelineOutput).toMatchObject({
      aiEnhanced: false,
      tier: 'free',
      provider: 'rules',
    });
    expect(result.pipelineOutput.fallbackReason).toBeUndefined();
  });

  it('falls back to local rules after Codex failure without invoking Anthropic', async () => {
    const result = await processSession(sessionFixture, {
      settingsManager: settings('codex', 'must-not-be-used'),
      dependencies: dependencies({
        createCodexAnalyzer: () => ({
          analyze: async () => { throw new Error('Codex CLI is logged out'); },
        }),
      }),
    });

    expect(result.pipelineOutput).toMatchObject({
      aiEnhanced: false,
      tier: 'byok',
      provider: 'codex',
      fallbackReason: 'Codex CLI is logged out',
    });
    expect(result.document.content).not.toContain('Anthropic found');
  });

  it('falls back to local rules when Anthropic is selected without a key', async () => {
    const result = await processSession(sessionFixture, {
      settingsManager: settings('anthropic'),
      dependencies: dependencies({}),
    });

    expect(result.pipelineOutput).toMatchObject({
      aiEnhanced: false,
      tier: 'byok',
      provider: 'anthropic',
      fallbackReason: 'Anthropic API key is not configured',
    });
  });
});
