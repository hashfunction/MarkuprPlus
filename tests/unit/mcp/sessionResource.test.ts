/**
 * Session Resource Unit Tests
 *
 * Tests the MCP session resource registration:
 * - Registers session://latest fixed resource
 * - Registers session://{id} template resource
 * - Returns session data when available
 * - Returns error JSON when no sessions exist
 * - Returns error JSON for unknown session IDs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Hoisted mocks
// =============================================================================

const { mockGetLatest, mockGet, mockResourceTemplate } = vi.hoisted(() => ({
  mockGetLatest: vi.fn(),
  mockGet: vi.fn(),
  mockResourceTemplate: vi.fn().mockImplementation(function ResourceTemplateMock(template: string) {
    return { template };
  }),
}));

vi.mock('../../../src/mcp/session/SessionStore.js', () => ({
  sessionStore: {
    getLatest: mockGetLatest,
    get: mockGet,
  },
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn(),
  ResourceTemplate: mockResourceTemplate,
}));

import { registerResources } from '../../../src/mcp/resources/sessionResource';

// =============================================================================
// Types
// =============================================================================

type ResourceHandler = (...args: unknown[]) => Promise<{
  contents: Array<{ uri: string; mimeType: string; text: string }>;
}>;

// =============================================================================
// Tests
// =============================================================================

describe('Session Resources', () => {
  let registeredResources: Array<{
    name: string;
    uri: unknown;
    options: unknown;
    handler: ResourceHandler;
  }>;
  let mockServer: any;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredResources = [];

    mockServer = {
      resource: vi.fn(
        (name: string, uri: unknown, options: unknown, handler: ResourceHandler) => {
          registeredResources.push({ name, uri, options, handler });
        },
      ),
    };

    registerResources(mockServer);
  });

  it('registers two resources', () => {
    expect(mockServer.resource).toHaveBeenCalledTimes(2);
  });

  describe('session://latest', () => {
    it('registers with correct name and URI', () => {
      const latest = registeredResources.find((r) => r.name === 'latest-session');
      expect(latest).toBeDefined();
      expect(latest!.uri).toBe('session://latest');
    });

    it('returns session data when a session exists', async () => {
      const mockSession = {
        id: 'mcp-20260214-120000',
        label: 'bug review',
        status: 'complete',
      };
      mockGetLatest.mockResolvedValue(mockSession);

      const handler = registeredResources.find(
        (r) => r.name === 'latest-session',
      )!.handler;
      const result = await handler();

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe('session://latest');
      expect(result.contents[0].mimeType).toBe('application/json');

      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.id).toBe('mcp-20260214-120000');
    });

    it('returns error JSON when no sessions exist', async () => {
      mockGetLatest.mockResolvedValue(null);

      const handler = registeredResources.find(
        (r) => r.name === 'latest-session',
      )!.handler;
      const result = await handler();

      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.error).toBe('No sessions found');
    });
  });

  describe('session://{id}', () => {
    it('registers with ResourceTemplate', () => {
      const byId = registeredResources.find((r) => r.name === 'session-by-id');
      expect(byId).toBeDefined();
      expect(mockResourceTemplate).toHaveBeenCalledWith('session://{id}', {
        list: undefined,
      });
    });

    it('returns session data for a known ID', async () => {
      const mockSession = { id: 'mcp-20260214-150000', status: 'complete' };
      mockGet.mockResolvedValue(mockSession);

      const handler = registeredResources.find(
        (r) => r.name === 'session-by-id',
      )!.handler;
      const mockUri = { href: 'session://mcp-20260214-150000' };
      const result = await handler(mockUri, { id: 'mcp-20260214-150000' });

      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.id).toBe('mcp-20260214-150000');
    });

    it('returns error JSON for an unknown session ID', async () => {
      mockGet.mockResolvedValue(null);

      const handler = registeredResources.find(
        (r) => r.name === 'session-by-id',
      )!.handler;
      const mockUri = { href: 'session://nonexistent' };
      const result = await handler(mockUri, { id: 'nonexistent' });

      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.error).toBe('Session not found: nonexistent');
    });
  });
});
