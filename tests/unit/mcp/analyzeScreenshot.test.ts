/**
 * analyzeScreenshot Tool Unit Tests
 *
 * Tests the analyze_screenshot MCP tool handler:
 * - Registers tool with correct name
 * - Captures screenshot to temp path
 * - Optimizes the captured image
 * - Returns base64 image content
 * - Includes display and timestamp in description
 * - Includes question in description when provided
 * - Cleans up temp file after completion
 * - Cleans up temp file on error
 * - Returns isError on capture failure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Hoisted mocks
// =============================================================================

const { mockCapture, mockOptimize, mockReadFile, mockUnlink } = vi.hoisted(() => ({
  mockCapture: vi.fn(),
  mockOptimize: vi.fn(),
  mockReadFile: vi.fn(),
  mockUnlink: vi.fn(),
}));

vi.mock('../../../src/mcp/capture/ScreenCapture.js', () => ({
  capture: mockCapture,
}));

vi.mock('../../../src/mcp/utils/ImageOptimizer.js', () => ({
  optimize: mockOptimize,
}));

vi.mock('fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs/promises')>()),
  readFile: mockReadFile,
  unlink: mockUnlink,
}));

vi.mock('os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('os')>()),
  tmpdir: () => '/tmp',
}));

vi.mock('crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('crypto')>()),
  randomUUID: () => 'test-uuid-1234',
}));

vi.mock('../../../src/mcp/utils/Logger.js', () => ({
  log: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn(),
}));

vi.mock('zod', () => ({
  z: {
    number: () => ({ optional: () => ({ default: () => ({ describe: () => ({}) }) }) }),
    string: () => ({ optional: () => ({ describe: () => ({}) }) }),
  },
}));

import { register } from '../../../src/mcp/tools/analyzeScreenshot.js';

describe('analyzeScreenshot tool', () => {
  let toolHandler: Function;
  let mockServer: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockServer = {
      tool: vi.fn((_name: string, _desc: string, _schema: any, handler: Function) => {
        toolHandler = handler;
      }),
    };

    mockCapture.mockResolvedValue('/tmp/markuprx-mcp-screenshot-test-uuid-1234.png');
    mockOptimize.mockResolvedValue('/tmp/markuprx-mcp-screenshot-test-uuid-1234.png');
    mockReadFile.mockResolvedValue(Buffer.from('fake-image-data'));
    mockUnlink.mockResolvedValue(undefined);

    register(mockServer);
  });

  it('registers with correct tool name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'analyze_screenshot',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('captures screenshot with display param', async () => {
    await toolHandler({ display: 2, question: undefined });

    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({ display: 2 }),
    );
  });

  it('optimizes the captured image', async () => {
    await toolHandler({ display: 1, question: undefined });

    expect(mockOptimize).toHaveBeenCalledWith(
      expect.stringContaining('markuprx-mcp-screenshot'),
    );
  });

  it('returns image content as base64', async () => {
    const result = await toolHandler({ display: 1, question: undefined });

    expect(result.content).toHaveLength(2);
    expect(result.content[0].type).toBe('image');
    expect(result.content[0].mimeType).toBe('image/png');
    expect(result.content[0].data).toBe(Buffer.from('fake-image-data').toString('base64'));
  });

  it('returns text content with timestamp', async () => {
    const result = await toolHandler({ display: 1, question: undefined });

    expect(result.content[1].type).toBe('text');
    expect(result.content[1].text).toContain('Screenshot of display 1');
    expect(result.content[1].text).toContain('captured at');
  });

  it('includes question in description when provided', async () => {
    const result = await toolHandler({ display: 1, question: 'What color is the button?' });

    expect(result.content[1].text).toContain('Question: What color is the button?');
  });

  it('omits question from description when not provided', async () => {
    const result = await toolHandler({ display: 1, question: undefined });

    expect(result.content[1].text).not.toContain('Question:');
  });

  it('cleans up temp file after success', async () => {
    await toolHandler({ display: 1, question: undefined });

    expect(mockUnlink).toHaveBeenCalledWith(
      expect.stringContaining('markuprx-mcp-screenshot'),
    );
  });

  it('cleans up temp file even on error', async () => {
    mockCapture.mockRejectedValue(new Error('Permission denied'));

    await toolHandler({ display: 1, question: undefined });

    expect(mockUnlink).toHaveBeenCalled();
  });

  it('returns isError on capture failure', async () => {
    mockCapture.mockRejectedValue(new Error('Permission denied'));

    const result = await toolHandler({ display: 1, question: undefined });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Permission denied');
  });

  it('returns isError on optimize failure', async () => {
    mockOptimize.mockRejectedValue(new Error('sharp failed'));

    const result = await toolHandler({ display: 1, question: undefined });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('sharp failed');
  });
});
