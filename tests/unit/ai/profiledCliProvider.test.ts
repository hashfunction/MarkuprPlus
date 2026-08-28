import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../../../src/main/SessionController';
import type { CliProcessOptions, CliProcessResult } from '../../../src/main/ai/CliProcessRunner';
import {
  CLI_PROVIDER_PROFILES,
  ProfiledCliProvider,
  extractCliAnalysisResult,
} from '../../../src/main/ai/providers/ProfiledCliProvider';

const analysis = {
  summary: 'One issue found.',
  items: [],
  themes: [],
  positiveNotes: [],
  metadata: { totalItems: 0, criticalCount: 0, highCount: 0 },
};

const session = {
  id: 'cli-profile-session',
  startTime: 1_700_000_000_000,
  state: 'complete',
  sourceId: 'screen:0:0',
  feedbackItems: [],
  transcriptBuffer: [{
    text: 'The primary action is hard to find.',
    isFinal: true,
    confidence: 0.95,
    timestamp: 1_700_000_001,
    tier: 'whisper',
  }],
  screenshotBuffer: [],
  metadata: { sourceName: 'Editor', startTime: 1_700_000_000_000 },
} as Session;

function result(overrides: Partial<CliProcessResult> = {}): CliProcessResult {
  return {
    exitCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    truncated: false,
    ...overrides,
  };
}

