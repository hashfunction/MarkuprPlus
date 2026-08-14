import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { contextBridge, ipcRenderer } from 'electron';
import type { AnalysisProviderStatus } from '../../src/shared/types';

interface ExposedAnalysisProvidersApi {
  discover(forceRefresh?: boolean): Promise<AnalysisProviderStatus[]>;
  test(provider: 'codex-cli'): Promise<AnalysisProviderStatus>;
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

  it('tests only Codex through the fixed test channel', async () => {
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
});
