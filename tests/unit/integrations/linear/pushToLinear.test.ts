/**
 * push_to_linear MCP Tool Unit Tests
 *
 * Tests:
 * - Registers tool with correct name
 * - Returns error when no token provided
 * - Returns error when report file not found
 * - Returns error when report file is empty
 * - Creates LinearIssueCreator and pushes report
 * - Handles dry-run mode
 * - Handles push errors
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Hoisted mocks
// =============================================================================

const { mockStat, mockPushReport } = vi.hoisted(() => ({
  mockStat: vi.fn(),
  mockPushReport: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  stat: mockStat,
}));

vi.mock('../../../../src/integrations/linear/LinearIssueCreator.js', () => ({
  LinearIssueCreator: vi.fn().mockImplementation(function LinearIssueCreatorMock() {
    return { pushReport: mockPushReport };
  }),
}));

vi.mock('../../../../src/mcp/utils/Logger.js', () => ({
  log: vi.fn(),
}));

import { register } from '../../../../src/mcp/tools/pushToLinear';

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

describe('push_to_linear MCP tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    register(mockServer);
  });

  it('should register with the correct name', () => {
    expect(registeredName).toBe('push_to_linear');
  });

  it('should return error when no token is provided', async () => {
    const oldEnv = process.env.LINEAR_API_KEY;
    delete process.env.LINEAR_API_KEY;

    const result = await registeredHandler({
      reportPath: '/path/to/report.md',
      teamKey: 'ENG',
      dryRun: false,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No Linear API token');

    if (oldEnv) process.env.LINEAR_API_KEY = oldEnv;
  });

  it('should return error when report file not found', async () => {
    mockStat.mockRejectedValueOnce(new Error('ENOENT'));

    const result = await registeredHandler({
      reportPath: '/path/to/missing.md',
      teamKey: 'ENG',
      token: 'lin_test',
      dryRun: false,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });

  it('should return error when report file is empty', async () => {
    mockStat.mockResolvedValueOnce({ isFile: () => true, size: 0 });

    const result = await registeredHandler({
      reportPath: '/path/to/empty.md',
      teamKey: 'ENG',
      token: 'lin_test',
      dryRun: false,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('empty');
  });

  it('should push report and return summary', async () => {
    mockStat.mockResolvedValueOnce({ isFile: () => true, size: 1000 });
    mockPushReport.mockResolvedValueOnce({
      teamKey: 'ENG',
      totalItems: 2,
      created: 2,
      failed: 0,
      dryRun: false,
      issues: [
        { success: true, identifier: 'ENG-1', issueUrl: 'https://linear.app/team/ENG-1' },
        { success: true, identifier: 'ENG-2', issueUrl: 'https://linear.app/team/ENG-2' },
      ],
    });

    const result = await registeredHandler({
      reportPath: '/path/to/report.md',
      teamKey: 'ENG',
      token: 'lin_test',
      dryRun: false,
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Push to Linear complete');
    expect(result.content[0].text).toContain('Created: 2');
    expect(result.content[0].text).toContain('ENG-1');
  });

  it('should indicate dry-run mode in output', async () => {
    mockStat.mockResolvedValueOnce({ isFile: () => true, size: 1000 });
    mockPushReport.mockResolvedValueOnce({
      teamKey: 'ENG',
      totalItems: 1,
      created: 1,
      failed: 0,
      dryRun: true,
      issues: [
        { success: true, identifier: 'DRY-FB-001', issueUrl: 'https://linear.app/dry-run/FB-001' },
      ],
    });

    const result = await registeredHandler({
      reportPath: '/path/to/report.md',
      teamKey: 'ENG',
      token: 'lin_test',
      dryRun: true,
    });

    expect(result.content[0].text).toContain('DRY RUN');
  });

  it('should handle push errors gracefully', async () => {
    mockStat.mockResolvedValueOnce({ isFile: () => true, size: 1000 });
    mockPushReport.mockRejectedValueOnce(new Error('Team "BAD" not found'));

    const result = await registeredHandler({
      reportPath: '/path/to/report.md',
      teamKey: 'BAD',
      token: 'lin_test',
      dryRun: false,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Team "BAD" not found');
  });

  it('should use LINEAR_API_KEY env var when no token param', async () => {
    const oldEnv = process.env.LINEAR_API_KEY;
    process.env.LINEAR_API_KEY = 'lin_env_token';

    mockStat.mockResolvedValueOnce({ isFile: () => true, size: 1000 });
    mockPushReport.mockResolvedValueOnce({
      teamKey: 'ENG',
      totalItems: 0,
      created: 0,
      failed: 0,
      dryRun: false,
      issues: [],
    });

    const result = await registeredHandler({
      reportPath: '/path/to/report.md',
      teamKey: 'ENG',
      dryRun: false,
    });

    expect(result.isError).toBeUndefined();

    if (oldEnv) {
      process.env.LINEAR_API_KEY = oldEnv;
    } else {
      delete process.env.LINEAR_API_KEY;
    }
  });

  it('should report failed issues', async () => {
    mockStat.mockResolvedValueOnce({ isFile: () => true, size: 1000 });
    mockPushReport.mockResolvedValueOnce({
      teamKey: 'ENG',
      totalItems: 2,
      created: 1,
      failed: 1,
      dryRun: false,
      issues: [
        { success: true, identifier: 'ENG-1', issueUrl: 'https://linear.app/team/ENG-1' },
        { success: false, error: 'Rate limited' },
      ],
    });

    const result = await registeredHandler({
      reportPath: '/path/to/report.md',
      teamKey: 'ENG',
      token: 'lin_test',
      dryRun: false,
    });

    expect(result.content[0].text).toContain('Failed: 1');
    expect(result.content[0].text).toContain('FAILED: Rate limited');
  });
});
