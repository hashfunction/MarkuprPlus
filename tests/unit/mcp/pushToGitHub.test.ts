/**
 * push_to_github MCP Tool Unit Tests
 *
 * Tests:
 * - Registers tool with correct name
 * - Returns error when report file not found
 * - Returns error when report is not a file
 * - Returns error when repo string is invalid
 * - Returns error when auth fails
 * - Formats dry-run output
 * - Formats created issues output
 * - Reports partial errors
 * - Handles unexpected exceptions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Hoisted mocks
// =============================================================================

const { mockStat, mockResolveAuth, mockParseRepoString, mockPushToGitHub } =
  vi.hoisted(() => ({
    mockStat: vi.fn(),
    mockResolveAuth: vi.fn(),
    mockParseRepoString: vi.fn(),
    mockPushToGitHub: vi.fn(),
  }));

vi.mock('fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs/promises')>()),
  stat: mockStat,
}));

vi.mock('../../../src/integrations/github/GitHubIssueCreator.js', () => ({
  resolveAuth: mockResolveAuth,
  parseRepoString: mockParseRepoString,
  pushToGitHub: mockPushToGitHub,
}));

vi.mock('../../../src/mcp/utils/Logger.js', () => ({
  log: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn(),
}));

import { register } from '../../../src/mcp/tools/pushToGitHub';

// =============================================================================
// Mock MCP server
// =============================================================================

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}>;

let registeredHandler: ToolHandler;
let registeredName: string;

const mockServer = {
  tool: (name: string, _description: string, _schema: unknown, handler: ToolHandler) => {
    registeredName = name;
    registeredHandler = handler;
  },
} as never;

// =============================================================================
// Tests
// =============================================================================

describe('push_to_github MCP tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    register(mockServer);
  });

  it('registers with the correct name', () => {
    expect(registeredName).toBe('push_to_github');
  });

  it('returns error when report file not found', async () => {
    mockStat.mockRejectedValueOnce(new Error('ENOENT'));

    const result = await registeredHandler({
      reportPath: '/missing/report.md',
      repo: 'owner/repo',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Report not found');
  });

  it('returns error when report path is not a file', async () => {
    mockStat.mockResolvedValueOnce({ isFile: () => false });

    const result = await registeredHandler({
      reportPath: '/path/to/directory',
      repo: 'owner/repo',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Not a file');
  });

  it('returns error when repo string is invalid', async () => {
    mockStat.mockResolvedValueOnce({ isFile: () => true });
    mockParseRepoString.mockImplementation(() => {
      throw new Error('Invalid repo format: must be "owner/repo"');
    });

    const result = await registeredHandler({
      reportPath: '/path/to/report.md',
      repo: 'bad-format',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid repo format');
  });

  it('returns error when auth resolution fails', async () => {
    mockStat.mockResolvedValueOnce({ isFile: () => true });
    mockParseRepoString.mockReturnValue({ owner: 'test', repo: 'app' });
    mockResolveAuth.mockRejectedValueOnce(
      new Error('No GitHub token found. Set GITHUB_TOKEN or install gh CLI.'),
    );

    const result = await registeredHandler({
      reportPath: '/path/to/report.md',
      repo: 'test/app',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No GitHub token found');
  });

  it('formats dry-run output with issue previews', async () => {
    mockStat.mockResolvedValueOnce({ isFile: () => true });
    mockParseRepoString.mockReturnValue({ owner: 'test', repo: 'app' });
    mockResolveAuth.mockResolvedValueOnce({ token: 'gh_test', source: 'env' });
    mockPushToGitHub.mockResolvedValueOnce({
      created: [
        { title: 'FB-001: Button misaligned' },
        { title: 'FB-002: Slow load time' },
      ],
      labelsCreated: ['markuprx', 'bug'],
      errors: [],
    });

    const result = await registeredHandler({
      reportPath: '/path/to/report.md',
      repo: 'test/app',
      dryRun: true,
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Dry run');
    expect(result.content[0].text).toContain('2 issue(s) would be created');
    expect(result.content[0].text).toContain('FB-001: Button misaligned');
    expect(result.content[0].text).toContain('Labels to create: markuprx, bug');
  });

  it('formats created issues with numbers and URLs', async () => {
    mockStat.mockResolvedValueOnce({ isFile: () => true });
    mockParseRepoString.mockReturnValue({ owner: 'test', repo: 'app' });
    mockResolveAuth.mockResolvedValueOnce({ token: 'gh_test', source: 'cli' });
    mockPushToGitHub.mockResolvedValueOnce({
      created: [
        { number: 42, title: 'FB-001: Bug', url: 'https://github.com/test/app/issues/42' },
      ],
      labelsCreated: ['markuprx'],
      errors: [],
    });

    const result = await registeredHandler({
      reportPath: '/path/to/report.md',
      repo: 'test/app',
      dryRun: false,
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Created 1 issue(s)');
    expect(result.content[0].text).toContain('#42: FB-001: Bug');
    expect(result.content[0].text).toContain('Labels created: markuprx');
  });

  it('reports partial errors from push', async () => {
    mockStat.mockResolvedValueOnce({ isFile: () => true });
    mockParseRepoString.mockReturnValue({ owner: 'test', repo: 'app' });
    mockResolveAuth.mockResolvedValueOnce({ token: 'gh_test', source: 'env' });
    mockPushToGitHub.mockResolvedValueOnce({
      created: [{ number: 42, title: 'FB-001: Bug', url: 'https://github.com/test/app/issues/42' }],
      labelsCreated: [],
      errors: [
        { itemId: 'FB-002', error: 'Rate limited' },
        { itemId: 'FB-003', error: 'Validation failed' },
      ],
    });

    const result = await registeredHandler({
      reportPath: '/path/to/report.md',
      repo: 'test/app',
      dryRun: false,
    });

    expect(result.content[0].text).toContain('Errors (2)');
    expect(result.content[0].text).toContain('FB-002: Rate limited');
  });

  it('handles unexpected exceptions gracefully', async () => {
    mockStat.mockResolvedValueOnce({ isFile: () => true });
    mockParseRepoString.mockReturnValue({ owner: 'test', repo: 'app' });
    mockResolveAuth.mockResolvedValueOnce({ token: 'gh_test', source: 'env' });
    mockPushToGitHub.mockRejectedValueOnce(new Error('Network timeout'));

    const result = await registeredHandler({
      reportPath: '/path/to/report.md',
      repo: 'test/app',
      dryRun: false,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Network timeout');
  });

  it('passes explicit token to resolveAuth', async () => {
    mockStat.mockResolvedValueOnce({ isFile: () => true });
    mockParseRepoString.mockReturnValue({ owner: 'test', repo: 'app' });
    mockResolveAuth.mockResolvedValueOnce({ token: 'gh_explicit', source: 'param' });
    mockPushToGitHub.mockResolvedValueOnce({
      created: [],
      labelsCreated: [],
      errors: [],
    });

    await registeredHandler({
      reportPath: '/path/to/report.md',
      repo: 'test/app',
      token: 'gh_explicit',
      dryRun: false,
    });

    expect(mockResolveAuth).toHaveBeenCalledWith('gh_explicit');
  });

  it('passes items filter to pushToGitHub', async () => {
    mockStat.mockResolvedValueOnce({ isFile: () => true });
    mockParseRepoString.mockReturnValue({ owner: 'test', repo: 'app' });
    mockResolveAuth.mockResolvedValueOnce({ token: 'gh_test', source: 'env' });
    mockPushToGitHub.mockResolvedValueOnce({
      created: [],
      labelsCreated: [],
      errors: [],
    });

    await registeredHandler({
      reportPath: '/path/to/report.md',
      repo: 'test/app',
      items: ['FB-001', 'FB-003'],
      dryRun: false,
    });

    expect(mockPushToGitHub).toHaveBeenCalledWith(
      expect.objectContaining({
        items: ['FB-001', 'FB-003'],
      }),
    );
  });
});
