import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Session } from '../SessionController';
import type { AIAnalysisResult } from './types';
import {
  ANALYSIS_JSON_SCHEMA,
  ANALYSIS_SYSTEM_PROMPT,
  buildTranscriptText,
  parseAnalysisResult,
  toRelativeTimestamp,
} from './analysisContract';
import { buildCliEnvironment, codexCliDiscovery } from './CodexCliDiscovery';
import type { CodexCliDiscovery } from './CodexCliDiscovery';
import { runCliProcess } from './CliProcessRunner';
import type { CliProcessOptions, CliProcessResult } from './CliProcessRunner';

const CODEX_TIMEOUT_MS = 180_000;
const MAX_CAPTURED_OUTPUT_BYTES = 1024 * 1024;
const MAX_RESULT_BYTES = 1024 * 1024;

export type CodexCliErrorCode =
  | 'NOT_READY'
  | 'EMPTY_INPUT'
  | 'TIMEOUT'
  | 'PROCESS_FAILED'
  | 'OUTPUT_TRUNCATED'
  | 'MISSING_OUTPUT'
  | 'INVALID_OUTPUT';

export class CodexCliError extends Error {
  constructor(
    message: string,
    public readonly code: CodexCliErrorCode,
  ) {
    super(message);
    this.name = 'CodexCliError';
  }
}

export interface CodexAnalyzerDependencies {
  discovery: Pick<CodexCliDiscovery, 'discover'>;
  run(options: CliProcessOptions): Promise<CliProcessResult>;
}

function buildPrompt(session: Session): string {
  const sourceName = session.metadata?.sourceName || 'Application';
  const transcript = buildTranscriptText(session);
  const screenshots = session.screenshotBuffer.length === 0
    ? '[No screenshots available]'
    : session.screenshotBuffer
        .map((screenshot, index) => {
          const capturedAt = toRelativeTimestamp(screenshot.timestamp, session.startTime);
          return `Screenshot ${index} was captured at ${capturedAt}.`;
        })
        .join('\n');

  return `${ANALYSIS_SYSTEM_PROMPT}

## Session

Application: ${sourceName}

## Transcript

${transcript}

## Screenshot index

${screenshots}`;
}

export class CodexAnalyzer {
  private readonly dependencies: CodexAnalyzerDependencies;

  constructor(dependencies: Partial<CodexAnalyzerDependencies> = {}) {
    this.dependencies = {
      discovery: codexCliDiscovery,
      run: runCliProcess,
      ...dependencies,
    };
  }

  async analyze(session: Session): Promise<AIAnalysisResult> {
    const status = await this.dependencies.discovery.discover();
    if (!status.ready || !status.executablePath) {
      throw new CodexCliError(
        status.diagnostic || 'Codex CLI is not ready for analysis.',
        'NOT_READY',
      );
    }

    const transcript = buildTranscriptText(session);
    if (transcript === '[No transcript available]' && session.screenshotBuffer.length === 0) {
      throw new CodexCliError('The session has no transcript or screenshots to analyze.', 'EMPTY_INPUT');
    }

    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'markupr-codex-'));
    try {
      const schemaPath = join(temporaryDirectory, 'analysis-schema.json');
      const resultPath = join(temporaryDirectory, 'analysis-result.json');
      await writeFile(schemaPath, JSON.stringify(ANALYSIS_JSON_SCHEMA), 'utf8');

      const imagePaths: string[] = [];
      for (let index = 0; index < session.screenshotBuffer.length; index += 1) {
        const imagePath = join(temporaryDirectory, `screenshot-${String(index).padStart(3, '0')}.png`);
        await writeFile(imagePath, session.screenshotBuffer[index].buffer);
        imagePaths.push(imagePath);
      }

      const args = [
        'exec',
        '--ephemeral',
        '--sandbox',
        'read-only',
        '--ignore-user-config',
        '--ignore-rules',
        '--skip-git-repo-check',
        '--output-schema',
        schemaPath,
        '--output-last-message',
        resultPath,
      ];
      for (const imagePath of imagePaths) {
        args.push('--image', imagePath);
      }
      args.push('-');

      const result = await this.dependencies.run({
        executable: status.executablePath,
        args,
        cwd: temporaryDirectory,
        env: buildCliEnvironment(status.executablePath),
        stdin: buildPrompt(session),
        timeoutMs: CODEX_TIMEOUT_MS,
        maxOutputBytes: MAX_CAPTURED_OUTPUT_BYTES,
      });

      if (result.timedOut) {
        throw new CodexCliError('Codex analysis timed out after 180 seconds.', 'TIMEOUT');
      }
      if (result.exitCode !== 0) {
        throw new CodexCliError(
          `Codex analysis exited with status ${result.exitCode ?? 'unknown'}.`,
          'PROCESS_FAILED',
        );
      }
      if (result.truncated) {
        throw new CodexCliError('Codex analysis produced excessive command output.', 'OUTPUT_TRUNCATED');
      }

      let resultStats;
      try {
        resultStats = await stat(resultPath);
      } catch {
        throw new CodexCliError('Codex analysis did not produce a result.', 'MISSING_OUTPUT');
      }
      if (!resultStats.isFile() || resultStats.size === 0 || resultStats.size > MAX_RESULT_BYTES) {
        throw new CodexCliError('Codex analysis produced an invalid result file.', 'INVALID_OUTPUT');
      }

      const output = await readFile(resultPath, 'utf8');
      try {
        return parseAnalysisResult(output);
      } catch {
        throw new CodexCliError('Codex analysis returned invalid structured output.', 'INVALID_OUTPUT');
      }
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}
