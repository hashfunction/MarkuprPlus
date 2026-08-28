import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import type { IpcContext } from '../../src/main/ipc/types';
import type {
  AnalysisModelSelections,
  AnalysisProvider,
  AnalysisProviderStatus,
} from '../../src/shared/types';
import { IPC_CHANNELS } from '../../src/shared/types';
import { registerAnalysisProviderHandlers } from '../../src/main/ipc/analysisProviderHandlers';
import { AnalysisProviderRegistry } from '../../src/main/ai/providers/AnalysisProviderRegistry';
import type { AnalysisProviderAdapter } from '../../src/main/ai/providers/types';

const providerIds = [
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
] as const;

function adapter(
  id: typeof providerIds[number],
  models = [{ id: `${id}-model`, name: `${id} model`, source: 'discovered' as const }],
) {
  const connection = id === 'anthropic-api' ? 'cloud' : id.endsWith('-cli') ? 'cli' : 'local';
  const discover = vi.fn(async (): Promise<AnalysisProviderStatus> => ({
    id,
    name: id,
    connection,
    installed: true,
    authenticated: true,
    ready: true,
    models,
  }));
  return {
    id,
    name: id,
    connection,
    discover,
    analyze: vi.fn(async () => null),
  } satisfies AnalysisProviderAdapter;
}

function context(models: AnalysisModelSelections = {}): IpcContext {
  return {
    getMainWindow: () => null,
    getPopover: () => null,
    getSettingsManager: () => ({
      get: (key: string) => key === 'analysisModelsByProvider' ? models : undefined,
    } as never),
    getWindowsTaskbar: () => null,
    getHasCompletedOnboarding: () => true,
    setHasCompletedOnboarding: () => undefined,
  };
}

function registeredHandler(channel: string): (...args: unknown[]) => unknown {
  const registration = vi.mocked(ipcMain.handle).mock.calls.find(([registered]) => registered === channel);
  if (!registration) throw new Error(`Handler not registered for ${channel}`);
  return registration[1] as (...args: unknown[]) => unknown;
}

function register(models: AnalysisModelSelections = {}) {
  const adapters = providerIds.map((id) => adapter(id));
  const registry = new AnalysisProviderRegistry(adapters);
  registerAnalysisProviderHandlers(context(models), {
    createProviderRegistry: () => registry,
  });
  return adapters;
}

describe('analysis provider IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all providers in fixed UI order and requires a selected local model', async () => {
    register({ ollama: 'ollama-model' });

    const handler = registeredHandler(IPC_CHANNELS.ANALYSIS_PROVIDERS_DISCOVER);
    const statuses = await handler({}, false) as AnalysisProviderStatus[];

    expect(statuses.map(({ id }) => id)).toEqual([
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
    expect(statuses.find(({ id }) => id === 'ollama')).toMatchObject({ ready: true });
    expect(statuses.find(({ id }) => id === 'lmstudio')).toMatchObject({
      ready: false,
      diagnostic: 'Select an installed LM Studio model.',
    });
    expect(statuses.at(-1)).toEqual({
      id: 'rules',
      name: 'Local Rules',
      connection: 'local',
      installed: true,
      authenticated: true,
      ready: true,
      models: [],
    });
  });

  it.each<AnalysisProvider>([
    'rules',
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
  ])('tests the normalized %s provider', async (provider) => {
    const adapters = register({ ollama: 'ollama-model', lmstudio: 'lmstudio-model' });
    const handler = registeredHandler(IPC_CHANNELS.ANALYSIS_PROVIDER_TEST);

    await expect(handler({}, provider)).resolves.toMatchObject({ id: provider });
    if (provider !== 'rules') {
      const selected = adapters.find(({ id }) => id === provider);
      expect(selected?.discover).toHaveBeenCalledWith(true);
    }
  });

  it('rejects unknown and legacy provider IDs', async () => {
    register();
    const handler = registeredHandler(IPC_CHANNELS.ANALYSIS_PROVIDER_TEST);

    await expect(handler({}, 'codex')).rejects.toThrow('Unsupported analysis provider');
    await expect(handler({}, 'unknown')).rejects.toThrow('Unsupported analysis provider');
  });

  it('lists models from only the named model provider', async () => {
    const adapters = register();
    const handler = registeredHandler(IPC_CHANNELS.ANALYSIS_PROVIDER_MODELS);

    await expect(handler({}, 'ollama', true)).resolves.toEqual([
      { id: 'ollama-model', name: 'ollama model', source: 'discovered' },
    ]);
    expect(adapters.find(({ id }) => id === 'ollama')?.discover).toHaveBeenCalledWith(true);
    expect(adapters.find(({ id }) => id === 'codex-cli')?.discover).not.toHaveBeenCalled();
    await expect(handler({}, 'rules', false)).rejects.toThrow('Provider does not expose report models');
  });
});
