/**
 * CLI Pipeline Unit Tests
 *
 * Tests the CLI hardening changes:
 * - Input validation (video file, audio file, output dir)
 * - Temp file cleanup (always via finally block)
 * - Signal handling and abort
 * - Error messages with actionable suggestions
 * - Exit code constants
 * - OpenAI key from env var
 * - UTC output filenames
 * - CLIPipelineError severity classification
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// ============================================================================
// Hoisted mocks — vi.hoisted runs before vi.mock factory hoisting
// ============================================================================

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
  mockUnlink: vi.fn(),
  mockStat: vi.fn(),
  mockWriteFile: vi.fn(),
  mockChmod: vi.fn(),
  mockExistsSync: vi.fn(),
  mockMkdirSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: mockExecFile,
}));

vi.mock('fs/promises', () => ({
  stat: mockStat,
  unlink: mockUnlink,
  writeFile: mockWriteFile,
  chmod: mockChmod,
}));

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
}));

vi.mock('os', () => ({
  tmpdir: () => '/tmp',
}));

vi.mock('crypto', () => ({
  randomUUID: () => 'test-uuid-1234',
}));

// Mock shared services to avoid Electron dependencies
vi.mock('../../src/main/pipeline/TranscriptAnalyzer', () => ({
  TranscriptAnalyzer: vi.fn().mockImplementation(() => ({
    analyze: vi.fn(() => []),
  })),
}));

vi.mock('../../src/main/pipeline/FrameExtractor', () => ({
  FrameExtractor: vi.fn().mockImplementation(() => ({
    checkFfmpeg: vi.fn(() => Promise.resolve(true)),
    extract: vi.fn(() => Promise.resolve({ frames: [] })),
  })),
}));

vi.mock('../../src/main/output/MarkdownGenerator', () => ({
  MarkdownGenerator: vi.fn().mockImplementation(() => ({
    generateFromPostProcess: vi.fn(() => '# Test Markdown'),
  })),
}));

vi.mock('../../src/main/transcription/WhisperService', () => {
  return {
    WhisperService: vi.fn().mockImplementation(() => {
      const emitter = new EventEmitter();
      return Object.assign(emitter, {
        isModelAvailable: vi.fn(() => false),
        getModelsDirectory: vi.fn(() => '/models'),
        getConfig: vi.fn(() => ({ modelPath: '/models/ggml-base.bin' })),
        transcribeFile: vi.fn(() => Promise.resolve([])),
      });
    }),
  };
});

// ============================================================================
// Import module under test (after mocks are set up)
// ============================================================================

import {
  CLIPipeline,
  CLIPipelineError,
  EXIT_SUCCESS,
  EXIT_USER_ERROR,
  EXIT_SYSTEM_ERROR,
  EXIT_SIGINT,
} from '../../src/cli/CLIPipeline';

// ============================================================================
// Helpers
// ============================================================================

function makeOptions(overrides: Partial<import('../../src/cli/CLIPipeline').CLIPipelineOptions> = {}) {
  return {
    videoPath: '/path/to/video.mp4',
    outputDir: '/path/to/output',
    skipFrames: true,
    verbose: false,
    ...overrides,
  };
}

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

/** Configure mocks for a happy-path pipeline run */
function setupHappyPath() {
  mockStat.mockResolvedValue({ isFile: () => true, size: 1024 });
  mockExecFileAsync((cmd) => {
    if (cmd === 'ffprobe') return { error: null, stdout: 'video\n', stderr: '' };
    if (cmd === 'ffmpeg') return { error: null, stdout: 'ffmpeg version 6.0', stderr: '' };
    return { error: null, stdout: '', stderr: '' };
  });
  mockExistsSync.mockReturnValue(true);
  mockWriteFile.mockResolvedValue(undefined);
  mockChmod.mockResolvedValue(undefined);
  mockUnlink.mockResolvedValue(undefined);
}

// ============================================================================
// Tests
// ============================================================================

