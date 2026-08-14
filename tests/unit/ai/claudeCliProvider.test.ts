import { access } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { Session } from '../../../src/main/SessionController';
import type { AnalysisProviderStatus } from '../../../src/shared/types';
import type { CliProcessOptions, CliProcessResult } from '../../../src/main/ai/CliProcessRunner';
import {
  ClaudeCliDiscovery,
  type ClaudeCliDiscoveryDependencies,
} from '../../../src/main/ai/providers/ClaudeCliDiscovery';
import {
  ClaudeCliAnalyzer,
  ClaudeCliError,
  type ClaudeCliAnalyzerDependencies,
} from '../../../src/main/ai/providers/ClaudeCliAnalyzer';

const success = (stdout = ''): CliProcessResult => ({
  exitCode: 0,
  stdout,
  stderr: '',
  timedOut: false,
  truncated: false,
});

const validAnalysis = {
  summary: 'One issue found.',
  items: [{
    title: 'Save action is hidden',
    category: 'UX Issue',
    priority: 'High',
    quote: 'The save button is hard to find',
    screenshotIndices: [],
    actionItem: 'Move save into the primary toolbar.',
    area: 'Editor toolbar',
  }],
  themes: ['discoverability'],
  positiveNotes: [],
  metadata: { totalItems: 1, criticalCount: 0, highCount: 1 },
};

const sessionFixture: Session = {
  id: 'claude-cli-session',
  startTime: 1_700_000_000_000,
  endTime: 1_700_000_005_000,
  state: 'complete',
  sourceId: 'screen:0:0',
  feedbackItems: [],
  transcriptBuffer: [{
    text: 'The save button is hard to find',
    isFinal: true,
    confidence: 0.95,
    timestamp: 1_700_000_001,
    tier: 'whisper',
  }],
  screenshotBuffer: [{
    id: 'ignored-screenshot',
    timestamp: 1_700_000_001_500,
    buffer: Buffer.from('image-data'),
    width: 1280,
    height: 720,
  }],
  metadata: { sourceName: 'Editor', startTime: 1_700_000_000_000 },
};

function discoveryDependencies(
  overrides: Partial<ClaudeCliDiscoveryDependencies> = {},
): ClaudeCliDiscoveryDependencies {
  return {
    env: { PATH: '/custom/bin:/usr/bin' },
    homeDirectory: '/Users/tester',
    shell: '/bin/zsh',
    isExecutable: async (path) => path === '/custom/bin/claude',
    realpath: async (path) => path,
    run: async ({ args }) => args.includes('--version')
      ? success('2.1.185 (Claude Code)\n')
      : success(JSON.stringify({ loggedIn: true })),
    ...overrides,
  };
}

const readyClaude: AnalysisProviderStatus = {
  id: 'claude-cli',
  name: 'Claude Code CLI',
  connection: 'cli',
  installed: true,
  executablePath: '/custom/bin/claude',
  version: '2.1.185 (Claude Code)',
  authenticated: true,
  ready: true,
};

function analyzerDependencies(
  run: ClaudeCliAnalyzerDependencies['run'],
  status: AnalysisProviderStatus = readyClaude,
): ClaudeCliAnalyzerDependencies {
  return {
    discovery: { discover: async () => status },
    run,
  };
}

describe('ClaudeCliDiscovery', () => {
  it('reports authenticated Claude with safe model choices', async () => {
    const discovery = new ClaudeCliDiscovery(discoveryDependencies());

    await expect(discovery.discover()).resolves.toEqual({
      ...readyClaude,
      models: [
        { id: '', name: 'Claude default', source: 'default' },
        { id: 'sonnet', name: 'Sonnet', source: 'preset' },
        { id: 'opus', name: 'Opus', source: 'preset' },
        { id: 'haiku', name: 'Haiku', source: 'preset' },
      ],
    });
  });

  it('returns actionable missing and logged-out diagnostics', async () => {
    const missing = new ClaudeCliDiscovery(discoveryDependencies({
      isExecutable: async () => false,
      run: async () => ({ ...success(), exitCode: 1 }),
    }));
    await expect(missing.discover()).resolves.toMatchObject({
      id: 'claude-cli',
      installed: false,
      ready: false,
      diagnostic: 'Claude Code CLI was not found. Install Claude Code, then scan again.',
    });

    const loggedOut = new ClaudeCliDiscovery(discoveryDependencies({
      run: async ({ args }) => args.includes('--version')
        ? success('2.1.185 (Claude Code)\n')
        : { ...success(), exitCode: 1, stderr: 'Not logged in' },
    }));
    await expect(loggedOut.discover()).resolves.toMatchObject({
      installed: true,
      authenticated: false,
      ready: false,
      diagnostic: 'Claude Code CLI is installed but not authenticated. Run claude auth login, then scan again.',
    });
  });
});

describe('ClaudeCliAnalyzer', () => {
  it('runs transcript-only structured analysis with safe mode and no tools', async () => {
    let invocation: CliProcessOptions | undefined;
    let temporaryDirectory = '';
    const analyzer = new ClaudeCliAnalyzer(analyzerDependencies(async (options) => {
      invocation = options;
      temporaryDirectory = options.cwd || '';
      return success(JSON.stringify({
        type: 'result',
        subtype: 'success',
        structured_output: validAnalysis,
      }));
    }));

    const result = await analyzer.analyze(sessionFixture, 'sonnet');

    expect(result.summary).toBe('One issue found.');
    expect(invocation?.args).toEqual(expect.arrayContaining([
      '--print',
      '--safe-mode',
      '--tools',
      '',
      '--disable-slash-commands',
      '--no-session-persistence',
      '--output-format',
      'json',
      '--json-schema',
      expect.any(String),
      '--model',
      'sonnet',
    ]));
    expect(invocation?.args).not.toContain('--add-dir');
    expect(invocation?.stdin).toContain('The save button is hard to find');
    expect(invocation?.stdin).toContain('Editor');
    expect(invocation?.stdin).not.toContain('ignored-screenshot');
    expect(invocation?.timeoutMs).toBe(180_000);
    await expect(access(temporaryDirectory)).rejects.toThrow();
  });

  it('reports timeout and invalid structured output without raw provider content', async () => {
    const timedOut = new ClaudeCliAnalyzer(analyzerDependencies(async () => ({
      ...success(),
      exitCode: null,
      timedOut: true,
    })));
    await expect(timedOut.analyze(sessionFixture)).rejects.toEqual(
      new ClaudeCliError('Claude analysis timed out after 180 seconds.', 'TIMEOUT'),
    );

    const invalid = new ClaudeCliAnalyzer(analyzerDependencies(async () =>
      success('{not-json')));
    await expect(invalid.analyze(sessionFixture)).rejects.toMatchObject({
      name: 'ClaudeCliError',
      code: 'INVALID_OUTPUT',
      message: 'Claude analysis returned invalid structured output.',
    });
  });
});
