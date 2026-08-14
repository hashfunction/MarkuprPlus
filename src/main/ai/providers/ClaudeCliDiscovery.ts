import { constants as fsConstants } from 'node:fs';
import { access, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join, resolve } from 'node:path';
import type { AnalysisModelOption, AnalysisProviderStatus } from '../../../shared/types';
import {
  runCliProcess,
  type CliProcessOptions,
  type CliProcessResult,
} from '../CliProcessRunner';
import { buildCliEnvironment } from '../CodexCliDiscovery';

const PROBE_TIMEOUT_MS = 5_000;
const PROBE_OUTPUT_BYTES = 16 * 1024;

const CLAUDE_MODELS: AnalysisModelOption[] = [
  { id: '', name: 'Claude default', source: 'default' },
  { id: 'sonnet', name: 'Sonnet', source: 'preset' },
  { id: 'opus', name: 'Opus', source: 'preset' },
  { id: 'haiku', name: 'Haiku', source: 'preset' },
];

export interface ClaudeCliDiscoveryDependencies {
  env: NodeJS.ProcessEnv;
  homeDirectory: string;
  shell: string;
  isExecutable(path: string): Promise<boolean>;
  realpath(path: string): Promise<string>;
  run(options: CliProcessOptions): Promise<CliProcessResult>;
}

function defaultDependencies(): ClaudeCliDiscoveryDependencies {
  return {
    env: process.env,
    homeDirectory: homedir(),
    shell: process.env.SHELL || (process.platform === 'win32' ? 'cmd.exe' : '/bin/zsh'),
    isExecutable: async (path) => {
      try {
        await access(path, fsConstants.F_OK | fsConstants.X_OK);
        return true;
      } catch {
        return false;
      }
    },
    realpath,
    run: runCliProcess,
  };
}

function directCandidates(environment: NodeJS.ProcessEnv, homeDirectory: string): string[] {
  const pathCandidates = (environment.PATH || '')
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => resolve(directory, 'claude'));

  return [...new Set([
    ...pathCandidates,
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    join(homeDirectory, '.local', 'bin', 'claude'),
  ])];
}

export class ClaudeCliDiscovery {
  private readonly dependencies: ClaudeCliDiscoveryDependencies;
  private cachedStatus: AnalysisProviderStatus | null = null;

  constructor(dependencies: Partial<ClaudeCliDiscoveryDependencies> = {}) {
    this.dependencies = { ...defaultDependencies(), ...dependencies };
  }

  async discover(forceRefresh = false): Promise<AnalysisProviderStatus> {
    if (!forceRefresh && this.cachedStatus) return this.cachedStatus;

    const executablePath = await this.resolveExecutable();
    if (!executablePath) {
      return this.cache({
        id: 'claude-cli',
        name: 'Claude Code CLI',
        connection: 'cli',
        installed: false,
        authenticated: false,
        ready: false,
        diagnostic: 'Claude Code CLI was not found. Install Claude Code, then scan again.',
        models: CLAUDE_MODELS,
      });
    }

    const environment = buildCliEnvironment(executablePath, this.dependencies.env);
    const [versionResult, authResult] = await Promise.all([
      this.dependencies.run({
        executable: executablePath,
        args: ['--version'],
        env: environment,
        timeoutMs: PROBE_TIMEOUT_MS,
        maxOutputBytes: PROBE_OUTPUT_BYTES,
      }),
      this.dependencies.run({
        executable: executablePath,
        args: ['auth', 'status'],
        env: environment,
        timeoutMs: PROBE_TIMEOUT_MS,
        maxOutputBytes: PROBE_OUTPUT_BYTES,
      }),
    ]);

    const authenticated = authResult.exitCode === 0 && !authResult.timedOut;
    const version = versionResult.exitCode === 0
      ? versionResult.stdout.trim().split(/\r?\n/, 1)[0]
      : undefined;

    return this.cache({
      id: 'claude-cli',
      name: 'Claude Code CLI',
      connection: 'cli',
      installed: true,
      executablePath,
      ...(version ? { version } : {}),
      authenticated,
      ready: authenticated,
      models: CLAUDE_MODELS,
      ...(!authenticated
        ? {
            diagnostic:
              'Claude Code CLI is installed but not authenticated. Run claude auth login, then scan again.',
          }
        : {}),
    });
  }

  private cache(status: AnalysisProviderStatus): AnalysisProviderStatus {
    this.cachedStatus = status;
    return status;
  }

  private async resolveExecutable(): Promise<string | null> {
    for (const candidate of directCandidates(this.dependencies.env, this.dependencies.homeDirectory)) {
      if (await this.validateCandidate(candidate)) return candidate;
    }

    if (process.platform === 'win32') return null;

    const shellResult = await this.dependencies.run({
      executable: this.dependencies.shell,
      args: ['-lic', 'command -v claude'],
      env: this.dependencies.env,
      timeoutMs: PROBE_TIMEOUT_MS,
      maxOutputBytes: PROBE_OUTPUT_BYTES,
    });
    if (shellResult.exitCode !== 0 || shellResult.timedOut) return null;

    const candidate = shellResult.stdout.trim().split(/\r?\n/, 1)[0];
    if (!candidate || !isAbsolute(candidate)) return null;
    return await this.validateCandidate(candidate) ? candidate : null;
  }

  private async validateCandidate(candidate: string): Promise<boolean> {
    if (!(await this.dependencies.isExecutable(candidate))) return false;
    try {
      await this.dependencies.realpath(candidate);
      return true;
    } catch {
      return false;
    }
  }
}

export const claudeCliDiscovery = new ClaudeCliDiscovery();
