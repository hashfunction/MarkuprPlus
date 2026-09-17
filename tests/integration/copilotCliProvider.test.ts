import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CLI_PROVIDER_PROFILES, ProfiledCliProvider } from '../../src/main/ai/providers/ProfiledCliProvider';
import type { Session } from '../../src/main/SessionController';

// Opt in with an installed CLI. No GitHub login, paid model, or network service is used.
const executable = process.env.MARKUPRPLUS_COPILOT_PATH;
describe.skipIf(!executable)('real Copilot CLI report adapter', () => {
  it('sends narration and screenshots to the model without exposing any tools', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'markuprplus-copilot-test-'));
    const marker = join(directory, 'hook-ran');
    const mcpMarker = join(directory, 'mcp-started');
    const hookCommand = `touch '${marker.replace(/'/g, "'\\''")}'`;
    await writeFile(join(directory, 'config.json'), JSON.stringify({
      hooks: { sessionStart: [{ type: 'command', bash: hookCommand, command: hookCommand }] },
    }));
    await writeFile(join(directory, 'mcp-config.json'), JSON.stringify({
      mcpServers: { unrelated: {
        type: 'local', command: process.execPath,
        args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(mcpMarker)}, 'started')`],
        tools: ['*'],
      } },
    }));
    const requests: Array<{ tools?: unknown[]; messages?: unknown[] }> = [];
    const analysis = {
      summary: 'The primary action is hard to find.', items: [], themes: [], positiveNotes: [],
      metadata: { totalItems: 0, criticalCount: 0, highCount: 0 },
    };
    const server = createServer(async (request, response) => {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw);
      requests.push(body);
      const content = JSON.stringify(analysis);
      const usage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
      if (body.stream) {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.end([
          `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] })}`,
          `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage })}`,
          'data: [DONE]', '',
        ].join('\n\n'));
      } else {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({
          id: 'test', object: 'chat.completion', usage,
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        }));
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    try {
      const provider = new ProfiledCliProvider(
        CLI_PROVIDER_PROFILES.find(({ id }) => id === 'github-copilot-cli')!,
        {
          env: {
            PATH: `${dirname(executable!)}:${process.env.PATH}`,
            HOME: process.env.HOME,
            COPILOT_HOME: directory,
            COPILOT_OFFLINE: 'true',
            COPILOT_ALLOW_ALL: 'true',
            COPILOT_PROVIDER_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
            COPILOT_PROVIDER_TYPE: 'openai',
            COPILOT_MODEL: 'gpt-4.1',
          },
          isExecutable: async (path) => path === executable,
        },
      );
      const sharp = (await vi.importActual<typeof import('sharp')>('sharp')).default;
      const screenshot = await sharp(randomBytes(800 * 600 * 3), {
        raw: { width: 800, height: 600, channels: 3 },
      }).png().toBuffer();
      expect(screenshot.length).toBeGreaterThan(1024 * 1024);
      const session = {
        id: 'copilot-live-test', startTime: 1_700_000_000_000,
        transcriptBuffer: [{ text: 'The primary action is hard to find.', timestamp: 1_700_000_001, isFinal: true }],
        screenshotBuffer: [{
          timestamp: 1_700_000_000_000,
          buffer: screenshot,
        }],
      } as Session;
      await expect(provider.analyze(session)).resolves.toEqual(analysis);
      await expect(provider.analyze({ ...session, transcriptBuffer: [] })).resolves.toEqual(analysis);
      expect(requests.length).toBe(2);
      for (const request of requests) {
        expect(request.tools ?? []).toEqual([]);
        expect(JSON.stringify(request.messages)).toContain('data:image/png;base64,');
      }
      expect(JSON.stringify(requests[0].messages)).toContain('The primary action is hard to find.');
      await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(mcpMarker)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
