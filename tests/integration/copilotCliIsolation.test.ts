import { once } from 'node:events';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Session } from '../../src/main/SessionController';
import {
  CLI_PROVIDER_PROFILES,
  ProfiledCliProvider,
} from '../../src/main/ai/providers/ProfiledCliProvider';

// Opt-in contract test against a real CLI, with a loopback model and no cloud requests.
describe.skipIf(process.env.MARKUPRPLUS_TEST_COPILOT !== '1')('Copilot CLI isolation contract', () => {
  it('exposes no tools and sends private context and images without loading user extensions', async () => {
    const home = await mkdtemp(join(tmpdir(), 'markuprplus-copilot-contract-'));
    const marker = join(home, 'must-not-exist');
    const analysis = {
      summary: 'Synthetic report with a deliberately long summary that exceeds terminal width. '.repeat(4).trim(),
      items: [],
      themes: [],
      positiveNotes: [],
      metadata: { totalItems: 0, criticalCount: 0, highCount: 0 },
    };
    const requests: Record<string, unknown>[] = [];
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = z.record(z.string(), z.unknown()).parse(JSON.parse(Buffer.concat(chunks).toString()));
      requests.push(body);
      const content = JSON.stringify(analysis);
      if (body.stream) {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.end([
          `data: ${JSON.stringify({ id: 'synthetic', object: 'chat.completion.chunk', choices: [
            { index: 0, delta: { role: 'assistant', content }, finish_reason: null },
          ] })}\n\n`,
          `data: ${JSON.stringify({ id: 'synthetic', object: 'chat.completion.chunk', choices: [
            { index: 0, delta: {}, finish_reason: 'stop' },
          ] })}\n\n`,
          'data: [DONE]\n\n',
        ].join(''));
      } else {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({
          id: 'synthetic', object: 'chat.completion', model: 'synthetic-model',
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        }));
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing loopback address');
      await writeFile(join(home, 'config.json'), JSON.stringify({
        hooks: { sessionStart: [{ type: 'command', bash: `touch "${marker}"` }] },
      }));
      await writeFile(join(home, 'mcp-config.json'), JSON.stringify({
        mcpServers: { forbidden: { command: 'touch', args: [marker], tools: ['*'] } },
      }));
      const profile = CLI_PROVIDER_PROFILES.find(({ id }) => id === 'github-copilot-cli')!;
      const provider = new ProfiledCliProvider(profile, {
        env: {
          ...process.env,
          COPILOT_HOME: home,
          COPILOT_OFFLINE: 'true',
          COPILOT_PROVIDER_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
          COPILOT_PROVIDER_TYPE: 'openai',
          COPILOT_PROVIDER_WIRE_API: 'completions',
          COPILOT_PROVIDER_API_KEY: undefined,
          COPILOT_PROVIDER_BEARER_TOKEN: undefined,
          COPILOT_PROVIDER_HEADERS: undefined,
          COPILOT_GITHUB_TOKEN: undefined,
          GH_TOKEN: undefined,
          GITHUB_TOKEN: undefined,
        },
      });
      const session: Session = {
        id: 'synthetic-session',
        startTime: 1_700_000_000_000,
        state: 'complete',
        sourceId: 'screen:0:0',
        feedbackItems: [],
        transcriptBuffer: [{
          text: 'Synthetic feedback: the submit button is clipped.',
          isFinal: true, confidence: 1, timestamp: 1_700_000_001, tier: 'whisper',
        }],
        screenshotBuffer: [{
          id: 'synthetic-image', timestamp: 1_700_000_001_000, width: 1, height: 1,
          buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZWQAAAAASUVORK5CYII=', 'base64'),
        }],
      };
      await expect(provider.analyze(session, 'synthetic-model')).resolves.toEqual(analysis);
      expect(requests.length).toBeGreaterThan(0);
      for (const request of requests) expect(request.tools ?? []).toEqual([]);
      const input = JSON.stringify(requests);
      expect(input.includes('Synthetic feedback: the submit button is clipped.')).toBe(true);
      expect(input.includes('data:image/png;base64,')).toBe(true);
      await expect(access(marker)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await rm(home, { recursive: true, force: true });
    }
  }, 200_000);
});