describe('CLIPipeline', () => {
  const noopLog = () => {};

  beforeEach(() => {
    // Only clear the hoisted mocks — don't use vi.clearAllMocks() which
    // would also clear the WhisperService/FrameExtractor mock implementations
    mockExecFile.mockReset();
    mockUnlink.mockReset();
    mockStat.mockReset();
    mockWriteFile.mockReset();
    mockChmod.mockReset();
    mockExistsSync.mockReset();
    mockMkdirSync.mockReset();
  });

  // --------------------------------------------------------------------------
  // Exit code constants
  // --------------------------------------------------------------------------

  describe('exit code constants', () => {
    it('defines correct exit code values', () => {
      expect(EXIT_SUCCESS).toBe(0);
      expect(EXIT_USER_ERROR).toBe(1);
      expect(EXIT_SYSTEM_ERROR).toBe(2);
      expect(EXIT_SIGINT).toBe(130);
    });
  });

  // --------------------------------------------------------------------------
  // CLIPipelineError
  // --------------------------------------------------------------------------

  describe('CLIPipelineError', () => {
    it('creates error with user severity', () => {
      const err = new CLIPipelineError('bad input', 'user');
      expect(err.message).toBe('bad input');
      expect(err.severity).toBe('user');
      expect(err.name).toBe('CLIPipelineError');
      expect(err).toBeInstanceOf(Error);
    });

    it('creates error with system severity', () => {
      const err = new CLIPipelineError('disk full', 'system');
      expect(err.severity).toBe('system');
    });
  });

  // --------------------------------------------------------------------------
  // Input validation — validateVideoFile
  // --------------------------------------------------------------------------

  describe('validateVideoFile', () => {
    it('rejects non-existent video file', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT'));
      mockExistsSync.mockReturnValue(true);
      mockUnlink.mockResolvedValue(undefined);

      const pipeline = new CLIPipeline(makeOptions(), noopLog);
      await expect(pipeline.run()).rejects.toThrow('Video file not found');
    });

    it('rejects directories', async () => {
      mockStat.mockResolvedValue({ isFile: () => false, size: 4096 });
      mockExistsSync.mockReturnValue(true);
      mockUnlink.mockResolvedValue(undefined);

      const pipeline = new CLIPipeline(makeOptions(), noopLog);
      await expect(pipeline.run()).rejects.toThrow('Not a regular file');
    });

    it('rejects zero-byte files', async () => {
      mockStat.mockResolvedValue({ isFile: () => true, size: 0 });
      mockExistsSync.mockReturnValue(true);
      mockUnlink.mockResolvedValue(undefined);

      const pipeline = new CLIPipeline(makeOptions(), noopLog);
      await expect(pipeline.run()).rejects.toThrow('Video file is empty (0 bytes)');
    });

    it('rejects files with no video stream', async () => {
      mockStat.mockResolvedValue({ isFile: () => true, size: 1024 });
      mockExistsSync.mockReturnValue(true);
      mockUnlink.mockResolvedValue(undefined);
      mockExecFileAsync((cmd) => {
        if (cmd === 'ffprobe') return { error: null, stdout: 'audio\n', stderr: '' };
        return { error: null, stdout: '', stderr: '' };
      });

      const pipeline = new CLIPipeline(makeOptions(), noopLog);
      await expect(pipeline.run()).rejects.toThrow('No video stream found');
    });

    it('reports ffprobe unavailable with actionable message', async () => {
      mockStat.mockResolvedValue({ isFile: () => true, size: 1024 });
      mockExistsSync.mockReturnValue(true);
      mockUnlink.mockResolvedValue(undefined);
      mockExecFileAsync((cmd) => {
        if (cmd === 'ffprobe') return { error: new Error('ENOENT'), stdout: '', stderr: '' };
        return { error: null, stdout: '', stderr: '' };
      });

      const pipeline = new CLIPipeline(makeOptions(), noopLog);
      await expect(pipeline.run()).rejects.toThrow('Cannot read video file (is ffprobe installed?)');
    });

    it('classifies validation errors with user severity', async () => {
      mockStat.mockResolvedValue({ isFile: () => true, size: 0 });
      mockExistsSync.mockReturnValue(true);
      mockUnlink.mockResolvedValue(undefined);

      const pipeline = new CLIPipeline(makeOptions(), noopLog);
      try {
        await pipeline.run();
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(CLIPipelineError);
        expect((err as CLIPipelineError).severity).toBe('user');
      }
    });
  });

  // --------------------------------------------------------------------------
  // ffmpeg availability check
  // --------------------------------------------------------------------------

  describe('checkFfmpegAvailable', () => {
    it('throws with install instructions when ffmpeg is missing', async () => {
      mockStat.mockResolvedValue({ isFile: () => true, size: 1024 });
      mockExistsSync.mockReturnValue(true);
      mockUnlink.mockResolvedValue(undefined);
      mockExecFileAsync((cmd) => {
        if (cmd === 'ffprobe') return { error: null, stdout: 'video\n', stderr: '' };
        if (cmd === 'ffmpeg') return { error: new Error('ENOENT'), stdout: '', stderr: '' };
        return { error: null, stdout: '', stderr: '' };
      });

      const pipeline = new CLIPipeline(makeOptions({ skipFrames: false }), noopLog);
      await expect(pipeline.run()).rejects.toThrow('ffmpeg is required but not found');
    });

    it('skips ffmpeg check when --audio and --no-frames', async () => {
      setupHappyPath();

      const pipeline = new CLIPipeline(
        makeOptions({ audioPath: '/path/to/audio.wav', skipFrames: true }),
        noopLog
      );
      const result = await pipeline.run();
      expect(result).toBeDefined();
      // ffmpeg should not have been called with -version
      const ffmpegCalls = mockExecFile.mock.calls.filter(
        (call: unknown[]) => call[0] === 'ffmpeg' && (call[1] as string[]).includes('-version')
      );
      expect(ffmpegCalls.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Output directory error handling
  // --------------------------------------------------------------------------

  describe('output directory creation', () => {
    it('wraps EACCES in a user-friendly message', async () => {
      setupHappyPath();
      mockExistsSync.mockReturnValue(false);
      const eaccesError = Object.assign(new Error('EACCES'), { code: 'EACCES' });
      mockMkdirSync.mockImplementation(() => { throw eaccesError; });

      const pipeline = new CLIPipeline(makeOptions(), noopLog);
      await expect(pipeline.run()).rejects.toThrow('Permission denied: cannot create output directory');
    });

    it('wraps other mkdir errors with the error code', async () => {
      setupHappyPath();
      mockExistsSync.mockReturnValue(false);
      const enospcError = Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
      mockMkdirSync.mockImplementation(() => { throw enospcError; });

      const pipeline = new CLIPipeline(makeOptions(), noopLog);
      await expect(pipeline.run()).rejects.toThrow('Cannot create output directory');
    });
  });

  // --------------------------------------------------------------------------
  // Write output error handling
  // --------------------------------------------------------------------------

  describe('output write errors', () => {
    it('reports disk-full errors clearly', async () => {
      setupHappyPath();
      const enospcError = Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
      mockWriteFile.mockRejectedValue(enospcError);

      const pipeline = new CLIPipeline(makeOptions(), noopLog);
      await expect(pipeline.run()).rejects.toThrow('Disk is full');
    });
  });

  // --------------------------------------------------------------------------
  // Temp file cleanup
  // --------------------------------------------------------------------------

  describe('temp file cleanup', () => {
    it('cleans up temp files on successful run', async () => {
      mockStat.mockResolvedValue({ isFile: () => true, size: 1024 });
      mockExistsSync.mockReturnValue(true);
      mockWriteFile.mockResolvedValue(undefined);
      mockUnlink.mockResolvedValue(undefined);
      mockChmod.mockResolvedValue(undefined);
      mockExecFileAsync((cmd, cmdArgs) => {
        if (cmd === 'ffprobe') {
          if (cmdArgs.includes('v')) {
            return { error: null, stdout: 'video\n', stderr: '' };
          } else {
            // videoHasAudioTrack
            return { error: null, stdout: 'audio\n', stderr: '' };
          }
        }
        if (cmd === 'ffmpeg') {
          if (cmdArgs.includes('-version')) {
            return { error: null, stdout: 'ffmpeg version 6.0', stderr: '' };
          }
          // audio extraction
          return { error: null, stdout: '', stderr: '' };
        }
        return { error: null, stdout: '', stderr: '' };
      });

      const pipeline = new CLIPipeline(makeOptions({ skipFrames: true }), noopLog);
      await pipeline.run();

      expect(mockUnlink).toHaveBeenCalledWith('/tmp/markuprx-cli-audio-test-uuid-1234.wav');
    });

    it('cleans up temp files even when pipeline fails', async () => {
      mockStat.mockResolvedValue({ isFile: () => true, size: 1024 });
      mockExistsSync.mockReturnValue(true);
      mockUnlink.mockResolvedValue(undefined);
      mockChmod.mockResolvedValue(undefined);
      mockExecFileAsync((cmd, cmdArgs) => {
        if (cmd === 'ffprobe') {
          if (cmdArgs.includes('v')) {
            return { error: null, stdout: 'video\n', stderr: '' };
          } else {
            return { error: null, stdout: 'audio\n', stderr: '' };
          }
        }
        if (cmd === 'ffmpeg') {
          if (cmdArgs.includes('-version')) {
            return { error: null, stdout: 'ffmpeg version 6.0', stderr: '' };
          }
          return { error: null, stdout: '', stderr: '' };
        }
        return { error: null, stdout: '', stderr: '' };
      });
      mockWriteFile.mockRejectedValue(new Error('write fail'));

      const pipeline = new CLIPipeline(makeOptions({ skipFrames: true }), noopLog);
      await expect(pipeline.run()).rejects.toThrow();

      expect(mockUnlink).toHaveBeenCalledWith('/tmp/markuprx-cli-audio-test-uuid-1234.wav');
    });

    it('cleanup ignores errors from unlink', async () => {
      mockUnlink.mockRejectedValue(new Error('ENOENT'));

      const pipeline = new CLIPipeline(makeOptions(), noopLog);
      (pipeline as any).tempFiles = ['/tmp/nonexistent.wav'];
      await expect(pipeline.cleanup()).resolves.not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Signal handling — abort()
  // --------------------------------------------------------------------------

  describe('abort', () => {
    it('kills all active child processes', async () => {
      const mockKill = vi.fn();
      const mockProc = { kill: mockKill, pid: 999 } as any;
      mockUnlink.mockResolvedValue(undefined);

      const pipeline = new CLIPipeline(makeOptions(), noopLog);
      (pipeline as any).activeProcesses.add(mockProc);
      (pipeline as any).tempFiles = ['/tmp/test.wav'];

      await pipeline.abort();

      expect(mockKill).toHaveBeenCalledWith('SIGTERM');
      expect((pipeline as any).activeProcesses.size).toBe(0);
      expect(mockUnlink).toHaveBeenCalledWith('/tmp/test.wav');
    });

    it('cleans up temp files during abort', async () => {
      mockUnlink.mockResolvedValue(undefined);

      const pipeline = new CLIPipeline(makeOptions(), noopLog);
      (pipeline as any).tempFiles = ['/tmp/a.wav', '/tmp/b.wav'];

      await pipeline.abort();

      expect(mockUnlink).toHaveBeenCalledTimes(2);
      expect(mockUnlink).toHaveBeenCalledWith('/tmp/a.wav');
      expect(mockUnlink).toHaveBeenCalledWith('/tmp/b.wav');
    });
  });

  // --------------------------------------------------------------------------
  // Progress output
  // --------------------------------------------------------------------------

  describe('progress output', () => {
    it('calls progress function for major pipeline steps', async () => {
      setupHappyPath();
      const progressFn = vi.fn();

      const pipeline = new CLIPipeline(makeOptions({ skipFrames: true }), noopLog, progressFn);
      await pipeline.run();

      expect(progressFn).toHaveBeenCalledWith('Extracting audio...');
      expect(progressFn).toHaveBeenCalledWith('Transcribing (this may take a while)...');
      expect(progressFn).toHaveBeenCalledWith('Generating report...');
    });
  });

  // --------------------------------------------------------------------------
  // Output filename — UTC
  // --------------------------------------------------------------------------

  describe('generateOutputFilename', () => {
    it('uses UTC timestamps in filename', () => {
      const pipeline = new CLIPipeline(
        makeOptions({ videoPath: '/path/to/my-recording.mp4' }),
        noopLog
      );

      const filename = pipeline.generateOutputFilename();
      expect(filename).toMatch(/^my-recording-feedback-\d{8}-\d{6}\.md$/);
    });

    it('sanitizes special characters in video filename', () => {
      const pipeline = new CLIPipeline(
        makeOptions({ videoPath: '/path/to/my recording (final).mp4' }),
        noopLog
      );

      const filename = pipeline.generateOutputFilename();
      expect(filename).not.toContain(' ');
      expect(filename).not.toContain('(');
      expect(filename).not.toContain(')');
    });
  });

  // --------------------------------------------------------------------------
  // Happy path — full pipeline
  // --------------------------------------------------------------------------

  describe('happy path', () => {
    it('returns result with output path and metrics', async () => {
      setupHappyPath();

      const pipeline = new CLIPipeline(makeOptions({ skipFrames: true }), noopLog);
      const result = await pipeline.run();

      expect(result.outputPath).toContain('/path/to/output/');
      expect(result.outputPath).toMatch(/\.md$/);
      expect(result.transcriptSegments).toBe(0);
      expect(result.extractedFrames).toBe(0);
      expect(result.durationSeconds).toBeGreaterThanOrEqual(0);
    });
  });
});
