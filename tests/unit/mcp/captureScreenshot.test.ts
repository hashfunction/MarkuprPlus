/**
 * captureScreenshot Tool Unit Tests
 *
 * Tests the capture_screenshot MCP tool handler:
 * - Registers tool with correct name
 * - Calls ScreenCapture.capture with display param
 * - Calls ImageOptimizer.optimize when optimize=true
 * - Skips optimization when optimize=false
 * - Creates session via SessionStore
 * - Returns markdown image reference
 * - Returns isError on capture failure
 * - Sequential filename generation (screenshot-001, screenshot-002, etc.)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Hoisted mocks
// =============================================================================

const { mockCapture, mockOptimize, mockReaddir } = vi.hoisted(() => ({
  mockCapture: vi.fn(),
  mockOptimize: vi.fn(),
  mockReaddir: vi.fn(),
}));

vi.mock('../../../src/mcp/capture/ScreenCapture.js', () => ({
  capture: mockCapture,
}));

vi.mock('../../../src/mcp/utils/ImageOptimizer.js', () => ({
  optimize: mockOptimize,
}));

vi.mock('fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs/promises')>()),
  readdir: mockReaddir,
}));

vi.mock('../../../src/mcp/utils/Logger.js', () => ({
  log: vi.fn(),
}));

// Mock SessionStore
const mockCreate = vi.fn();
const mockGetSessionDir = vi.fn();
const mockGet = vi.fn();
const mockUpdate = vi.fn();

vi.mock('../../../src/mcp/session/SessionStore.js', () => ({
  sessionStore: {
    create: (...args: unknown[]) => mockCreate(...args),
    getSessionDir: (...args: unknown[]) => mockGetSessionDir(...args),
    get: (...args: unknown[]) => mockGet(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock('../../../src/mcp/utils/CaptureContext.js', () => ({
  captureContextSnapshot: vi.fn(async () => ({
    recordedAt: 1739534400000,
    cursor: { x: 100, y: 200 },
    activeWindow: { appName: 'TestApp', title: 'Test Window', pid: 123 },
    focusedElement: { source: 'window-title', textPreview: 'Test Window' },
  })),
}));

// Mock McpServer
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn(),
}));

vi.mock('zod', () => ({
  z: {
    string: () => ({ optional: () => ({ describe: () => ({}) }) }),
    number: () => ({ optional: () => ({ default: () => ({ describe: () => ({}) }) }) }),
    boolean: () => ({ optional: () => ({ default: () => ({ describe: () => ({}) }) }) }),
  },
}));

import { register } from '../../../src/mcp/tools/captureScreenshot.js';

describe('captureScreenshot tool', () => {
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
    mockGet.mockResolvedValue({ id: 'mcp-20260214-120000', captures: [] });
    mockUpdate.mockResolvedValue(undefined);
    mockCapture.mockResolvedValue('/tmp/sessions/mcp-20260214-120000/screenshots/screenshot-001.png');
    mockOptimize.mockResolvedValue('/tmp/sessions/mcp-20260214-120000/screenshots/screenshot-001.png');
    mockReaddir.mockResolvedValue([]);

    register(mockServer);
  });

  it('registers with correct tool name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'capture_screenshot',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('creates a session on capture', async () => {
    await toolHandler({ label: 'test', display: 1, optimize: true });
    expect(mockCreate).toHaveBeenCalledWith('test');
  });

  it('calls ScreenCapture.capture with display param', async () => {
    await toolHandler({ label: 'test', display: 2, optimize: true });

    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({ display: 2 }),
    );
  });

  it('calls ImageOptimizer.optimize when optimize is true', async () => {
    await toolHandler({ label: 'test', display: 1, optimize: true });
    expect(mockOptimize).toHaveBeenCalled();
  });

  it('skips optimization when optimize is false', async () => {
    await toolHandler({ label: 'test', display: 1, optimize: false });
    expect(mockOptimize).not.toHaveBeenCalled();
  });

  it('returns text content with markdown image reference', async () => {
    const result = await toolHandler({ label: 'my label', display: 1, optimize: true });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('Screenshot saved:');
    expect(result.content[0].text).toContain('![my label]');
  });

  it('uses filename as label when no label provided', async () => {
    const result = await toolHandler({ label: undefined, display: 1, optimize: true });

    expect(result.content[0].text).toContain('![screenshot-001.png]');
  });

  it('generates sequential filenames', async () => {
    mockReaddir.mockResolvedValue(['screenshot-001.png', 'screenshot-002.png']);

    await toolHandler({ label: 'test', display: 1, optimize: true });

    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        outputPath: expect.stringContaining('screenshot-003.png'),
      }),
    );
  });

  it('returns isError on capture failure', async () => {
    mockCapture.mockRejectedValue(new Error('Permission denied'));

    const result = await toolHandler({ label: 'test', display: 1, optimize: true });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Permission denied');
  });
});
