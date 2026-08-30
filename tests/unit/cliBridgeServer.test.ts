import { describe, expect, it, vi } from 'vitest';
import { request as httpRequest } from 'node:http';
import type { AIAnalysisResult } from '../../src/main/ai/types';
import {
  createAnalysisProviderRegistry,
} from '../../src/main/ai/providers/AnalysisProviderRegistry';
import type { AnalysisProviderAdapter } from '../../src/main/ai/providers/types';
import {
  generateBridgeToken,
  isAuthorized,
} from '../../src/bridge/BridgeAuth';
import { startCliBridgeServer } from '../../src/bridge/CliBridgeServer';

const token = 'a'.repeat(43);
const analysis: AIAnalysisResult = {
  summary: 'One issue found.',
  items: [],
  themes: [],
  positiveNotes: [],
  metadata: { totalItems: 0, criticalCount: 0, highCount: 0 },
};

function codexAdapter(): AnalysisProviderAdapter {
  return {
    id: 'codex-cli',
    name: 'Codex CLI',
    connection: 'cli',
    discover: vi.fn(async () => ({
      id: 'codex-cli',
      name: 'Codex CLI',
      connection: 'cli' as const,
      installed: true,
      authenticated: true,
      ready: true,
      version: 'codex 1.2.3',
      executablePath: '/usr/local/bin/codex',
      models: [{ id: '', name: 'Codex default', source: 'default' as const }],
    })),
    analyze: vi.fn(async () => analysis),
  };
}

async function requestWithHost(
  origin: string,
  path: string,
  host: string,
  authorization: string,
): Promise<{ status: number; body: string }> {
  const url = new URL(path, origin);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'GET',
      headers: { Host: host, Authorization: authorization },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.on('error', reject);
    request.end();
  });
}

describe('CLI bridge server security and routing', () => {
  it('generates high-entropy tokens and requires exact bearer authentication', () => {
    const generated = generateBridgeToken();
    expect(generated).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(generated, 'base64url')).toHaveLength(32);
    expect(isAuthorized(`Bearer ${token}`, token)).toBe(true);
    expect(isAuthorized(`bearer ${token}`, token)).toBe(false);
    expect(isAuthorized(`Bearer ${token}x`, token)).toBe(false);
    expect(isAuthorized(undefined, token)).toBe(false);
  });

  it('exposes only health without authentication and sets defensive headers', async () => {
    const handle = await startCliBridgeServer({
      token,
      bridgeVersion: '3.1.0',
      registry: createAnalysisProviderRegistry([codexAdapter()]),
      port: 0,
    });
    try {
      const health = await fetch(`${handle.origin}/v1/health`);
      expect(health.status).toBe(200);
      expect(health.headers.get('cache-control')).toBe('no-store');
      expect(health.headers.get('access-control-allow-origin')).toBeNull();
      expect(await health.json()).toEqual({
        bridgeVersion: '3.1.0',
        protocolVersion: 1,
        pairingConfigured: true,
      });

      const providers = await fetch(`${handle.origin}/v1/providers`);
      expect(providers.status).toBe(401);
      expect(await providers.json()).toEqual({
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Bridge authentication is required.',
        },
      });
    } finally {
      await handle.close();
    }
  });

  it('rejects DNS-rebinding hosts, unsupported providers, paths, and methods', async () => {
    const handle = await startCliBridgeServer({
      token,
      bridgeVersion: '3.1.0',
      registry: createAnalysisProviderRegistry([codexAdapter()]),
      port: 0,
    });
    const auth = { Authorization: `Bearer ${token}` };
    try {
      const badHost = await requestWithHost(
        handle.origin,
        '/v1/providers',
        'attacker.example',
        `Bearer ${token}`,
      );
      expect(badHost.status).toBe(400);
      expect(badHost.body).not.toContain('attacker.example');

      const unsupported = await fetch(`${handle.origin}/v1/providers/ollama/models`, {
        headers: auth,
      });
      expect(unsupported.status).toBe(400);
      expect(await unsupported.json()).toMatchObject({
        error: { code: 'PROVIDER_UNSUPPORTED' },
      });

      const missing = await fetch(`${handle.origin}/v1/secret`, { headers: auth });
      expect(missing.status).toBe(404);
      expect(await missing.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });

      const method = await fetch(`${handle.origin}/v1/health`, { method: 'POST' });
      expect(method.status).toBe(405);
      expect(await method.json()).toMatchObject({ error: { code: 'METHOD_NOT_ALLOWED' } });
    } finally {
      await handle.close();
    }
  });

  it('discovers providers, forces one provider test, and lists models', async () => {
    const adapter = codexAdapter();
    const handle = await startCliBridgeServer({
      token,
      bridgeVersion: '3.1.0',
      registry: createAnalysisProviderRegistry([adapter]),
      port: 0,
    });
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const providers = await fetch(`${handle.origin}/v1/providers?force=true`, { headers });
      expect(providers.status).toBe(200);
      expect(await providers.json()).toMatchObject({
        protocolVersion: 1,
        providers: [{ id: 'codex-cli', ready: true }],
      });

      const tested = await fetch(`${handle.origin}/v1/providers/codex-cli/test`, {
        method: 'POST',
        headers,
      });
      expect(tested.status).toBe(200);
      expect(await tested.json()).toMatchObject({ id: 'codex-cli', ready: true });

      const models = await fetch(`${handle.origin}/v1/providers/codex-cli/models`, { headers });
      expect(models.status).toBe(200);
      expect(await models.json()).toEqual({
        protocolVersion: 1,
        models: [{ id: '', name: 'Codex default', source: 'default' }],
      });
      expect(adapter.discover).toHaveBeenCalledWith(true);
    } finally {
      await handle.close();
    }
  });
});
