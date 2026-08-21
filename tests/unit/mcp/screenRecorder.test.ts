/**
 * ScreenRecorder Unit Tests
 *
 * Tests the headless screen + audio recording module:
 * - record(): fixed-duration recording via ffmpeg
 * - start(): long-form recording spawn
 * - stop(): graceful SIGINT shutdown with force-kill timeout
 * - validateOutputFile: file existence and size checks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// =============================================================================
// Hoisted mocks
// =============================================================================

const { mockExecFile, mockStat } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockStat: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('child_process')>()),
  execFile: mockExecFile,
}));

vi.mock('fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs/promises')>()),
  stat: mockStat,
}));

vi.mock('../../../src/mcp/utils/Logger.js', () => ({
  log: vi.fn(),
}));

import { record, start, stop } from '../../../src/mcp/capture/ScreenRecorder';
import type { RecordOptions, StartOptions } from '../../../src/mcp/capture/ScreenRecorder';

// =============================================================================
// Helpers
// =============================================================================

function createMockProcess(overrides: Partial<ChildProcess> = {}): ChildProcess {
  const proc = new EventEmitter() as unknown as ChildProcess;
  (proc as any).exitCode = null;
  (proc as any).kill = vi.fn((signal?: string) => {
    if (signal === 'SIGINT' || signal === 'SIGKILL') {
      process.nextTick(() => proc.emit('exit', 0));
    }
    return true;
  });
  (proc as any).pid = 12345;
  Object.assign(proc, overrides);
  return proc;
}

// =============================================================================
// Tests
// =============================================================================

describe('ScreenRecorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('record', () => {
    it('calls ffmpeg with correct arguments for fixed-duration recording', async () => {
      const child = createMockProcess();
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
          process.nextTick(() => cb(null));
          return child;
        },
      );
      mockStat.mockResolvedValue({ isFile: () => true, size: 5000 });

      const options: RecordOptions = {
        duration: 10,
        outputPath: '/tmp/test-recording.mp4',
        videoDevice: '2',
        audioDevice: 'mic1',
      };

      const resultPromise = record(options);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(mockExecFile).toHaveBeenCalledWith(
        'ffmpeg',
        expect.arrayContaining([
          '-f', 'avfoundation',
          '-framerate', '10',
          '-i', '2:mic1',
          '-vcodec', 'libx264',
          '-t', '10',
        ]),
        expect.objectContaining({ timeout: 40000 }),
        expect.any(Function),
      );
      expect(result).toContain('test-recording.mp4');
    });

    it('uses default video and audio devices when not specified', async () => {
      const child = createMockProcess();
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
          process.nextTick(() => cb(null));
          return child;
        },
      );
      mockStat.mockResolvedValue({ isFile: () => true, size: 1024 });

      const resultPromise = record({ duration: 5, outputPath: '/tmp/out.mp4' });
      await vi.runAllTimersAsync();
      await resultPromise;

      const call = mockExecFile.mock.calls[0];
      const args = call[1] as string[];
      expect(args).toContain('1:default');
    });

    it('rejects when ffmpeg fails', async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
          process.nextTick(() => cb(new Error('Device not found')));
          return createMockProcess();
        },
      );

      // Attach the rejection handler BEFORE advancing timers to avoid unhandled rejection
      const promise = record({ duration: 5, outputPath: '/tmp/out.mp4' }).catch((e) => e);
      await vi.runAllTimersAsync();
      const error = await promise;
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Screen recording failed');
    });

    it('rejects when output file is missing after recording', async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
          process.nextTick(() => cb(null));
          return createMockProcess();
        },
      );
      mockStat.mockRejectedValue(new Error('ENOENT'));

      const promise = record({ duration: 5, outputPath: '/tmp/out.mp4' }).catch((e) => e);
      await vi.runAllTimersAsync();
      const error = await promise;
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Recording file not created');
    });

    it('rejects when output file is empty (0 bytes)', async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
          process.nextTick(() => cb(null));
          return createMockProcess();
        },
      );
      mockStat.mockResolvedValue({ isFile: () => true, size: 0 });

      const promise = record({ duration: 5, outputPath: '/tmp/out.mp4' }).catch((e) => e);
      await vi.runAllTimersAsync();
      const error = await promise;
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Recording file is empty');
    });
  });

  describe('start', () => {
    it('spawns ffmpeg without duration flag', () => {
      const child = createMockProcess();
      mockExecFile.mockReturnValue(child);

      const result = start({ outputPath: '/tmp/long-recording.mp4' });

      expect(result).toBe(child);
      const call = mockExecFile.mock.calls[0];
      const args = call[1] as string[];
      expect(args).not.toContain('-t');
      expect(args).toContain('-y');
    });

    it('uses custom video and audio devices', () => {
      const child = createMockProcess();
      mockExecFile.mockReturnValue(child);

      start({ outputPath: '/tmp/out.mp4', videoDevice: '3', audioDevice: 'usb-mic' });

      const call = mockExecFile.mock.calls[0];
      const args = call[1] as string[];
      expect(args).toContain('3:usb-mic');
    });
  });

  describe('stop', () => {
    it('resolves immediately when process already exited', async () => {
      const proc = createMockProcess();
      (proc as any).exitCode = 0;

      await expect(stop(proc)).resolves.toBeUndefined();
      expect((proc as any).kill).not.toHaveBeenCalled();
    });

    it('sends SIGINT to running process', async () => {
      const proc = createMockProcess();

      const stopPromise = stop(proc);
      await vi.runAllTimersAsync();
      await stopPromise;

      expect((proc as any).kill).toHaveBeenCalledWith('SIGINT');
    });

    it('rejects when process emits error', async () => {
      const proc = new EventEmitter() as unknown as ChildProcess;
      (proc as any).exitCode = null;
      (proc as any).kill = vi.fn((signal?: string) => {
        if (signal === 'SIGINT') {
          process.nextTick(() => proc.emit('error', new Error('Permission denied')));
        }
        return true;
      });

      const promise = stop(proc).catch((e) => e);
      await vi.runAllTimersAsync();
      const error = await promise;
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Error stopping recording');
    });

    it('force-kills after 10s timeout', async () => {
      const proc = new EventEmitter() as unknown as ChildProcess;
      (proc as any).exitCode = null;
      (proc as any).kill = vi.fn((signal?: string) => {
        if (signal === 'SIGKILL') {
          process.nextTick(() => proc.emit('exit', 137));
        }
        return true;
      });

      const promise = stop(proc);
      await vi.advanceTimersByTimeAsync(10001);
      await promise;

      expect((proc as any).kill).toHaveBeenCalledWith('SIGINT');
      expect((proc as any).kill).toHaveBeenCalledWith('SIGKILL');
    });
  });
});