describe('CLI provider profiles', () => {
  it('does not register headless CLIs whose tool restrictions can be bypassed', () => {
    expect(CLI_PROVIDER_PROFILES.map(({ id }) => id)).not.toContain('gemini-cli');
    expect(CLI_PROVIDER_PROFILES.map(({ id }) => id)).not.toContain('github-copilot-cli');
  });

  it('does not advertise excluded headless CLIs as available providers', async () => {
    const readme = await readFile('README.md', 'utf8');

    expect(readme).not.toContain('| **Gemini CLI**');
    expect(readme).not.toContain('| **GitHub Copilot CLI**');
    expect(readme).toContain('Codex CLI and OpenCode can receive captured screenshots.');
  });

  it('defines every additional CLI with a unique executable and safe invocation', () => {
    expect(CLI_PROVIDER_PROFILES.map(({ id, name, executables }) => ({
      id,
      name,
      executable: executables[0],
    }))).toEqual([
      { id: 'opencode-cli', name: 'OpenCode', executable: 'opencode2' },
      { id: 'cursor-cli', name: 'Cursor Agent CLI', executable: 'agent' },
      { id: 'qwen-cli', name: 'Qwen Code', executable: 'qwen' },
      { id: 'goose-cli', name: 'Goose', executable: 'goose' },
      { id: 'amp-cli', name: 'Amp', executable: 'amp' },
      { id: 'kiro-cli', name: 'Kiro CLI', executable: 'kiro-cli' },
      { id: 'aider-cli', name: 'Aider', executable: 'aider' },
    ]);

    const prompt = 'Return a report';
    expect(CLI_PROVIDER_PROFILES.find(({ id }) => id === 'cursor-cli')
      ?.buildArgs({ prompt, modelId: undefined, imagePaths: [] }))
      .toContain('--mode=ask');
    expect(CLI_PROVIDER_PROFILES.find(({ id }) => id === 'opencode-cli')
      ?.buildArgs({ prompt, modelId: undefined, imagePaths: [] }))
      .toEqual(expect.arrayContaining(['--agent', 'markuprx-report']));
    expect(CLI_PROVIDER_PROFILES.find(({ id }) => id === 'qwen-cli')
      ?.buildArgs({ prompt, modelId: undefined, imagePaths: [] }))
      .toContain('--safe-mode');
    expect(CLI_PROVIDER_PROFILES.find(({ id }) => id === 'kiro-cli')
      ?.buildArgs({ prompt, modelId: undefined, imagePaths: [] }))
      .toContain('--trust-tools=read,grep');
    expect(CLI_PROVIDER_PROFILES.find(({ id }) => id === 'goose-cli')
      ?.buildArgs({ prompt, modelId: 'claude-sonnet', imagePaths: [] }))
      .toEqual([
        'run', '--no-profile', '--no-session', '--quiet', '--output-format', 'text',
        '--model', 'claude-sonnet',
        '--instructions', '-',
      ]);
    expect(CLI_PROVIDER_PROFILES.find(({ id }) => id === 'aider-cli')
      ?.buildArgs({ prompt, modelId: undefined, imagePaths: [] }))
      .toEqual(expect.arrayContaining(['--dry-run', '--no-auto-commits', '--no-git']));
  });

  it('discovers an executable from PATH and reports its version', async () => {
    const profile = CLI_PROVIDER_PROFILES[0];
    const run = vi.fn(async (options: CliProcessOptions) => {
      expect(options.executable).toBe('/tools/opencode2');
      expect(options.args).toEqual(['--version']);
      return result({ stdout: 'opencode 2.2.3\n' });
    });
    const provider = new ProfiledCliProvider(profile, {
      env: { PATH: '/tools' },
      homeDirectory: '/home/tester',
      shell: '/bin/zsh',
      isExecutable: async (path) => path === '/tools/opencode2',
      realpath: async (path) => path,
      run,
    });

    await expect(provider.discover()).resolves.toEqual(expect.objectContaining({
      id: 'opencode-cli',
      executablePath: '/tools/opencode2',
      installed: true,
      ready: true,
      version: 'opencode 2.2.3',
      models: [{ id: '', name: 'OpenCode default', source: 'default' }],
    }));
  });

  it('returns an actionable diagnostic when a CLI is not installed', async () => {
    const profile = CLI_PROVIDER_PROFILES.find(({ id }) => id === 'opencode-cli')!;
    const provider = new ProfiledCliProvider(profile, {
      env: { PATH: '' },
      homeDirectory: '/home/tester',
      shell: '/bin/zsh',
      isExecutable: async () => false,
      realpath: async (path) => path,
      run: async () => result({ exitCode: 1 }),
    });

    await expect(provider.discover()).resolves.toMatchObject({
      installed: false,
      ready: false,
      diagnostic: 'OpenCode was not found. Install and sign in to OpenCode, then scan again.',
    });
  });

  it('does not report a broken executable as ready', async () => {
    const profile = CLI_PROVIDER_PROFILES.find(({ id }) => id === 'cursor-cli')!;
    const provider = new ProfiledCliProvider(profile, {
      env: { PATH: '/tools' },
      homeDirectory: '/home/tester',
      shell: '/bin/zsh',
      isExecutable: async (path) => path === '/tools/agent',
      realpath: async (path) => path,
      run: async () => result({ exitCode: 2, stderr: 'unsupported runtime' }),
    });

    await expect(provider.discover()).resolves.toMatchObject({
      installed: true,
      authenticated: false,
      ready: false,
      diagnostic: expect.stringContaining('could not be validated'),
    });
  });

  it('fails closed for OpenCode V1 instead of using a permissive fallback agent', async () => {
    const profile = CLI_PROVIDER_PROFILES.find(({ id }) => id === 'opencode-cli')!;
    const provider = new ProfiledCliProvider(profile, {
      env: { PATH: '/tools' },
      homeDirectory: '/home/tester',
      shell: '/bin/zsh',
      isExecutable: async (path) => path === '/tools/opencode',
      realpath: async (path) => path,
      run: async () => result({ stdout: 'opencode 1.9.0' }),
    });

    await expect(provider.discover()).resolves.toMatchObject({
      installed: true,
      ready: false,
      diagnostic: expect.stringContaining('OpenCode V2 or newer'),
    });
  });

  it('requires Kiro headless authentication before reporting ready', async () => {
    const profile = CLI_PROVIDER_PROFILES.find(({ id }) => id === 'kiro-cli')!;
    const provider = new ProfiledCliProvider(profile, {
      env: { PATH: '/tools' },
      homeDirectory: '/home/tester',
      shell: '/bin/zsh',
      isExecutable: async (path) => path === '/tools/kiro-cli',
      realpath: async (path) => path,
      run: async () => result({ stdout: '3.0.0' }),
    });

    await expect(provider.discover()).resolves.toMatchObject({
      installed: true,
      authenticated: false,
      ready: false,
      diagnostic: expect.stringContaining('KIRO_API_KEY'),
    });
  });

  it('runs analysis in an isolated directory and validates the structured response', async () => {
    const profile = CLI_PROVIDER_PROFILES.find(({ id }) => id === 'qwen-cli')!;
    const calls: CliProcessOptions[] = [];
    const run = vi.fn(async (options: CliProcessOptions) => {
      calls.push(options);
      if (options.args[0] === '--version') return result({ stdout: '0.9.0' });
      return result({ stdout: JSON.stringify({ response: JSON.stringify(analysis) }) });
    });
    const provider = new ProfiledCliProvider(profile, {
      env: { PATH: '/tools' },
      homeDirectory: '/home/tester',
      shell: '/bin/zsh',
      isExecutable: async (path) => path === '/tools/qwen',
      realpath: async (path) => path,
      run,
    });

    await expect(provider.analyze(session, 'qwen3-coder')).resolves.toEqual(analysis);
    const analysisCall = calls.at(-1)!;
    expect(analysisCall.cwd).toContain('markuprx-qwen-cli-');
    expect(analysisCall.args).toContain('qwen3-coder');
    expect(analysisCall.args.join(' ')).not.toContain('The primary action is hard to find.');
    expect(analysisCall.stdin).toContain('The primary action is hard to find.');
    expect(analysisCall.env?.NO_COLOR).toBe('1');
  });

  it('writes a hard-deny OpenCode agent configuration for every tool action', async () => {
    const profile = CLI_PROVIDER_PROFILES.find(({ id }) => id === 'opencode-cli')!;
    const run = vi.fn(async (options: CliProcessOptions) => {
      if (options.args[0] === '--version') return result({ stdout: '2.0.0' });
      const config = JSON.parse(await readFile(`${options.cwd}/opencode.json`, 'utf8'));
      expect(config.default_agent).toBe('markuprx-report');
      expect(config.agents['markuprx-report'].permissions).toEqual([
        { action: '*', resource: '*', effect: 'deny' },
      ]);
      expect(options.env?.OPENCODE_DISABLE_PROJECT_CONFIG).toBe('true');
      expect(JSON.parse(options.env?.OPENCODE_CONFIG_CONTENT || '{}'))
        .toEqual(config);
      expect(options.stdin).toContain('The primary action is hard to find.');
      return result({
        stdout: JSON.stringify({
          type: 'text',
          part: { type: 'text', text: JSON.stringify(analysis) },
        }),
      });
    });
    const provider = new ProfiledCliProvider(profile, {
      env: { PATH: '/tools' },
      homeDirectory: '/home/tester',
      shell: '/bin/zsh',
      isExecutable: async (path) => path === '/tools/opencode',
      realpath: async (path) => path,
      run,
    });

    await expect(provider.analyze(session)).resolves.toEqual(analysis);
  });

  it('runs Goose without profiles and in tool-free chat mode', async () => {
    const profile = CLI_PROVIDER_PROFILES.find(({ id }) => id === 'goose-cli')!;
    const run = vi.fn(async (options: CliProcessOptions) => {
      if (options.args[0] === '--version') return result({ stdout: '1.29.0' });
      expect(options.args).toContain('--no-profile');
      expect(options.env?.GOOSE_MODE).toBe('chat');
      expect(options.stdin).toContain('The primary action is hard to find.');
      return result({ stdout: JSON.stringify(analysis) });
    });
    const provider = new ProfiledCliProvider(profile, {
      env: { PATH: '/tools' },
      homeDirectory: '/home/tester',
      shell: '/bin/zsh',
      isExecutable: async (path) => path === '/tools/goose',
      realpath: async (path) => path,
      run,
    });

    await expect(provider.analyze(session)).resolves.toEqual(analysis);
  });

  it('runs Amp with an isolated default-deny tool policy', async () => {
    const profile = CLI_PROVIDER_PROFILES.find(({ id }) => id === 'amp-cli')!;
    const run = vi.fn(async (options: CliProcessOptions) => {
      if (options.args[0] === '--version') return result({ stdout: '0.1.0' });
      const settingsFlag = options.args.indexOf('--settings-file');
      expect(settingsFlag).toBeGreaterThan(-1);
      const settings = JSON.parse(await readFile(options.args[settingsFlag + 1], 'utf8'));
      expect(settings).toEqual({
        'amp.dangerouslyAllowAll': false,
        'amp.permissions': [{
          tool: '*',
          action: 'reject',
          message: 'MarkuprPlus report generation does not allow tool use.',
        }],
      });
      return result({
        stdout: JSON.stringify({ type: 'result', result: JSON.stringify(analysis) }),
      });
    });
    const provider = new ProfiledCliProvider(profile, {
      env: { PATH: '/tools' },
      homeDirectory: '/home/tester',
      shell: '/bin/zsh',
      isExecutable: async (path) => path === '/tools/amp',
      realpath: async (path) => path,
      run,
    });

    await expect(provider.analyze(session)).resolves.toEqual(analysis);
  });

  it('rejects timed out, failed, truncated, and malformed CLI responses', async () => {
    const profile = CLI_PROVIDER_PROFILES.find(({ id }) => id === 'goose-cli')!;
    const outcomes = [
      result({ timedOut: true }),
      result({ exitCode: 2, stderr: 'not signed in' }),
      result({ truncated: true, stdout: '{}' }),
      result({ stdout: 'not json' }),
    ];

    for (const [index, outcome] of outcomes.entries()) {
      const provider = new ProfiledCliProvider(profile, {
        env: { PATH: '/tools' },
        homeDirectory: '/home/tester',
        shell: '/bin/zsh',
        isExecutable: async (path) => path === '/tools/goose',
        realpath: async (path) => path,
        run: async (options) => options.args[0] === '--version'
          ? result({ stdout: '1.0.0' })
          : outcome,
      });
      await expect(provider.analyze(session)).rejects.toThrow([
        'Goose analysis timed out',
        'Goose analysis exited with status 2: not signed in',
        'Goose analysis produced excessive command output',
        'Goose analysis returned invalid structured output',
      ][index]);
    }
  });

  it('rejects screenshot-only input when a CLI cannot receive images', async () => {
    const profile = CLI_PROVIDER_PROFILES.find(({ id }) => id === 'aider-cli')!;
    const provider = new ProfiledCliProvider(profile, {
      env: { PATH: '/tools' },
      homeDirectory: '/home/tester',
      shell: '/bin/zsh',
      isExecutable: async (path) => path === '/tools/aider',
      realpath: async (path) => path,
      run: async () => result({ stdout: '1.0.0' }),
    });
    const screenshotOnly = {
      ...session,
      transcriptBuffer: [],
      screenshotBuffer: [{ timestamp: session.startTime, buffer: Buffer.from('png') }],
    } as Session;

    await expect(provider.analyze(screenshotOnly)).rejects.toThrow(
      'Aider cannot analyze a screenshot-only session',
    );
  });

  it('discovers Windows command shims using PATHEXT', async () => {
    const profile = CLI_PROVIDER_PROFILES.find(({ id }) => id === 'opencode-cli')!;
    const provider = new ProfiledCliProvider(profile, {
      platform: 'win32',
      env: { PATH: 'C:\\Tools', PATHEXT: '.COM;.EXE;.BAT;.CMD' },
      homeDirectory: 'C:\\Users\\tester',
      shell: 'cmd.exe',
      isExecutable: async (path) => path.toLowerCase().endsWith('opencode2.cmd'),
      realpath: async (path) => path,
      run: async () => result({ stdout: '2.0.0' }),
    });

    await expect(provider.discover()).resolves.toMatchObject({
      installed: true,
      ready: true,
      executablePath: expect.stringMatching(/opencode2\.cmd$/i),
    });
  });
});

