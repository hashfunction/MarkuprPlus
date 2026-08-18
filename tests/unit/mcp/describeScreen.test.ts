/**
 * describeScreen Tool Unit Tests
 *
 * Tests the describe_screen MCP tool handler:
 * - Registers tool with correct name
 * - Returns error when no API key is available
 * - Captures screenshot when no imagePath provided
 * - Uses provided imagePath instead of capturing
 * - Validates imagePath exists and is non-empty
 * - Optimizes captured screenshots
 * - Calls Claude API with correct model and prompt
 * - Includes focus area in user prompt when provided
 * - Returns structured text description
 * - Returns isError on capture failure
 * - Returns isError on Claude API failure
 * - Cleans up temp file after success
 * - Cleans up temp file on error
 * - Returns actionable error for auth failures
 * - Returns actionable error for rate limit
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Hoisted mocks
// =============================================================================

const {
  mockCapture,
  mockOptimize,
  mockReadFile,
  mockUnlink,
  mockStat,
  mockMessagesCreate,
} = vi.hoisted(() => ({
  mockCapture: vi.fn(),
  mockOptimize: vi.fn(),
  mockReadFile: vi.fn(),
  mockUnlink: vi.fn(),
  mockStat: vi.fn(),
  mockMessagesCreate: vi.fn(),
}));

vi.mock('../../../src/mcp/capture/ScreenCapture.js', () => ({
  capture: mockCapture,
}));

vi.mock('../../../src/mcp/utils/ImageOptimizer.js', () => ({
  optimize: mockOptimize,
}));

vi.mock('fs/promises', () => ({
  readFile: mockReadFile,
  unlink: mockUnlink,
  stat: mockStat,
}));

vi.mock('os', () => ({
  tmpdir: () => '/tmp',
}));

vi.mock('crypto', () => ({
  randomUUID: () => 'test-uuid-1234',
}));

vi.mock('../../../src/mcp/utils/Logger.js', () => ({
  log: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function AnthropicMock() {
    return {
      messages: {
        create: mockMessagesCreate,
      },
    };
  }),
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn(),
}));

vi.mock('zod', () => ({
  z: {
    string: () => ({ optional: () => ({ describe: () => ({}) }) }),
    number: () => ({
      optional: () => ({ default: () => ({ describe: () => ({}) }) }),
    }),
    boolean: () => ({
      optional: () => ({ default: () => ({ describe: () => ({}) }) }),
    }),
  },
}));

import { register } from '../../../src/mcp/tools/describeScreen.js';

describe('describeScreen tool', () => {
  let toolHandler: Function;
  let mockServer: any;

  const defaultClaudeResponse = {
    content: [
      {
        type: 'text',
        text: '### Active Window\nVS Code with index.ts open\n\n### Visible UI Elements\n- File explorer sidebar\n- Editor tab: index.ts\n\n### Text Content\nconst app = express();\n\n### Layout Structure\nTwo-panel layout with sidebar and editor\n\n### Notable Issues\nNone observed.',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockServer = {
      tool: vi.fn(
        (_name: string, _desc: string, _schema: any, handler: Function) => {
          toolHandler = handler;
        },
      ),
    };

    // Default mock implementations
    mockCapture.mockResolvedValue(
      '/tmp/markuprx-mcp-describe-test-uuid-1234.png',
    );
    mockOptimize.mockResolvedValue(
      '/tmp/markuprx-mcp-describe-test-uuid-1234.png',
    );
    mockReadFile.mockResolvedValue(Buffer.from('fake-image-data'));
    mockUnlink.mockResolvedValue(undefined);
    mockStat.mockResolvedValue({ isFile: () => true, size: 1024 });
    mockMessagesCreate.mockResolvedValue(defaultClaudeResponse);

    // Set env var for most tests
    process.env.ANTHROPIC_API_KEY = 'test-key-123';

    register(mockServer);
  });

  // =========================================================================
  // Registration
  // =========================================================================

  it('registers with correct tool name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'describe_screen',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  // =========================================================================
  // API Key Resolution
  // =========================================================================

  it('returns error when no API key is available', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await toolHandler({
      imagePath: undefined,
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No Anthropic API key');
  });

  it('uses apiKey parameter over env var', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;

    await toolHandler({
      imagePath: '/test/image.png',
      display: 1,
      apiKey: 'param-key-456',
      focus: undefined,
    });

    expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'param-key-456' });
  });

  it('falls back to ANTHROPIC_API_KEY env var', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    process.env.ANTHROPIC_API_KEY = 'env-key-789';

    await toolHandler({
      imagePath: '/test/image.png',
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'env-key-789' });
  });

  // =========================================================================
  // Screenshot Capture (no imagePath)
  // =========================================================================

  it('captures screenshot when no imagePath provided', async () => {
    await toolHandler({
      imagePath: undefined,
      display: 2,
      apiKey: undefined,
      focus: undefined,
    });

    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({ display: 2 }),
    );
  });

  it('optimizes captured screenshot', async () => {
    await toolHandler({
      imagePath: undefined,
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    expect(mockOptimize).toHaveBeenCalledWith(
      expect.stringContaining('markuprx-mcp-describe'),
    );
  });

  it('does not capture or optimize when imagePath is provided', async () => {
    await toolHandler({
      imagePath: '/test/image.png',
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockOptimize).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Image Path Validation
  // =========================================================================

  it('validates imagePath exists', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));

    const result = await toolHandler({
      imagePath: '/nonexistent/image.png',
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Image file not found');
  });

  it('validates imagePath is a non-empty file', async () => {
    mockStat.mockResolvedValue({ isFile: () => true, size: 0 });

    const result = await toolHandler({
      imagePath: '/test/empty.png',
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('empty or not a regular file');
  });

  it('validates imagePath is a regular file', async () => {
    mockStat.mockResolvedValue({ isFile: () => false, size: 1024 });

    const result = await toolHandler({
      imagePath: '/test/directory',
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('empty or not a regular file');
  });

  // =========================================================================
  // Claude API Call
  // =========================================================================

  it('calls Claude API with correct model', async () => {
    await toolHandler({
      imagePath: '/test/image.png',
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2048,
      }),
    );
  });

  it('sends image as base64 in the API request', async () => {
    mockReadFile.mockResolvedValue(Buffer.from('test-image-bytes'));

    await toolHandler({
      imagePath: '/test/image.png',
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    const callArgs = mockMessagesCreate.mock.calls[0][0];
    const imageBlock = callArgs.messages[0].content[0];

    expect(imageBlock.type).toBe('image');
    expect(imageBlock.source.type).toBe('base64');
    expect(imageBlock.source.media_type).toBe('image/png');
    expect(imageBlock.source.data).toBe(
      Buffer.from('test-image-bytes').toString('base64'),
    );
  });

  it('detects JPEG media type from extension', async () => {
    await toolHandler({
      imagePath: '/test/image.jpg',
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    const callArgs = mockMessagesCreate.mock.calls[0][0];
    const imageBlock = callArgs.messages[0].content[0];
    expect(imageBlock.source.media_type).toBe('image/jpeg');
  });

  it('detects WebP media type from extension', async () => {
    await toolHandler({
      imagePath: '/test/image.webp',
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    const callArgs = mockMessagesCreate.mock.calls[0][0];
    const imageBlock = callArgs.messages[0].content[0];
    expect(imageBlock.source.media_type).toBe('image/webp');
  });

  it('includes focus area in user prompt when provided', async () => {
    await toolHandler({
      imagePath: '/test/image.png',
      display: 1,
      apiKey: undefined,
      focus: 'the error dialog',
    });

    const callArgs = mockMessagesCreate.mock.calls[0][0];
    const textBlock = callArgs.messages[0].content[1];
    expect(textBlock.text).toContain('the error dialog');
  });

  it('uses generic prompt when no focus provided', async () => {
    await toolHandler({
      imagePath: '/test/image.png',
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    const callArgs = mockMessagesCreate.mock.calls[0][0];
    const textBlock = callArgs.messages[0].content[1];
    expect(textBlock.text).toBe('Describe what is visible on this screen.');
  });

  // =========================================================================
  // Response Handling
  // =========================================================================

  it('returns structured description with header', async () => {
    const result = await toolHandler({
      imagePath: '/test/image.png',
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('# Screen Description');
    expect(result.content[0].text).toContain('VS Code with index.ts open');
  });

  it('includes source info for image path input', async () => {
    const result = await toolHandler({
      imagePath: '/test/image.png',
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    expect(result.content[0].text).toContain('image file: /test/image.png');
  });

  it('includes source info for display capture', async () => {
    const result = await toolHandler({
      imagePath: undefined,
      display: 2,
      apiKey: undefined,
      focus: undefined,
    });

    expect(result.content[0].text).toContain('display 2 capture');
  });

  it('returns isError when Claude returns no text', async () => {
    mockMessagesCreate.mockResolvedValue({ content: [] });

    const result = await toolHandler({
      imagePath: '/test/image.png',
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No text content');
  });

  // =========================================================================
  // Error Handling
  // =========================================================================

  it('returns isError on capture failure', async () => {
    mockCapture.mockRejectedValue(new Error('Permission denied'));

    const result = await toolHandler({
      imagePath: undefined,
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Permission denied');
  });

  it('returns actionable error for auth failures', async () => {
    mockMessagesCreate.mockRejectedValue(new Error('401 Unauthorized'));

    const result = await toolHandler({
      imagePath: '/test/image.png',
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('authentication failed');
  });

  it('returns actionable error for rate limits', async () => {
    mockMessagesCreate.mockRejectedValue(
      new Error('429 Too Many Requests'),
    );

    const result = await toolHandler({
      imagePath: '/test/image.png',
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('rate limit');
  });

  it('returns generic error for unknown failures', async () => {
    mockMessagesCreate.mockRejectedValue(new Error('Network timeout'));

    const result = await toolHandler({
      imagePath: '/test/image.png',
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Network timeout');
  });

  // =========================================================================
  // Temp File Cleanup
  // =========================================================================

  it('cleans up temp file after successful capture', async () => {
    await toolHandler({
      imagePath: undefined,
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    expect(mockUnlink).toHaveBeenCalledWith(
      expect.stringContaining('markuprx-mcp-describe'),
    );
  });

  it('cleans up temp file even on error', async () => {
    mockMessagesCreate.mockRejectedValue(new Error('API error'));

    await toolHandler({
      imagePath: undefined,
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    expect(mockUnlink).toHaveBeenCalledWith(
      expect.stringContaining('markuprx-mcp-describe'),
    );
  });

  it('does not try to unlink when using imagePath', async () => {
    await toolHandler({
      imagePath: '/test/image.png',
      display: 1,
      apiKey: undefined,
      focus: undefined,
    });

    expect(mockUnlink).not.toHaveBeenCalled();
  });
});
