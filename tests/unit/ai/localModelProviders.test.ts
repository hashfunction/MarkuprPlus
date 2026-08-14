import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../../../src/main/SessionController';
import { ANALYSIS_JSON_SCHEMA } from '../../../src/main/ai/analysisContract';
import {
  fetchBoundedJson,
  LocalProviderHttpError,
} from '../../../src/main/ai/providers/LocalProviderHttp';
import {
  OllamaProvider,
  OllamaProviderError,
} from '../../../src/main/ai/providers/OllamaProvider';
import {
  LmStudioProvider,
  LmStudioProviderError,
} from '../../../src/main/ai/providers/LmStudioProvider';
import {
  createLocalAnalysisProviderRegistry,
} from '../../../src/main/ai/providers/AnalysisProviderRegistry';

const validAnalysis = {
  summary: 'One local issue found.',
  items: [{
    title: 'Save action is hidden',
    category: 'UX Issue',
    priority: 'High',
    quote: 'The save button is hard to find',
    screenshotIndices: [0],
    actionItem: 'Move save into the primary toolbar.',
    area: 'Editor toolbar',
  }],
  themes: ['discoverability'],
  positiveNotes: [],
  metadata: { totalItems: 1, criticalCount: 0, highCount: 1 },
};

const sessionFixture: Session = {
  id: 'local-provider-session',
  startTime: 1_700_000_000_000,
  endTime: 1_700_000_005_000,
  state: 'complete',
  sourceId: 'screen:0:0',
  feedbackItems: [],
  transcriptBuffer: [{
    text: 'The save button is hard to find',
    isFinal: true,
    confidence: 0.95,
    timestamp: 1_700_000_001,
    tier: 'whisper',
  }],
  screenshotBuffer: [{
    id: 'shot-1',
    timestamp: 1_700_000_001_500,
    buffer: Buffer.from('bounded-image'),
    width: 1280,
    height: 720,
  }],
  metadata: { sourceName: 'Editor', startTime: 1_700_000_000_000 },
};

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    ...init,
  });
}

describe('bounded local-provider HTTP', () => {
  it('rejects non-loopback origins and oversized responses', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ ok: true })) as unknown as typeof fetch;
    await expect(fetchBoundedJson(
      'http://example.com/api/tags',
      {},
      { fetchFn, allowedOrigin: 'http://127.0.0.1:11434' },
    )).rejects.toEqual(new LocalProviderHttpError(
      'Local provider URL is not permitted.',
      'INVALID_URL',
    ));

    const oversizedFetch = vi.fn(async () => jsonResponse(
      { data: 'large' },
      { headers: { 'content-length': String(1024 * 1024 + 1) } },
    )) as unknown as typeof fetch;
    await expect(fetchBoundedJson(
      'http://127.0.0.1:11434/api/tags',
      {},
      { fetchFn: oversizedFetch, allowedOrigin: 'http://127.0.0.1:11434' },
    )).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
  });

  it('aborts a local provider request at its timeout', async () => {
    const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      })) as unknown as typeof fetch;

    await expect(fetchBoundedJson(
      'http://127.0.0.1:1234/v1/models',
      {},
      {
        fetchFn,
        allowedOrigin: 'http://127.0.0.1:1234',
        timeoutMs: 5,
      },
    )).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});

