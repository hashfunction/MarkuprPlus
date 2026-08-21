/**
 * ScreenCapture Unit Tests
 *
 * Tests the macOS screencapture CLI wrapper:
 * - Correct command arguments (-x, -D{display}, outputPath)
 * - Default display is 1
 * - Custom display number
 * - Error when screencapture command fails
 * - Error when output file is missing
 * - Error when output file is empty (permission denied)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Hoisted mocks
// =============================================================================

const { mockExecFileCb, mockStat } = vi.hoisted(() => ({
  mockExecFileCb: vi.fn(),
  mockStat: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('child_process')>()),
  execFile: mockExecFileCb,
}));

vi.mock('fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs/promises')>()),
  stat: mockStat,
}));

vi.mock('../../../src/mcp/utils/Logger.js', () => ({
  log: vi.fn(),
}));

import { capture } from '../../../src/mcp/capture/ScreenCapture.js';

describe('ScreenCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls screencapture with correct args for default display', async () => {
    mockExecFileCb.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(null);
      },
    );
    mockStat.mockResolvedValue({ isFile: () => true, size: 5000 });

    await capture({ outputPath: '/tmp/test.png' });

    expect(mockExecFileCb).toHaveBeenCalledWith(
      'screencapture',
      ['-x', '-D1', expect.stringContaining('test.png')],
      expect.objectContaining({ env: expect.any(Object) }),
      expect.any(Function),
    );
  });

  it('uses display number from options', async () => {
    mockExecFileCb.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(null);
      },
    );
    mockStat.mockResolvedValue({ isFile: () => true, size: 5000 });

    await capture({ outputPath: '/tmp/test.png', display: 2 });

    expect(mockExecFileCb).toHaveBeenCalledWith(
      'screencapture',
      expect.arrayContaining(['-D2']),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns the resolved output path on success', async () => {
    mockExecFileCb.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(null);
      },
    );
    mockStat.mockResolvedValue({ isFile: () => true, size: 12345 });

    const result = await capture({ outputPath: '/tmp/test.png' });
    expect(result).toContain('test.png');
  });

  it('throws when screencapture command fails', async () => {
    mockExecFileCb.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(new Error('command not found'));
      },
    );

    await expect(capture({ outputPath: '/tmp/test.png' })).rejects.toThrow(
      'screencapture failed',
    );
  });

  it('throws when output file does not exist', async () => {
    mockExecFileCb.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(null);
      },
    );
    mockStat.mockRejectedValue(new Error('ENOENT'));

    await expect(capture({ outputPath: '/tmp/test.png' })).rejects.toThrow(
      'Screenshot file not created',
    );
  });

  it('throws when output file is empty (permission denied)', async () => {
    mockExecFileCb.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(null);
      },
    );
    mockStat.mockResolvedValue({ isFile: () => true, size: 0 });

    await expect(capture({ outputPath: '/tmp/test.png' })).rejects.toThrow(
      'file is empty',
    );
  });

  it('throws when stat returns non-file entry', async () => {
    mockExecFileCb.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(null);
      },
    );
    mockStat.mockResolvedValue({ isFile: () => false, size: 100 });

    await expect(capture({ outputPath: '/tmp/test.png' })).rejects.toThrow(
      'file is empty',
    );
  });
});
