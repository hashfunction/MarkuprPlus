import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../../../src/main/SessionController';
import type { AIAnalysisResult } from '../../../src/main/ai/types';
import type {
  AnalysisProviderAdapter,
} from '../../../src/main/ai/providers/types';
import {
  AnalysisProviderRegistry,
  createCliAnalysisProviderRegistry,
  createDefaultAnalysisProviderRegistry,
} from '../../../src/main/ai/providers/AnalysisProviderRegistry';

const sessionFixture = {
  id: 'registry-session',
  startTime: 1_700_000_000_000,
  state: 'complete',
  sourceId: 'screen:0:0',
  feedbackItems: [],
  transcriptBuffer: [],
  screenshotBuffer: [],
} as Session;

const analysisFixture: AIAnalysisResult = {
  summary: 'One issue found.',
  items: [],
  themes: [],
  positiveNotes: [],
  metadata: { totalItems: 0, criticalCount: 0, highCount: 0 },
};

function adapter(
  id: AnalysisProviderAdapter['id'],
  name: string,
): AnalysisProviderAdapter & {
  discover: ReturnType<typeof vi.fn>;
  analyze: ReturnType<typeof vi.fn>;
} {
  return {
    id,
    name,
    connection: id === 'anthropic-api' ? 'cloud' : id.endsWith('-cli') ? 'cli' : 'local',
    discover: vi.fn(async () => ({
      id,
      name,
      connection: id === 'anthropic-api' ? 'cloud' : id.endsWith('-cli') ? 'cli' : 'local',
      installed: true,
      ready: true,
    })),
    analyze: vi.fn(async () => analysisFixture),
  };
}

describe('AnalysisProviderRegistry', () => {
  it('resolves exactly the registered provider', () => {
    const codex = adapter('codex-cli', 'Codex CLI');
    const claude = adapter('claude-cli', 'Claude Code CLI');
    const registry = new AnalysisProviderRegistry([codex, claude]);

    expect(registry.get('codex-cli')).toBe(codex);
    expect(registry.get('claude-cli')).toBe(claude);
    expect(() => registry.get('rules')).toThrow('Unsupported analysis provider: rules');
    expect(() => registry.get('unknown' as never)).toThrow(
      'Unsupported analysis provider: unknown',
    );
  });

  it('preserves adapter order during discovery and forwards refresh', async () => {
    const codex = adapter('codex-cli', 'Codex CLI');
    const ollama = adapter('ollama', 'Ollama');
    const registry = new AnalysisProviderRegistry([codex, ollama]);

    await expect(registry.discoverAll(true)).resolves.toEqual([
      expect.objectContaining({ id: 'codex-cli' }),
      expect.objectContaining({ id: 'ollama' }),
    ]);
    expect(codex.discover).toHaveBeenCalledWith(true);
    expect(ollama.discover).toHaveBeenCalledWith(true);
  });

  it('forwards the selected model to only the requested adapter', async () => {
    const codex = adapter('codex-cli', 'Codex CLI');
    const ollama = adapter('ollama', 'Ollama');
    const registry = new AnalysisProviderRegistry([codex, ollama]);

    await expect(
      registry.analyze('ollama', sessionFixture, 'qwen2.5:7b'),
    ).resolves.toEqual(analysisFixture);

    expect(ollama.analyze).toHaveBeenCalledWith(sessionFixture, 'qwen2.5:7b');
    expect(codex.analyze).not.toHaveBeenCalled();
  });

  it('rejects duplicate provider registrations', () => {
    expect(() => new AnalysisProviderRegistry([
      adapter('ollama', 'Ollama A'),
      adapter('ollama', 'Ollama B'),
    ])).toThrow('Duplicate analysis provider: ollama');
  });

  it('assembles every supported CLI adapter', () => {
    const registry = createCliAnalysisProviderRegistry();

    expect([
      'codex-cli',
      'claude-cli',
      'github-copilot-cli',
      'opencode-cli',
      'gemini-cli',
      'cursor-cli',
      'qwen-cli',
      'goose-cli',
      'amp-cli',
      'kiro-cli',
      'aider-cli',
    ].map((id) => registry.get(id as never))).toMatchObject([
      { id: 'codex-cli', name: 'Codex CLI', connection: 'cli' },
      { id: 'claude-cli', name: 'Claude Code CLI', connection: 'cli' },
      { id: 'github-copilot-cli', name: 'GitHub Copilot CLI', connection: 'cli' },
      { id: 'opencode-cli', name: 'OpenCode', connection: 'cli' },
      { id: 'gemini-cli', name: 'Gemini CLI', connection: 'cli' },
      { id: 'cursor-cli', name: 'Cursor Agent CLI', connection: 'cli' },
      { id: 'qwen-cli', name: 'Qwen Code', connection: 'cli' },
      { id: 'goose-cli', name: 'Goose', connection: 'cli' },
      { id: 'amp-cli', name: 'Amp', connection: 'cli' },
      { id: 'kiro-cli', name: 'Kiro CLI', connection: 'cli' },
      { id: 'aider-cli', name: 'Aider', connection: 'cli' },
    ]);
  });

  it('omits external CLI adapters when the distribution forbids child tools', () => {
    const settingsManager = {
      hasApiKey: vi.fn(async () => false),
      getApiKey: vi.fn(async () => null),
    } as never;
    const registry = createDefaultAnalysisProviderRegistry(settingsManager, false);

    expect(() => registry.get('codex-cli')).toThrow('Unsupported analysis provider: codex-cli');
    expect(() => registry.get('claude-cli')).toThrow('Unsupported analysis provider: claude-cli');
    expect(() => registry.get('github-copilot-cli')).toThrow(
      'Unsupported analysis provider: github-copilot-cli',
    );
    expect(registry.get('ollama')).toMatchObject({ id: 'ollama' });
    expect(registry.get('lmstudio')).toMatchObject({ id: 'lmstudio' });
    expect(registry.get('anthropic-api')).toMatchObject({ id: 'anthropic-api' });
  });
});
