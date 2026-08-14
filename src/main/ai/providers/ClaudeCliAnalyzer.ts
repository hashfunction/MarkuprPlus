import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Session } from '../../SessionController';
import type { AIAnalysisResult } from '../types';
import {
  ANALYSIS_JSON_SCHEMA,
  ANALYSIS_SYSTEM_PROMPT,
  buildTranscriptText,
  parseAnalysisResult,
} from '../analysisContract';
import { buildCliEnvironment } from '../CodexCliDiscovery';
import { runCliProcess } from '../CliProcessRunner';
import type { CliProcessOptions, CliProcessResult } from '../CliProcessRunner';
import { claudeCliDiscovery } from './ClaudeCliDiscovery';
import type { ClaudeCliDiscovery } from './ClaudeCliDiscovery';

const CLAUDE_TIMEOUT_MS = 180_000;
const MAX_CAPTURED_OUTPUT_BYTES = 1024 * 1024;

export type ClaudeCliErrorCode =
  | 'NOT_READY'
  | 'EMPTY_INPUT'
  | 'TIMEOUT'
  | 'PROCESS_FAILED'
  | 'OUTPUT_TRUNCATED'
  | 'INVALID_OUTPUT';

export class ClaudeCliError extends Error {
  constructor(
    message: string,
    public readonly code: ClaudeCliErrorCode,
  ) {
    super(message);
    this.name = 'ClaudeCliError';
  }
}

export interface ClaudeCliAnalyzerDependencies {
  discovery: Pick<ClaudeCliDiscovery, 'discover'>;
  run(options: CliProcessOptions): Promise<CliProcessResult>;
}

function buildPrompt(session: Session): string {
  const sourceName = session.metadata?.sourceName || 'Application';
  return `${ANALYSIS_SYSTEM_PROMPT}

## Session

Application: ${sourceName}

## Transcript

${buildTranscriptText(session)}

Screenshots are not available to this provider. Analyze only the transcript.`;
}

function parseClaudeOutput(output: string): AIAnalysisResult {
  const envelope = JSON.parse(output) as Record<string, unknown>;
  const candidate = envelope.structured_output ?? envelope.structuredOutput ?? envelope.result ?? envelope;
  return parseAnalysisResult(
    typeof candidate === 'string' ? candidate : JSON.stringify(candidate),
  );
}

export class ClaudeCliAnalyzer {
  private readonly dependencies: ClaudeCliAnalyzerDependencies;

  constructor(dependencies: Partial<ClaudeCliAnalyzerDependencies> = {}) {
    this.dependencies = {
      discovery: claudeCliDiscovery,
      run: runCliProcess,
      ...dependencies,
    };
  }

  async analyze(session: Session, modelId?: string): Promise<AIAnalysisResult> {
    const status = await this.dependencies.discovery.discover();
    if (!status.ready || !status.executablePath) {
      throw new ClaudeCliError(
        status.diagnostic || 'Claude Code CLI is not ready for analysis.',
        'NOT_READY',
      );
    }

    if (buildTranscriptText(session) === '[No transcript available]') {
      throw new ClaudeCliError('The session has no transcript to analyze.', 'EMPTY_INPUT');
    }

    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'markupr-claude-'));
    try {
      const args = [
        '--print',
        '--safe-mode',
        '--tools',
        '',
        '--disable-slash-commands',
        '--no-session-persistence',
        '--output-format',
        'json',
        '--json-schema',
        JSON.stringify(ANALYSIS_JSON_SCHEMA),
      ];
      if (modelId?.trim()) args.push('--model', modelId.trim());

      const result = await this.dependencies.run({
        executable: status.executablePath,
        args,
        cwd: temporaryDirectory,
        env: buildCliEnvironment(status.executablePath),
        stdin: buildPrompt(session),
        timeoutMs: CLAUDE_TIMEOUT_MS,
        maxOutputBytes: MAX_CAPTURED_OUTPUT_BYTES,
      });

      if (result.timedOut) {
        throw new ClaudeCliError('Claude analysis timed out after 180 seconds.', 'TIMEOUT');
      }
      if (result.exitCode !== 0) {
        throw new ClaudeCliError(
          `Claude analysis exited with status ${result.exitCode ?? 'unknown'}.`,
          'PROCESS_FAILED',
        );
      }
      if (result.truncated) {
        throw new ClaudeCliError('Claude analysis produced excessive command output.', 'OUTPUT_TRUNCATED');
      }

      try {
        return parseClaudeOutput(result.stdout);
      } catch {
        throw new ClaudeCliError(
          'Claude analysis returned invalid structured output.',
          'INVALID_OUTPUT',
        );
      }
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}
