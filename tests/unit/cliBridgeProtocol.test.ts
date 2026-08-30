import { describe, expect, it } from 'vitest';
import {
  CLI_BRIDGE_DEFAULT_HOST,
  CLI_BRIDGE_DEFAULT_PORT,
  CLI_BRIDGE_PROTOCOL_VERSION,
  CLI_BRIDGE_PROVIDER_IDS,
  parseBridgeAnalyzeRequest,
  type BridgeAnalyzeRequest,
  type BridgeSessionPayload,
} from '../../src/shared/cliBridgeProtocol';

const minimalSession: BridgeSessionPayload = {
  id: 'bridge-session',
  startTime: 1_700_000_000_000,
  state: 'complete',
  sourceId: 'screen:0:0',
  feedbackItems: [],
  transcriptBuffer: [],
  screenshots: [],
  metadata: {
    sourceId: 'screen:0:0',
    sourceName: 'Browser',
    sourceType: 'screen',
  },
};

function request(overrides: Partial<BridgeAnalyzeRequest> = {}): unknown {
  return {
    protocolVersion: 1,
    provider: 'codex-cli',
    session: minimalSession,
    ...overrides,
  };
}

describe('CLI bridge protocol', () => {
  it('accepts only the supported CLI provider catalog', () => {
    expect(CLI_BRIDGE_PROTOCOL_VERSION).toBe(1);
    expect(CLI_BRIDGE_DEFAULT_HOST).toBe('127.0.0.1');
    expect(CLI_BRIDGE_DEFAULT_PORT).toBe(49_647);
    expect(CLI_BRIDGE_PROVIDER_IDS).toEqual([
      'codex-cli',
      'claude-cli',
      'opencode-cli',
      'cursor-cli',
      'qwen-cli',
      'goose-cli',
      'amp-cli',
      'kiro-cli',
      'aider-cli',
    ]);

    expect(parseBridgeAnalyzeRequest(request())).toMatchObject({
      protocolVersion: 1,
      provider: 'codex-cli',
      session: { id: 'bridge-session' },
    });
    expect(() => parseBridgeAnalyzeRequest(request({ provider: 'ollama' as never })))
      .toThrow(/unsupported provider/i);
  });

  it('rejects unknown properties and unsafe model identifiers', () => {
    expect(() => parseBridgeAnalyzeRequest({
      ...request() as object,
      executable: '/usr/local/bin/codex',
    })).toThrow(/invalid bridge request/i);
    expect(() => parseBridgeAnalyzeRequest(request({ modelId: 'bad\nmodel' })))
      .toThrow(/invalid bridge request/i);
    expect(() => parseBridgeAnalyzeRequest(request({ modelId: 'x'.repeat(201) })))
      .toThrow(/invalid bridge request/i);
  });

  it('enforces screenshot count, encoding, and decoded byte limits', () => {
    const screenshot = {
      id: 'shot-1',
      timestamp: 1_700_000_001_000,
      width: 100,
      height: 80,
      mimeType: 'image/png' as const,
      dataBase64: Buffer.from('png').toString('base64'),
    };

    expect(() => parseBridgeAnalyzeRequest(request({
      session: { ...minimalSession, screenshots: Array.from({ length: 21 }, () => screenshot) },
    }))).toThrow(/invalid bridge request/i);
    expect(() => parseBridgeAnalyzeRequest(request({
      session: {
        ...minimalSession,
        screenshots: [{ ...screenshot, dataBase64: '***not-base64***' }],
      },
    }))).toThrow(/invalid bridge request/i);
    expect(() => parseBridgeAnalyzeRequest(request({
      session: {
        ...minimalSession,
        screenshots: [{
          ...screenshot,
          dataBase64: Buffer.alloc(8 * 1024 * 1024 + 1).toString('base64'),
        }],
      },
    }))).toThrow(/invalid bridge request/i);
  });

  it('bounds transcript and feedback arrays', () => {
    const transcript = {
      text: 'A note',
      isFinal: true,
      confidence: 0.9,
      timestamp: 1_700_000_001,
      tier: 'whisper' as const,
    };
    const feedback = {
      id: 'feedback-1',
      timestamp: 1_700_000_001_000,
      text: 'A note',
      confidence: 0.9,
    };

    expect(() => parseBridgeAnalyzeRequest(request({
      session: {
        ...minimalSession,
        transcriptBuffer: Array.from({ length: 2_001 }, () => transcript),
      },
    }))).toThrow(/invalid bridge request/i);
    expect(() => parseBridgeAnalyzeRequest(request({
      session: {
        ...minimalSession,
        feedbackItems: Array.from({ length: 2_001 }, () => feedback),
      },
    }))).toThrow(/invalid bridge request/i);
  });
});
