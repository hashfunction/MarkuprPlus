import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { BridgeProviderRegistry } from './BridgeProviderRegistry';
import { deserializeBridgeSession } from './BridgeSession';
import { isAuthorized } from './BridgeAuth';
import { BridgeHttpError, sanitizeBridgeMessage } from './BridgeErrors';
import {
  CLI_BRIDGE_DEFAULT_HOST,
  CLI_BRIDGE_DEFAULT_PORT,
  CLI_BRIDGE_MAX_BODY_BYTES,
  CLI_BRIDGE_PROTOCOL_VERSION,
  isCliBridgeProvider,
  parseBridgeAnalyzeRequest,
  type BridgeErrorEnvelope,
  type CliBridgeErrorCode,
} from '../shared/cliBridgeProtocol';

const DEFAULT_ANALYSIS_TIMEOUT_MS = 190_000;

export interface CliBridgeServerOptions {
  token: string;
  bridgeVersion: string;
  registry: BridgeProviderRegistry;
  host?: string;
  port?: number;
  maxBodyBytes?: number;
  analysisTimeoutMs?: number;
}

export interface CliBridgeServerHandle {
  server: Server;
  origin: string;
  port: number;
  close(): Promise<void>;
}

function json(
  response: ServerResponse,
  status: number,
  value: unknown,
  extraHeaders: Record<string, string> = {},
): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(Buffer.byteLength(body)),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  response.end(body);
}

function bridgeError(
  response: ServerResponse,
  status: number,
  code: CliBridgeErrorCode,
  message: string,
): void {
  const body: BridgeErrorEnvelope = { error: { code, message } };
  json(response, status, body);
}

function currentPort(server: Server): number | null {
  const address = server.address();
  return address && typeof address !== 'string' ? address.port : null;
}

function hasAllowedHost(request: IncomingMessage, server: Server): boolean {
  const host = request.headers.host;
  const port = currentPort(server);
  if (!host || port === null) return false;
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

function hasLoopbackPeer(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress;
  return address === '127.0.0.1' || address === '::ffff:127.0.0.1';
}

async function readJsonBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    throw new BridgeHttpError(400, 'INVALID_REQUEST', 'Content-Type must be application/json.');
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  let tooLarge = false;
  for await (const rawChunk of request) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    bytes += chunk.length;
    if (bytes > maxBytes) {
      tooLarge = true;
      continue;
    }
    chunks.push(chunk);
  }
  if (tooLarge) {
    throw new BridgeHttpError(
      413,
      'PAYLOAD_TOO_LARGE',
      'Bridge request exceeds the allowed size.',
    );
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new BridgeHttpError(400, 'INVALID_REQUEST', 'Bridge request must contain valid JSON.');
  }
}

function providerFromPath(pathname: string): {
  provider: string;
  action: 'test' | 'models';
} | null {
  const match = /^\/v1\/providers\/([^/]+)\/(test|models)$/.exec(pathname);
  if (!match) return null;
  return { provider: decodeURIComponent(match[1]), action: match[2] as 'test' | 'models' };
}

function timeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = setTimeout(() => {
      reject(new BridgeHttpError(504, 'ANALYSIS_TIMEOUT', 'CLI analysis timed out.'));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(handle);
        resolve(value);
      },
      (error) => {
        clearTimeout(handle);
        reject(error);
      },
    );
  });
}

