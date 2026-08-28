import { constants as fsConstants } from 'node:fs';
import { access, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import type { AnalysisModelOption, AnalysisProviderStatus } from '../../../shared/types';
import type { Session } from '../../SessionController';
import {
  ANALYSIS_JSON_SCHEMA,
  ANALYSIS_SYSTEM_PROMPT,
  buildTranscriptText,
  parseAnalysisResult,
  toRelativeTimestamp,
} from '../analysisContract';
import { buildCliEnvironment } from '../CodexCliDiscovery';
import { runCliProcess } from '../CliProcessRunner';
import type { CliProcessOptions, CliProcessResult } from '../CliProcessRunner';
import type { AIAnalysisResult } from '../types';
import type { AnalysisProviderAdapter } from './types';

const PROBE_TIMEOUT_MS = 5_000;
const ANALYSIS_TIMEOUT_MS = 180_000;
const PROBE_OUTPUT_BYTES = 16 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;

export interface CliProviderProfile {
  id: AnalysisProviderAdapter['id'];
  name: string;
  executables: string[];
  versionArgs?: string[];
  minimumMajorVersion?: number;
  promptViaStdin?: boolean;
  supportsImages?: boolean;
  requiredEnvironmentVariable?: string;
  environment?: NodeJS.ProcessEnv;
  buildArgs(input: {
    prompt: string;
    modelId?: string;
    imagePaths: string[];
    settingsPath?: string;
    promptPath?: string;
  }): string[];
}

function addModel(args: string[], modelId: string | undefined, flag = '--model'): string[] {
  return modelId?.trim() ? [...args, flag, modelId.trim()] : args;
}

function addImages(args: string[], imagePaths: string[], flag: string): string[] {
  return imagePaths.reduce((result, path) => [...result, flag, path], args);
}

export const CLI_PROVIDER_PROFILES: CliProviderProfile[] = [
  {
    id: 'opencode-cli',
    name: 'OpenCode',
    executables: ['opencode2', 'opencode'],
    minimumMajorVersion: 2,
    promptViaStdin: true,
    supportsImages: true,
    buildArgs: ({ modelId, imagePaths }) => [
      ...addModel(addImages([
        'run', '--format', 'json', '--agent', 'markuprx-report',
      ], imagePaths, '--file'), modelId),
    ],
  },
  {
    id: 'cursor-cli',
    name: 'Cursor Agent CLI',
    executables: ['agent', 'cursor-agent'],
    promptViaStdin: true,
    buildArgs: ({ modelId }) => [
      ...addModel(['--print', '--output-format', 'json', '--mode=ask'], modelId),
    ],
  },
  {
    id: 'qwen-cli',
    name: 'Qwen Code',
    executables: ['qwen'],
    promptViaStdin: true,
    buildArgs: ({ modelId }) => addModel([
      '--output-format', 'json',
      '--safe-mode',
      '--approval-mode', 'plan',
      '--exclude-tools', 'shell,write,edit,agent',
    ], modelId),
  },
  {
    id: 'goose-cli',
    name: 'Goose',
    executables: ['goose'],
    promptViaStdin: true,
    environment: { GOOSE_MODE: 'chat' },
    buildArgs: ({ modelId }) => [
      'run',
      '--no-profile',
      '--no-session',
      '--quiet',
      '--output-format', 'text',
      ...(modelId?.trim() ? ['--model', modelId.trim()] : []),
      '--instructions', '-',
    ],
  },
  {
    id: 'amp-cli',
    name: 'Amp',
    executables: ['amp'],
    promptViaStdin: true,
    buildArgs: ({ settingsPath }) => [
      ...(settingsPath ? ['--settings-file', settingsPath] : []),
      '--execute', '--stream-json',
    ],
  },
  {
    id: 'kiro-cli',
    name: 'Kiro CLI',
    executables: ['kiro-cli'],
    promptViaStdin: true,
    requiredEnvironmentVariable: 'KIRO_API_KEY',
    buildArgs: () => [
      'chat', '--no-interactive', '--trust-tools=read,grep',
      'Analyze the supplied stdin context and return only the requested JSON.',
    ],
  },
  {
    id: 'aider-cli',
    name: 'Aider',
    executables: ['aider'],
    buildArgs: ({ prompt, promptPath, modelId }) => addModel([
      ...(promptPath ? ['--message-file', promptPath] : ['--message', prompt]),
      '--dry-run',
      '--no-auto-commits',
      '--no-git',
      '--yes',
      '--no-stream',
      '--no-pretty',
    ], modelId),
  },
];

const strictAnalysisSchema = z.object({
  summary: z.string(),
  items: z.array(z.object({
    title: z.string(),
    category: z.enum(['Bug', 'UX Issue', 'Performance', 'Suggestion', 'Question', 'Positive Note']),
    priority: z.enum(['Critical', 'High', 'Medium', 'Low']),
    quote: z.string(),
    screenshotIndices: z.array(z.number().int().nonnegative()),
    actionItem: z.string(),
    area: z.string(),
  }).strict()),
  themes: z.array(z.string()),
  positiveNotes: z.array(z.string()),
  metadata: z.object({
    totalItems: z.number().int().nonnegative(),
    criticalCount: z.number().int().nonnegative(),
    highCount: z.number().int().nonnegative(),
  }).strict(),
}).strict();

function tryAnalysis(candidate: string): AIAnalysisResult | null {
  try {
    strictAnalysisSchema.parse(JSON.parse(candidate));
    return parseAnalysisResult(candidate);
  } catch {
    return null;
  }
}

function parseJsonValues(output: string): unknown[] {
  try {
    return [JSON.parse(output)];
  } catch {
    const values: unknown[] = [];
    for (const line of output.split(/\r?\n/)) {
      try {
        values.push(JSON.parse(line));
      } catch {
        // Ignore non-JSON progress lines around documented JSON/JSONL records.
      }
    }
    return values;
  }
}

function terminalCandidate(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  if (object.error || object.is_error === true || object.subtype === 'error') return null;

  if (typeof object.response === 'string' && object.type === undefined) return object.response;
  if (typeof object.structured_output === 'string') return object.structured_output;
  if (typeof object.structuredOutput === 'string') return object.structuredOutput;
  if (
    typeof object.result === 'string'
    && (object.type === undefined || object.type === 'result')
    && (object.subtype === undefined || object.subtype === 'success')
  ) return object.result;

  if (object.type === 'text' && object.part && typeof object.part === 'object') {
    const part = object.part as Record<string, unknown>;
    if (part.type === 'text' && typeof part.text === 'string') return part.text;
  }
  return null;
}

export function extractCliAnalysisResult(output: string): AIAnalysisResult {
  const trimmed = output.trim();
  const directCandidates = [trimmed];
  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    directCandidates.push(match[1].trim());
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    directCandidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of directCandidates) {
    const parsed = tryAnalysis(candidate);
    if (parsed) return parsed;
  }

  const values = parseJsonValues(trimmed);
  const records = values.flatMap((value) => Array.isArray(value) ? value : [value]);
  const terminalCandidates = records
    .map(terminalCandidate)
    .filter((candidate): candidate is string => candidate !== null);
  for (const candidate of terminalCandidates.reverse()) {
    const parsed = tryAnalysis(candidate);
    if (parsed) return parsed;
  }
  throw new Error('Invalid structured CLI output.');
}

