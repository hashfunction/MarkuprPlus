import { describe, expect, it } from 'vitest';
import type { CliProcessOptions, CliProcessResult } from '../../../src/main/ai/CliProcessRunner';
import {
  buildCliEnvironment,
  CodexCliDiscovery,
  type CodexCliDiscoveryDependencies,
} from '../../../src/main/ai/CodexCliDiscovery';

const success = (stdout: string): CliProcessResult => ({
  exitCode: 0,
  stdout,
  stderr: '',
  timedOut: false,
  truncated: false,
});

function dependencies(
  overrides: Partial<CodexCliDiscoveryDependencies> = {},
): CodexCliDiscoveryDependencies {
  return {
    env: { PATH: '/custom/bin:/usr/bin' },
    homeDirectory: '/Users/tester',
    shell: '/bin/zsh',
    isExecutable: async (path) => path === '/custom/bin/codex',
    realpath: async (path) => path,
    run: async ({ args }) => {
      if (args.includes('--version')) return success('codex-cli 0.147.0\n');
      if (args[0] === 'debug') {
        return success(JSON.stringify({
          models: [
            { slug: 'gpt-5.6-terra', display_name: 'GPT-5.6 Terra' },
            { slug: 'gpt-5.6-sol', display_name: 'GPT-5.6 Sol' },
          ],
        }));
      }
      return success('Logged in using ChatGPT\n');
    },
    ...overrides,
  };
}

describe('CodexCliDiscovery', () => {
  it('reports the resolved version and authentication state for a PATH installation', async () => {
    const discovery = new CodexCliDiscovery(dependencies());

    await expect(discovery.discover()).resolves.toEqual({
      id: 'codex-cli',
      name: 'Codex CLI',
      connection: 'cli',
      installed: true,
      executablePath: '/custom/bin/codex',
      version: 'codex-cli 0.147.0',
      authenticated: true,
      ready: true,
      models: [
        { id: '', name: 'Codex default', source: 'default' },
        { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', source: 'discovered' },
        { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', source: 'discovered' },
      ],
    });
  });

  it('finds Homebrew Codex when a Finder-style PATH omits Homebrew', async () => {
    const discovery = new CodexCliDiscovery(dependencies({
      env: { PATH: '/usr/bin:/bin' },
      isExecutable: async (path) => path === '/opt/homebrew/bin/codex',
    }));

    const status = await discovery.discover();

    expect(status.executablePath).toBe('/opt/homebrew/bin/codex');
    expect(status.ready).toBe(true);
  });

  it('uses the login shell only after direct candidates are exhausted', async () => {
    const run = async (options: CliProcessOptions): Promise<CliProcessResult> => {
      if (options.executable === '/bin/zsh') return success('/shell/bin/codex\n');
      if (options.args.includes('--version')) return success('codex-cli 0.147.0\n');
      return success('Logged in using ChatGPT\n');
    };
    const discovery = new CodexCliDiscovery(dependencies({
      isExecutable: async (path) => path === '/shell/bin/codex',
      run,
    }));

    const status = await discovery.discover();

    expect(status.executablePath).toBe('/shell/bin/codex');
    expect(status.ready).toBe(true);
  });

  it('reports a missing installation with actionable guidance', async () => {
    const discovery = new CodexCliDiscovery(dependencies({
      isExecutable: async () => false,
      run: async () => ({
        exitCode: 1,
        stdout: '',
        stderr: 'not found',
        timedOut: false,
        truncated: false,
      }),
    }));

    await expect(discovery.discover()).resolves.toEqual({
      id: 'codex-cli',
      name: 'Codex CLI',
      connection: 'cli',
      installed: false,
      authenticated: false,
      ready: false,
      diagnostic: 'Codex CLI was not found. Install Codex, then scan again.',
      models: [{ id: '', name: 'Codex default', source: 'default' }],
    });
  });

  it('keeps an installed but logged-out Codex unavailable', async () => {
    const discovery = new CodexCliDiscovery(dependencies({
      run: async ({ args }) => args.includes('--version')
        ? success('codex-cli 0.147.0\n')
        : {
            exitCode: 1,
            stdout: '',
            stderr: 'Not logged in',
            timedOut: false,
            truncated: false,
          },
    }));

    const status = await discovery.discover();

    expect(status).toMatchObject({
      installed: true,
      authenticated: false,
      ready: false,
      diagnostic: 'Codex CLI is installed but not authenticated. Run codex login, then scan again.',
    });
  });

  it('keeps Codex ready when the experimental model catalog fails', async () => {
    const discovery = new CodexCliDiscovery(dependencies({
      run: async ({ args }) => {
        if (args.includes('--version')) return success('codex-cli 0.147.0\n');
        if (args[0] === 'debug') {
          return { ...success(''), exitCode: 2, stderr: 'unsupported command' };
        }
        return success('Logged in using ChatGPT\n');
      },
    }));

    const status = await discovery.discover();

    expect(status).toMatchObject({
      ready: true,
      models: [{ id: '', name: 'Codex default', source: 'default' }],
    });
  });

  it('puts the resolved executable directory first in child PATH', () => {
    const environment = buildCliEnvironment('/opt/homebrew/bin/codex', {
      PATH: '/usr/bin:/bin',
      HOME: '/Users/tester',
    });

    expect(environment.PATH?.split(':').slice(0, 3)).toEqual([
      '/opt/homebrew/bin',
      '/usr/bin',
      '/bin',
    ]);
    expect(environment.HOME).toBe('/Users/tester');
  });
});
