/**
 * captureWithVoice Tool Unit Tests
 *
 * Tests the capture_with_voice MCP tool handler:
 * - Registers tool with correct name
 * - Calls ScreenRecorder.record with duration
 * - Creates a CLIPipeline instance and runs it
 * - Updates session with results
 * - Returns pipeline summary
 * - Returns isError on failure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Hoisted mocks
// =============================================================================

const {
  mockRecord,
  mockPipelineRun,
  mockCLIPipeline,
  mockCreate,
  mockGetSessionDir,
  mockUpdate,
  mockGet,
} = vi.hoisted(() => {
  const pipelineRun = vi.fn();
  return {
    mockRecord: vi.fn(),
    mockPipelineRun: pipelineRun,
    mockCLIPipeline: vi.fn().mockImplementation(function CLIPipelineMock() {
      return { run: pipelineRun };
    }),
    mockCreate: vi.fn(),
    mockGetSessionDir: vi.fn(),
    mockUpdate: vi.fn(),
    mockGet: vi.fn(),
  };
});

vi.mock('../../../src/mcp/capture/ScreenRecorder.js', () => ({
  record: mockRecord,
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
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

vi.mock('../../../src/mcp/utils/CaptureContext.js', () => ({
  captureContextSnapshot: vi.fn(async () => ({
    recordedAt: 1739534400000,
    cursor: { x: 700, y: 800 },
    activeWindow: { appName: 'TestApp', title: 'Test Window', pid: 123 },
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn(),
}));

vi.mock('zod', () => ({
  z: {
    string: () => ({ optional: () => ({ describe: () => ({}) }) }),
    number: () => ({ min: () => ({ max: () => ({ describe: () => ({}) }) }) }),
    boolean: () => ({ optional: () => ({ default: () => ({ describe: () => ({}) }) }) }),
  },
}));

import { register } from '../../../src/mcp/tools/captureWithVoice.js';

describe('captureWithVoice tool', () => {
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
    mockGet.mockResolvedValue({
      id: 'mcp-20260214-120000',
      recordingContextStart: { recordedAt: 1739534395000 },
      captures: [],
    });
    mockRecord.mockResolvedValue('/tmp/sessions/mcp-20260214-120000/recording.mp4');
    mockPipelineRun.mockResolvedValue({
      outputPath: '/tmp/sessions/mcp-20260214-120000/feedback-report.md',
      transcriptSegments: 5,
      extractedFrames: 3,
      durationSeconds: 8.2,
    });

    register(mockServer);
  });

  it('registers with correct tool name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'capture_with_voice',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('calls ScreenRecorder.record with specified duration', async () => {
    await toolHandler({ duration: 30, skipFrames: false });

    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ duration: 30 }),
    );
  });

  it('creates a CLIPipeline with correct options', async () => {
    await toolHandler({ duration: 30, skipFrames: true });

    expect(mockCLIPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        skipFrames: true,
        verbose: false,
      }),
      expect.any(Function),
    );
  });

  it('runs the pipeline', async () => {
    await toolHandler({ duration: 30, skipFrames: false });
    expect(mockPipelineRun).toHaveBeenCalled();
  });

  it('updates session with results on success', async () => {
    await toolHandler({ duration: 30, skipFrames: false });

    expect(mockUpdate).toHaveBeenCalledWith(
      'mcp-20260214-120000',
      expect.objectContaining({
        status: 'complete',
        reportPath: expect.stringContaining('feedback-report.md'),
      }),
    );
  });

  it('returns pipeline summary in response', async () => {
    const result = await toolHandler({ duration: 30, skipFrames: false });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('Recording complete: 30 seconds');
    expect(result.content[0].text).toContain('Transcript segments: 5');
    expect(result.content[0].text).toContain('Extracted frames: 3');
    expect(result.content[0].text).toContain('Processing time: 8.2s');
    expect(result.content[0].text).toContain('OUTPUT:');
  });

  it('uses custom outputDir when provided', async () => {
    await toolHandler({ duration: 10, outputDir: '/custom/output', skipFrames: false });

    expect(mockCLIPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        outputDir: '/custom/output',
      }),
      expect.any(Function),
    );
  });

  it('returns isError on recording failure', async () => {
    mockRecord.mockRejectedValue(new Error('ffmpeg not found'));

    const result = await toolHandler({ duration: 30, skipFrames: false });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ffmpeg not found');
  });

  it('returns isError on pipeline failure', async () => {
    mockPipelineRun.mockRejectedValue(new Error('Whisper failed'));

    const result = await toolHandler({ duration: 30, skipFrames: false });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Whisper failed');
  });
});
