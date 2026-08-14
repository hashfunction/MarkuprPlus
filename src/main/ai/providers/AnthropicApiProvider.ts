import type { ISettingsManager } from '../../settings/SettingsManager';
import type { Session } from '../../SessionController';
import { ClaudeAnalyzer } from '../ClaudeAnalyzer';
import {
  DEFAULT_CLAUDE_ANALYZER_OPTIONS,
  type AIAnalysisResult,
} from '../types';
import type { AnalysisProviderAdapter } from './types';

interface AnthropicAnalyzer {
  analyze(session: Session): Promise<AIAnalysisResult | null>;
}

export interface AnthropicApiProviderDependencies {
  createAnalyzer(apiKey: string, modelId: string): AnthropicAnalyzer;
}

export type AnthropicApiProviderErrorCode = 'NOT_AUTHENTICATED';

export class AnthropicApiProviderError extends Error {
  constructor(
    message: string,
    public readonly code: AnthropicApiProviderErrorCode,
  ) {
    super(message);
    this.name = 'AnthropicApiProviderError';
  }
}

const DEFAULT_DEPENDENCIES: AnthropicApiProviderDependencies = {
  createAnalyzer: (apiKey, modelId) => new ClaudeAnalyzer(apiKey, { model: modelId }),
};

export class AnthropicApiProvider implements AnalysisProviderAdapter {
  readonly id = 'anthropic-api' as const;
  readonly name = 'Anthropic API';
  readonly connection = 'cloud' as const;

  constructor(
    private readonly settingsManager: ISettingsManager,
    private readonly dependencies: AnthropicApiProviderDependencies = DEFAULT_DEPENDENCIES,
  ) {}

  async discover() {
    const authenticated = await this.settingsManager.hasApiKey('anthropic');
    return {
      id: this.id,
      name: this.name,
      connection: this.connection,
      installed: true,
      authenticated,
      ready: authenticated,
      models: [{ id: '', name: 'Anthropic default', source: 'default' as const }],
      ...(!authenticated
        ? { diagnostic: 'Anthropic API key is not configured.' }
        : {}),
    };
  }

  async analyze(session: Session, modelId?: string): Promise<AIAnalysisResult | null> {
    const apiKey = await this.settingsManager.getApiKey('anthropic');
    if (!apiKey) {
      throw new AnthropicApiProviderError(
        'Anthropic API key is not configured.',
        'NOT_AUTHENTICATED',
      );
    }

    const selectedModel = modelId?.trim() || DEFAULT_CLAUDE_ANALYZER_OPTIONS.model;
    return this.dependencies.createAnalyzer(apiKey, selectedModel).analyze(session);
  }
}
