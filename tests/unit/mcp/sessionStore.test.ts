/**
 * SessionStore Unit Tests
 *
 * Tests the disk-persisted session lifecycle management:
 * - Session creation with directory and metadata.json
 * - Session ID format (mcp-YYYYMMDD-HHMMSS)
 * - Conflict resolution (appending counter)
 * - Session retrieval by ID
 * - getLatest returns most recent by startTime
 * - list returns sessions sorted by startTime descending
 * - update merges partial data
 * - update throws for nonexistent session
 * - getSessionDir returns correct path
 * - list handles missing base directory
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Hoisted mocks
// =============================================================================

const { mockMkdir, mockReadFile, mockWriteFile, mockReaddir, mockAccess } = vi.hoisted(() => ({
  mockMkdir: vi.fn(),
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn(),
  mockReaddir: vi.fn(),
  mockAccess: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  mkdir: mockMkdir,
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  readdir: mockReaddir,
  access: mockAccess,
}));

vi.mock('../../../src/mcp/utils/Logger.js', () => ({
  log: vi.fn(),
}));

import { SessionStore } from '../../../src/mcp/session/SessionStore.js';

describe('SessionStore', () => {
  let store: SessionStore;
  const TEST_BASE = '/tmp/test-markuprx-mcp';

  beforeEach(() => {
    vi.clearAllMocks();
    store = new SessionStore(TEST_BASE);
    // Default: base dir exists
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    // Default: directory doesn't exist (for create conflict check)
    mockAccess.mockRejectedValue(new Error('ENOENT'));
  });

  describe('create', () => {
    it('creates a session with correct directory structure', async () => {
      const session = await store.create();

      // Should create base dir
      expect(mockMkdir).toHaveBeenCalledWith(TEST_BASE, { recursive: true });
      // Should create session dir (pattern: mcp-YYYYMMDD-HHMMSS)
      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringMatching(/test-markuprx-mcp\/mcp-\d{8}-\d{6}$/),
        { recursive: true },
      );
      // Should create screenshots subdir
      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('screenshots'),
        { recursive: true },
      );
    });

    it('writes metadata.json on creation', async () => {
      const session = await store.create('test label');

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('metadata.json'),
        expect.stringContaining('"label": "test label"'),
        'utf-8',
      );
    });

    it('returns session with recording status', async () => {
      const session = await store.create();

      expect(session.status).toBe('recording');
      expect(session.id).toMatch(/^mcp-\d{8}-\d{6}$/);
      expect(session.startTime).toBeTypeOf('number');
    });

    it('includes label when provided', async () => {
      const session = await store.create('my label');
      expect(session.label).toBe('my label');
    });

    it('handles directory conflicts by appending counter', async () => {
      // First access check succeeds (dir exists), second fails (dir doesn't exist)
      mockAccess
        .mockResolvedValueOnce(undefined) // first dir exists
        .mockRejectedValueOnce(new Error('ENOENT')); // -1 suffix doesn't exist

      const session = await store.create();

      expect(session.id).toMatch(/^mcp-\d{8}-\d{6}-1$/);
    });
  });

  describe('get', () => {
    it('returns session when metadata.json exists', async () => {
      const mockSession = {
        id: 'mcp-20260214-120000',
        startTime: 1739534400000,
        status: 'complete',
        label: 'test',
      };
      mockReadFile.mockResolvedValue(JSON.stringify(mockSession));

      const session = await store.get('mcp-20260214-120000');

      expect(session).toEqual(mockSession);
      expect(mockReadFile).toHaveBeenCalledWith(
        expect.stringContaining('mcp-20260214-120000/metadata.json'),
        'utf-8',
      );
    });

    it('returns null when session does not exist', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const session = await store.get('nonexistent');
      expect(session).toBeNull();
    });
  });

  describe('getLatest', () => {
    it('returns the most recent session', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReaddir.mockResolvedValue([
        { name: 'mcp-20260214-100000', isDirectory: () => true },
        { name: 'mcp-20260214-120000', isDirectory: () => true },
      ]);

      const older = { id: 'mcp-20260214-100000', startTime: 1000, status: 'complete' };
      const newer = { id: 'mcp-20260214-120000', startTime: 2000, status: 'complete' };

      mockReadFile
        .mockResolvedValueOnce(JSON.stringify(older))
        .mockResolvedValueOnce(JSON.stringify(newer));

      const latest = await store.getLatest();
      expect(latest?.id).toBe('mcp-20260214-120000');
    });

    it('returns null when no sessions exist', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReaddir.mockResolvedValue([]);

      const latest = await store.getLatest();
      expect(latest).toBeNull();
    });
  });

  describe('list', () => {
    it('returns sessions sorted by startTime descending', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReaddir.mockResolvedValue([
        { name: 'mcp-20260214-100000', isDirectory: () => true },
        { name: 'mcp-20260214-120000', isDirectory: () => true },
        { name: 'mcp-20260214-110000', isDirectory: () => true },
      ]);

      const s1 = { id: 'mcp-20260214-100000', startTime: 1000, status: 'complete' };
      const s2 = { id: 'mcp-20260214-120000', startTime: 3000, status: 'complete' };
      const s3 = { id: 'mcp-20260214-110000', startTime: 2000, status: 'complete' };

      mockReadFile
        .mockResolvedValueOnce(JSON.stringify(s1))
        .mockResolvedValueOnce(JSON.stringify(s2))
        .mockResolvedValueOnce(JSON.stringify(s3));

      const sessions = await store.list();

      expect(sessions).toHaveLength(3);
      expect(sessions[0].startTime).toBe(3000);
      expect(sessions[1].startTime).toBe(2000);
      expect(sessions[2].startTime).toBe(1000);
    });

    it('returns empty array when base dir does not exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const sessions = await store.list();
      expect(sessions).toEqual([]);
    });

    it('skips directories without valid metadata', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReaddir.mockResolvedValue([
        { name: 'mcp-20260214-100000', isDirectory: () => true },
        { name: 'invalid-dir', isDirectory: () => true },
      ]);

      const valid = { id: 'mcp-20260214-100000', startTime: 1000, status: 'complete' };
      mockReadFile
        .mockResolvedValueOnce(JSON.stringify(valid))
        .mockRejectedValueOnce(new Error('ENOENT'));

      const sessions = await store.list();
      expect(sessions).toHaveLength(1);
    });

    it('skips non-directory entries', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockReaddir.mockResolvedValue([
        { name: 'some-file.txt', isDirectory: () => false },
        { name: 'mcp-20260214-100000', isDirectory: () => true },
      ]);

      const valid = { id: 'mcp-20260214-100000', startTime: 1000, status: 'complete' };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(valid));

      const sessions = await store.list();
      expect(sessions).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('merges partial data into existing metadata', async () => {
      const existing = { id: 'mcp-20260214-100000', startTime: 1000, status: 'recording' };
      mockReadFile.mockResolvedValue(JSON.stringify(existing));

      await store.update('mcp-20260214-100000', { status: 'complete', endTime: 2000 });

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('metadata.json'),
        expect.stringContaining('"status": "complete"'),
        'utf-8',
      );
      // Should also contain the original data
      const writtenData = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(writtenData.startTime).toBe(1000);
      expect(writtenData.endTime).toBe(2000);
    });

    it('throws when session does not exist', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      await expect(store.update('nonexistent', { status: 'complete' })).rejects.toThrow(
        'Session not found',
      );
    });
  });

  describe('getSessionDir', () => {
    it('returns the correct path for a session ID', () => {
      const dir = store.getSessionDir('mcp-20260214-120000');
      expect(dir).toBe(`${TEST_BASE}/mcp-20260214-120000`);
    });
  });
});
