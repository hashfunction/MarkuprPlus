import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../../../src/main/SessionController';
import type { CliBridgeClient } from '../../../src/main/ai/bridge/CliBridgeClient';
import { CliBridgeClientError } from '../../../src/main/ai/bridge/CliBridgeClient';
import { BridgeCliProvider } from '../../../src/main/ai/bridge/BridgeCliProvider';

const session = {
  id: 'session-1', startTime: 1, state: 'complete', sourceId: 'screen:0:0',
  feedbackItems: [], transcriptBuffer: [], screenshotBuffer: [],
  metadata: { sourceId: 'screen:0:0', sourceName: 'Browser' },
} as Session;

function client(overrides: Partial<CliBridgeClient> = {}): CliBridgeClient {
  return {
    getHealth: vi.fn(),
    discoverProviders: vi.fn(async () => [{
      id: 'codex-cli', name: 'Codex CLI', connection: 'cli', installed: true, ready: true,
    }]),
    testProvider: vi.fn(async () => ({
      id: 'codex-cli', name: 'Codex CLI', connection: 'cli', installed: true, ready: true,
    })),
    models: vi.fn(async () => [{ id: '', name: 'Codex default', source: 'default' }]),
    analyze: vi.fn(async () => ({
      summary: 'One issue.', items: [], themes: [], positiveNotes: [],
      metadata: { totalItems: 0, criticalCount: 0, highCount: 0 },
    })),
    ...overrides,
  } as never;
}

describe('BridgeCliProvider', () => {
  it('forwards discovery, models, and analysis through one bridge client', async () => {
    const bridgeClient = client();
    const provider = new BridgeCliProvider('codex-cli', 'Codex CLI', bridgeClient);

    await expect(provider.discover(false)).resolves.toMatchObject({ id: 'codex-cli', ready: true });
    await expect(provider.discover(true)).resolves.toMatchObject({ id: 'codex-cli', ready: true });
    await expect(provider.analyze(session, 'gpt-5.6')).resolves.toMatchObject({ summary: 'One issue.' });
    expect(bridgeClient.testProvider).toHaveBeenCalledWith('codex-cli');
    expect(bridgeClient.analyze).toHaveBeenCalledWith('codex-cli', session, 'gpt-5.6');
  });

  it.each([
    ['BRIDGE_NOT_PAIRED', 'Pair MarkuprPlus CLI Bridge'],
    ['BRIDGE_OFFLINE', 'Start MarkuprPlus CLI Bridge'],
    ['BRIDGE_INCOMPATIBLE', 'Update MarkuprPlus CLI Bridge'],
  ] as const)('turns %s into an actionable unavailable status', async (code, diagnostic) => {
    const provider = new BridgeCliProvider('codex-cli', 'Codex CLI', client({
      discoverProviders: vi.fn(async () => {
        throw new CliBridgeClientError(code, 'transport detail');
      }),
    }));

    await expect(provider.discover()).resolves.toMatchObject({
      id: 'codex-cli',
      installed: false,
      ready: false,
      diagnostic: expect.stringContaining(diagnostic),
    });
  });
});
