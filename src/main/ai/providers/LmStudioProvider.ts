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

const LM_STUDIO_ORIGIN = 'http://127.0.0.1:1234';

export type LmStudioProviderErrorCode =
  | 'MODEL_REQUIRED'
  | 'EMPTY_INPUT'
  | 'INVALID_OUTPUT';

export class LmStudioProviderError extends Error {
  constructor(
    message: string,
    public readonly code: LmStudioProviderErrorCode,
  ) {
    super(message);
    this.name = 'LmStudioProviderError';
  }
}

export interface LmStudioProviderDependencies {
  fetchFn: typeof fetch;
  timeoutMs: number;
}

function buildPrompt(session: Session): string {
  return `${ANALYSIS_SYSTEM_PROMPT}

## Session

Application: ${session.metadata?.sourceName || 'Application'}

## Transcript

${buildTranscriptText(session)}

Screenshots are not supplied because this model's vision capability is unknown.`;
}

function parseModels(payload: unknown): AnalysisModelOption[] {
  const models = (payload as { data?: Array<{ id?: unknown }> })?.data;
  if (!Array.isArray(models)) return [];
  const seen = new Set<string>();
  return models.flatMap((entry) => {
    if (typeof entry.id !== 'string' || !entry.id || seen.has(entry.id)) return [];
    seen.add(entry.id);
    return [{ id: entry.id, name: entry.id, source: 'discovered' as const }];
  });
}

export class LmStudioProvider implements AnalysisProviderAdapter {
  readonly id = 'lmstudio' as const;
  readonly name = 'LM Studio';
  readonly connection = 'local' as const;
  private readonly dependencies: LmStudioProviderDependencies;
  private cachedStatus: AnalysisProviderStatus | null = null;

  constructor(dependencies: Partial<LmStudioProviderDependencies> = {}) {
    this.dependencies = {
      fetchFn: fetch,
      timeoutMs: 5_000,
      ...dependencies,
    };
  }

  async discover(forceRefresh = false): Promise<AnalysisProviderStatus> {
    if (!forceRefresh && this.cachedStatus) return this.cachedStatus;
    try {
      const models = parseModels(await this.get('/v1/models'));
      return this.cache({
        id: this.id,
        name: this.name,
        connection: this.connection,
        endpoint: LM_STUDIO_ORIGIN,
        installed: true,
        authenticated: true,
        ready: models.length > 0,
        models,
        ...(models.length === 0
          ? { diagnostic: 'LM Studio is running, but no available models were found.' }
          : {}),
      });
    } catch {
      return this.cache({
        id: this.id,
        name: this.name,
        connection: this.connection,
        endpoint: LM_STUDIO_ORIGIN,
        installed: false,
        authenticated: true,
        ready: false,
        models: [],
        diagnostic: 'LM Studio was not reachable at 127.0.0.1:1234.',
      });
    }
  }

  async analyze(session: Session, modelId?: string): Promise<AIAnalysisResult> {
    const model = modelId?.trim();
    if (!model) {
      throw new LmStudioProviderError(
        'Select an available LM Studio model.',
        'MODEL_REQUIRED',
      );
    }
    if (buildTranscriptText(session) === '[No transcript available]') {
      throw new LmStudioProviderError('The session has no transcript to analyze.', 'EMPTY_INPUT');
    }

    const response = await this.post('/v1/chat/completions', {
      model,
      stream: false,
      temperature: 0.2,
      messages: [{ role: 'user', content: buildPrompt(session) }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'markuprx_analysis',
          strict: true,
          schema: ANALYSIS_JSON_SCHEMA,
        },
      },
    });
    const content = (response as {
      choices?: Array<{ message?: { content?: unknown } }>;
    }).choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new LmStudioProviderError(
        'LM Studio returned invalid structured output.',
        'INVALID_OUTPUT',
      );
    }
    try {
      return parseAnalysisResult(content);
    } catch {
      throw new LmStudioProviderError(
        'LM Studio returned invalid structured output.',
        'INVALID_OUTPUT',
      );
    }
  }

  private get(path: string): Promise<unknown> {
    return fetchBoundedJson(`${LM_STUDIO_ORIGIN}${path}`, {}, {
      fetchFn: this.dependencies.fetchFn,
      allowedOrigin: LM_STUDIO_ORIGIN,
      timeoutMs: this.dependencies.timeoutMs,
    });
  }

  private post(path: string, body: unknown): Promise<unknown> {
    return fetchBoundedJson(`${LM_STUDIO_ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }, {
      fetchFn: this.dependencies.fetchFn,
      allowedOrigin: LM_STUDIO_ORIGIN,
      timeoutMs: this.dependencies.timeoutMs,
      maxResponseBytes: 1024 * 1024,
    });
  }

  private cache(status: AnalysisProviderStatus): AnalysisProviderStatus {
    this.cachedStatus = status;
    return status;
  }
}