describe('OllamaProvider', () => {
  it('discovers installed models from the fixed loopback endpoint', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({
      models: [{ name: 'qwen2.5:7b' }, { model: 'llama3.2-vision:latest' }],
    })) as unknown as typeof fetch;
    const provider = new OllamaProvider({ fetchFn });

    await expect(provider.discover(true)).resolves.toMatchObject({
      id: 'ollama',
      name: 'Ollama',
      connection: 'local',
      endpoint: 'http://127.0.0.1:11434',
      installed: true,
      ready: true,
      models: [
        { id: 'qwen2.5:7b', name: 'qwen2.5:7b', source: 'discovered' },
        { id: 'llama3.2-vision:latest', name: 'llama3.2-vision:latest', source: 'discovered' },
      ],
    });
    expect(fetchFn).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/api/tags',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('uses schema output and attaches images only for confirmed vision models', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith('/api/show')) return jsonResponse({ capabilities: ['vision'] });
      return jsonResponse({ message: { content: JSON.stringify(validAnalysis) } });
    }) as unknown as typeof fetch;
    const provider = new OllamaProvider({ fetchFn });

    const result = await provider.analyze(sessionFixture, 'llama3.2-vision:latest');

    expect(result?.summary).toBe('One local issue found.');
    expect(requests.map(({ url }) => url)).toEqual([
      'http://127.0.0.1:11434/api/show',
      'http://127.0.0.1:11434/api/chat',
    ]);
    const body = JSON.parse(String(requests[1].init?.body));
    expect(body).toMatchObject({
      model: 'llama3.2-vision:latest',
      stream: false,
      format: ANALYSIS_JSON_SCHEMA,
    });
    expect(body.messages[0].images).toEqual([
      Buffer.from('bounded-image').toString('base64'),
    ]);
  });

  it('reports unavailable servers and requires a selected model', async () => {
    const provider = new OllamaProvider({
      fetchFn: vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch,
    });
    await expect(provider.discover(true)).resolves.toMatchObject({
      installed: false,
      ready: false,
      diagnostic: 'Ollama was not reachable at 127.0.0.1:11434.',
    });
    await expect(provider.analyze(sessionFixture)).rejects.toEqual(
      new OllamaProviderError('Select an installed Ollama model.', 'MODEL_REQUIRED'),
    );
  });
});

describe('LmStudioProvider', () => {
  it('discovers models from the fixed OpenAI-compatible endpoint', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({
      data: [{ id: 'qwen2.5-7b-instruct' }],
    })) as unknown as typeof fetch;
    const provider = new LmStudioProvider({ fetchFn });

    await expect(provider.discover(true)).resolves.toMatchObject({
      id: 'lmstudio',
      connection: 'local',
      endpoint: 'http://127.0.0.1:1234',
      ready: true,
      models: [
        { id: 'qwen2.5-7b-instruct', name: 'qwen2.5-7b-instruct', source: 'discovered' },
      ],
    });
    expect(fetchFn).toHaveBeenCalledWith(
      'http://127.0.0.1:1234/v1/models',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('requests transcript-only JSON Schema output for the selected model', async () => {
    let request: RequestInit | undefined;
    const fetchFn = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      request = init;
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify(validAnalysis) } }],
      });
    }) as unknown as typeof fetch;
    const provider = new LmStudioProvider({ fetchFn });

    const result = await provider.analyze(sessionFixture, 'qwen2.5-7b-instruct');

    expect(result?.summary).toBe('One local issue found.');
    const body = JSON.parse(String(request?.body));
    expect(body.model).toBe('qwen2.5-7b-instruct');
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'markupr_analysis',
        strict: true,
        schema: ANALYSIS_JSON_SCHEMA,
      },
    });
    expect(body.messages[0].content).toContain('The save button is hard to find');
    expect(body.messages[0]).not.toHaveProperty('images');
  });

  it('requires a selected model', async () => {
    const provider = new LmStudioProvider();
    await expect(provider.analyze(sessionFixture, '  ')).rejects.toEqual(
      new LmStudioProviderError('Select an available LM Studio model.', 'MODEL_REQUIRED'),
    );
  });
});

describe('local provider registry assembly', () => {
  it('assembles independent Ollama and LM Studio adapters', () => {
    const registry = createLocalAnalysisProviderRegistry();
    expect(registry.get('ollama')).toMatchObject({ id: 'ollama', connection: 'local' });
    expect(registry.get('lmstudio')).toMatchObject({ id: 'lmstudio', connection: 'local' });
  });
});
