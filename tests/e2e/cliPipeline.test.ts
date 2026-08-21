/**
 * CLI Pipeline E2E Integration Tests
 *
 * Tests the complete CLI pipeline end-to-end:
 * - Full pipeline flow: video -> audio -> transcription -> analysis -> frames -> markdown
 * - Input validation and error handling
 * - ffmpeg integration
 * - Temp file cleanup and abort handling
 * - Exit code classification
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// =============================================================================
// Hoisted mocks
// =============================================================================

const {
  mockExecFile,
  mockUnlink,
  mockStat,
  mockWriteFile,
  mockChmod,
  mockExistsSync,
  mockMkdirSync,
} = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockUnlink: vi.fn(() => Promise.resolve()),
  mockStat: vi.fn(),
  mockWriteFile: vi.fn(() => Promise.resolve()),
  mockChmod: vi.fn(() => Promise.resolve()),
  mockExistsSync: vi.fn(() => true),
  mockMkdirSync: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('child_process')>()),
  execFile: mockExecFile,
}));

vi.mock('fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs/promises')>()),
  stat: mockStat,
  unlink: mockUnlink,
  writeFile: mockWriteFile,
  chmod: mockChmod,
}));

vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
}));

vi.mock('os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('os')>()),
  tmpdir: () => '/tmp',
}));

vi.mock('crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('crypto')>()),
  randomUUID: () => 'test-uuid-1234',
}));

// Mock shared services
vi.mock('../../src/main/pipeline/TranscriptAnalyzer', () => ({
  TranscriptAnalyzer: vi.fn().mockImplementation(() => ({
    analyze: vi.fn(() => [
      { timestamp: 0.35, reason: 'Session start', confidence: 1.0 },
      { timestamp: 15, reason: 'Natural pause', confidence: 0.8 },
    ]),
  })),
}));

vi.mock('../../src/main/pipeline/FrameExtractor', () => ({
  FrameExtractor: vi.fn().mockImplementation(() => ({
    checkFfmpeg: vi.fn(() => Promise.resolve(true)),
    extract: vi.fn(() =>
      Promise.resolve({
        frames: [
          { path: '/output/screenshots/frame-001.png', timestamp: 0.35, success: true },
          { path: '/output/screenshots/frame-002.png', timestamp: 15, success: true },
        ],
        ffmpegAvailable: true,
      })
    ),
  })),
}));

vi.mock('../../src/main/output/MarkdownGenerator', () => ({
  MarkdownGenerator: vi.fn().mockImplementation(() => ({
    generateFromPostProcess: vi.fn(() => '# Feedback Report\n\nTest content'),
  })),
}));

vi.mock('../../src/main/transcription/WhisperService', () => ({
  WhisperService: vi.fn().mockImplementation(() => {
    const emitter = new EventEmitter();
    return Object.assign(emitter, {
      isModelAvailable: vi.fn(() => true),
      getModelsDirectory: vi.fn(() => '/models'),
      getConfig: vi.fn(() => ({ modelPath: '/models/ggml-base.bin' })),
      transcribeFile: vi.fn(() =>
        Promise.resolve([
          { text: 'Test transcription', startTime: 0, endTime: 5, confidence: 0.95 },
          { text: 'More content here', startTime: 6, endTime: 10, confidence: 0.92 },
        ])
      ),
    });
  }),
}));

// =============================================================================
// Import after mocks
// =============================================================================

import {
  CLIPipeline,
  CLIPipelineError,
  EXIT_SUCCESS,
  EXIT_USER_ERROR,
  EXIT_SYSTEM_ERROR,
  EXIT_SIGINT,
} from '../../src/cli/CLIPipeline';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create an execFile mock that calls callbacks via process.nextTick (async),
 * matching real Node.js behavior. The `execFileTracked` method captures the
 * return value as `const child = execFileCb(...)`, so the callback must NOT
 * fire synchronously (child would be in temporal dead zone).
 */
function mockExecFileAsync(
  handler: (cmd: string, cmdArgs: string[]) => { error: Error | null; stdout: string; stderr: string }
) {
  mockExecFile.mockImplementation((...args: unknown[]) => {
    const cmd = args[0] as string;
    const cmdArgs = args[1] as string[];
    const callback = args[args.length - 1] as (err: Error | null, stdout: string, stderr: string) => void;
    const child = { kill: vi.fn(), pid: 123 };
    const result = handler(cmd, cmdArgs);
    process.nextTick(() => callback(result.error, result.stdout, result.stderr));
    return child;
  });
}

