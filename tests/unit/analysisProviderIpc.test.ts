import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import type { IpcContext } from '../../src/main/ipc/types';
import type { AnalysisProviderStatus } from '../../src/shared/types';
import { IPC_CHANNELS } from '../../src/shared/types';
import { registerAnalysisProviderHandlers } from '../../src/main/ipc/analysisProviderHandlers';

const codexStatus: AnalysisProviderStatus = {
  id: 'codex',
  name: 'Codex CLI',
  installed: true,
  executablePath: '/opt/homebrew/bin/codex',
  version: 'codex-cli 0.147.0',
  authenticated: true,
  ready: true,
};

function context(hasAnthropicKey: boolean): IpcContext {
  return {
    getMainWindow: () => null,
    getPopover: () => null,
    getSettingsManager: () => ({
      hasApiKey: async (service: string) => service === 'anthropic' && hasAnthropicKey,
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

describe('analysis provider IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns local, Anthropic, and discovered Codex readiness', async () => {
    registerAnalysisProviderHandlers(context(true), {
      discover: async () => codexStatus,
    });

    const handler = registeredHandler(IPC_CHANNELS.ANALYSIS_PROVIDERS_DISCOVER);
    const statuses = await handler({}, false) as AnalysisProviderStatus[];

    expect(statuses).toEqual([
      {
        id: 'rules',
        name: 'Local rules',
        installed: true,
        authenticated: true,
        ready: true,
      },
      {
        id: 'anthropic',
        name: 'Anthropic API',
        installed: true,
        authenticated: true,
        ready: true,
      },
      codexStatus,
    ]);
  });

  it('reports Anthropic as unavailable when its key is missing', async () => {
    registerAnalysisProviderHandlers(context(false), {
      discover: async () => codexStatus,
    });

    const handler = registeredHandler(IPC_CHANNELS.ANALYSIS_PROVIDERS_DISCOVER);
    const statuses = await handler({}, false) as AnalysisProviderStatus[];

    expect(statuses.find(({ id }) => id === 'anthropic')).toMatchObject({
      ready: false,
      diagnostic: 'Add an Anthropic API key to use Anthropic analysis.',
    });
  });

  it('forces a fresh Codex probe only for the fixed codex provider ID', async () => {
    let forcedRefresh = false;
    registerAnalysisProviderHandlers(context(false), {
      discover: async (force) => {
        forcedRefresh = force;
        return codexStatus;
      },
    });

    const handler = registeredHandler(IPC_CHANNELS.ANALYSIS_PROVIDER_TEST);
    await expect(handler({}, 'codex')).resolves.toEqual(codexStatus);
    expect(forcedRefresh).toBe(true);
    await expect(handler({}, 'anthropic')).rejects.toThrow('Unsupported analysis provider');
  });
});
