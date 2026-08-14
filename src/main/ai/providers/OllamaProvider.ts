import type { AnalysisModelOption, AnalysisProviderStatus } from '../../../shared/types';
import type { Session } from '../../SessionController';
import {
  ANALYSIS_JSON_SCHEMA,
  ANALYSIS_SYSTEM_PROMPT,
  buildTranscriptText,
  parseAnalysisResult,
} from '../analysisContract';
import type { AIAnalysisResult } from '../types';
import { fetchBoundedJson } from './LocalProviderHttp';
import type { AnalysisProviderAdapter } from './types';

const OLLAMA_ORIGIN = 'http://127.0.0.1:11434';
const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type OllamaProviderErrorCode =
  | 'MODEL_REQUIRED'
  | 'EMPTY_INPUT'
  | 'INVALID_OUTPUT';

export class OllamaProviderError extends Error {
  constructor(
    message: string,
    public readonly code: OllamaProviderErrorCode,
  ) {
    super(message);
    this.name = 'OllamaProviderError';
  }
}

export interface OllamaProviderDependencies {
  fetchFn: typeof fetch;
  timeoutMs: number;
}

function buildPrompt(session: Session): string {
  return `${ANALYSIS_SYSTEM_PROMPT}

## Session

Application: ${session.metadata?.sourceName || 'Application'}

## Transcript

${buildTranscriptText(session)}`;
}

function parseModels(payload: unknown): AnalysisModelOption[] {
  const models = (payload as { models?: Array<{ name?: unknown; model?: unknown }> })?.models;
  if (!Array.isArray(models)) return [];
  const seen = new Set<string>();
  return models.flatMap((entry) => {
    const id = typeof entry.name === 'string'
      ? entry.name
      : typeof entry.model === 'string'
        ? entry.model
        : '';
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name: id, source: 'discovered' as const }];
  });
}

export class OllamaProvider implements AnalysisProviderAdapter {
  readonly id = 'ollama' as const;
  readonly name = 'Ollama';
  readonly connection = 'local' as const;
  private readonly dependencies: OllamaProviderDependencies;
  private cachedStatus: AnalysisProviderStatus | null = null;

  constructor(dependencies: Partial<OllamaProviderDependencies> = {}) {
    this.dependencies = {
      fetchFn: fetch,
      timeoutMs: 5_000,
      ...dependencies,
    };
  }

  async discover(forceRefresh = false): Promise<AnalysisProviderStatus> {
    if (!forceRefresh && this.cachedStatus) return this.cachedStatus;
    try {
      const models = parseModels(await this.get('/api/tags'));
      return this.cache({
        id: this.id,
        name: this.name,
        connection: this.connection,
        endpoint: OLLAMA_ORIGIN,
        installed: true,
        authenticated: true,
        ready: models.length > 0,
        models,
        ...(models.length === 0
          ? { diagnostic: 'Ollama is running, but no installed models were found.' }
          : {}),
      });
    } catch {
      return this.cache({
        id: this.id,
        name: this.name,
        connection: this.connection,
        endpoint: OLLAMA_ORIGIN,
        installed: false,
        authenticated: true,
        ready: false,
        models: [],
        diagnostic: 'Ollama was not reachable at 127.0.0.1:11434.',
      });
    }
  }

  async analyze(session: Session, modelId?: string): Promise<AIAnalysisResult> {
    const model = modelId?.trim();
    if (!model) {
      throw new OllamaProviderError('Select an installed Ollama model.', 'MODEL_REQUIRED');
    }
    if (buildTranscriptText(session) === '[No transcript available]' && session.screenshotBuffer.length === 0) {
      throw new OllamaProviderError('The session has no transcript or screenshots to analyze.', 'EMPTY_INPUT');
    }

    let supportsImages = false;
    try {
      const details = await this.post('/api/show', { model });
      supportsImages = Array.isArray((details as { capabilities?: unknown }).capabilities)
        && ((details as { capabilities: unknown[] }).capabilities).includes('vision');
    } catch {
      supportsImages = false;
    }

    const images = supportsImages
      ? session.screenshotBuffer
          .filter(({ buffer }) => buffer.length <= MAX_IMAGE_BYTES)
          .slice(0, MAX_IMAGES)
          .map(({ buffer }) => buffer.toString('base64'))
      : [];
    const response = await this.post('/api/chat', {
      model,
      stream: false,
      format: ANALYSIS_JSON_SCHEMA,
      messages: [{
        role: 'user',
        content: buildPrompt(session),
        ...(images.length > 0 ? { images } : {}),
      }],
      options: { temperature: 0.2 },
    });
    const content = (response as { message?: { content?: unknown } }).message?.content;
    if (typeof content !== 'string') {
      throw new OllamaProviderError('Ollama returned invalid structured output.', 'INVALID_OUTPUT');
    }
    try {
      return parseAnalysisResult(content);
    } catch {
      throw new OllamaProviderError('Ollama returned invalid structured output.', 'INVALID_OUTPUT');
    }
  }

  private get(path: string): Promise<unknown> {
    return fetchBoundedJson(`${OLLAMA_ORIGIN}${path}`, {}, {
      fetchFn: this.dependencies.fetchFn,
      allowedOrigin: OLLAMA_ORIGIN,
      timeoutMs: this.dependencies.timeoutMs,
    });
  }

  private post(path: string, body: unknown): Promise<unknown> {
    return fetchBoundedJson(`${OLLAMA_ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }, {
      fetchFn: this.dependencies.fetchFn,
      allowedOrigin: OLLAMA_ORIGIN,
      timeoutMs: this.dependencies.timeoutMs,
      maxResponseBytes: 1024 * 1024,
    });
  }

  private cache(status: AnalysisProviderStatus): AnalysisProviderStatus {
    this.cachedStatus = status;
    return status;
  }
}
