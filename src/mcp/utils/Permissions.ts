/**
 * Permissions — Detect macOS permissions for screen recording, microphone, and ffmpeg.
 *
 * Uses a practical approach: attempt each operation and check the result.
 * Returns actionable error messages telling the user which System Settings
 * pane to visit. Zero Electron dependencies.
 */

import { execFile as execFileCb } from 'child_process';
import { stat, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { log } from './Logger.js';

const SAFE_CHILD_ENV = {
  PATH: process.env.PATH,
  HOME: process.env.HOME || process.env.USERPROFILE,
  USERPROFILE: process.env.USERPROFILE,
  LANG: process.env.LANG,
  TMPDIR: process.env.TMPDIR || process.env.TEMP,
  TEMP: process.env.TEMP,
};

export interface PermissionStatus {
  granted: boolean;
  error?: string;
}

/**
 * Check if Screen Recording permission is granted.
 *
 * Attempts a silent screencapture and checks if the output is a valid,
 * non-empty PNG. An empty or missing file indicates permission is denied.
 */
export async function checkScreenRecording(): Promise<PermissionStatus> {
  const testPath = join(tmpdir(), `markuprx-perm-test-${randomUUID()}.png`);

  try {
    await new Promise<void>((resolve, reject) => {
      execFileCb(
        'screencapture',
        ['-x', testPath],
        { env: SAFE_CHILD_ENV, timeout: 10_000 },
        (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        },
      );
    });

    const fileStats = await stat(testPath);
    if (fileStats.size === 0) {
      return {
        granted: false,
        error:
          'Screen Recording permission is not granted.\n' +
          'Grant permission in System Settings → Privacy & Security → Screen Recording.',
      };
    }

    log('Screen Recording permission: granted');
    return { granted: true };
  } catch {
    return {
      granted: false,
      error:
        'Screen Recording permission check failed.\n' +
        'Grant permission in System Settings → Privacy & Security → Screen Recording.',
    };
  } finally {
    // Clean up test file
    await unlink(testPath).catch(() => {});
  }
}

/**
 * Check if Microphone permission is granted.
 *
 * Attempts a 0.1s audio recording with ffmpeg and checks for a valid output.
 */
export async function checkMicrophone(): Promise<PermissionStatus> {
  const testPath = join(tmpdir(), `markuprx-mic-test-${randomUUID()}.wav`);

  try {
    await new Promise<void>((resolve, reject) => {
      execFileCb(
        'ffmpeg',
        [
          '-f', 'avfoundation',
          '-i', ':default',
          '-ar', '16000',
          '-ac', '1',
          '-t', '0.1',
          '-y',
          testPath,
        ],
        { env: SAFE_CHILD_ENV, timeout: 10_000 },
        (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        },
      );
    });

    const fileStats = await stat(testPath);
    if (fileStats.size === 0) {
      return {
        granted: false,
        error:
          'Microphone permission is not granted.\n' +
          'Grant permission in System Settings → Privacy & Security → Microphone.',
      };
    }

    log('Microphone permission: granted');
    return { granted: true };
  } catch {
    return {
      granted: false,
      error:
        'Microphone permission check failed.\n' +
        'Grant permission in System Settings → Privacy & Security → Microphone.\n' +
        'Also ensure ffmpeg is installed: brew install ffmpeg',
    };
  } finally {
    await unlink(testPath).catch(() => {});
  }
}

/**
 * Check if ffmpeg is installed and accessible on PATH.
 */
export async function checkFfmpeg(): Promise<PermissionStatus> {
  try {
    const version = await new Promise<string>((resolve, reject) => {
      execFileCb(
        'ffmpeg',
        ['-version'],
        { env: SAFE_CHILD_ENV, timeout: 5_000 },
        (error, stdout) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(stdout?.toString() ?? '');
        },
      );
    });

    // Extract first line (e.g. "ffmpeg version 6.1 ...")
    const firstLine = version.split('\n')[0]?.trim() ?? 'unknown version';
    log(`ffmpeg available: ${firstLine}`);
    return { granted: true };
  } catch {
    return {
      granted: false,
      error:
        'ffmpeg is not installed or not on PATH.\n' +
        'Install via: brew install ffmpeg\n' +
        'Screenshot-only tools will still work without ffmpeg.',
    };
  }
}

/**
 * Run all permission checks and return a summary.
 */
export async function checkAll(): Promise<{
  screenRecording: PermissionStatus;
  microphone: PermissionStatus;
  ffmpeg: PermissionStatus;
}> {
  const [screenRecording, microphone, ffmpeg] = await Promise.all([
    checkScreenRecording(),
    checkMicrophone(),
    checkFfmpeg(),
  ]);

  return { screenRecording, microphone, ffmpeg };
}