describe('extractCliAnalysisResult', () => {
  it.each([
    JSON.stringify(analysis),
    `\`\`\`json\n${JSON.stringify(analysis)}\n\`\`\``,
    JSON.stringify({ response: JSON.stringify(analysis) }),
    JSON.stringify([{ type: 'result', result: JSON.stringify(analysis) }]),
    `${JSON.stringify({ type: 'step', text: 'working' })}\n${JSON.stringify({ type: 'result', result: JSON.stringify(analysis) })}`,
    JSON.stringify({ type: 'text', part: { type: 'text', text: JSON.stringify(analysis) } }),
  ])('extracts validated analysis from supported CLI output envelopes', (output) => {
    expect(extractCliAnalysisResult(output)).toEqual(analysis);
  });

  it('does not accept valid-looking JSON echoed from a tool or progress event', () => {
    expect(() => extractCliAnalysisResult(JSON.stringify({
      type: 'tool_result',
      output: JSON.stringify(analysis),
    }))).toThrow('Invalid structured CLI output');
    expect(() => extractCliAnalysisResult(JSON.stringify({
      type: 'progress',
      text: JSON.stringify(analysis),
    }))).toThrow('Invalid structured CLI output');
  });

  it('strictly rejects incomplete analysis objects', () => {
    expect(() => extractCliAnalysisResult(JSON.stringify({
      summary: 'Looks valid at a glance',
      items: [],
    }))).toThrow('Invalid structured CLI output');
  });
});
