import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { createRequire } from 'module';
import { dirname, join, resolve } from 'path';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { encodeFloat32Pcm16Wav } from '../audio/audioUtils';
import type { WhisperTranscriptResult } from './types';

const execFileAsync = promisify(execFile);
const localRequire = createRequire(import.meta.url);

export interface WhisperCppArgumentsInput {
  modelPath: string;
  wavPath: string;
  outputBasePath: string;
  language: string;
  threads: number;
  translateToEnglish: boolean;
}

export interface WhisperCppRunInput {
  samples: Float32Array;
  startTimeSec: number;
  modelPath: string;
  language: string;
  threads: number;
  translateToEnglish: boolean;
  timeoutMs?: number;
}

interface WhisperCppJsonSegment {
  offsets?: {
    from?: number;
    to?: number;
  };
  text?: string;
}

interface WhisperCppJsonOutput {
  transcription?: WhisperCppJsonSegment[];
}

export function buildWhisperCppArguments(input: WhisperCppArgumentsInput): string[] {
  const args = [
    '-m', input.modelPath,
    '-f', input.wavPath,
    '-l', input.language.trim() || 'auto',
    '-t', String(Math.max(1, Math.floor(input.threads))),
  ];

  if (input.translateToEnglish) {
    args.push('-tr');
  }

  args.push('-oj', '-of', input.outputBasePath);
  return args;
}

export function parseWhisperCppJson(
  rawJson: string,
  startTimeSec: number,
): WhisperTranscriptResult[] {
  const parsed = JSON.parse(rawJson) as WhisperCppJsonOutput;
  if (!Array.isArray(parsed.transcription)) {
    return [];
  }

  return parsed.transcription.flatMap((segment) => {
    const text = segment.text?.trim();
    const fromMs = segment.offsets?.from;
    const toMs = segment.offsets?.to;
    if (
      !text
      || !Number.isFinite(fromMs)
      || !Number.isFinite(toMs)
      || Number(toMs) < Number(fromMs)
    ) {
      return [];
    }

    return [{
      text,
      startTime: startTimeSec + Math.max(0, Number(fromMs)) / 1_000,
      endTime: startTimeSec + Math.max(0, Number(toMs)) / 1_000,
      confidence: 0.9,
    }];
  });
}

export function toAsarUnpackedPath(path: string): string {
  return path.replace(/([/\\])app\.asar([/\\])/, '$1app.asar.unpacked$2');
}

function resolveWhisperCppDirectory(): string {
  const entryPath = localRequire.resolve('whisper-node');
  const packageDirectory = resolve(dirname(entryPath), '..');
  return toAsarUnpackedPath(join(packageDirectory, 'lib', 'whisper.cpp'));
}

async function ensureWhisperCppBinary(directory: string): Promise<string> {
  const binaryName = process.platform === 'win32' ? 'main.exe' : 'main';
  const binaryPath = join(directory, binaryName);
  if (existsSync(binaryPath)) {
    return binaryPath;
  }

  if (directory.includes('app.asar.unpacked')) {
    throw new Error('The packaged Whisper runtime is missing. Reinstall markupR and try again.');
  }

  if (!existsSync(join(directory, 'Makefile'))) {
    throw new Error('The local Whisper runtime is missing. Reinstall markupR dependencies and try again.');
  }

  try {
    await execFileAsync('make', [], {
      cwd: directory,
      timeout: 5 * 60_000,
      maxBuffer: 2 * 1024 * 1024,
    });
  } catch {
    throw new Error('The local Whisper runtime could not be built. Install build tools and try again.');
  }

  if (!existsSync(binaryPath)) {
    throw new Error('The local Whisper runtime build completed without producing an executable.');
  }
  return binaryPath;
}

function whisperRuntimeEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL']) {
    const value = process.env[key];
    if (value) {
      environment[key] = value;
    }
  }
  return environment;
}

export async function runWhisperCppOnSamples(
  input: WhisperCppRunInput,
): Promise<WhisperTranscriptResult[]> {
  const workingDirectory = await mkdtemp(join(tmpdir(), 'markupr-whisper-'));
  const wavPath = join(workingDirectory, 'input.wav');
  const outputBasePath = join(workingDirectory, 'result');
  const outputJsonPath = `${outputBasePath}.json`;

  try {
    await writeFile(
      wavPath,
      encodeFloat32Pcm16Wav(input.samples, 16_000, 1),
      { mode: 0o600 },
    );

    const whisperDirectory = resolveWhisperCppDirectory();
    const binaryPath = await ensureWhisperCppBinary(whisperDirectory);
    const args = buildWhisperCppArguments({
      modelPath: input.modelPath,
      wavPath,
      outputBasePath,
      language: input.language,
      threads: input.threads,
      translateToEnglish: input.translateToEnglish,
    });

    try {
      await execFileAsync(binaryPath, args, {
        cwd: whisperDirectory,
        env: whisperRuntimeEnvironment(),
        timeout: input.timeoutMs ?? 60_000,
        maxBuffer: 4 * 1024 * 1024,
      });
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : '';
      throw new Error(code === 'ETIMEDOUT'
        ? 'Whisper transcription timed out.'
        : 'Whisper.cpp could not transcribe the recorded audio.');
    }

    const rawJson = await readFile(outputJsonPath, 'utf8').catch(() => {
      throw new Error('Whisper.cpp completed without producing transcript output.');
    });
    return parseWhisperCppJson(rawJson, input.startTimeSec);
  } finally {
    await rm(workingDirectory, { recursive: true, force: true }).catch(() => {});
  }
}
