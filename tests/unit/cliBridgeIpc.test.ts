import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import { registerCliBridgeHandlers } from '../../src/main/ipc/cliBridgeHandlers';
import { CliBridgeClientError } from '../../src/main/ai/bridge/CliBridgeClient';
import { IPC_CHANNELS, type AnalysisProviderStatus } from '../../src/shared/types';
import type { IpcContext } from '../../src/main/ipc/types';

const PROVIDERS: AnalysisProviderStatus[] = [{
  id: 'codex-cli',
  name: 'Codex CLI',
  connection: 'cli',
  installed: true,
  authenticated: true,
  ready: true,
}];

function registeredHandler(channel: string): (...args: unknown[]) => unknown {
  const registration = vi.mocked(ipcMain.handle).mock.calls.find(([name]) => name === channel);
  if (!registration) throw new Error(`Handler not registered for ${channel}`);
  return registration[1] as (...args: unknown[]) => unknown;
}

function setup(options: {
  distribution?: 'direct' | 'mas';
  token?: string | null;
  provider?: string;
  discover?: ReturnType<typeof vi.fn>;
} = {}) {
  const getApiKey = vi.fn(async () => options.token ?? null);
  const setApiKey = vi.fn(async () => undefined);
  const deleteApiKey = vi.fn(async () => undefined);
  const set = vi.fn();
  const get = vi.fn((key: string) => key === 'analysisProvider'
    ? options.provider ?? 'anthropic-api'
    : undefined);
  const discoverProviders = options.discover ?? vi.fn(async () => PROVIDERS);
  const context: IpcContext = {
    getMainWindow: () => null,
    getPopover: () => null,
    getSettingsManager: () => ({ getApiKey, setApiKey, deleteApiKey, set, get } as never),
    getWindowsTaskbar: () => null,
    getHasCompletedOnboarding: () => true,
    setHasCompletedOnboarding: () => undefined,
  };

  registerCliBridgeHandlers(context, {
    distribution: () => options.distribution ?? 'mas',
    createClient: () => ({ discoverProviders }),
  });
  return { getApiKey, setApiKey, deleteApiKey, set, get, discoverProviders };
}

describe('CLI bridge IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is not applicable in direct builds without reading secrets or contacting a bridge', async () => {
    const deps = setup({ distribution: 'direct' });

    await expect(registeredHandler(IPC_CHANNELS.CLI_BRIDGE_STATUS)({})).resolves.toEqual({
      state: 'not-applicable',
      paired: false,
      diagnostic: 'CLI providers run directly in this build.',
    });
    expect(deps.getApiKey).not.toHaveBeenCalled();
    expect(deps.discoverProviders).not.toHaveBeenCalled();
  });

  it('reports not paired without exposing or testing a saved token', async () => {
    const deps = setup({ token: null });

    await expect(registeredHandler(IPC_CHANNELS.CLI_BRIDGE_STATUS)({})).resolves.toEqual({
      state: 'not-paired',
      paired: false,
      diagnostic: 'Pair MarkuprPlus CLI Bridge.',
    });
    expect(deps.discoverProviders).not.toHaveBeenCalled();
  });

  it('reports connected provider status using the saved secret only in main', async () => {
    const deps = setup({ token: 'saved-secret' });

    await expect(registeredHandler(IPC_CHANNELS.CLI_BRIDGE_STATUS)({})).resolves.toEqual({
      state: 'connected',
      paired: true,
      providers: PROVIDERS,
    });
    expect(deps.discoverProviders).toHaveBeenCalledWith(false);
  });

  it('maps bridge connection failures to an actionable status', async () => {
    setup({
      token: 'saved-secret',
      discover: vi.fn(async () => {
        throw new CliBridgeClientError('BRIDGE_OFFLINE', 'Start MarkuprPlus CLI Bridge.');
      }),
    });

    await expect(registeredHandler(IPC_CHANNELS.CLI_BRIDGE_STATUS)({})).resolves.toEqual({
      state: 'offline',
      paired: true,
      diagnostic: 'Start MarkuprPlus CLI Bridge.',
    });
  });

  it('rejects malformed pairing tokens before contacting or changing anything', async () => {
    const deps = setup({ token: 'old-secret' });

    await expect(registeredHandler(IPC_CHANNELS.CLI_BRIDGE_PAIR)({}, 'bad token')).resolves.toEqual({
      success: false,
      status: {
        state: 'not-paired',
        paired: true,
        diagnostic: 'Enter the 43-character token printed by markuprplus bridge token.',
      },
    });
    expect(deps.discoverProviders).not.toHaveBeenCalled();
    expect(deps.setApiKey).not.toHaveBeenCalled();
    expect(deps.deleteApiKey).not.toHaveBeenCalled();
  });

  it('validates a candidate token before saving it', async () => {
    const deps = setup();
    const candidate = 'a'.repeat(43);

    await expect(registeredHandler(IPC_CHANNELS.CLI_BRIDGE_PAIR)({}, ` ${candidate} `)).resolves.toEqual({
      success: true,
      status: { state: 'connected', paired: true, providers: PROVIDERS },
    });
    expect(deps.discoverProviders).toHaveBeenCalledWith(true, candidate);
    expect(deps.setApiKey).toHaveBeenCalledWith('cli-bridge', candidate);
  });

  it('preserves the previous pairing when candidate validation fails', async () => {
    const deps = setup({
      token: 'old-secret',
      discover: vi.fn(async () => {
        throw new CliBridgeClientError('AUTH_INVALID', 'Pairing token was rejected.');
      }),
    });

    await expect(registeredHandler(IPC_CHANNELS.CLI_BRIDGE_PAIR)({}, 'a'.repeat(43))).resolves.toEqual({
      success: false,
      status: { state: 'not-paired', paired: true, diagnostic: 'Pairing token was rejected.' },
    });
    expect(deps.setApiKey).not.toHaveBeenCalled();
    expect(deps.deleteApiKey).not.toHaveBeenCalled();
  });

  it('forgets the secret and falls back to Local Rules when a CLI was selected', async () => {
    const deps = setup({ token: 'saved-secret', provider: 'codex-cli' });

    await expect(registeredHandler(IPC_CHANNELS.CLI_BRIDGE_FORGET)({})).resolves.toEqual({
      state: 'not-paired',
      paired: false,
      diagnostic: 'Pair MarkuprPlus CLI Bridge.',
    });
    expect(deps.deleteApiKey).toHaveBeenCalledWith('cli-bridge');
    expect(deps.set).toHaveBeenCalledWith('analysisProvider', 'rules');
  });
});
