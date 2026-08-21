/**
 * AudioCapture Unit Tests
 *
 * Tests the ffmpeg avfoundation audio recording wrapper:
 * - Correct ffmpeg arguments (format, sample rate, channels, codec, duration)
 * - Default device is "default"
 * - Custom device selection
 * - Duration included in args
 * - Timeout calculation (duration + 10 seconds)
 * - Error on permission denied
 * - Error on empty output file
 * - Error when output file is missing
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

import { record } from '../../../src/mcp/capture/AudioCapture.js';

describe('AudioCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls ffmpeg with correct audio recording args', async () => {
    mockExecFileCb.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(null);
      },
    );
    mockStat.mockResolvedValue({ isFile: () => true, size: 50000 });

    await record({ duration: 10, outputPath: '/tmp/audio.wav' });

    expect(mockExecFileCb).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining([
        '-f', 'avfoundation',
        '-i', ':default',
        '-ar', '16000',
        '-ac', '1',
        '-acodec', 'pcm_f32le',
        '-t', '10',
        '-y',
      ]),
      expect.objectContaining({
        env: expect.any(Object),
        timeout: 20000, // (10 + 10) * 1000
      }),
      expect.any(Function),
    );
  });

  it('uses custom device when specified', async () => {
    mockExecFileCb.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(null);
      },
    );
    mockStat.mockResolvedValue({ isFile: () => true, size: 50000 });

    await record({ duration: 5, outputPath: '/tmp/audio.wav', device: 'External Mic' });

    expect(mockExecFileCb).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-i', ':External Mic']),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('uses default device when none specified', async () => {
    mockExecFileCb.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(null);
      },
    );
    mockStat.mockResolvedValue({ isFile: () => true, size: 50000 });

    await record({ duration: 5, outputPath: '/tmp/audio.wav' });

    expect(mockExecFileCb).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-i', ':default']),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns the output path on success', async () => {
    mockExecFileCb.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(null);
      },
    );
    mockStat.mockResolvedValue({ isFile: () => true, size: 50000 });

    const result = await record({ duration: 5, outputPath: '/tmp/audio.wav' });
    expect(result).toContain('audio.wav');
  });

  it('throws permission error when ffmpeg reports permission denied', async () => {
    mockExecFileCb.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(new Error('permission not granted for audio'));
      },
    );

    await expect(
      record({ duration: 5, outputPath: '/tmp/audio.wav' }),
    ).rejects.toThrow('Microphone access denied');
  });

  it('throws generic error for non-permission ffmpeg failures', async () => {
    mockExecFileCb.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(new Error('ffmpeg crashed'));
      },
    );

    await expect(
      record({ duration: 5, outputPath: '/tmp/audio.wav' }),
    ).rejects.toThrow('Audio recording failed');
  });

  it('throws when output file does not exist', async () => {
    mockExecFileCb.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(null);
      },
    );
    mockStat.mockRejectedValue(new Error('ENOENT'));

    await expect(
      record({ duration: 5, outputPath: '/tmp/audio.wav' }),
    ).rejects.toThrow('Audio file not created');
  });

  it('throws when output file is empty', async () => {
    mockExecFileCb.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: Function) => {
        cb(null);
      },
    );
    mockStat.mockResolvedValue({ isFile: () => true, size: 0 });

    await expect(
      record({ duration: 5, outputPath: '/tmp/audio.wav' }),
    ).rejects.toThrow('file is empty');
  });

  it('sets timeout based on duration', async () => {
    mockExecFileCb.mockImplementation(
      (_cmd: string, _args: string[], opts: { timeout: number }, cb: Function) => {
        expect(opts.timeout).toBe(40000); // (30 + 10) * 1000
        cb(null);
      },
    );
    mockStat.mockResolvedValue({ isFile: () => true, size: 50000 });

    await record({ duration: 30, outputPath: '/tmp/audio.wav' });
  });
});
