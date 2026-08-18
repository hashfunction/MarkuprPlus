/**
 * stopRecording Tool Unit Tests
 *
 * Tests the stop_recording MCP tool handler:
 * - Registers tool with correct name
 * - Returns isError when no recording is active
 * - Stops the ffmpeg process via ScreenRecorder.stop
 * - Releases the ActiveRecording lock
 * - Updates session status to processing then complete
 * - Creates CLIPipeline and runs it
 * - Returns pipeline summary
 * - Returns isError on failure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Hoisted mocks
// =============================================================================

const {
  mockStop,
  mockPipelineRun,
  mockCLIPipeline,
  mockIsRecording,
  mockGetCurrent,
  mockActiveStop,
  mockUpdate,
  mockGet,
  mockGetSessionDir,
} = vi.hoisted(() => {
  const pipelineRun = vi.fn();
  return {
    mockStop: vi.fn(),
    mockPipelineRun: pipelineRun,
    mockCLIPipeline: vi.fn().mockImplementation(function CLIPipelineMock() {
      return { run: pipelineRun };
    }),
    mockIsRecording: vi.fn(),
    mockGetCurrent: vi.fn(),
    mockActiveStop: vi.fn(),
    mockUpdate: vi.fn(),
    mockGet: vi.fn(),
    mockGetSessionDir: vi.fn(),
  };
});

vi.mock('../../../src/mcp/capture/ScreenRecorder.js', () => ({
  stop: mockStop,
}));

vi.mock('../../../src/cli/CLIPipeline.js', () => ({
  CLIPipeline: mockCLIPipeline,
}));

vi.mock('../../../src/mcp/session/ActiveRecording.js', () => ({
  activeRecording: {
    isRecording: (...args: unknown[]) => mockIsRecording(...args),
    getCurrent: (...args: unknown[]) => mockGetCurrent(...args),
    stop: (...args: unknown[]) => mockActiveStop(...args),
  },
}));

vi.mock('../../../src/mcp/session/SessionStore.js', () => ({
  sessionStore: {
    update: (...args: unknown[]) => mockUpdate(...args),
    get: (...args: unknown[]) => mockGet(...args),
    getSessionDir: (...args: unknown[]) => mockGetSessionDir(...args),
  },
}));

vi.mock('../../../src/mcp/utils/CaptureContext.js', () => ({
  captureContextSnapshot: vi.fn(async () => ({
    recordedAt: 1739534400000,
    cursor: { x: 500, y: 600 },
    activeWindow: { appName: 'TestApp', title: 'Test Window', pid: 123 },
  })),
}));

vi.mock('../../../src/mcp/utils/Logger.js', () => ({
  log: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn(),
}));

vi.mock('zod', () => ({
  z: {
    string: () => ({ optional: () => ({ describe: () => ({}) }) }),
    boolean: () => ({ optional: () => ({ default: () => ({ describe: () => ({}) }) }) }),
  },
}));

import { register } from '../../../src/mcp/tools/stopRecording.js';

describe('stopRecording tool', () => {
  let toolHandler: Function;
  let mockServer: any;
  let mockProcess: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockServer = {
      tool: vi.fn((_name: string, _desc: string, _schema: any, handler: Function) => {
        toolHandler = handler;
      }),
    };

    mockProcess = { pid: 1234, exitCode: null, kill: vi.fn(), once: vi.fn() };
    mockIsRecording.mockReturnValue(true);
    mockGetCurrent.mockReturnValue({
      sessionId: 'mcp-20260214-120000',
      process: mockProcess,
      videoPath: '/tmp/sessions/mcp-20260214-120000/recording.mp4',
    });
    mockActiveStop.mockReturnValue({
      sessionId: 'mcp-20260214-120000',
      videoPath: '/tmp/sessions/mcp-20260214-120000/recording.mp4',
    });
    mockStop.mockResolvedValue(undefined);
    mockUpdate.mockResolvedValue(undefined);
    mockGet.mockResolvedValue({
      id: 'mcp-20260214-120000',
      recordingContextStart: { recordedAt: 1739534395000 },
      captures: [],
    });
    mockGetSessionDir.mockReturnValue('/tmp/sessions/mcp-20260214-120000');
    mockPipelineRun.mockResolvedValue({
      outputPath: '/tmp/sessions/mcp-20260214-120000/feedback-report.md',
      transcriptSegments: 10,
      extractedFrames: 5,
      durationSeconds: 15.3,
    });

    register(mockServer);
  });

  it('registers with correct tool name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'stop_recording',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns isError when no recording is active', async () => {
    mockIsRecording.mockReturnValue(false);

    const result = await toolHandler({ skipFrames: false });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No recording in progress');
  });

  it('returns isError when getCurrent returns null', async () => {
    mockIsRecording.mockReturnValue(true);
    mockGetCurrent.mockReturnValue(null);

    const result = await toolHandler({ skipFrames: false });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No recording in progress');
  });

  it('stops the ffmpeg process', async () => {
    await toolHandler({ skipFrames: false });

    expect(mockStop).toHaveBeenCalledWith(mockProcess);
  });

  it('releases the ActiveRecording lock', async () => {
    await toolHandler({ skipFrames: false });

    expect(mockActiveStop).toHaveBeenCalled();
  });

  it('updates session status to processing', async () => {
    await toolHandler({ skipFrames: false });

    expect(mockUpdate).toHaveBeenCalledWith(
      'mcp-20260214-120000',
      expect.objectContaining({ status: 'processing' }),
    );
  });

  it('runs the pipeline on the recorded video', async () => {
    await toolHandler({ skipFrames: false });

    expect(mockCLIPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        videoPath: expect.stringContaining('recording.mp4'),
        skipFrames: false,
        verbose: false,
      }),
      expect.any(Function),
    );
    expect(mockPipelineRun).toHaveBeenCalled();
  });

  it('passes skipFrames to pipeline', async () => {
    await toolHandler({ skipFrames: true });

    expect(mockCLIPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ skipFrames: true }),
      expect.any(Function),
    );
  });

  it('updates session with complete status and results', async () => {
    await toolHandler({ skipFrames: false });

    expect(mockUpdate).toHaveBeenCalledWith(
      'mcp-20260214-120000',
      expect.objectContaining({
        status: 'complete',
        reportPath: expect.stringContaining('feedback-report.md'),
      }),
    );
  });

  it('returns pipeline summary in response', async () => {
    const result = await toolHandler({ skipFrames: false });

    expect(result.content[0].text).toContain('Recording stopped and processed.');
    expect(result.content[0].text).toContain('Session: mcp-20260214-120000');
    expect(result.content[0].text).toContain('Transcript segments: 10');
    expect(result.content[0].text).toContain('Extracted frames: 5');
    expect(result.content[0].text).toContain('Processing time: 15.3s');
    expect(result.content[0].text).toContain('OUTPUT:');
  });

  it('returns isError on stop failure', async () => {
    mockStop.mockRejectedValue(new Error('SIGINT failed'));

    const result = await toolHandler({ skipFrames: false });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('SIGINT failed');
  });

  it('returns isError on pipeline failure', async () => {
    mockPipelineRun.mockRejectedValue(new Error('Transcription failed'));

    const result = await toolHandler({ skipFrames: false });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Transcription failed');
  });
});