export function createCliBridgeServer(options: CliBridgeServerOptions): Server {
  const maxBodyBytes = options.maxBodyBytes ?? CLI_BRIDGE_MAX_BODY_BYTES;
  const analysisTimeoutMs = options.analysisTimeoutMs ?? DEFAULT_ANALYSIS_TIMEOUT_MS;
  let analysisActive = false;

  const server = createServer(async (request, response) => {
    try {
      if (!hasLoopbackPeer(request) || !hasAllowedHost(request, server)) {
        throw new BridgeHttpError(400, 'INVALID_REQUEST', 'Invalid bridge request origin.');
      }

      const url = new URL(request.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/v1/health') {
        if (request.method !== 'GET') {
          throw new BridgeHttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
        }
        json(response, 200, {
          bridgeVersion: options.bridgeVersion,
          protocolVersion: CLI_BRIDGE_PROTOCOL_VERSION,
          pairingConfigured: options.token.length > 0,
        });
        return;
      }

      const authorization = request.headers.authorization;
      if (!authorization) {
        throw new BridgeHttpError(401, 'AUTH_REQUIRED', 'Bridge authentication is required.');
      }
      if (!isAuthorized(authorization, options.token)) {
        throw new BridgeHttpError(401, 'AUTH_INVALID', 'Bridge authentication failed.');
      }

      if (url.pathname === '/v1/providers') {
        if (request.method !== 'GET') {
          throw new BridgeHttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
        }
        const providers = await options.registry.discoverAll(url.searchParams.get('force') === 'true');
        json(response, 200, {
          protocolVersion: CLI_BRIDGE_PROTOCOL_VERSION,
          providers,
        });
        return;
      }

      const providerRoute = providerFromPath(url.pathname);
      if (providerRoute) {
        if (!isCliBridgeProvider(providerRoute.provider)) {
          throw new BridgeHttpError(400, 'PROVIDER_UNSUPPORTED', 'Unsupported CLI provider.');
        }
        const adapter = options.registry.get(providerRoute.provider);
        if (providerRoute.action === 'test') {
          if (request.method !== 'POST') {
            throw new BridgeHttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
          }
          json(response, 200, await adapter.discover(true));
          return;
        }
        if (request.method !== 'GET') {
          throw new BridgeHttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
        }
        const status = await adapter.discover(false);
        json(response, 200, {
          protocolVersion: CLI_BRIDGE_PROTOCOL_VERSION,
          models: status.models || [],
        });
        return;
      }

      if (url.pathname === '/v1/analyze') {
        if (request.method !== 'POST') {
          throw new BridgeHttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
        }
        if (analysisActive) {
          throw new BridgeHttpError(429, 'BRIDGE_BUSY', 'The CLI bridge is already analyzing a report.');
        }
        const raw = await readJsonBody(request, maxBodyBytes);
        let parsed;
        try {
          parsed = parseBridgeAnalyzeRequest(raw);
        } catch (error) {
          const unsupported = error instanceof Error && /unsupported provider/i.test(error.message);
          throw new BridgeHttpError(
            400,
            unsupported ? 'PROVIDER_UNSUPPORTED' : 'INVALID_REQUEST',
            unsupported ? 'Unsupported CLI provider.' : 'Invalid bridge analysis request.',
          );
        }

        analysisActive = true;
        try {
          const adapter = options.registry.get(parsed.provider);
          const status = await adapter.discover(false);
          if (!status.ready) {
            throw new BridgeHttpError(
              503,
              'PROVIDER_UNAVAILABLE',
              sanitizeBridgeMessage(status.diagnostic, `${adapter.name} is unavailable.`),
            );
          }
          const analysis = await timeout(
            adapter.analyze(
              deserializeBridgeSession(parsed.session),
              parsed.modelId,
            ),
            analysisTimeoutMs,
          );
          if (!analysis) {
            throw new BridgeHttpError(502, 'ANALYSIS_FAILED', 'CLI analysis returned no result.');
          }
          json(response, 200, {
            protocolVersion: CLI_BRIDGE_PROTOCOL_VERSION,
            analysis,
          });
        } catch (error) {
          if (error instanceof BridgeHttpError) throw error;
          throw new BridgeHttpError(
            502,
            'ANALYSIS_FAILED',
            sanitizeBridgeMessage(error, 'CLI analysis failed.'),
          );
        } finally {
          analysisActive = false;
        }
        return;
      }

      throw new BridgeHttpError(404, 'NOT_FOUND', 'Bridge endpoint not found.');
    } catch (error) {
      if (error instanceof BridgeHttpError) {
        bridgeError(response, error.status, error.code, error.message);
        return;
      }
      bridgeError(response, 500, 'INTERNAL_ERROR', 'The CLI bridge encountered an internal error.');
    }
  });

  return server;
}

export async function startCliBridgeServer(
  options: CliBridgeServerOptions,
): Promise<CliBridgeServerHandle> {
  const server = createCliBridgeServer(options);
  const host = options.host ?? CLI_BRIDGE_DEFAULT_HOST;
  const port = options.port ?? CLI_BRIDGE_DEFAULT_PORT;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return {
    server,
    port: address.port,
    origin: `http://${host}:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}
