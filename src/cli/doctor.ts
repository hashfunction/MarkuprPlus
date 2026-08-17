/**
 * doctor.ts - Environment health check for MarkuprX CLI
 *
 * Checks that all required and optional dependencies are available:
 * - ffmpeg / ffprobe (required for video analysis)
 * - Whisper model (optional, for local transcription)
 * - Node.js version compatibility
 * - Anthropic API key (optional, for AI analysis)
 * - Disk space (for recordings and output)
 */

import { existsSync } from 'fs';
import { stat } from 'fs/promises';
import { execFile as execFileCb } from 'child_process';
import { join } from 'path';
import { homedir, platform } from 'os';
import { PUBLIC_BRAND_NAME } from '../shared/publicBrand';

// ============================================================================
// Types
// ============================================================================

export interface DoctorCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  hint?: string;
}

export interface DoctorResult {
  checks: DoctorCheck[];
  passed: number;
  warned: number;
  failed: number;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Safe child environment -- only expose PATH and essential vars.
 */
const SAFE_CHILD_ENV = {
  PATH: process.env.PATH,
  HOME: process.env.HOME || process.env.USERPROFILE,
  USERPROFILE: process.env.USERPROFILE,
  LANG: process.env.LANG,
};

/**
 * Execute a command and return stdout, or null on failure.
 */
function execQuiet(command: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFileCb(command, args, { env: SAFE_CHILD_ENV }, (error, stdout) => {
      if (error) {
        resolve(null);
      } else {
        resolve(stdout?.toString().trim() ?? '');
      }
    });
  });
}

/**
 * Resolve the default Whisper models directory (mirrors WhisperService logic).
 */
function getWhisperModelsDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || homedir();
  return join(home, '.markuprx', 'whisper-models');
}

/**
 * Check if any Whisper model file exists in the models directory.
 */
function findWhisperModel(modelsDir: string): string | null {
  const modelNames = [
    'ggml-tiny.bin',
    'ggml-base.bin',
    'ggml-small.bin',
    'ggml-medium.bin',
    'ggml-large-v3.bin',
  ];

  for (const name of modelNames) {
    const modelPath = join(modelsDir, name);
    if (existsSync(modelPath)) {
      return name;
    }
  }
  return null;
}

/**
 * Parse a semver string into [major, minor, patch].
 */
