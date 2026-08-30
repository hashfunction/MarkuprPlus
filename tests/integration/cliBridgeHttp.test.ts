import { describe, expect, it, vi } from 'vitest';
import type { AIAnalysisResult } from '../../src/main/ai/types';
import { createAnalysisProviderRegistry } from '../../src/main/ai/providers/AnalysisProviderRegistry';
import type { AnalysisProviderAdapter } from '../../src/main/ai/providers/types';
import { startCliBridgeServer } from '../../src/bridge/CliBridgeServer';

const token = 'b'.repeat(43);
const session = {
  id: 'session-1',
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
  screenshots: [],
  metadata: { sourceId: 'screen:0:0', sourceName: 'Browser', sourceType: 'screen' },
} as const;

const result: AIAnalysisResult = {
  summary: 'The primary action is clipped.',
  items: [],
  themes: ['Layout'],
  positiveNotes: [],
  metadata: { totalItems: 0, criticalCount: 0, highCount: 0 },
};

function adapter(analyze: AnalysisProviderAdapter['analyze']): AnalysisProviderAdapter {
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
      models: [],
    })),
    analyze,
  };
}

function analyzeBody() {
  return JSON.stringify({
    protocolVersion: 1,
    provider: 'codex-cli',
    session,
  });
}

describe('CLI bridge real HTTP behavior', () => {
  it('returns an analysis result through a real loopback request', async () => {
    const handle = await startCliBridgeServer({
      token,
      bridgeVersion: '3.1.0',
      registry: createAnalysisProviderRegistry([adapter(async () => result)]),
      port: 0,
    });
    try {
      const response = await fetch(`${handle.origin}/v1/analyze`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: analyzeBody(),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ protocolVersion: 1, analysis: result });
    } finally {
      await handle.close();
    }
  });

  it('rejects a second analysis while one is active', async () => {
    let release!: (value: AIAnalysisResult) => void;
    let started!: () => void;
    const didStart = new Promise<void>((resolve) => { started = resolve; });
    const pending = new Promise<AIAnalysisResult>((resolve) => { release = resolve; });
    const handle = await startCliBridgeServer({
      token,
      bridgeVersion: '3.1.0',
      registry: createAnalysisProviderRegistry([adapter(async () => {
        started();
        return pending;
      })]),
      port: 0,
    });
    const options = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: analyzeBody(),
    };
    try {
      const first = fetch(`${handle.origin}/v1/analyze`, options);
      await didStart;
      const second = await fetch(`${handle.origin}/v1/analyze`, options);
      expect(second.status).toBe(429);
      expect(await second.json()).toMatchObject({ error: { code: 'BRIDGE_BUSY' } });
      release(result);
      expect((await first).status).toBe(200);
    } finally {
      release(result);
      await handle.close();
    }
  });

  it('times out stalled analysis and sanitizes provider failures', async () => {
    const timeoutHandle = await startCliBridgeServer({
      token,
      bridgeVersion: '3.1.0',
      registry: createAnalysisProviderRegistry([adapter(async () => new Promise(() => {}))]),
      analysisTimeoutMs: 20,
      port: 0,
    });
    try {
      const response = await fetch(`${timeoutHandle.origin}/v1/analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: analyzeBody(),
      });
      expect(response.status).toBe(504);
      expect(await response.json()).toMatchObject({ error: { code: 'ANALYSIS_TIMEOUT' } });
    } finally {
      await timeoutHandle.close();
    }

    const secret = 'sk-proj-abcdefghijklmnopqrstuvwxyz123456';
    const failureHandle = await startCliBridgeServer({
      token,
      bridgeVersion: '3.1.0',
      registry: createAnalysisProviderRegistry([adapter(async () => {
        throw new Error(`Provider rejected api_key=${secret}`);
      })]),
      port: 0,
    });
    try {
      const response = await fetch(`${failureHandle.origin}/v1/analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: analyzeBody(),
      });
      const text = await response.text();
      expect(response.status).toBe(502);
      expect(text).toContain('[redacted]');
      expect(text).not.toContain(secret);
      expect(text).not.toContain('at ');
    } finally {
      await failureHandle.close();
    }
  });

  it('stops buffering oversized bodies', async () => {
    const handle = await startCliBridgeServer({
      token,
      bridgeVersion: '3.1.0',
      registry: createAnalysisProviderRegistry([adapter(async () => result)]),
      maxBodyBytes: 64,
      port: 0,
    });
    try {
      const response = await fetch(`${handle.origin}/v1/analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 'x'.repeat(128) }),
      });
      expect(response.status).toBe(413);
      expect(await response.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
    } finally {
      await handle.close();
    }
  });
});
