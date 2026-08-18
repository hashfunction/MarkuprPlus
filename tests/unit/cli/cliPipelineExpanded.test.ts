/**
 * CLIPipeline Expanded Unit Tests
 *
 * Tests additional paths not covered by the main cli.test.ts:
 * - findClosestSegment: exact match, nearest neighbor, empty segments
 * - Template system: unknown template error, non-markdown extension
 * - Audio path resolution: missing provided audio, no audio track in video
 * - Transcription: model available path, model not available path
 * - Frame extraction: ffmpeg not available, key moments with frames
 * - generateOutputFilename: custom extensions, dotless extension
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// ============================================================================
// Hoisted mocks
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
  randomUUID: () => 'test-uuid-expanded',
}));

// Mock TranscriptAnalyzer to return key moments when we want
const mockAnalyze = vi.fn(() => []);

vi.mock('../../../src/main/pipeline/TranscriptAnalyzer', () => ({
  TranscriptAnalyzer: vi.fn().mockImplementation(function TranscriptAnalyzerMock() {
    return {
      analyze: mockAnalyze,
    };
  }),
}));

// Mock FrameExtractor
const mockCheckFfmpeg = vi.fn(() => Promise.resolve(true));
const mockExtract = vi.fn(() =>
  Promise.resolve({ frames: [] }),
);

vi.mock('../../../src/main/pipeline/FrameExtractor', () => ({
  FrameExtractor: vi.fn().mockImplementation(function FrameExtractorMock() {
    return {
      checkFfmpeg: mockCheckFfmpeg,
      extract: mockExtract,
    };
  }),
}));

// Mock MarkdownGenerator
vi.mock('../../../src/main/output/MarkdownGenerator', () => ({
  MarkdownGenerator: vi.fn().mockImplementation(function MarkdownGeneratorMock() {
    return {
      generateFromPostProcess: vi.fn(() => '# Test Markdown'),
    };
  }),
}));

// Mock WhisperService with controllable behavior
const mockIsModelAvailable = vi.fn(() => false);
const mockTranscribeFile = vi.fn(() => Promise.resolve([]));

vi.mock('../../../src/main/transcription/WhisperService', () => {
  return {
    WhisperService: vi.fn().mockImplementation(function WhisperServiceMock() {
      const emitter = new EventEmitter();
      return Object.assign(emitter, {
        isModelAvailable: mockIsModelAvailable,
        getModelsDirectory: vi.fn(() => '/models'),
        getConfig: vi.fn(() => ({ modelPath: '/models/ggml-base.bin' })),
        transcribeFile: mockTranscribeFile,
      });
    }),
  };
});

// Mock template registry
const mockTemplateGet = vi.fn();
const mockTemplateList = vi.fn(() => ['markdown', 'json', 'github-issue']);

vi.mock('../../../src/main/output/templates/index', () => ({
  templateRegistry: {
    get: (...args: unknown[]) => mockTemplateGet(...args),
    list: () => mockTemplateList(),
  },
}));

import { CLIPipeline, CLIPipelineError } from '../../../src/cli/CLIPipeline';

// ============================================================================
// Helpers
// ============================================================================

function makeOptions(
  overrides: Partial<import('../../../src/cli/CLIPipeline').CLIPipelineOptions> = {},
) {
  return {
    videoPath: '/path/to/video.mp4',
    outputDir: '/path/to/output',
    skipFrames: true,
    verbose: false,
    ...overrides,
  };
}

function mockExecFileAsync(
  handler: (
    cmd: string,
    cmdArgs: string[],
  ) => { error: Error | null; stdout: string; stderr: string },
) {
  mockExecFile.mockImplementation((...args: unknown[]) => {
    const cmd = args[0] as string;
    const cmdArgs = args[1] as string[];
    const callback = args[args.length - 1] as (
      err: Error | null,
      stdout: string,
      stderr: string,
    ) => void;
    const child = { kill: vi.fn(), pid: 456 };
    const result = handler(cmd, cmdArgs);
    process.nextTick(() => callback(result.error, result.stdout, result.stderr));
    return child;
  });
}

function setupHappyPath() {
  mockStat.mockResolvedValue({ isFile: () => true, size: 1024 });
  mockExecFileAsync((cmd) => {
    if (cmd === 'ffprobe') return { error: null, stdout: 'video\n', stderr: '' };
    if (cmd === 'ffmpeg')
      return { error: null, stdout: 'ffmpeg version 6.0', stderr: '' };
    return { error: null, stdout: '', stderr: '' };
  });
  mockExistsSync.mockReturnValue(true);
  mockWriteFile.mockResolvedValue(undefined);
  mockChmod.mockResolvedValue(undefined);
  mockUnlink.mockResolvedValue(undefined);
}

const noopLog = () => {};

// ============================================================================
// Tests
// ============================================================================

describe('CLIPipeline Expanded', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
    mockUnlink.mockReset();
    mockStat.mockReset();
    mockWriteFile.mockReset();
    mockChmod.mockReset();
    mockExistsSync.mockReset();
    mockMkdirSync.mockReset();
    mockAnalyze.mockReset().mockReturnValue([]);
    mockCheckFfmpeg.mockReset().mockResolvedValue(true);
    mockExtract.mockReset().mockResolvedValue({ frames: [] });
    mockIsModelAvailable.mockReset().mockReturnValue(false);
    mockTranscribeFile.mockReset().mockResolvedValue([]);
    mockTemplateGet.mockReset();
  });

  // --------------------------------------------------------------------------
  // findClosestSegment via frame extraction
  // --------------------------------------------------------------------------

  describe('findClosestSegment (via extractFrames)', () => {
    it('matches a segment that contains the timestamp', async () => {
      setupHappyPath();
      mockAnalyze.mockReturnValue([
        { timestamp: 5.0, reason: 'Key moment', confidence: 0.9 },
      ]);
      mockCheckFfmpeg.mockResolvedValue(true);
      mockExtract.mockResolvedValue({
        frames: [{ success: true, path: '/out/frame-5.0.png', timestamp: 5.0 }],
      });
      mockIsModelAvailable.mockReturnValue(true);
      mockTranscribeFile.mockResolvedValue([
        { text: 'hello', startTime: 3.0, endTime: 7.0, confidence: 0.9 },
        { text: 'world', startTime: 8.0, endTime: 12.0, confidence: 0.8 },
      ]);

      const pipeline = new CLIPipeline(
        makeOptions({ skipFrames: false }),
        noopLog,
      );
      const result = await pipeline.run();

      // Frame extraction happened with key moments
      expect(result.extractedFrames).toBe(1);
    });

    it('handles no key moments gracefully', async () => {
      setupHappyPath();
      mockAnalyze.mockReturnValue([]); // no key moments

      const pipeline = new CLIPipeline(
        makeOptions({ skipFrames: false }),
        noopLog,
      );
      const result = await pipeline.run();

      // No frames extracted when no key moments
      expect(result.extractedFrames).toBe(0);
      expect(mockExtract).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Template system
  // --------------------------------------------------------------------------

  describe('template system', () => {
    it('throws CLIPipelineError for unknown template', async () => {
      setupHappyPath();
      mockTemplateGet.mockReturnValue(undefined);

      const pipeline = new CLIPipeline(
        makeOptions({ template: 'nonexistent' }),
        noopLog,
      );

      await expect(pipeline.run()).rejects.toThrow('Unknown template "nonexistent"');
    });

    it('classifies unknown template error with user severity', async () => {
      setupHappyPath();
      mockTemplateGet.mockReturnValue(undefined);

      const pipeline = new CLIPipeline(
        makeOptions({ template: 'nonexistent' }),
        noopLog,
      );

      try {
        await pipeline.run();
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(CLIPipelineError);
        expect((err as CLIPipelineError).severity).toBe('user');
      }
    });

    it('uses template renderer and custom extension', async () => {
      setupHappyPath();
      mockTemplateGet.mockReturnValue({
        render: vi.fn(() => ({
          content: '{"issues": []}',
          fileExtension: '.json',
        })),
      });

      const pipeline = new CLIPipeline(
        makeOptions({ template: 'json' }),
        noopLog,
      );
      const result = await pipeline.run();

      expect(result.outputPath).toMatch(/\.json$/);
      expect(mockTemplateGet).toHaveBeenCalledWith('json');
    });

    it('uses markdown generator when template is "markdown"', async () => {
      setupHappyPath();

      const pipeline = new CLIPipeline(
        makeOptions({ template: 'markdown' }),
        noopLog,
      );
      const result = await pipeline.run();

      expect(result.outputPath).toMatch(/\.md$/);
      expect(mockTemplateGet).not.toHaveBeenCalled();
    });

    it('uses markdown generator when no template specified', async () => {
      setupHappyPath();

      const pipeline = new CLIPipeline(makeOptions(), noopLog);
      const result = await pipeline.run();

      expect(result.outputPath).toMatch(/\.md$/);
    });
  });

  // --------------------------------------------------------------------------
  // Audio resolution
  // --------------------------------------------------------------------------

  describe('audio path resolution', () => {
    it('throws when provided audio file does not exist', async () => {
      setupHappyPath();
      mockExistsSync.mockImplementation((path: string) => {
        if (path === '/path/to/missing-audio.wav') return false;
        return true;
      });

      const pipeline = new CLIPipeline(
        makeOptions({ audioPath: '/path/to/missing-audio.wav' }),
        noopLog,
      );

      await expect(pipeline.run()).rejects.toThrow('Audio file not found');
    });

    it('skips transcription when video has no audio track', async () => {
      mockStat.mockResolvedValue({ isFile: () => true, size: 1024 });
      mockExistsSync.mockReturnValue(true);
      mockWriteFile.mockResolvedValue(undefined);
      mockUnlink.mockResolvedValue(undefined);
      mockExecFileAsync((cmd, cmdArgs) => {
        if (cmd === 'ffprobe') {
          if (cmdArgs.includes('v')) {
            return { error: null, stdout: 'video\n', stderr: '' };
          }
          // audio stream check - return empty = no audio
          return { error: null, stdout: '', stderr: '' };
        }
        if (cmd === 'ffmpeg') {
          return { error: null, stdout: 'ffmpeg version 6.0', stderr: '' };
        }
        return { error: null, stdout: '', stderr: '' };
      });

      const logMessages: string[] = [];
      const pipeline = new CLIPipeline(
        makeOptions({ skipFrames: true }),
        (msg) => logMessages.push(msg),
      );

      const result = await pipeline.run();
      expect(result.transcriptSegments).toBe(0);
      expect(logMessages).toContain(
        '  No audio track found in video - transcription will be skipped',
      );
    });

    it('handles audio extraction failure gracefully', async () => {
      mockStat.mockResolvedValue({ isFile: () => true, size: 1024 });
      mockExistsSync.mockReturnValue(true);
      mockWriteFile.mockResolvedValue(undefined);
      mockChmod.mockResolvedValue(undefined);
      mockUnlink.mockResolvedValue(undefined);
      mockExecFileAsync((cmd, cmdArgs) => {
        if (cmd === 'ffprobe') {
          if (cmdArgs.includes('v')) {
            return { error: null, stdout: 'video\n', stderr: '' };
          }
          // Has audio track
          return { error: null, stdout: 'audio\n', stderr: '' };
        }
        if (cmd === 'ffmpeg') {
          if (cmdArgs.includes('-version')) {
            return { error: null, stdout: 'ffmpeg version 6.0', stderr: '' };
          }
          // Audio extraction fails
          return { error: new Error('Codec error'), stdout: '', stderr: '' };
        }
        return { error: null, stdout: '', stderr: '' };
      });

      const logMessages: string[] = [];
      const pipeline = new CLIPipeline(
        makeOptions({ skipFrames: true }),
        (msg) => logMessages.push(msg),
      );

      const result = await pipeline.run();
      expect(result.transcriptSegments).toBe(0);
      expect(logMessages.some((m) => m.includes('WARNING: Audio extraction failed'))).toBe(
        true,
      );
    });
  });

  // --------------------------------------------------------------------------
  // Transcription
  // --------------------------------------------------------------------------

  describe('transcription', () => {
    it('skips when model is not available', async () => {
      setupHappyPath();
      mockIsModelAvailable.mockReturnValue(false);

      const logMessages: string[] = [];
      const pipeline = new CLIPipeline(
        makeOptions({ audioPath: '/path/to/audio.wav', skipFrames: true }),
        (msg) => logMessages.push(msg),
      );

      const result = await pipeline.run();
      expect(result.transcriptSegments).toBe(0);
      expect(
        logMessages.some((m) => m.includes('Whisper model not found')),
      ).toBe(true);
    });

    it('handles transcription failure gracefully', async () => {
      setupHappyPath();
      mockIsModelAvailable.mockReturnValue(true);
      mockTranscribeFile.mockRejectedValue(new Error('WASM runtime error'));

      const logMessages: string[] = [];
      const pipeline = new CLIPipeline(
        makeOptions({ audioPath: '/path/to/audio.wav', skipFrames: true }),
        (msg) => logMessages.push(msg),
      );

      const result = await pipeline.run();
      expect(result.transcriptSegments).toBe(0);
      expect(
        logMessages.some((m) => m.includes('WARNING: Transcription failed')),
      ).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Frame extraction edge cases
  // --------------------------------------------------------------------------

  describe('frame extraction', () => {
    it('skips when ffmpeg is not available', async () => {
      setupHappyPath();
      mockAnalyze.mockReturnValue([
        { timestamp: 5.0, reason: 'Key moment', confidence: 0.9 },
      ]);
      mockCheckFfmpeg.mockResolvedValue(false);

      const logMessages: string[] = [];
      const pipeline = new CLIPipeline(
        makeOptions({ skipFrames: false }),
        (msg) => logMessages.push(msg),
      );

      const result = await pipeline.run();
      expect(result.extractedFrames).toBe(0);
      expect(
        logMessages.some((m) => m.includes('ffmpeg not found')),
      ).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // generateOutputFilename
  // --------------------------------------------------------------------------

  describe('generateOutputFilename', () => {
    it('handles extension without leading dot', () => {
      const pipeline = new CLIPipeline(
        makeOptions({ videoPath: '/path/to/rec.mp4' }),
        noopLog,
      );

      const filename = pipeline.generateOutputFilename('json');
      expect(filename).toMatch(/\.json$/);
    });

    it('handles extension with leading dot', () => {
      const pipeline = new CLIPipeline(
        makeOptions({ videoPath: '/path/to/rec.mp4' }),
        noopLog,
      );

      const filename = pipeline.generateOutputFilename('.html');
      expect(filename).toMatch(/\.html$/);
    });

    it('handles video filenames with multiple dots', () => {
      const pipeline = new CLIPipeline(
        makeOptions({ videoPath: '/path/to/screen.recording.2024.mp4' }),
        noopLog,
      );

      const filename = pipeline.generateOutputFilename();
      expect(filename).toMatch(/^screen-recording-2024-feedback-\d{8}-\d{6}\.md$/);
    });
  });
});