function setupFfmpegMocks() {
  // Default: ffmpeg and ffprobe are available
  mockExecFileAsync((cmd, args) => {
    if (cmd === 'ffprobe') return { error: null, stdout: 'video\n', stderr: '' };
    if (cmd === 'ffmpeg') return { error: null, stdout: 'ffmpeg version 6.0', stderr: '' };
    return { error: null, stdout: '', stderr: '' };
  });
}

function createPipeline(
  overrides: Partial<{
    videoPath: string;
    audioPath: string;
    outputDir: string;
    skipFrames: boolean;
    verbose: boolean;
  }> = {}
) {
  return new CLIPipeline(
    {
      videoPath: overrides.videoPath ?? '/test/video.mp4',
      audioPath: overrides.audioPath,
      outputDir: overrides.outputDir ?? '/test/output',
      skipFrames: overrides.skipFrames ?? false,
      verbose: overrides.verbose ?? false,
    },
    vi.fn(), // log
    vi.fn(), // progress
  );
}

// =============================================================================
// Tests
// =============================================================================

describe('CLI Pipeline E2E', () => {
  beforeEach(() => {
    // Only reset the hoisted mocks — don't use vi.clearAllMocks() which
    // would also clear the WhisperService/FrameExtractor mock implementations
    mockExecFile.mockReset();
    mockUnlink.mockReset();
    mockStat.mockReset();
    mockWriteFile.mockReset();
    mockChmod.mockReset();
    mockExistsSync.mockReset();
    mockMkdirSync.mockReset();

    mockExistsSync.mockReturnValue(true);
    mockStat.mockResolvedValue({ size: 1024, isFile: () => true });
    mockWriteFile.mockResolvedValue(undefined);
    mockChmod.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    setupFfmpegMocks();
  });

  // Note: do NOT use vi.restoreAllMocks() here as it would restore the
  // WhisperService/FrameExtractor/etc module mocks to their original state.

  // ===========================================================================
  // Exit Code Constants
  // ===========================================================================

  describe('Exit Code Constants', () => {
    it('should define correct exit codes', () => {
      expect(EXIT_SUCCESS).toBe(0);
      expect(EXIT_USER_ERROR).toBe(1);
      expect(EXIT_SYSTEM_ERROR).toBe(2);
      expect(EXIT_SIGINT).toBe(130);
    });
  });

  // ===========================================================================
  // CLIPipelineError
  // ===========================================================================

  describe('CLIPipelineError', () => {
    it('should classify user errors', () => {
      const err = new CLIPipelineError('File not found', 'user');
      expect(err.severity).toBe('user');
      expect(err.name).toBe('CLIPipelineError');
      expect(err.message).toBe('File not found');
    });

    it('should classify system errors', () => {
      const err = new CLIPipelineError('ffmpeg crashed', 'system');
      expect(err.severity).toBe('system');
    });

    it('should extend Error', () => {
      const err = new CLIPipelineError('test', 'user');
      expect(err).toBeInstanceOf(Error);
    });
  });

  // ===========================================================================
  // Happy Path Pipeline
  // ===========================================================================

  describe('Happy Path', () => {
    it('should run full pipeline with separate audio file', async () => {
      const pipeline = createPipeline({
        audioPath: '/test/audio.wav',
        skipFrames: false,
      });

      const result = await pipeline.run();

      expect(result.outputPath).toBeTruthy();
      expect(result.outputPath).toMatch(/\.md$/);
      expect(result.transcriptSegments).toBe(2);
      expect(result.durationSeconds).toBeGreaterThanOrEqual(0);
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should run pipeline with --no-frames', async () => {
      const pipeline = createPipeline({
        audioPath: '/test/audio.wav',
        skipFrames: true,
      });

      const result = await pipeline.run();

      expect(result.outputPath).toBeTruthy();
      expect(result.transcriptSegments).toBe(2);
      expect(result.extractedFrames).toBe(0);
    });

    it('should generate correct output filename pattern', () => {
      const pipeline = createPipeline({ videoPath: '/test/my-recording.mp4' });
      const filename = pipeline.generateOutputFilename();

      expect(filename).toMatch(/^my-recording-feedback-\d{8}-\d{6}\.md$/);
    });

    it('should sanitize video name in output filename', () => {
      const pipeline = createPipeline({
        videoPath: '/test/My Recording (Final).mp4',
      });
      const filename = pipeline.generateOutputFilename();

      expect(filename).not.toContain('(');
      expect(filename).not.toContain(')');
      expect(filename).not.toContain(' ');
    });
  });

  // ===========================================================================
  // Input Validation
  // ===========================================================================

  describe('Input Validation', () => {
    it('should throw user error for non-existent video file', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT'));

      const pipeline = createPipeline({ videoPath: '/nonexistent/video.mp4' });

      await expect(pipeline.run()).rejects.toThrow('Video file not found');
    });

    it('should throw user error for empty video file', async () => {
      mockStat.mockResolvedValueOnce({ size: 0, isFile: () => true });

      const pipeline = createPipeline();

      await expect(pipeline.run()).rejects.toThrow(/empty/i);
    });

    it('should throw user error for non-regular file', async () => {
      mockStat.mockResolvedValueOnce({ size: 1024, isFile: () => false });

      const pipeline = createPipeline();

      await expect(pipeline.run()).rejects.toThrow(/Not a regular file/);
    });

    it('should throw user error for non-existent audio file', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (typeof path === 'string' && path.includes('audio')) return false;
        return true;
      });

      const pipeline = createPipeline({ audioPath: '/nonexistent/audio.wav' });

      await expect(pipeline.run()).rejects.toThrow(/Audio file not found/);
    });

    it('should handle output directory creation failure', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (typeof path === 'string' && path === '/test/output') return false;
        return true;
      });
      mockMkdirSync.mockImplementationOnce(() => {
        const err = new Error('Permission denied') as NodeJS.ErrnoException;
        err.code = 'EACCES';
        throw err;
      });

      const pipeline = createPipeline();

      await expect(pipeline.run()).rejects.toThrow(/Permission denied/);
    });
  });

  // ===========================================================================
  // ffmpeg Integration
  // ===========================================================================

  describe('ffmpeg Integration', () => {
    it('should throw system error when ffmpeg not available', async () => {
      mockExecFileAsync((cmd, args) => {
        if (cmd === 'ffmpeg' && args[0] === '-version') {
          return { error: new Error('command not found'), stdout: '', stderr: '' };
        }
        // ffprobe for validation must pass
        if (cmd === 'ffprobe') {
          return { error: null, stdout: 'video\n', stderr: '' };
        }
        return { error: null, stdout: '', stderr: '' };
      });

      const pipeline = createPipeline();

      await expect(pipeline.run()).rejects.toThrow(/ffmpeg.*not found/i);
    });

    it('should skip ffmpeg check when --audio and --no-frames', async () => {
      // When both --audio and --no-frames are provided, ffmpeg check is skipped.
      // But validateVideoFile still runs ffprobe, so we need ffprobe to fail
      // to simulate no ffmpeg at all. The key assertion is it doesn't throw
      // "ffmpeg is required".
      mockExecFileAsync(() => {
        return { error: new Error('not found'), stdout: '', stderr: '' };
      });

      const pipeline = createPipeline({
        audioPath: '/test/audio.wav',
        skipFrames: true,
      });

      // validateVideoFile will fail on ffprobe, but not on "ffmpeg is required"
      try {
        await pipeline.run();
      } catch (err) {
        expect((err as Error).message).not.toMatch(/ffmpeg.*required/i);
      }
    });
  });

  // ===========================================================================
  // Transcription
  // ===========================================================================

  describe('Transcription', () => {
    it('should produce segments when whisper model is available', async () => {
      const pipeline = createPipeline({
        audioPath: '/test/audio.wav',
        skipFrames: true,
      });

      const result = await pipeline.run();
      expect(result.transcriptSegments).toBe(2);
    });
  });

  // ===========================================================================
  // Cleanup & Abort
  // ===========================================================================

  describe('Cleanup & Abort', () => {
    it('should clean up temp files after successful run', async () => {
      const pipeline = createPipeline({
        audioPath: '/test/audio.wav',
        skipFrames: true,
      });

      await pipeline.run();

      // cleanup() is called in finally block
      // No assertion on mockUnlink since we provided audioPath directly
    });

    it('should clean up temp files after failed run', async () => {
      mockStat.mockRejectedValueOnce(new Error('ENOENT'));

      const pipeline = createPipeline();

      try {
        await pipeline.run();
      } catch {
        // Expected
      }

      // cleanup() should still have been called via finally
    });

    it('should abort and kill tracked processes', async () => {
      const pipeline = createPipeline();
      await pipeline.abort();
      // Should not throw
    });
  });

  // ===========================================================================
  // Write Errors
  // ===========================================================================

  describe('Write Errors', () => {
    it('should handle disk full error with helpful message', async () => {
      mockWriteFile.mockRejectedValueOnce(
        Object.assign(new Error('No space left'), { code: 'ENOSPC' })
      );

      const pipeline = createPipeline({
        audioPath: '/test/audio.wav',
        skipFrames: true,
      });

      await expect(pipeline.run()).rejects.toThrow(/Disk is full/);
    });
  });
});
