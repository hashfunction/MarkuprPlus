import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../../../src/main/SessionController';
import {
  CliBridgeClient,
  CliBridgeClientError,
} from '../../../src/main/ai/bridge/CliBridgeClient';

const session: Session = {
  id: 'client-session',
  startTime: 1_700_000_000_000,
  state: 'complete',
  sourceId: 'screen:0:0',
  feedbackItems: [],
  transcriptBuffer: [{
    text: 'The button is clipped.',
    isFinal: true,
    confidence: 0.9,
    timestamp: 1_700_000_001,
    tier: 'whisper',
  }],
  screenshotBuffer: [],
  metadata: {
    sourceId: 'screen:0:0',
    sourceName: 'Browser',
    recordingPath: '/private/session.webm',
  },
};

const providerStatus = {
  id: 'codex-cli',
  name: 'Codex CLI',
  connection: 'cli' as const,
  installed: true,
  authenticated: true,
  ready: true,
  models: [{ id: '', name: 'Codex default', source: 'default' as const }],
};

const analysis = {
  summary: 'One issue.',
  items: [],
  themes: [],
  positiveNotes: [],
  metadata: { totalItems: 0, criticalCount: 0, highCount: 0 },
};

describe('CliBridgeClient', () => {
  it('does not issue authenticated requests without a paired token', async () => {
    const fetchFn = vi.fn();
    const client = new CliBridgeClient({
      getToken: async () => null,
      fetchFn,
    });

    await expect(client.discoverProviders()).rejects.toMatchObject({
      code: 'BRIDGE_NOT_PAIRED',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('authenticates discovery, caches it, and bypasses cache for refresh', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({
      protocolVersion: 1,
      providers: [providerStatus],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const client = new CliBridgeClient({
      getToken: async () => 'j'.repeat(43),
      fetchFn,
      baseUrl: 'http://127.0.0.1:49647',
    });

    await expect(client.discoverProviders()).resolves.toEqual([providerStatus]);
    await expect(client.discoverProviders()).resolves.toEqual([providerStatus]);
    await expect(client.discoverProviders(true)).resolves.toEqual([providerStatus]);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const [url, options] = fetchFn.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:49647/v1/providers?force=false');
    expect(options?.headers).toMatchObject({ Authorization: `Bearer ${'j'.repeat(43)}` });
  });

  it('enforces discovery timeouts and reports incompatible protocol versions', async () => {
    const stalled = new CliBridgeClient({
      getToken: async () => 'k'.repeat(43),
      discoveryTimeoutMs: 10,
      fetchFn: vi.fn((_url, options) => new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      })),
    });
    await expect(stalled.discoverProviders()).rejects.toMatchObject({ code: 'BRIDGE_OFFLINE' });

    const incompatible = new CliBridgeClient({
      getToken: async () => 'k'.repeat(43),
      fetchFn: vi.fn(async () => new Response(JSON.stringify({
        protocolVersion: 2,
        providers: [],
      }), { status: 200 })),
    });
    await expect(incompatible.discoverProviders()).rejects.toMatchObject({
      code: 'BRIDGE_INCOMPATIBLE',
    });
  });

  it('maps authenticated errors and malformed responses without leaking bodies', async () => {
    const denied = new CliBridgeClient({
      getToken: async () => 'l'.repeat(43),
      fetchFn: vi.fn(async () => new Response(JSON.stringify({
        error: { code: 'AUTH_INVALID', message: 'Bridge authentication failed.' },
      }), { status: 401 })),
    });
    await expect(denied.discoverProviders()).rejects.toEqual(expect.objectContaining({
      code: 'AUTH_INVALID',
      status: 401,
    }));

    const malformed = new CliBridgeClient({
      getToken: async () => 'l'.repeat(43),
      fetchFn: vi.fn(async () => new Response('<html>secret response</html>', { status: 200 })),
    });
    await expect(malformed.discoverProviders()).rejects.toEqual(expect.objectContaining({
      code: 'BRIDGE_PROTOCOL_ERROR',
      message: expect.not.stringContaining('secret response'),
    }));
  });

  it('sends a path-free analysis request and returns typed analysis', async () => {
    let body = '';
    const client = new CliBridgeClient({
      getToken: async () => 'm'.repeat(43),
      fetchFn: vi.fn(async (_url, options) => {
        body = String(options?.body);
        return new Response(JSON.stringify({ protocolVersion: 1, analysis }), { status: 200 });
      }),
    });

    await expect(client.analyze('codex-cli', session, 'gpt-5.6')).resolves.toEqual(analysis);
    expect(body).not.toContain('/private/session.webm');
    expect(JSON.parse(body)).toMatchObject({
      protocolVersion: 1,
      provider: 'codex-cli',
      modelId: 'gpt-5.6',
      session: { id: 'client-session', metadata: { sourceName: 'Browser' } },
    });
  });

  it('uses a candidate token without persisting it during pairing validation', async () => {
    const getToken = vi.fn(async () => null);
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({
      protocolVersion: 1,
      providers: [providerStatus],
    }), { status: 200 }));
    const client = new CliBridgeClient({ getToken, fetchFn });

    await client.discoverProviders(true, 'n'.repeat(43));
    expect(getToken).not.toHaveBeenCalled();
    expect(fetchFn.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: `Bearer ${'n'.repeat(43)}`,
    });
  });

  it('uses a stable error class for bridge failures', () => {
    const error = new CliBridgeClientError('BRIDGE_OFFLINE', 'Bridge offline.');
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'CliBridgeClientError', code: 'BRIDGE_OFFLINE' });
  });
});
