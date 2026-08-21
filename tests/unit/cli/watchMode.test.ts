/**
 * WatchMode Unit Tests
 *
 * Tests the watch mode functionality:
 * - File detection (only video extensions)
 * - Stability check (file size must stabilize)
 * - Skip logic (already-processed files)
 * - Graceful shutdown
 * - Watch log writing
 * - Error handling during processing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Hoisted mocks
// ============================================================================

const {
  mockWatch,
  mockExistsSync,
  mockMkdirSync,
  mockReaddirSync,
  mockStat,
  mockReaddir,
  mockAppendFile,
} = vi.hoisted(() => ({
  mockWatch: vi.fn(),
  mockExistsSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockReaddirSync: vi.fn(),
  mockStat: vi.fn(),
  mockReaddir: vi.fn(),
  mockAppendFile: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  watch: mockWatch,
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  readdirSync: mockReaddirSync,
}));

vi.mock('fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs/promises')>()),
  stat: mockStat,
  readdir: mockReaddir,
  appendFile: mockAppendFile,
}));

// Mock CLIPipeline to avoid real pipeline execution
const mockPipelineRun = vi.fn();
const mockPipelineAbort = vi.fn();

vi.mock('../../../src/cli/CLIPipeline', () => ({
  CLIPipeline: vi.fn().mockImplementation(() => ({
    run: mockPipelineRun,
    abort: mockPipelineAbort,
  })),
}));

// ============================================================================
// Import module under test (after mocks)
// ============================================================================

import {
  WatchMode,
  VIDEO_EXTENSIONS,
  WATCH_LOG_FILENAME,
  type WatchModeOptions,
  type WatchModeCallbacks,
} from '../../../src/cli/WatchMode';

// ============================================================================
// Helpers
// ============================================================================

function makeOptions(overrides: Partial<WatchModeOptions> = {}): WatchModeOptions {
  return {
    watchDir: '/watch',
    outputDir: '/watch/markuprx-output',
    skipFrames: true,
    verbose: false,
    stabilityInterval: 50,
    maxStabilityChecks: 3,
    ...overrides,
  };
}

function makeCallbacks(overrides: Partial<WatchModeCallbacks> = {}): WatchModeCallbacks {
  return {
    onLog: vi.fn(),
    onFileDetected: vi.fn(),
    onProcessingStart: vi.fn(),
    onProcessingComplete: vi.fn(),
    onProcessingError: vi.fn(),
    ...overrides,
  };
}

/** Create a fake FSWatcher that lets us emit events */
function createFakeWatcher() {
  const listeners = new Map<string, Function[]>();
  let watchCallback: ((eventType: string, filename: string | null) => void) | null = null;

  const fakeWatcher = {
    on: vi.fn((event: string, handler: Function) => {
      const list = listeners.get(event) || [];
      list.push(handler);
      listeners.set(event, list);
      return fakeWatcher;
    }),
    close: vi.fn(),
  };

  mockWatch.mockImplementation((_dir: string, cb: (eventType: string, filename: string | null) => void) => {
    watchCallback = cb;
    return fakeWatcher;
  });

  return {
    fakeWatcher,
    emit: (eventType: string, filename: string | null) => {
      if (watchCallback) watchCallback(eventType, filename);
    },
    emitError: (err: Error) => {
      const handlers = listeners.get('error') || [];
      handlers.forEach((h) => h(err));
    },
  };
}

/**
 * Flush microtask queue so that async operations (like readdir mock resolving)
 * complete. This is needed because start() awaits scanExistingFiles() before
 * setting up the fs.watch watcher.
 */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

/**
 * Advance fake timers and flush microtask queue repeatedly.
 * This ensures nested setTimeout + async callbacks all fire.
 */
