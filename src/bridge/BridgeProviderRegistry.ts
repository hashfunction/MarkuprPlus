import type { AnalysisProviderStatus } from '../shared/types';
import type { CliBridgeProvider } from '../shared/cliBridgeProtocol';
import { CodexAnalyzer } from '../main/ai/CodexAnalyzer';
import { codexCliDiscovery } from '../main/ai/CodexCliDiscovery';
import { ClaudeCliAnalyzer } from '../main/ai/providers/ClaudeCliAnalyzer';
import { claudeCliDiscovery } from '../main/ai/providers/ClaudeCliDiscovery';
import {
  CLI_PROVIDER_PROFILES,
  ProfiledCliProvider,
} from '../main/ai/providers/ProfiledCliProvider';
import type { AnalysisProviderAdapter } from '../main/ai/providers/types';

export interface BridgeProviderRegistry {
  discoverAll(forceRefresh?: boolean): Promise<AnalysisProviderStatus[]>;
  get(provider: CliBridgeProvider): AnalysisProviderAdapter;
}

export function createBridgeProviderRegistry(): BridgeProviderRegistry {
  const codexAnalyzer = new CodexAnalyzer();
  const claudeAnalyzer = new ClaudeCliAnalyzer();
  const adapters: AnalysisProviderAdapter[] = [
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
    ...CLI_PROVIDER_PROFILES.map((profile) => new ProfiledCliProvider(profile)),
  ];
  const byId = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  return {
    discoverAll: (forceRefresh = false) => Promise.all(
      adapters.map((adapter) => adapter.discover(forceRefresh)),
    ),
    get(provider) {
      const adapter = byId.get(provider);
      if (!adapter) throw new Error(`Unsupported analysis provider: ${provider}`);
      return adapter;
    },
  };
}