function parseSemver(version: string): [number, number, number] | null {
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

/** Match the package.json runtime floor without accepting older Node 20 minors. */
export function meetsNodeEngineFloor(version: string): boolean {
  const parsed = parseSemver(version);
  if (!parsed) return false;
  const [major, minor] = parsed;
  return major > 20 || (major === 20 && minor >= 9);
}

// ============================================================================
// Check functions
// ============================================================================

async function checkNodeVersion(): Promise<DoctorCheck> {
  const version = process.version; // e.g. "v20.11.0"
  const parsed = parseSemver(version);

  if (!parsed) {
    return {
      name: 'Node.js',
      status: 'warn',
      message: `Unknown version: ${version}`,
      hint: `${PUBLIC_BRAND_NAME} requires Node.js >= 20.9.0`,
    };
  }

  if (meetsNodeEngineFloor(version)) {
    return {
      name: 'Node.js',
      status: 'pass',
      message: `${version} (>= 20.9.0)`,
    };
  }

  return {
    name: 'Node.js',
    status: 'fail',
    message: `${version} is too old`,
    hint: `${PUBLIC_BRAND_NAME} requires Node.js >= 20.9.0. Upgrade at https://nodejs.org`,
  };
}

async function checkFfmpeg(): Promise<DoctorCheck> {
  const stdout = await execQuiet('ffmpeg', ['-version']);

  if (stdout === null) {
    const os = platform();
    const installHint =
      os === 'darwin'
        ? 'brew install ffmpeg'
        : os === 'win32'
          ? 'winget install ffmpeg (or download from https://ffmpeg.org)'
          : 'apt install ffmpeg (or your package manager)';

    return {
      name: 'ffmpeg',
      status: 'fail',
      message: 'Not found on PATH',
      hint: `Install via: ${installHint}`,
    };
  }

  // Extract version from first line, e.g. "ffmpeg version 6.1.1 ..."
  const versionMatch = stdout.match(/ffmpeg version (\S+)/);
  const version = versionMatch ? versionMatch[1] : 'unknown';

  return {
    name: 'ffmpeg',
    status: 'pass',
    message: `Installed (${version})`,
  };
}

async function checkFfprobe(): Promise<DoctorCheck> {
  const stdout = await execQuiet('ffprobe', ['-version']);

  if (stdout === null) {
    return {
      name: 'ffprobe',
      status: 'fail',
      message: 'Not found on PATH',
      hint: 'ffprobe is usually installed alongside ffmpeg',
    };
  }

  const versionMatch = stdout.match(/ffprobe version (\S+)/);
  const version = versionMatch ? versionMatch[1] : 'unknown';

  return {
    name: 'ffprobe',
    status: 'pass',
    message: `Installed (${version})`,
  };
}

async function checkWhisperModel(): Promise<DoctorCheck> {
  const modelsDir = getWhisperModelsDir();

  if (!existsSync(modelsDir)) {
    return {
      name: 'Whisper model',
      status: 'warn',
      message: 'No models directory found',
      hint: `Models directory: ${modelsDir}\nDownload a model via the ${PUBLIC_BRAND_NAME} desktop app, or manually place a ggml-*.bin file there`,
    };
  }

  const model = findWhisperModel(modelsDir);

  if (!model) {
    return {
      name: 'Whisper model',
      status: 'warn',
      message: 'No model files found',
      hint: `Models directory: ${modelsDir}\nDownload a model via the ${PUBLIC_BRAND_NAME} desktop app, or manually place a ggml-*.bin file there`,
    };
  }

  return {
    name: 'Whisper model',
    status: 'pass',
    message: `${model} found in ${modelsDir}`,
  };
}

async function checkAnthropicKey(): Promise<DoctorCheck> {
  const key = process.env.ANTHROPIC_API_KEY;

  if (!key) {
    return {
      name: 'Anthropic API key',
      status: 'warn',
      message: 'ANTHROPIC_API_KEY not set',
      hint: 'Optional. Set this env var to enable AI-powered analysis. Get a key at https://console.anthropic.com',
    };
  }

  // Basic format validation (sk-ant-...)
  if (key.startsWith('sk-ant-')) {
    return {
      name: 'Anthropic API key',
      status: 'pass',
      message: 'ANTHROPIC_API_KEY is set (sk-ant-...)',
    };
  }

  return {
    name: 'Anthropic API key',
    status: 'pass',
    message: 'ANTHROPIC_API_KEY is set',
  };
}

async function checkDiskSpace(): Promise<DoctorCheck> {
  // We check available space in the OS temp directory as a proxy
  // for whether recordings/output will fit
  try {
    const tempDir = process.env.TMPDIR || process.env.TEMP || '/tmp';

    // On most systems we cannot determine free space from stat alone.
    // Use `df` on POSIX systems for a real check.
    if (platform() !== 'win32') {
      const dfOutput = await execQuiet('df', ['-k', tempDir]);
      if (dfOutput) {
        // Parse df output: Filesystem 1K-blocks Used Available Use% Mounted
        const lines = dfOutput.split('\n');
        if (lines.length >= 2) {
          const parts = lines[1].split(/\s+/);
          if (parts.length >= 4) {
            const availableKB = parseInt(parts[3], 10);
            if (!isNaN(availableKB)) {
              const availableGB = availableKB / (1024 * 1024);
              if (availableGB < 1) {
                return {
                  name: 'Disk space',
                  status: 'warn',
                  message: `${availableGB.toFixed(1)} GB available (low)`,
                  hint: `${PUBLIC_BRAND_NAME} recordings and output need disk space. Free up some space if you plan to record long sessions`,
                };
              }
              return {
                name: 'Disk space',
                status: 'pass',
                message: `${availableGB.toFixed(1)} GB available`,
              };
            }
          }
        }
      }
    }

    // Fallback: just confirm the temp dir is writable
    await stat(tempDir);
    return {
      name: 'Disk space',
      status: 'pass',
      message: 'Temp directory accessible',
    };
  } catch {
    return {
      name: 'Disk space',
      status: 'warn',
      message: 'Could not determine available disk space',
    };
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Run all doctor checks and return the result.
 */
export async function runDoctorChecks(): Promise<DoctorResult> {
  const checks = await Promise.all([
    checkNodeVersion(),
    checkFfmpeg(),
    checkFfprobe(),
    checkWhisperModel(),
    checkAnthropicKey(),
    checkDiskSpace(),
  ]);

  const passed = checks.filter((c) => c.status === 'pass').length;
  const warned = checks.filter((c) => c.status === 'warn').length;
  const failed = checks.filter((c) => c.status === 'fail').length;

  return { checks, passed, warned, failed };
}