export interface ProfiledCliProviderDependencies {
  env: NodeJS.ProcessEnv;
  homeDirectory: string;
  shell: string;
  platform: NodeJS.Platform;
  isExecutable(path: string): Promise<boolean>;
  realpath(path: string): Promise<string>;
  run(options: CliProcessOptions): Promise<CliProcessResult>;
}

function defaultDependencies(): ProfiledCliProviderDependencies {
  return {
    env: process.env,
    homeDirectory: homedir(),
    shell: process.env.SHELL || (process.platform === 'win32' ? 'cmd.exe' : '/bin/zsh'),
    platform: process.platform,
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

function buildPrompt(session: Session, supportsImages: boolean): string {
  const sourceName = session.metadata?.sourceName || 'Application';
  const screenshots = !supportsImages
    ? '[Screenshots are not available to this provider. Do not infer visual details or reference screenshot indices.]'
    : session.screenshotBuffer.length === 0
    ? '[No screenshots available]'
    : session.screenshotBuffer.map((screenshot, index) => (
      `Screenshot ${index} was captured at ${toRelativeTimestamp(screenshot.timestamp, session.startTime)}.`
    )).join('\n');

  return `${ANALYSIS_SYSTEM_PROMPT}

Return only JSON matching this schema, with no markdown fence:
${JSON.stringify(ANALYSIS_JSON_SCHEMA)}

## Session

Application: ${sourceName}

## Transcript

${buildTranscriptText(session)}

## Screenshot index

${screenshots}`;
}

function sanitizeCliDetail(value: string): string {
  const withoutControls = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? ' ' : character;
  }).join('');
  return withoutControls
    .replace(/\b(?:sk|gh[opusr]|github_pat)_[A-Za-z0-9_-]{8,}\b/gi, '[redacted]')
    .replace(/\b(Bearer|api[_ -]?key|token)\s*[:=]\s*\S+/gi, '$1: [redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function openCodeConfiguration(): object {
  return {
    $schema: 'https://opencode.ai/config.json',
    default_agent: 'markuprx-report',
    agents: {
      'markuprx-report': {
        description: 'Generate a MarkuprPlus report without invoking tools.',
        mode: 'primary',
        steps: 1,
        permissions: [{ action: '*', resource: '*', effect: 'deny' }],
      },
    },
    mcp: {},
  };
}

export class ProfiledCliProvider implements AnalysisProviderAdapter {
  readonly id: AnalysisProviderAdapter['id'];
  readonly name: string;
  readonly connection = 'cli' as const;
  private readonly profile: CliProviderProfile;
  private readonly dependencies: ProfiledCliProviderDependencies;
  private cachedStatus: AnalysisProviderStatus | null = null;

  constructor(
    profile: CliProviderProfile,
    dependencies: Partial<ProfiledCliProviderDependencies> = {},
  ) {
    this.profile = profile;
    this.id = profile.id;
    this.name = profile.name;
    this.dependencies = { ...defaultDependencies(), ...dependencies };
  }

  async discover(forceRefresh = false): Promise<AnalysisProviderStatus> {
    if (!forceRefresh && this.cachedStatus) return this.cachedStatus;

    const executablePath = await this.resolveExecutable();
    const defaultModel: AnalysisModelOption = {
      id: '',
      name: `${this.name.replace(/ CLI$/, '')} default`,
      source: 'default',
    };
    if (!executablePath) {
      return this.cache({
        id: this.id,
        name: this.name,
        connection: 'cli',
        installed: false,
        authenticated: false,
        ready: false,
        models: [defaultModel],
        diagnostic: `${this.name} was not found. Install and sign in to ${this.name}, then scan again.`,
      });
    }

    const versionResult = await this.dependencies.run({
      executable: executablePath,
      args: this.profile.versionArgs || ['--version'],
      env: buildCliEnvironment(executablePath, this.dependencies.env),
      timeoutMs: PROBE_TIMEOUT_MS,
      maxOutputBytes: PROBE_OUTPUT_BYTES,
    });
    if (versionResult.exitCode !== 0 || versionResult.timedOut || versionResult.truncated) {
      return this.cache({
        id: this.id,
        name: this.name,
        connection: 'cli',
        installed: true,
        executablePath,
        authenticated: false,
        ready: false,
        models: [defaultModel],
        diagnostic: `${this.name} is installed but could not be validated. Run ${this.profile.executables[0]} --version and update or reinstall it.`,
      });
    }
    const version = versionResult.stdout.trim().split(/\r?\n/, 1)[0];
    if (this.profile.minimumMajorVersion) {
      const majorVersion = Number.parseInt(version.match(/\d+/)?.[0] || '', 10);
      if (!Number.isFinite(majorVersion) || majorVersion < this.profile.minimumMajorVersion) {
        return this.cache({
          id: this.id,
          name: this.name,
          connection: 'cli',
          installed: true,
          executablePath,
          ...(version ? { version } : {}),
          authenticated: false,
          ready: false,
          models: [defaultModel],
          diagnostic: `${this.name} V${this.profile.minimumMajorVersion} or newer is required for fail-closed tool permissions. Update ${this.profile.executables.at(-1)}, then scan again.`,
        });
      }
    }
    const requiredEnvironmentVariable = this.profile.requiredEnvironmentVariable;
    if (requiredEnvironmentVariable && !this.dependencies.env[requiredEnvironmentVariable]?.trim()) {
      return this.cache({
        id: this.id,
        name: this.name,
        connection: 'cli',
        installed: true,
        executablePath,
        ...(version ? { version } : {}),
        authenticated: false,
        ready: false,
        models: [defaultModel],
        diagnostic: `${this.name} headless mode requires ${requiredEnvironmentVariable}. Configure it, then scan again.`,
      });
    }
    return this.cache({
      id: this.id,
      name: this.name,
      connection: 'cli',
      installed: true,
      executablePath,
      ...(version ? { version } : {}),
      ...(requiredEnvironmentVariable ? { authenticated: true } : {}),
      ready: true,
      models: [defaultModel],
    });
  }

  async analyze(session: Session, modelId?: string): Promise<AIAnalysisResult> {
    const status = await this.discover();
    if (!status.ready || !status.executablePath) {
      throw new Error(status.diagnostic || `${this.name} is not ready for analysis.`);
    }
    const transcript = buildTranscriptText(session);
    if (transcript === '[No transcript available]' && session.screenshotBuffer.length === 0) {
      throw new Error('The session has no transcript or screenshots to analyze.');
    }
    if (transcript === '[No transcript available]' && !this.profile.supportsImages) {
      throw new Error(`${this.name} cannot analyze a screenshot-only session. Choose Codex CLI or OpenCode.`);
    }

    const temporaryDirectory = await mkdtemp(join(tmpdir(), `markuprx-${this.id}-`));
    try {
      const imagePaths: string[] = [];
      for (let index = 0; this.profile.supportsImages && index < session.screenshotBuffer.length; index += 1) {
        const imagePath = join(temporaryDirectory, `screenshot-${String(index).padStart(3, '0')}.png`);
        await writeFile(imagePath, session.screenshotBuffer[index].buffer);
        imagePaths.push(imagePath);
      }
      const prompt = buildPrompt(session, this.profile.supportsImages === true);
      const settingsPath = this.profile.id === 'amp-cli'
        ? join(temporaryDirectory, 'amp-settings.json')
        : this.profile.id === 'opencode-cli'
          ? join(temporaryDirectory, 'opencode.json')
          : undefined;
      if (this.profile.id === 'amp-cli' && settingsPath) {
        await writeFile(settingsPath, JSON.stringify({
          'amp.dangerouslyAllowAll': false,
          'amp.permissions': [{
            tool: '*',
            action: 'reject',
            message: 'MarkuprPlus report generation does not allow tool use.',
          }],
        }), { encoding: 'utf8', mode: 0o600 });
      } else if (this.profile.id === 'opencode-cli' && settingsPath) {
        await writeFile(settingsPath, JSON.stringify(openCodeConfiguration()), {
          encoding: 'utf8',
          mode: 0o600,
        });
      }
      const promptPath = this.profile.id === 'aider-cli'
        ? join(temporaryDirectory, 'analysis-prompt.txt')
        : undefined;
      if (promptPath) {
        await writeFile(promptPath, prompt, { encoding: 'utf8', mode: 0o600 });
      }
      const promptArgument = this.profile.promptViaStdin ? '' : prompt;
      const openCodeEnvironment = this.profile.id === 'opencode-cli'
        ? {
            OPENCODE_DISABLE_PROJECT_CONFIG: 'true',
            OPENCODE_CONFIG_CONTENT: JSON.stringify(openCodeConfiguration()),
          }
        : {};
      const result = await this.dependencies.run({
        executable: status.executablePath,
        args: this.profile.buildArgs({
          prompt: promptArgument,
          modelId,
          imagePaths,
          settingsPath,
          promptPath,
        }),
        cwd: temporaryDirectory,
        env: {
          ...buildCliEnvironment(status.executablePath, this.dependencies.env),
          ...this.profile.environment,
          ...openCodeEnvironment,
          CI: '1',
          NO_COLOR: '1',
        },
        ...(this.profile.promptViaStdin ? { stdin: prompt } : {}),
        timeoutMs: ANALYSIS_TIMEOUT_MS,
        maxOutputBytes: MAX_OUTPUT_BYTES,
      });
      if (result.timedOut) throw new Error(`${this.name} analysis timed out after 180 seconds.`);
      if (result.exitCode !== 0) {
        const detail = sanitizeCliDetail(result.stderr || result.stdout);
        throw new Error(
          `${this.name} analysis exited with status ${result.exitCode ?? 'unknown'}${detail ? `: ${detail}` : ''}.`,
        );
      }
      if (result.truncated) throw new Error(`${this.name} analysis produced excessive command output.`);
      try {
        return extractCliAnalysisResult(result.stdout);
      } catch {
        throw new Error(`${this.name} analysis returned invalid structured output.`);
      }
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  private cache(status: AnalysisProviderStatus): AnalysisProviderStatus {
    this.cachedStatus = status;
    return status;
  }

  private async resolveExecutable(): Promise<string | null> {
    const pathDirectories = (this.dependencies.env.PATH || '').split(delimiter).filter(Boolean);
    const commonDirectories = this.dependencies.platform === 'win32'
      ? []
      : [
          '/opt/homebrew/bin',
          '/usr/local/bin',
          join(this.dependencies.homeDirectory, '.local', 'bin'),
          '/usr/bin',
          '/bin',
        ];
    for (const executable of this.profile.executables) {
      const executableNames = this.dependencies.platform === 'win32'
        ? [executable, ...(this.dependencies.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
            .split(';')
            .filter(Boolean)
            .map((extension) => `${executable}${extension.toLowerCase()}`)]
        : [executable];
      const candidates = [...new Set([
        ...pathDirectories.flatMap((directory) => executableNames.map((name) => resolve(directory, name))),
        ...commonDirectories.flatMap((directory) => executableNames.map((name) => resolve(directory, name))),
      ])];
      for (const candidate of candidates) {
        if (await this.validateCandidate(candidate)) return candidate;
      }
    }

    if (this.dependencies.platform === 'win32') return null;
    for (const executable of this.profile.executables) {
      const shellResult = await this.dependencies.run({
        executable: this.dependencies.shell,
        args: ['-lic', `command -v ${executable}`],
        env: this.dependencies.env,
        timeoutMs: PROBE_TIMEOUT_MS,
        maxOutputBytes: PROBE_OUTPUT_BYTES,
      });
      if (shellResult.exitCode !== 0 || shellResult.timedOut) continue;
      const candidate = shellResult.stdout.trim().split(/\r?\n/, 1)[0];
      if (candidate && isAbsolute(candidate) && await this.validateCandidate(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private async validateCandidate(candidate: string): Promise<boolean> {
    if (!(await this.dependencies.isExecutable(candidate))) return false;
    try {
      const resolved = await this.dependencies.realpath(candidate);
      return isAbsolute(resolved) && dirname(resolved).length > 0;
    } catch {
      return false;
    }
  }
}
