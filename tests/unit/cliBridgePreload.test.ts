import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { contextBridge, ipcRenderer } from 'electron';
import type { CliBridgeConnectionStatus, CliBridgePairResult } from '../../src/shared/types';

interface ExposedCliBridgeApi {
  status(): Promise<CliBridgeConnectionStatus>;
  pair(token: string): Promise<CliBridgePairResult>;
  forget(): Promise<CliBridgeConnectionStatus>;
}

let cliBridge: ExposedCliBridgeApi;

describe('CLI bridge preload API', () => {
  beforeAll(async () => {
    vi.resetModules();
    await import('../../src/preload/index');
    const exposure = vi.mocked(contextBridge.exposeInMainWorld).mock.calls.find(([name]) => name === 'markuprx');
    if (!exposure) throw new Error('markuprx preload API was not exposed');
    cliBridge = (exposure[1] as { cliBridge: ExposedCliBridgeApi }).cliBridge;
  });

  beforeEach(() => {
    vi.mocked(ipcRenderer.invoke).mockReset();
  });

  it('gets connection status without accepting a token', async () => {
    const status: CliBridgeConnectionStatus = { state: 'connected', paired: true, providers: [] };
    vi.mocked(ipcRenderer.invoke).mockResolvedValue(status);

    await expect(cliBridge.status()).resolves.toEqual(status);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('markuprx:cli-bridge:status');
  });

  it('submits a candidate token through only the pairing channel', async () => {
    const result: CliBridgePairResult = {
      success: true,
      status: { state: 'connected', paired: true, providers: [] },
    };
    vi.mocked(ipcRenderer.invoke).mockResolvedValue(result);

    await expect(cliBridge.pair('candidate')).resolves.toEqual(result);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('markuprx:cli-bridge:pair', 'candidate');
  });

  it('forgets the connection without naming or retrieving its secure-storage key', async () => {
    const status: CliBridgeConnectionStatus = { state: 'not-paired', paired: false };
    vi.mocked(ipcRenderer.invoke).mockResolvedValue(status);

    await expect(cliBridge.forget()).resolves.toEqual(status);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('markuprx:cli-bridge:forget');
  });
});
