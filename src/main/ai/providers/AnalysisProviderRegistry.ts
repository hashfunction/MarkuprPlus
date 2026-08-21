import type { AnalysisProvider } from '../../../shared/types';
import type { Session } from '../../SessionController';
import { CodexAnalyzer } from '../CodexAnalyzer';
import { codexCliDiscovery } from '../CodexCliDiscovery';
import type { AIAnalysisResult } from '../types';
import { ClaudeCliAnalyzer } from './ClaudeCliAnalyzer';
import { claudeCliDiscovery } from './ClaudeCliDiscovery';
import { LmStudioProvider } from './LmStudioProvider';
import { OllamaProvider } from './OllamaProvider';
import type {
  AdapterAnalysisProvider,
  AnalysisProviderAdapter,
} from './types';
import type { ISettingsManager } from '../../settings/SettingsManager';
import { AnthropicApiProvider } from './AnthropicApiProvider';
import { currentDistributionCapabilities } from '../../../shared/distribution';

export class AnalysisProviderRegistry {
  private readonly adapters: AnalysisProviderAdapter[];
  private readonly adaptersById = new Map<AdapterAnalysisProvider, AnalysisProviderAdapter>();

  constructor(adapters: AnalysisProviderAdapter[]) {
    this.adapters = [...adapters];
    for (const adapter of this.adapters) {
      if (this.adaptersById.has(adapter.id)) {
        throw new Error(`Duplicate analysis provider: ${adapter.id}`);
      }
      this.adaptersById.set(adapter.id, adapter);
    }
  }

  get(provider: AnalysisProvider): AnalysisProviderAdapter {
    const adapter = this.adaptersById.get(provider as AdapterAnalysisProvider);
    if (!adapter) {
      throw new Error(`Unsupported analysis provider: ${provider}`);
    }
    return adapter;
  }

  async discoverAll(forceRefresh = false) {
    return Promise.all(
      this.adapters.map((adapter) => adapter.discover(forceRefresh)),
    );
  }

  analyze(
    provider: AnalysisProvider,
    session: Session,
    modelId?: string,
  ): Promise<AIAnalysisResult | null> {
    return this.get(provider).analyze(session, modelId);
  }
}

export function createAnalysisProviderRegistry(
  adapters: AnalysisProviderAdapter[],
): AnalysisProviderRegistry {
  return new AnalysisProviderRegistry(adapters);
}

export function createCliAnalysisProviderRegistry(): AnalysisProviderRegistry {
  const codexAnalyzer = new CodexAnalyzer();
  const claudeAnalyzer = new ClaudeCliAnalyzer();
  return new AnalysisProviderRegistry([
    {
      id: 'codex-cli',
      name: 'Codex CLI',
      connection: 'cli',
      discover: (forceRefresh) => codexCliDiscovery.discover(forceRefresh),
      analyze: (session, modelId) => codexAnalyzer.analyze(session, modelId),
    },
    {
      id: 'claude-cli',
      name: 'Claude Code CLI',
      connection: 'cli',
      discover: (forceRefresh) => claudeCliDiscovery.discover(forceRefresh),
      analyze: (session, modelId) => claudeAnalyzer.analyze(session, modelId),
    },
  ]);
}

export function createLocalAnalysisProviderRegistry(): AnalysisProviderRegistry {
  return new AnalysisProviderRegistry([
    new OllamaProvider(),
    new LmStudioProvider(),
  ]);
}

export function createDefaultAnalysisProviderRegistry(
  settingsManager: ISettingsManager,
  allowCliProviders = currentDistributionCapabilities().externalCliProviders,
): AnalysisProviderRegistry {
  const codexAnalyzer = new CodexAnalyzer();
  const claudeAnalyzer = new ClaudeCliAnalyzer();
  const cliAdapters: AnalysisProviderAdapter[] = allowCliProviders ? [
    {
      id: 'codex-cli',
      name: 'Codex CLI',
      connection: 'cli',
      discover: (forceRefresh) => codexCliDiscovery.discover(forceRefresh),
      analyze: (session, modelId) => codexAnalyzer.analyze(session, modelId),
    },
    {
      id: 'claude-cli',
      name: 'Claude Code CLI',
      connection: 'cli',
      discover: (forceRefresh) => claudeCliDiscovery.discover(forceRefresh),
      analyze: (session, modelId) => claudeAnalyzer.analyze(session, modelId),
    },
  ] : [];
  return new AnalysisProviderRegistry([
    ...cliAdapters,
    new OllamaProvider(),
    new LmStudioProvider(),
    new AnthropicApiProvider(settingsManager),
  ]);
}
