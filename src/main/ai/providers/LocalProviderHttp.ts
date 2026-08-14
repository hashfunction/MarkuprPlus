const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;

export type LocalProviderHttpErrorCode =
  | 'INVALID_URL'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'HTTP_ERROR'
  | 'RESPONSE_TOO_LARGE'
  | 'INVALID_JSON';

export class LocalProviderHttpError extends Error {
  constructor(
    message: string,
    public readonly code: LocalProviderHttpErrorCode,
  ) {
    super(message);
    this.name = 'LocalProviderHttpError';
  }
}

export interface BoundedJsonOptions {
  fetchFn?: typeof fetch;
  allowedOrigin: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export async function fetchBoundedJson(
  url: string,
  init: RequestInit,
  options: BoundedJsonOptions,
): Promise<unknown> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new LocalProviderHttpError('Local provider URL is not permitted.', 'INVALID_URL');
  }
  if (parsedUrl.origin !== options.allowedOrigin) {
    throw new LocalProviderHttpError('Local provider URL is not permitted.', 'INVALID_URL');
  }

  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const response = await (options.fetchFn ?? fetch)(url, {
      ...init,
      signal: abortController.signal,
    });
    if (!response.ok) {
      throw new LocalProviderHttpError(
        `Local provider returned HTTP ${response.status}.`,
        'HTTP_ERROR',
      );
    }

    const maxBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
      throw new LocalProviderHttpError(
        'Local provider response exceeded the size limit.',
        'RESPONSE_TOO_LARGE',
      );
    }

    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new LocalProviderHttpError(
        'Local provider response exceeded the size limit.',
        'RESPONSE_TOO_LARGE',
      );
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new LocalProviderHttpError(
        'Local provider returned invalid JSON.',
        'INVALID_JSON',
      );
    }
  } catch (error) {
    if (error instanceof LocalProviderHttpError) throw error;
    if (abortController.signal.aborted) {
      throw new LocalProviderHttpError('Local provider request timed out.', 'TIMEOUT');
    }
    throw new LocalProviderHttpError('Local provider request failed.', 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}
