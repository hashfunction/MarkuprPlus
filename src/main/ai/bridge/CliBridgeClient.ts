import type { Session } from '../../SessionController';
import type { AIAnalysisResult } from '../types';
import type { AnalysisModelOption, AnalysisProviderStatus } from '../../../shared/types';
import {
  CLI_BRIDGE_DEFAULT_HOST,
  CLI_BRIDGE_DEFAULT_PORT,
  CLI_BRIDGE_PROTOCOL_VERSION,
  type BridgeHealthResponse,
  type CliBridgeErrorCode,
  type CliBridgeProvider,
} from '../../../shared/cliBridgeProtocol';
import { serializeBridgeSession } from '../../../bridge/BridgeSession';
import { parseAnalysisResult } from '../analysisContract';

const DEFAULT_BASE_URL = `http://${CLI_BRIDGE_DEFAULT_HOST}:${CLI_BRIDGE_DEFAULT_PORT}`;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 2_000;
const DEFAULT_ANALYSIS_TIMEOUT_MS = 190_000;

export type CliBridgeClientErrorCode =
  | CliBridgeErrorCode
  | 'BRIDGE_NOT_PAIRED'
  | 'BRIDGE_OFFLINE'
  | 'BRIDGE_INCOMPATIBLE';

export class CliBridgeClientError extends Error {
  constructor(
    public readonly code: CliBridgeClientErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'CliBridgeClientError';
  }
}

export interface CliBridgeClientOptions {
  getToken(): Promise<string | null>;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  discoveryTimeoutMs?: number;
  analysisTimeoutMs?: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireProtocol(value: unknown): Record<string, unknown> {
  if (!isObject(value) || value.protocolVersion !== CLI_BRIDGE_PROTOCOL_VERSION) {
    throw new CliBridgeClientError(
      'BRIDGE_INCOMPATIBLE',
      `Update MarkuprPlus CLI Bridge; protocol ${CLI_BRIDGE_PROTOCOL_VERSION} is required.`,
    );
  }
  return value;
}

function requireProviderStatus(value: unknown): AnalysisProviderStatus {
  if (
    !isObject(value)
    || typeof value.id !== 'string'
    || typeof value.name !== 'string'
    || typeof value.installed !== 'boolean'
    || typeof value.ready !== 'boolean'
  ) {
    throw new CliBridgeClientError('BRIDGE_PROTOCOL_ERROR', 'The CLI bridge returned an invalid provider status.');
  }
  return value as unknown as AnalysisProviderStatus;
}

export class CliBridgeClient {
  private readonly options: Required<Omit<CliBridgeClientOptions, 'getToken'>>
    & Pick<CliBridgeClientOptions, 'getToken'>;
  private cachedProviders: AnalysisProviderStatus[] | null = null;
  private discoveryPromise: Promise<AnalysisProviderStatus[]> | null = null;

  constructor(options: CliBridgeClientOptions) {
    this.options = {
      getToken: options.getToken,
      baseUrl: options.baseUrl || DEFAULT_BASE_URL,
      fetchFn: options.fetchFn || fetch,
      discoveryTimeoutMs: options.discoveryTimeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS,
      analysisTimeoutMs: options.analysisTimeoutMs ?? DEFAULT_ANALYSIS_TIMEOUT_MS,
    };
  }

  async getHealth(): Promise<BridgeHealthResponse> {
    const value = await this.requestJson('/v1/health', {
      method: 'GET',
      timeoutMs: this.options.discoveryTimeoutMs,
      authenticated: false,
    });
    if (
      !isObject(value)
      || typeof value.bridgeVersion !== 'string'
      || typeof value.pairingConfigured !== 'boolean'
      || value.protocolVersion !== CLI_BRIDGE_PROTOCOL_VERSION
    ) {
      requireProtocol(value);
      throw new CliBridgeClientError('BRIDGE_PROTOCOL_ERROR', 'The CLI bridge returned an invalid health response.');
    }
    return value as unknown as BridgeHealthResponse;
  }

  async discoverProviders(
    forceRefresh = false,
    tokenOverride?: string,
  ): Promise<AnalysisProviderStatus[]> {
    if (!forceRefresh && !tokenOverride && this.cachedProviders) return this.cachedProviders;
    if (!forceRefresh && !tokenOverride && this.discoveryPromise) return this.discoveryPromise;
    const operation = this.loadProviders(forceRefresh, tokenOverride);
    if (!forceRefresh && !tokenOverride) this.discoveryPromise = operation;
    try {
      const providers = await operation;
      if (!tokenOverride) this.cachedProviders = providers;
      return providers;
    } finally {
      if (!forceRefresh && !tokenOverride) this.discoveryPromise = null;
    }
  }

