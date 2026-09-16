import { EventEmitter } from 'node:events';
import { Socket } from 'node:net';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app } from 'electron';
import { IncomingMessage, type RequestOptions } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelDownloadManager } from '../../src/main/transcription/ModelDownloadManager';

const network = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('https', () => network);

class Request extends EventEmitter {
  destroy = vi.fn();
  setTimeout = vi.fn();
}

class Response extends IncomingMessage {
  constructor(statusCode: number, headers: Record<string, string>) {
    super(new Socket());
    this.statusCode = statusCode;
    this.headers = headers;
  }
}

describe('startup Whisper model download', () => {
  let directory: string;
  let manager: ModelDownloadManager;
  let requests: Array<{ request: Request; options: RequestOptions; respond: (response: IncomingMessage) => void }>;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'markuprplus-model-test-'));
    vi.spyOn(app, 'getPath').mockReturnValue(directory);
    manager = new ModelDownloadManager();
    const getInfo = manager.getModelInfo.bind(manager);
    vi.spyOn(manager, 'getModelInfo').mockImplementation((model) => ({
      ...getInfo(model), sizeBytes: 4,
    }));
    requests = [];
    network.get.mockImplementation((_url: string, options: RequestOptions, respond: (response: IncomingMessage) => void) => {
      const request = new Request();
      requests.push({ request, options, respond });
      return request;
    });
  });

  afterEach(() => {
    manager.cancelDownload('tiny');
    vi.restoreAllMocks();
    network.get.mockReset();
    rmSync(directory, { recursive: true, force: true });
  });

  function respond(index = 0, status = 200, body = 'abcd') {
    const response = new Response(status, { 'content-length': String(body.length) });
    requests[index].respond(response);
    response.push(body);
    response.complete = true;
    response.push(null);
    return response;
  }

  it('downloads tiny once when no model exists and makes it available', async () => {
    const result = manager.ensureDefaultModel();
    expect(manager.isDownloading('tiny')).toBe(true);
    expect(manager.getDownloadStatus('tiny')).toMatchObject({ isDownloading: true, error: null });
    respond();
    await expect(result).resolves.toMatchObject({ success: true, model: 'tiny' });
    expect(readFileSync(manager.getModelPath('tiny'), 'utf8')).toBe('abcd');
    expect(manager.hasAnyModel()).toBe(true);
    await expect(manager.ensureDefaultModel()).resolves.toBeNull();
    expect(requests).toHaveLength(1);
  });

  it.each(['tiny', 'base', 'small', 'medium', 'large'] as const)(
    'does not replace an existing %s model',
    async (model) => {
      writeFileSync(manager.getModelPath(model), 'abcd');
      await expect(manager.ensureDefaultModel()).resolves.toBeNull();
      expect(requests).toHaveLength(0);
    },
  );

  it('shares an in-flight transfer with a manual download request', async () => {
    const startup = manager.ensureDefaultModel();
    const manual = manager.downloadModel('tiny');
    const repeatedStartup = manager.ensureDefaultModel();
    expect(requests).toHaveLength(1);
    respond();
    const results = await Promise.all([startup, manual, repeatedStartup]);
    expect(results.every((result) => result?.success)).toBe(true);
  });

  it('reports offline errors without an unhandled EventEmitter error and allows retry', async () => {
    const first = manager.ensureDefaultModel();
    const rejected = expect(first).rejects.toThrow('offline');
    expect(() => requests[0].request.emit('error', new Error('offline'))).not.toThrow();
    await rejected;
    expect(manager.getDownloadStatus('tiny')).toMatchObject({ isDownloading: false, error: 'offline' });
    const retry = manager.ensureDefaultModel();
    respond(1);
    await expect(retry).resolves.toMatchObject({ success: true });
    expect(manager.getDownloadStatus('tiny').error).toBeNull();
  });

  it('restarts rather than appending when the server ignores a resume Range', async () => {
    writeFileSync(`${manager.getModelPath('tiny')}.download`, 'ab');
    const result = manager.ensureDefaultModel();
    expect(requests[0].options.headers).toEqual({ Range: 'bytes=2-' });
    respond();
    await expect(result).resolves.toMatchObject({ success: true });
    expect(readFileSync(manager.getModelPath('tiny'), 'utf8')).toBe('abcd');
  });

  it('continues an interrupted transfer when the server honors Range', async () => {
    writeFileSync(`${manager.getModelPath('tiny')}.download`, 'ab');
    const result = manager.ensureDefaultModel();
    respond(0, 206, 'cd');
    await expect(result).resolves.toMatchObject({ success: true });
    expect(readFileSync(manager.getModelPath('tiny'), 'utf8')).toBe('abcd');
  });

  it('restarts a stale partial download when the server rejects its Range', async () => {
    writeFileSync(`${manager.getModelPath('tiny')}.download`, 'abcd');
    const result = manager.ensureDefaultModel().catch((error: unknown) => error);
    respond(0, 416, '');
    expect(requests).toHaveLength(2);
    expect(requests[1].options.headers).toEqual({});
    respond(1);
    await expect(result).resolves.toMatchObject({ success: true });
  });

  it('settles cancellation and keeps the partial model for the next startup', async () => {
    writeFileSync(`${manager.getModelPath('tiny')}.download`, 'ab');
    const result = manager.ensureDefaultModel();
    const rejected = expect(result).rejects.toThrow(/cancelled/i);
    manager.cancelDownload('tiny');
    await rejected;
    expect(requests[0].request.destroy).toHaveBeenCalled();
    expect(manager.isDownloading('tiny')).toBe(false);
    expect(readFileSync(`${manager.getModelPath('tiny')}.download`, 'utf8')).toBe('ab');
  });

  it('rejects a disconnected response without publishing an incomplete model', async () => {
    const result = manager.ensureDefaultModel();
    const rejected = expect(result).rejects.toThrow(/interrupted/i);
    const response = new Response(200, { 'content-length': '4' });
    requests[0].respond(response);
    response.emit('aborted');
    await rejected;
    expect(manager.hasAnyModel()).toBe(false);
  });

  it('bounds stalled requests with a timeout', async () => {
    const result = manager.ensureDefaultModel();
    const rejected = expect(result).rejects.toThrow(/timed out/i);
    const [milliseconds, onTimeout] = requests[0].request.setTimeout.mock.calls[0];
    expect(milliseconds).toBe(30_000);
    onTimeout();
    await rejected;
    expect(manager.isDownloading('tiny')).toBe(false);
  });
});
