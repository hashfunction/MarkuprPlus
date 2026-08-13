import { access, writeFile } from 'node:fs/promises';
import type { Session } from '../../../src/main/SessionController';
import type { AnalysisProviderStatus } from '../../../src/shared/types';
import { describe, expect, it } from 'vitest';
import type { CliProcessOptions, CliProcessResult } from '../../../src/main/ai/CliProcessRunner';
import {
  CodexAnalyzer,
  CodexCliError,
  type CodexAnalyzerDependencies,
} from '../../../src/main/ai/CodexAnalyzer';

const readyCodex: AnalysisProviderStatus = {
  id: 'codex',
  name: 'Codex CLI',
  installed: true,
  executablePath: '/opt/homebrew/bin/codex',
  version: 'codex-cli 0.147.0',
  authenticated: true,
  ready: true,
};

const validAnalysis = {
  summary: 'One issue found.',
  items: [{
    title: 'Header button overlap',
    category: 'Bug',
    priority: 'High',
    quote: 'Button overlaps the header',
    screenshotIndices: [0],
    actionItem: 'Add spacing between the button and header.',
    area: 'Header',
  }],
  themes: ['layout'],
  positiveNotes: [],
  metadata: { totalItems: 1, criticalCount: 0, highCount: 1 },
};

const sessionFixture: Session = {
  id: 'session-1',
  startTime: 1_700_000_000_000,
  endTime: 1_700_000_010_000,
  state: 'complete',
  sourceId: 'screen:0:0',
  feedbackItems: [],
  transcriptBuffer: [{
    text: 'Button overlaps the header',
    isFinal: true,
    confidence: 0.98,
    timestamp: 1_700_000_001,
    tier: 'whisper',
  }],
  screenshotBuffer: [{
    id: 'shot-1',
    timestamp: 1_700_000_001_500,
    buffer: Buffer.from('png-image-data'),
    width: 1280,
    height: 720,
  }],
  metadata: {
    sourceName: 'Test App',
    startTime: 1_700_000_000_000,
  },
};

const success = (): CliProcessResult => ({
  exitCode: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
  truncated: false,
});

function outputPath(options: CliProcessOptions): string {
  const index = options.args.indexOf('--output-last-message');
  if (index === -1 || !options.args[index + 1]) throw new Error('Missing output path');
  return options.args[index + 1];
}

function dependencies(
  run: CodexAnalyzerDependencies['run'],
  status: AnalysisProviderStatus = readyCodex,
): CodexAnalyzerDependencies {
  return {
    discovery: { discover: async () => status },
    run,
  };
}

describe('CodexAnalyzer', () => {
  it('runs Codex with safe flags, stdin context, images, and structured output', async () => {
    let invocation: CliProcessOptions | undefined;
    const analyzer = new CodexAnalyzer(dependencies(async (options) => {
      invocation = options;
      await writeFile(outputPath(options), JSON.stringify(validAnalysis));
      return success();
    }));

    const analysis = await analyzer.analyze(sessionFixture);

    expect(analysis.summary).toBe('One issue found.');
    expect(analysis.items[0]).toMatchObject({ title: 'Header button overlap', priority: 'High' });
    expect(invocation).toBeDefined();
    expect(invocation?.executable).toBe('/opt/homebrew/bin/codex');
    expect(invocation?.args).toEqual(expect.arrayContaining([
      'exec',
      '--ephemeral',
      '--sandbox',
      'read-only',
      '--ignore-user-config',
      '--ignore-rules',
      '--skip-git-repo-check',
      '--output-schema',
      '--output-last-message',
      '--image',
      '-',
    ]));
    expect(invocation?.args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(invocation?.stdin).toContain('Button overlaps the header');
    expect(invocation?.stdin).toContain('Test App');
    expect(invocation?.timeoutMs).toBe(180_000);
    expect(invocation?.cwd).toContain('markupr-codex-');
  });

  it('removes its temporary directory after a successful run', async () => {
    let temporaryDirectory = '';
    const analyzer = new CodexAnalyzer(dependencies(async (options) => {
      temporaryDirectory = options.cwd || '';
      await writeFile(outputPath(options), JSON.stringify(validAnalysis));
      return success();
    }));

    await analyzer.analyze(sessionFixture);

    await expect(access(temporaryDirectory)).rejects.toThrow();
  });

  it('rejects an unavailable or logged-out Codex before spawning analysis', async () => {
    const analyzer = new CodexAnalyzer(dependencies(
      async () => { throw new Error('runner must not be called'); },
      {
        ...readyCodex,
        authenticated: false,
        ready: false,
        diagnostic: 'Codex CLI is installed but not authenticated. Run codex login, then scan again.',
      },
    ));

    await expect(analyzer.analyze(sessionFixture)).rejects.toMatchObject({
      name: 'CodexCliError',
      code: 'NOT_READY',
    });
  });

  it('reports timeouts without attempting to parse a result', async () => {
    const analyzer = new CodexAnalyzer(dependencies(async () => ({
      ...success(),
      exitCode: null,
      timedOut: true,
    })));

    await expect(analyzer.analyze(sessionFixture)).rejects.toEqual(
      new CodexCliError('Codex analysis timed out after 180 seconds.', 'TIMEOUT'),
    );
  });

  it('reports a non-zero Codex exit without exposing command output', async () => {
    const analyzer = new CodexAnalyzer(dependencies(async () => ({
      ...success(),
      exitCode: 7,
      stderr: 'secret diagnostic content',
    })));

    await expect(analyzer.analyze(sessionFixture)).rejects.toEqual(
      new CodexCliError('Codex analysis exited with status 7.', 'PROCESS_FAILED'),
    );
  });

  it('rejects malformed structured output and still removes temporary files', async () => {
    let temporaryDirectory = '';
    const analyzer = new CodexAnalyzer(dependencies(async (options) => {
      temporaryDirectory = options.cwd || '';
      await writeFile(outputPath(options), '{not-json');
      return success();
    }));

    await expect(analyzer.analyze(sessionFixture)).rejects.toMatchObject({
      code: 'INVALID_OUTPUT',
    });
    await expect(access(temporaryDirectory)).rejects.toThrow();
  });
});
