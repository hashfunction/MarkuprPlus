/**
 * analyzeVideo Tool Unit Tests
 *
 * Tests the analyze_video MCP tool handler:
 * - Registers tool with correct name
 * - Validates video file exists via stat
 * - Returns isError when video file not found
 * - Returns isError when video file is empty
 * - Validates optional audio file
 * - Creates CLIPipeline with correct options
 * - Passes audioPath to pipeline when provided
 * - Returns pipeline summary
 * - Returns isError on pipeline failure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Hoisted mocks
// =============================================================================

const {
  mockStat,
  mockPipelineRun,
  mockCLIPipeline,
  mockCreate,
  mockGetSessionDir,
  mockUpdate,
} = vi.hoisted(() => {
  const pipelineRun = vi.fn();
  return {
    mockStat: vi.fn(),
    mockPipelineRun: pipelineRun,
    mockCLIPipeline: vi.fn().mockImplementation(function CLIPipelineMock() {
      return { run: pipelineRun };
    }),
    mockCreate: vi.fn(),
    mockGetSessionDir: vi.fn(),
    mockUpdate: vi.fn(),
  };
});

vi.mock('fs/promises', () => ({
  stat: mockStat,
}));

vi.mock('../../../src/cli/CLIPipeline.js', () => ({
  CLIPipeline: mockCLIPipeline,
}));

vi.mock('../../../src/mcp/utils/Logger.js', () => ({
  log: vi.fn(),
}));

vi.mock('../../../src/mcp/session/SessionStore.js', () => ({
  sessionStore: {
    create: (...args: unknown[]) => mockCreate(...args),
    getSessionDir: (...args: unknown[]) => mockGetSessionDir(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn(),
}));

vi.mock('zod', () => ({
  z: {
    string: () => ({
      describe: () => ({}),
      optional: () => ({ describe: () => ({}) }),
    }),
    boolean: () => ({ optional: () => ({ default: () => ({ describe: () => ({}) }) }) }),
  },
}));

import { register } from '../../../src/mcp/tools/analyzeVideo.js';

describe('analyzeVideo tool', () => {
  let toolHandler: Function;
  let mockServer: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockServer = {
      tool: vi.fn((_name: string, _desc: string, _schema: any, handler: Function) => {
        toolHandler = handler;
      }),
    };

    mockCreate.mockResolvedValue({ id: 'mcp-20260214-120000' });
    mockGetSessionDir.mockReturnValue('/tmp/sessions/mcp-20260214-120000');
    mockUpdate.mockResolvedValue(undefined);
    mockPipelineRun.mockResolvedValue({
      outputPath: '/tmp/sessions/mcp-20260214-120000/feedback-report.md',
      transcriptSegments: 8,
      extractedFrames: 4,
      durationSeconds: 12.5,
    });

    register(mockServer);
  });

  it('registers with correct tool name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'analyze_video',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns isError when video file not found', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));

    const result = await toolHandler({
      videoPath: '/nonexistent/video.mp4',
      skipFrames: false,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Video file not found');
  });

  it('returns isError when video file is empty', async () => {
    mockStat.mockResolvedValue({ isFile: () => true, size: 0 });

    const result = await toolHandler({
      videoPath: '/tmp/empty.mp4',
      skipFrames: false,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('empty or not a regular file');
  });

  it('returns isError when video is not a regular file', async () => {
    mockStat.mockResolvedValue({ isFile: () => false, size: 1000 });

    const result = await toolHandler({
      videoPath: '/tmp/not-a-file',
      skipFrames: false,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('empty or not a regular file');
  });

  it('validates audio file when provided', async () => {
    mockStat
      .mockResolvedValueOnce({ isFile: () => true, size: 5000 }) // video
      .mockRejectedValueOnce(new Error('ENOENT')); // audio

    const result = await toolHandler({
      videoPath: '/tmp/video.mp4',
      audioPath: '/nonexistent/audio.wav',
      skipFrames: false,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Audio file not found');
  });

  it('returns isError when audio file is empty', async () => {
    mockStat
      .mockResolvedValueOnce({ isFile: () => true, size: 5000 }) // video
      .mockResolvedValueOnce({ isFile: () => true, size: 0 }); // audio

    const result = await toolHandler({
      videoPath: '/tmp/video.mp4',
      audioPath: '/tmp/empty.wav',
      skipFrames: false,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Audio file is empty');
  });

  it('creates CLIPipeline with correct options for valid video', async () => {
    mockStat.mockResolvedValue({ isFile: () => true, size: 5000 });

    await toolHandler({
      videoPath: '/tmp/video.mp4',
      skipFrames: true,
    });

    expect(mockCLIPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        videoPath: '/tmp/video.mp4',
        skipFrames: true,
        verbose: false,
      }),
      expect.any(Function),
    );
  });

  it('passes audioPath to pipeline when provided', async () => {
    mockStat.mockResolvedValue({ isFile: () => true, size: 5000 });

    await toolHandler({
      videoPath: '/tmp/video.mp4',
      audioPath: '/tmp/audio.wav',
      skipFrames: false,
    });

    expect(mockCLIPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        audioPath: '/tmp/audio.wav',
      }),
      expect.any(Function),
    );
  });

  it('returns pipeline summary on success', async () => {
    mockStat.mockResolvedValue({ isFile: () => true, size: 5000 });

    const result = await toolHandler({
      videoPath: '/tmp/video.mp4',
      skipFrames: false,
    });

    expect(result.content[0].text).toContain('Video analysis complete');
    expect(result.content[0].text).toContain('Transcript segments: 8');
    expect(result.content[0].text).toContain('Extracted frames: 4');
    expect(result.content[0].text).toContain('OUTPUT:');
  });

  it('updates session with results on success', async () => {
    mockStat.mockResolvedValue({ isFile: () => true, size: 5000 });

    await toolHandler({ videoPath: '/tmp/video.mp4', skipFrames: false });

    expect(mockUpdate).toHaveBeenCalledWith(
      'mcp-20260214-120000',
      expect.objectContaining({ status: 'complete' }),
    );
  });

  it('returns isError on pipeline failure', async () => {
    mockStat.mockResolvedValue({ isFile: () => true, size: 5000 });
    mockPipelineRun.mockRejectedValue(new Error('Pipeline crashed'));

    const result = await toolHandler({
      videoPath: '/tmp/video.mp4',
      skipFrames: false,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Pipeline crashed');
  });
});
