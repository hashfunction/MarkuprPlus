/**
 * MCP Permissions Unit Tests
 *
 * Tests the headless permission detection module:
 * - checkScreenRecording: screencapture probe
 * - checkMicrophone: ffmpeg audio probe
 * - checkFfmpeg: ffmpeg availability check
 * - checkAll: combined check
 * - Cleanup of temp files on success and failure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Hoisted mocks
// =============================================================================

const { mockExecFile, mockStat, mockUnlink } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockStat: vi.fn(),
  mockUnlink: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('child_process')>()),
  execFile: mockExecFile,
}));

vi.mock('fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs/promises')>()),
  stat: mockStat,
  unlink: mockUnlink,
}));

vi.mock('os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('os')>()),
  tmpdir: () => '/tmp',
}));

vi.mock('crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('crypto')>()),
  randomUUID: () => 'test-uuid-perm',
}));

vi.mock('../../../src/mcp/utils/Logger.js', () => ({
  log: vi.fn(),
}));

import {
  checkScreenRecording,
  checkMicrophone,
  checkFfmpeg,
  checkAll,
} from '../../../src/mcp/utils/Permissions';

// =============================================================================
// Helpers
// =============================================================================

function mockExecSuccess(stdout = '') {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      process.nextTick(() => cb(null, stdout, ''));
      return { pid: 1 };
    },
  );
}

function mockExecFailure(message = 'Command failed') {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      process.nextTick(() => cb(new Error(message)));
      return { pid: 1 };
    },
  );
}

// =============================================================================
// Tests
// =============================================================================

describe('MCP Permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnlink.mockResolvedValue(undefined);
  });

  describe('checkScreenRecording', () => {
    it('returns granted when screencapture produces a non-empty file', async () => {
      mockExecSuccess();
      mockStat.mockResolvedValue({ size: 5000 });

      const result = await checkScreenRecording();
      expect(result.granted).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('returns not granted when screencapture produces empty file', async () => {
      mockExecSuccess();
      mockStat.mockResolvedValue({ size: 0 });

      const result = await checkScreenRecording();
      expect(result.granted).toBe(false);
      expect(result.error).toContain('Screen Recording permission');
    });

    it('returns not granted when screencapture command fails', async () => {
      mockExecFailure('Not authorized');

      const result = await checkScreenRecording();
      expect(result.granted).toBe(false);
      expect(result.error).toContain('Screen Recording permission check failed');
    });

    it('cleans up test file on success', async () => {
      mockExecSuccess();
      mockStat.mockResolvedValue({ size: 5000 });

      await checkScreenRecording();
      expect(mockUnlink).toHaveBeenCalledWith(
        expect.stringContaining('markuprx-perm-test-'),
      );
    });

    it('does not throw when cleanup fails', async () => {
      mockExecSuccess();
      mockStat.mockResolvedValue({ size: 5000 });
      mockUnlink.mockRejectedValue(new Error('ENOENT'));

      await expect(checkScreenRecording()).resolves.toBeDefined();
    });
  });

  describe('checkMicrophone', () => {
    it('returns granted when mic recording produces non-empty file', async () => {
      mockExecSuccess();
      mockStat.mockResolvedValue({ size: 3200 });

      const result = await checkMicrophone();
      expect(result.granted).toBe(true);
    });

    it('returns not granted when mic recording produces empty file', async () => {
      mockExecSuccess();
      mockStat.mockResolvedValue({ size: 0 });

      const result = await checkMicrophone();
      expect(result.granted).toBe(false);
      expect(result.error).toContain('Microphone permission');
    });

    it('returns not granted when ffmpeg mic probe fails', async () => {
      mockExecFailure('No such device');

      const result = await checkMicrophone();
      expect(result.granted).toBe(false);
      expect(result.error).toContain('ffmpeg');
    });
  });

  describe('checkFfmpeg', () => {
    it('returns granted when ffmpeg is available', async () => {
      mockExecSuccess('ffmpeg version 6.1 Copyright (c) 2000-2024');

      const result = await checkFfmpeg();
      expect(result.granted).toBe(true);
    });

    it('returns not granted when ffmpeg is not installed', async () => {
      mockExecFailure('ENOENT');

      const result = await checkFfmpeg();
      expect(result.granted).toBe(false);
      expect(result.error).toContain('ffmpeg is not installed');
      expect(result.error).toContain('brew install ffmpeg');
    });
  });

  describe('checkAll', () => {
    it('runs all permission checks and returns structured result', async () => {
      mockExecFile.mockImplementation(
        (cmd: string, args: string[], _opts: unknown, cb: Function) => {
          if (cmd === 'screencapture') {
            process.nextTick(() => cb(null, '', ''));
          } else if (cmd === 'ffmpeg' && args.includes('-version')) {
            process.nextTick(() => cb(null, 'ffmpeg version 6.0', ''));
          } else {
            process.nextTick(() => cb(null, '', ''));
          }
          return { pid: 1 };
        },
      );
      mockStat.mockResolvedValue({ size: 5000 });

      const result = await checkAll();
      expect(result).toHaveProperty('screenRecording');
      expect(result).toHaveProperty('microphone');
      expect(result).toHaveProperty('ffmpeg');
    });

    it('returns independent results when some checks fail', async () => {
      mockExecFile.mockImplementation(
        (cmd: string, args: string[], _opts: unknown, cb: Function) => {
          if (cmd === 'screencapture') {
            process.nextTick(() => cb(new Error('Not authorized')));
          } else if (cmd === 'ffmpeg' && args.includes('-version')) {
            process.nextTick(() => cb(null, 'ffmpeg version 6.0', ''));
          } else {
            process.nextTick(() => cb(new Error('No mic')));
          }
          return { pid: 1 };
        },
      );

      const result = await checkAll();
      expect(result.screenRecording.granted).toBe(false);
      expect(result.microphone.granted).toBe(false);
      expect(result.ffmpeg.granted).toBe(true);
    });
  });
});
