import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { contextBridge, ipcRenderer } from 'electron';
import type {
  AnalysisModelOption,
  AnalysisProvider,
  AnalysisProviderStatus,
  ModelAnalysisProvider,
} from '../../src/shared/types';

interface ExposedAnalysisProvidersApi {
  discover(forceRefresh?: boolean): Promise<AnalysisProviderStatus[]>;
  test(provider: AnalysisProvider): Promise<AnalysisProviderStatus>;
  models(provider: ModelAnalysisProvider, forceRefresh?: boolean): Promise<AnalysisModelOption[]>;
}

let analysisProviders: ExposedAnalysisProvidersApi;

describe('analysis provider preload bridge', () => {
  beforeAll(async () => {
    vi.resetModules();
    await import('../../src/preload/index');
    const exposure = vi.mocked(contextBridge.exposeInMainWorld).mock.calls.find(([name]) => name === 'markupr');
    if (!exposure) throw new Error('markupr preload API was not exposed');
    analysisProviders = (exposure[1] as { analysisProviders: ExposedAnalysisProvidersApi }).analysisProviders;
  });

  beforeEach(() => {
    vi.mocked(ipcRenderer.invoke).mockReset();
  });

  it('discovers providers through the fixed discovery channel', async () => {
    const statuses: AnalysisProviderStatus[] = [{
      id: 'codex-cli',
      name: 'Codex CLI',
      installed: true,
      ready: true,
    }];
    vi.mocked(ipcRenderer.invoke).mockResolvedValue(statuses);

    await expect(analysisProviders.discover(true)).resolves.toEqual(statuses);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('markupr:analysis-providers:discover', true);
  });

  it('tests a validated provider through the fixed test channel', async () => {
    const status: AnalysisProviderStatus = {
      id: 'codex-cli',
      name: 'Codex CLI',
      installed: true,
      ready: true,
    };
    vi.mocked(ipcRenderer.invoke).mockResolvedValue(status);

    await expect(analysisProviders.test('codex-cli')).resolves.toEqual(status);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('markupr:analysis-provider:test', 'codex-cli');
  });

  it('lists models through the narrow provider-model channel', async () => {
    const models: AnalysisModelOption[] = [
      { id: 'qwen2.5:7b', name: 'qwen2.5:7b', source: 'discovered' },
    ];
    vi.mocked(ipcRenderer.invoke).mockResolvedValue(models);

    await expect(analysisProviders.models('ollama', true)).resolves.toEqual(models);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      'markupr:analysis-provider:models',
      'ollama',
      true,
    );
  });
});