async function advanceAndFlush(ms: number, iterations = 5): Promise<void> {
  const step = Math.ceil(ms / iterations);
  for (let i = 0; i < iterations; i++) {
    await vi.advanceTimersByTimeAsync(step);
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('WatchMode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockWatch.mockReset();
    mockExistsSync.mockReset();
    mockMkdirSync.mockReset();
    mockReaddirSync.mockReset();
    mockStat.mockReset();
    mockReaddir.mockReset();
    mockAppendFile.mockReset();
    mockPipelineRun.mockReset();
    mockPipelineAbort.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --------------------------------------------------------------------------
  // Constants
  // --------------------------------------------------------------------------

  describe('constants', () => {
    it('supports .mov, .mp4, and .webm extensions', () => {
      expect(VIDEO_EXTENSIONS.has('.mov')).toBe(true);
      expect(VIDEO_EXTENSIONS.has('.mp4')).toBe(true);
      expect(VIDEO_EXTENSIONS.has('.webm')).toBe(true);
    });

    it('does not include non-video extensions', () => {
      expect(VIDEO_EXTENSIONS.has('.txt')).toBe(false);
      expect(VIDEO_EXTENSIONS.has('.png')).toBe(false);
      expect(VIDEO_EXTENSIONS.has('.wav')).toBe(false);
    });

    it('defines a watch log filename', () => {
      expect(WATCH_LOG_FILENAME).toBe('.markuprx-watch.log');
    });
  });

  // --------------------------------------------------------------------------
  // Directory validation
  // --------------------------------------------------------------------------

  describe('directory validation', () => {
    it('throws if watch directory does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const watcher = new WatchMode(makeOptions(), makeCallbacks());
      await expect(watcher.start()).rejects.toThrow('Watch directory does not exist');
    });

    it('creates output directory if it does not exist', async () => {
      mockExistsSync.mockImplementation((p: string) => {
        if (p === '/watch') return true;
        if (p === '/watch/markuprx-output') return false;
        return true;
      });
      mockReaddir.mockResolvedValue([]);
      const { fakeWatcher } = createFakeWatcher();

      const watcher = new WatchMode(makeOptions(), makeCallbacks());
      const startPromise = watcher.start();
      await flush();

      watcher.stop();
      await startPromise;

      expect(mockMkdirSync).toHaveBeenCalledWith('/watch/markuprx-output', { recursive: true });
      expect(fakeWatcher.close).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // File detection
  // --------------------------------------------------------------------------

  describe('file detection', () => {
    it('detects new .mov files', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([]);
      const callbacks = makeCallbacks();
      const { emit } = createFakeWatcher();

      const watcher = new WatchMode(makeOptions(), callbacks);
      const startPromise = watcher.start();
      await flush();

      emit('rename', 'recording.mov');

      watcher.stop();
      await startPromise;

      expect(callbacks.onFileDetected).toHaveBeenCalledWith('/watch/recording.mov');
    });

    it('detects new .mp4 files', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([]);
      const callbacks = makeCallbacks();
      const { emit } = createFakeWatcher();

      const watcher = new WatchMode(makeOptions(), callbacks);
      const startPromise = watcher.start();
      await flush();

      emit('rename', 'recording.mp4');

      watcher.stop();
      await startPromise;

      expect(callbacks.onFileDetected).toHaveBeenCalledWith('/watch/recording.mp4');
    });

    it('detects new .webm files', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([]);
      const callbacks = makeCallbacks();
      const { emit } = createFakeWatcher();

      const watcher = new WatchMode(makeOptions(), callbacks);
      const startPromise = watcher.start();
      await flush();

      emit('rename', 'recording.webm');

      watcher.stop();
      await startPromise;

      expect(callbacks.onFileDetected).toHaveBeenCalledWith('/watch/recording.webm');
    });

    it('ignores non-video files', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([]);
      const callbacks = makeCallbacks();
      const { emit } = createFakeWatcher();

      const watcher = new WatchMode(makeOptions(), callbacks);
      const startPromise = watcher.start();
      await flush();

      emit('rename', 'notes.txt');
      emit('rename', 'image.png');
      emit('rename', '.DS_Store');

      watcher.stop();
      await startPromise;

      expect(callbacks.onFileDetected).not.toHaveBeenCalled();
    });

    it('ignores null filenames', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([]);
      const callbacks = makeCallbacks();
      const { emit } = createFakeWatcher();

      const watcher = new WatchMode(makeOptions(), callbacks);
      const startPromise = watcher.start();
      await flush();

      emit('rename', null);

      watcher.stop();
      await startPromise;

      expect(callbacks.onFileDetected).not.toHaveBeenCalled();
    });

    it('does not detect the same file twice', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([]);
      const callbacks = makeCallbacks();
      const { emit } = createFakeWatcher();

      const watcher = new WatchMode(makeOptions(), callbacks);
      const startPromise = watcher.start();
      await flush();

      emit('rename', 'recording.mov');
      emit('rename', 'recording.mov');
      emit('rename', 'recording.mov');

      watcher.stop();
      await startPromise;

      // Only detected once (subsequent events ignored because stability check is pending)
      expect(callbacks.onFileDetected).toHaveBeenCalledTimes(1);
    });
  });

  // --------------------------------------------------------------------------
  // Stability checks
  // --------------------------------------------------------------------------

  describe('file stability', () => {
    it('processes file after size stabilizes', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([]);
      mockAppendFile.mockResolvedValue(undefined);
      mockPipelineRun.mockResolvedValue({
        outputPath: '/watch/markuprx-output/test-feedback.md',
        transcriptSegments: 0,
        extractedFrames: 0,
        durationSeconds: 1.0,
      });

      const callbacks = makeCallbacks();
      const { emit } = createFakeWatcher();

      // First stat call returns 1000, then 2000, then 2000 (stable)
      let statCallCount = 0;
      mockStat.mockImplementation(async () => {
        statCallCount++;
        if (statCallCount === 1) return { size: 1000 };
        return { size: 2000 };
      });

      const watcher = new WatchMode(makeOptions(), callbacks);
      const startPromise = watcher.start();
      await flush();

      emit('rename', 'test.mov');

      // Advance through stability checks + pipeline execution
      await advanceAndFlush(600, 12);

      watcher.stop();
      await startPromise;

      expect(callbacks.onProcessingStart).toHaveBeenCalledWith('/watch/test.mov');
    });

    it('skips files that are removed before stabilizing', async () => {
      mockExistsSync.mockImplementation((p: string) => {
        if (p === '/watch') return true;
        if (p === '/watch/markuprx-output') return true;
        if (p === '/watch/vanished.mov') return false;
        return true;
      });
      mockReaddir.mockResolvedValue([]);
      const callbacks = makeCallbacks();
      const { emit } = createFakeWatcher();

      const watcher = new WatchMode(makeOptions(), callbacks);
      const startPromise = watcher.start();
      await flush();

      emit('rename', 'vanished.mov');

      await advanceAndFlush(300, 6);

      watcher.stop();
      await startPromise;

      expect(callbacks.onProcessingStart).not.toHaveBeenCalled();
    });

    it('gives up after max stability checks', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([]);
      const callbacks = makeCallbacks();
      const { emit } = createFakeWatcher();

      // File size keeps changing
      let size = 100;
      mockStat.mockImplementation(async () => {
        size += 100;
        return { size };
      });

      const watcher = new WatchMode(
        makeOptions({ maxStabilityChecks: 3 }),
        callbacks
      );
      const startPromise = watcher.start();
      await flush();

      emit('rename', 'growing.mov');

      // Advance through all stability checks (3 checks * 50ms interval + extra)
      await advanceAndFlush(500, 10);

      watcher.stop();
      await startPromise;

      expect(callbacks.onLog).toHaveBeenCalledWith(
        expect.stringContaining('Gave up waiting for file to stabilize')
      );
      expect(callbacks.onProcessingStart).not.toHaveBeenCalled();
    });

    it('skips zero-byte files and continues checking', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([]);
      mockAppendFile.mockResolvedValue(undefined);
      mockPipelineRun.mockResolvedValue({
        outputPath: '/watch/markuprx-output/test-feedback.md',
        transcriptSegments: 0,
        extractedFrames: 0,
        durationSeconds: 1.0,
      });

      const callbacks = makeCallbacks();
      const { emit } = createFakeWatcher();

      let statCall = 0;
      mockStat.mockImplementation(async () => {
        statCall++;
        if (statCall <= 1) return { size: 0 }; // Zero bytes at first
        return { size: 5000 }; // Then stable
      });

      const watcher = new WatchMode(makeOptions(), callbacks);
      const startPromise = watcher.start();
      await flush();

      emit('rename', 'test.mov');

      // Advance through checks + pipeline
      await advanceAndFlush(600, 12);

      watcher.stop();
      await startPromise;

      expect(callbacks.onProcessingStart).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Skip logic
  // --------------------------------------------------------------------------

  describe('skip already-processed files', () => {
    it('skips files that already have output', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue(['existing.mov']);
      mockReaddirSync.mockReturnValue(['existing-feedback-20260214-120000.md']);

      const callbacks = makeCallbacks();
      const { emit } = createFakeWatcher();

      const watcher = new WatchMode(makeOptions({ verbose: true }), callbacks);
      const startPromise = watcher.start();
      await flush();

      // Try to trigger this file — it should already be in the processed set
      emit('rename', 'existing.mov');

      watcher.stop();
      await startPromise;

      expect(callbacks.onFileDetected).not.toHaveBeenCalled();
      expect(callbacks.onLog).toHaveBeenCalledWith(
        expect.stringContaining('Skipping (already processed)')
      );
    });

    it('does not skip files without existing output', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue(['new-recording.mov']);
      mockReaddirSync.mockReturnValue([]); // No output files

      const callbacks = makeCallbacks();
      const { emit } = createFakeWatcher();

      const watcher = new WatchMode(makeOptions(), callbacks);
      const startPromise = watcher.start();
      await flush();

      emit('rename', 'new-recording.mov');

      watcher.stop();
      await startPromise;

      expect(callbacks.onFileDetected).toHaveBeenCalledWith('/watch/new-recording.mov');
    });
  });

  // --------------------------------------------------------------------------
  // hasExistingOutput
  // --------------------------------------------------------------------------

  describe('hasExistingOutput', () => {
    it('returns true when matching output exists', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['my-video-feedback-20260214-120000.md']);

      const watcher = new WatchMode(makeOptions(), makeCallbacks());
      expect(watcher.hasExistingOutput('my-video.mov')).toBe(true);
    });

    it('returns false when no matching output exists', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['other-video-feedback-20260214-120000.md']);

      const watcher = new WatchMode(makeOptions(), makeCallbacks());
      expect(watcher.hasExistingOutput('my-video.mov')).toBe(false);
    });

    it('returns false when output directory does not exist', () => {
      mockExistsSync.mockImplementation((p: string) => {
        if (p === '/watch/markuprx-output') return false;
        return true;
      });

      const watcher = new WatchMode(makeOptions(), makeCallbacks());
      expect(watcher.hasExistingOutput('my-video.mov')).toBe(false);
    });

    it('sanitizes filenames with special characters', () => {
      mockExistsSync.mockReturnValue(true);
      // 'my recording (final)' → 'my-recording--final-' → 'my-recording-final-'
      mockReaddirSync.mockReturnValue(['my-recording-final--feedback-20260214-120000.md']);

      const watcher = new WatchMode(makeOptions(), makeCallbacks());
      expect(watcher.hasExistingOutput('my recording (final).mov')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Graceful shutdown
  // --------------------------------------------------------------------------

  describe('graceful shutdown', () => {
    it('stops the watcher and clears pending checks', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([]);
      const { fakeWatcher, emit } = createFakeWatcher();

      const watcher = new WatchMode(makeOptions(), makeCallbacks());
      const startPromise = watcher.start();
      await flush();

      emit('rename', 'test.mov');

      watcher.stop();
      await startPromise;

      expect(fakeWatcher.close).toHaveBeenCalled();
      expect(watcher.isStopped()).toBe(true);
    });

    it('ignores file events after stop', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([]);
      const callbacks = makeCallbacks();
      const { emit } = createFakeWatcher();

      const watcher = new WatchMode(makeOptions(), callbacks);
      const startPromise = watcher.start();
      await flush();

      watcher.stop();
      await startPromise;

      emit('rename', 'after-stop.mov');

      expect(callbacks.onFileDetected).not.toHaveBeenCalled();
    });

    it('can be stopped multiple times without error', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([]);
      createFakeWatcher();

      const watcher = new WatchMode(makeOptions(), makeCallbacks());
      const startPromise = watcher.start();
      await flush();

      watcher.stop();
      watcher.stop();
      watcher.stop();
      await startPromise;

      expect(watcher.isStopped()).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Processing pipeline integration
  // --------------------------------------------------------------------------

  describe('pipeline processing', () => {
    it('calls CLIPipeline.run() for stable files', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([]);
      mockAppendFile.mockResolvedValue(undefined);
      mockReaddirSync.mockReturnValue([]);
      mockPipelineRun.mockResolvedValue({
        outputPath: '/watch/markuprx-output/test-feedback.md',
        transcriptSegments: 5,
        extractedFrames: 3,
        durationSeconds: 2.5,
      });

      // Stable from the start (two checks with same size)
      mockStat.mockResolvedValue({ size: 5000 });

      const callbacks = makeCallbacks();
      const { emit } = createFakeWatcher();

      const watcher = new WatchMode(makeOptions(), callbacks);
      const startPromise = watcher.start();
      await flush();

      emit('rename', 'test.mov');

      // Advance through stability checks + pipeline
      await advanceAndFlush(600, 12);

      watcher.stop();
      await startPromise;

      expect(mockPipelineRun).toHaveBeenCalledTimes(1);
      expect(callbacks.onProcessingComplete).toHaveBeenCalledWith(
        '/watch/test.mov',
        '/watch/markuprx-output/test-feedback.md'
      );
    });

    it('reports pipeline errors without crashing', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([]);
      mockReaddirSync.mockReturnValue([]);
      mockStat.mockResolvedValue({ size: 5000 });
      mockPipelineRun.mockRejectedValue(new Error('ffmpeg crashed'));

      const callbacks = makeCallbacks();
      const { emit } = createFakeWatcher();

      const watcher = new WatchMode(makeOptions(), callbacks);
      const startPromise = watcher.start();
      await flush();

      emit('rename', 'test.mov');

      // Advance through stability + pipeline error
      await advanceAndFlush(600, 12);

      watcher.stop();
      await startPromise;

      expect(callbacks.onProcessingError).toHaveBeenCalledWith(
        '/watch/test.mov',
        expect.objectContaining({ message: 'ffmpeg crashed' })
      );
    });

    it('adds file to processed set after successful pipeline', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([]);
      mockReaddirSync.mockReturnValue([]);
      mockAppendFile.mockResolvedValue(undefined);
      mockStat.mockResolvedValue({ size: 5000 });
      mockPipelineRun.mockResolvedValue({
        outputPath: '/watch/markuprx-output/test-feedback.md',
        transcriptSegments: 0,
        extractedFrames: 0,
        durationSeconds: 1.0,
      });

      const { emit } = createFakeWatcher();

      const watcher = new WatchMode(makeOptions(), makeCallbacks());
      const startPromise = watcher.start();
      await flush();

      emit('rename', 'test.mov');

      await advanceAndFlush(600, 12);

      expect(watcher.getProcessedFiles().has('/watch/test.mov')).toBe(true);

      watcher.stop();
      await startPromise;
    });
  });

  // --------------------------------------------------------------------------
  // Watch log
  // --------------------------------------------------------------------------

  describe('watch log', () => {
    it('appends entry to watch log after processing', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([]);
      mockReaddirSync.mockReturnValue([]);
      mockAppendFile.mockResolvedValue(undefined);
      mockStat.mockResolvedValue({ size: 5000 });
      mockPipelineRun.mockResolvedValue({
        outputPath: '/watch/markuprx-output/test-feedback.md',
        transcriptSegments: 0,
        extractedFrames: 0,
        durationSeconds: 1.0,
      });

      const { emit } = createFakeWatcher();
      const watcher = new WatchMode(makeOptions(), makeCallbacks());
      const startPromise = watcher.start();
      await flush();

      emit('rename', 'test.mov');

      await advanceAndFlush(600, 12);

      watcher.stop();
      await startPromise;

      expect(mockAppendFile).toHaveBeenCalledWith(
        '/watch/.markuprx-watch.log',
        expect.stringContaining('/watch/test.mov'),
        'utf-8'
      );
      expect(mockAppendFile).toHaveBeenCalledWith(
        '/watch/.markuprx-watch.log',
        expect.stringContaining('/watch/markuprx-output/test-feedback.md'),
        'utf-8'
      );
    });

    it('does not crash if watch log write fails', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([]);
      mockReaddirSync.mockReturnValue([]);
      mockAppendFile.mockRejectedValue(new Error('EACCES'));
      mockStat.mockResolvedValue({ size: 5000 });
      mockPipelineRun.mockResolvedValue({
        outputPath: '/watch/markuprx-output/test-feedback.md',
        transcriptSegments: 0,
        extractedFrames: 0,
        durationSeconds: 1.0,
      });

      const callbacks = makeCallbacks();
      const { emit } = createFakeWatcher();
      const watcher = new WatchMode(makeOptions(), callbacks);
      const startPromise = watcher.start();
      await flush();

      emit('rename', 'test.mov');

      await advanceAndFlush(600, 12);

      watcher.stop();
      await startPromise;

      // Should still report success even though log write failed
      expect(callbacks.onProcessingComplete).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Watcher error handling
  // --------------------------------------------------------------------------

  describe('watcher errors', () => {
    it('logs watcher errors without crashing', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([]);
      const callbacks = makeCallbacks();
      const { emitError } = createFakeWatcher();

      const watcher = new WatchMode(makeOptions(), callbacks);
      const startPromise = watcher.start();
      await flush();

      emitError(new Error('EPERM'));

      watcher.stop();
      await startPromise;

      expect(callbacks.onLog).toHaveBeenCalledWith('Watcher error: EPERM');
    });
  });

  // --------------------------------------------------------------------------
  // Default output directory
  // --------------------------------------------------------------------------

  describe('default output directory', () => {
    it('defaults to <watchDir>/markuprx-output when no outputDir specified', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([]);

      const watcher = new WatchMode(
        makeOptions({ outputDir: undefined, watchDir: '/my/dir' }),
        makeCallbacks()
      );

      watcher.hasExistingOutput('test.mov');
      expect(mockExistsSync).toHaveBeenCalledWith('/my/dir/markuprx-output');
    });
  });

  // --------------------------------------------------------------------------
  // Verbose mode
  // --------------------------------------------------------------------------

  describe('verbose mode', () => {
    it('logs file size during stability checks when verbose', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddir.mockResolvedValue([]);
      mockStat.mockResolvedValue({ size: 1000 });

      const callbacks = makeCallbacks();
      const { emit } = createFakeWatcher();

      const watcher = new WatchMode(
        makeOptions({ verbose: true, maxStabilityChecks: 2 }),
        callbacks
      );
      const startPromise = watcher.start();
      await flush();

      emit('rename', 'test.mov');

      // Advance through stability check
      await advanceAndFlush(300, 6);

      watcher.stop();
      await startPromise;

      expect(callbacks.onLog).toHaveBeenCalledWith(
        expect.stringContaining('File size: 1000 bytes')
      );
    });
  });
});
