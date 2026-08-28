import { ipcMain } from 'electron';
import {
  createDefaultAnalysisProviderRegistry,
  type AnalysisProviderRegistry,
} from '../ai/providers/AnalysisProviderRegistry';
import type { ISettingsManager } from '../settings/SettingsManager';
import {
  IPC_CHANNELS,
  isAnalysisProvider,
  type AnalysisModelOption,
  type AnalysisModelSelections,
  type AnalysisProvider,
  type AnalysisProviderStatus,
  type ModelAnalysisProvider,
} from '../../shared/types';
import type { IpcContext } from './types';

const PROVIDER_ORDER: AnalysisProvider[] = [
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
];

const MODEL_PROVIDERS = new Set<ModelAnalysisProvider>([
  'anthropic-api',
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
]);

const LOCAL_RULES_STATUS: AnalysisProviderStatus = {
  id: 'rules',
  name: 'Local Rules',
  connection: 'local',
  installed: true,
  authenticated: true,
  ready: true,
  models: [],
};

export interface AnalysisProviderHandlerDependencies {
  createProviderRegistry(settingsManager: ISettingsManager): AnalysisProviderRegistry;
}

const DEFAULT_DEPENDENCIES: AnalysisProviderHandlerDependencies = {
  createProviderRegistry: createDefaultAnalysisProviderRegistry,
};

function requireProvider(value: unknown): AnalysisProvider {
  if (!isAnalysisProvider(value)) {
    throw new Error('Unsupported analysis provider');
  }
  return value;
}

function requireModelProvider(value: unknown): ModelAnalysisProvider {
  const provider = requireProvider(value);
  if (!MODEL_PROVIDERS.has(provider as ModelAnalysisProvider)) {
    throw new Error('Provider does not expose report models');
  }
  return provider as ModelAnalysisProvider;
}

function applyLocalModelRequirement(
  status: AnalysisProviderStatus,
  selections: AnalysisModelSelections,
): AnalysisProviderStatus {
  if (status.id !== 'ollama' && status.id !== 'lmstudio') {
    return status;
  }

  const selectedModel = selections[status.id]?.trim();
  if (!selectedModel && status.ready) {
    const providerName = status.id === 'ollama' ? 'Ollama' : 'LM Studio';
    return {
      ...status,
      ready: false,
      diagnostic: `Select an installed ${providerName} model.`,
    };
  }
  return status;
}

function getSettingsManager(ctx: IpcContext): ISettingsManager {
  const settingsManager = ctx.getSettingsManager();
  if (!settingsManager) {
    throw new Error('Settings manager is unavailable');
  }
  return settingsManager;
}

export function registerAnalysisProviderHandlers(
  ctx: IpcContext,
  dependencies: AnalysisProviderHandlerDependencies = DEFAULT_DEPENDENCIES,
): void {
  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_PROVIDERS_DISCOVER,
    async (_, forceRefresh: unknown = false): Promise<AnalysisProviderStatus[]> => {
      const settingsManager = getSettingsManager(ctx);
      const registry = dependencies.createProviderRegistry(settingsManager);
      const discovered = await registry.discoverAll(forceRefresh === true);
      const selections = settingsManager.get('analysisModelsByProvider') || {};
      const statuses = [
        ...discovered.map((status) => applyLocalModelRequirement(status, selections)),
        LOCAL_RULES_STATUS,
      ];
      const byId = new Map(statuses.map((status) => [status.id, status]));
      return PROVIDER_ORDER.flatMap((provider) => {
        const status = byId.get(provider);
        return status ? [status] : [];
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_PROVIDER_TEST,
    async (_, providerValue: unknown): Promise<AnalysisProviderStatus> => {
      const provider = requireProvider(providerValue);
      if (provider === 'rules') {
        return LOCAL_RULES_STATUS;
      }

      const settingsManager = getSettingsManager(ctx);
      const status = await dependencies
        .createProviderRegistry(settingsManager)
        .get(provider)
        .discover(true);
      return applyLocalModelRequirement(
        status,
        settingsManager.get('analysisModelsByProvider') || {},
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.ANALYSIS_PROVIDER_MODELS,
    async (
      _,
      providerValue: unknown,
      forceRefresh: unknown = false,
    ): Promise<AnalysisModelOption[]> => {
      const provider = requireModelProvider(providerValue);
      const settingsManager = getSettingsManager(ctx);
      const status = await dependencies
        .createProviderRegistry(settingsManager)
        .get(provider)
        .discover(forceRefresh === true);
      return status.models || [];
    },
  );
}