  private async loadProviders(
    forceRefresh: boolean,
    tokenOverride?: string,
  ): Promise<AnalysisProviderStatus[]> {
    const value = requireProtocol(await this.requestJson(
      `/v1/providers?force=${forceRefresh ? 'true' : 'false'}`,
      {
        method: 'GET',
        timeoutMs: this.options.discoveryTimeoutMs,
        authenticated: true,
        tokenOverride,
      },
    ));
    if (!Array.isArray(value.providers)) {
      throw new CliBridgeClientError('BRIDGE_PROTOCOL_ERROR', 'The CLI bridge returned invalid providers.');
    }
    return value.providers.map(requireProviderStatus);
  }

  async testProvider(provider: CliBridgeProvider): Promise<AnalysisProviderStatus> {
    const value = await this.requestJson(`/v1/providers/${encodeURIComponent(provider)}/test`, {
      method: 'POST',
      timeoutMs: this.options.discoveryTimeoutMs,
      authenticated: true,
    });
    this.cachedProviders = null;
    return requireProviderStatus(value);
  }

  async models(provider: CliBridgeProvider): Promise<AnalysisModelOption[]> {
    const value = requireProtocol(await this.requestJson(
      `/v1/providers/${encodeURIComponent(provider)}/models`,
      {
        method: 'GET',
        timeoutMs: this.options.discoveryTimeoutMs,
        authenticated: true,
      },
    ));
    if (!Array.isArray(value.models)) {
      throw new CliBridgeClientError('BRIDGE_PROTOCOL_ERROR', 'The CLI bridge returned invalid models.');
    }
    return value.models as AnalysisModelOption[];
  }

  async analyze(
    provider: CliBridgeProvider,
    session: Session,
    modelId?: string,
  ): Promise<AIAnalysisResult> {
    const value = requireProtocol(await this.requestJson('/v1/analyze', {
      method: 'POST',
      timeoutMs: this.options.analysisTimeoutMs,
      authenticated: true,
      body: {
        protocolVersion: CLI_BRIDGE_PROTOCOL_VERSION,
        provider,
        ...(modelId?.trim() ? { modelId: modelId.trim() } : {}),
        session: serializeBridgeSession(session),
      },
    }));
    if (!isObject(value.analysis)) {
      throw new CliBridgeClientError('BRIDGE_PROTOCOL_ERROR', 'The CLI bridge returned invalid analysis.');
    }
    try {
      return parseAnalysisResult(JSON.stringify(value.analysis));
    } catch {
      throw new CliBridgeClientError('BRIDGE_PROTOCOL_ERROR', 'The CLI bridge returned invalid analysis.');
    }
  }

  private async requestJson(
    path: string,
    request: {
      method: 'GET' | 'POST';
      timeoutMs: number;
      authenticated: boolean;
      tokenOverride?: string;
      body?: unknown;
    },
  ): Promise<unknown> {
    let token: string | null = null;
    if (request.authenticated) {
      token = request.tokenOverride ?? await this.options.getToken();
      if (!token) {
        throw new CliBridgeClientError('BRIDGE_NOT_PAIRED', 'Pair MarkuprPlus CLI Bridge.');
      }
    }
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await this.options.fetchFn(`${this.options.baseUrl}${path}`, {
        method: request.method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        signal: controller.signal,
      });
      const text = await response.text();
      let value: unknown;
      try {
        value = JSON.parse(text) as unknown;
      } catch {
        throw new CliBridgeClientError(
          'BRIDGE_PROTOCOL_ERROR',
          'The CLI bridge returned an invalid response.',
          response.status,
        );
      }
      if (!response.ok) {
        const error = isObject(value) && isObject(value.error) ? value.error : null;
        const code = error && typeof error.code === 'string'
          ? error.code as CliBridgeClientErrorCode
          : 'BRIDGE_PROTOCOL_ERROR';
        const message = error && typeof error.message === 'string'
          ? error.message
          : 'The CLI bridge request failed.';
        throw new CliBridgeClientError(code, message.slice(0, 500), response.status);
      }
      return value;
    } catch (error) {
      if (error instanceof CliBridgeClientError) throw error;
      throw new CliBridgeClientError(
        'BRIDGE_OFFLINE',
        error instanceof Error && error.name === 'AbortError'
          ? 'Start MarkuprPlus CLI Bridge; the connection timed out.'
          : 'Start MarkuprPlus CLI Bridge.',
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
