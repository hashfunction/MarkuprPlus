import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: unknown[]) => unknown>();
vi.mock('electron', () => ({
  app: { isPackaged: false },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
  },
  shell: { openPath: vi.fn(async () => '') },
}));

vi.mock('../../../src/main/SessionController', () => ({
  sessionController: {
    getSession: vi.fn(() => null),
  },
}));

vi.mock('../../../src/main/output', () => ({
  adaptSessionForReview: vi.fn((s: unknown) => s),
  exportService: {
    export: vi.fn(async () => ({
      success: true,
      outputPath: '/tmp/export/out.md',
      format: 'markdown',
    })),
  },
  fileManager: {
    listSessions: vi.fn(async () => []),
    getOutputDirectory: vi.fn(() => '/tmp/test-output'),
    saveSession: vi.fn(async () => ({ success: true, sessionDir: '/tmp/test-output/session-1' })),
  },
  outputManager: {
    copySessionSummary: vi.fn(async () => true),
  },
  clipboardService: {
    copyWithNotification: vi.fn(async () => true),
  },
  generateDocumentForFileManager: vi.fn(() => ({
    markdown: '# Test',
    screenshots: [],
  })),
}));

vi.mock('../../../src/main/output/ReviewExportRequest', () => ({
  sanitizeReviewExportOptions: vi.fn((input: unknown) => input),
  trustedReviewExportSession: vi.fn(async (session: unknown) => session),
  runReviewExportInPrivateDirectory: vi.fn(async () => ({
    success: true,
    outputPath: '/tmp/export/out.md',
    format: 'markdown',
  })),
}));

vi.mock('../../../src/main/output/SavedReviewUpdater', () => ({
  updateSavedReviewSession: vi.fn(async () => ({
    success: true,
    path: '/tmp/test-output/session-1',
  })),
}));

vi.mock('../../../src/main/e2e/ElectronTestHarness', () => ({
  getElectronTestReviewSaveDelay: vi.fn(() => 0),
}));

vi.mock('../../../src/main/ai', () => ({
  processSession: vi.fn(async () => ({
    document: { markdown: '# AI processed', screenshots: [] },
  })),
}));

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    readFile: vi.fn(async () => ''),
    readdir: vi.fn(async () => []),
    rm: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    cp: vi.fn(async () => undefined),
  };
});

import { registerOutputHandlers } from '../../../src/main/ipc/outputHandlers';
import { IPC_CHANNELS } from '../../../src/shared/types';
import { sessionController } from '../../../src/main/SessionController';
import { fileManager, outputManager } from '../../../src/main/output';
import { updateSavedReviewSession } from '../../../src/main/output/SavedReviewUpdater';
import {
  runReviewExportInPrivateDirectory,
  sanitizeReviewExportOptions,
} from '../../../src/main/output/ReviewExportRequest';
import { shell } from 'electron';
import * as fs from 'fs/promises';
import type { IpcContext } from '../../../src/main/ipc/types';

function makeCtx(): IpcContext {
  return {
    getMainWindow: () => null,
    getPopover: () => null,
    getSettingsManager: () => ({ get: vi.fn() } as never),
    getWindowsTaskbar: () => null,
    getHasCompletedOnboarding: () => true,
    setHasCompletedOnboarding: vi.fn(),
  };
}

describe('registerOutputHandlers', () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    registerOutputHandlers(makeCtx());
  });

  it('registers all expected IPC channels', () => {
    expect(handlers.has(IPC_CHANNELS.OUTPUT_SAVE)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.OUTPUT_COPY_CLIPBOARD)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.OUTPUT_EXPORT)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.OUTPUT_OPEN_FOLDER)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.OUTPUT_LIST_SESSIONS)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.OUTPUT_GET_SESSION_METADATA)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.OUTPUT_DELETE_SESSION)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.OUTPUT_DELETE_SESSIONS)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.OUTPUT_EXPORT_SESSION)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.OUTPUT_EXPORT_SESSIONS)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.COPY_TO_CLIPBOARD)).toBe(true);
  });

  describe('OUTPUT_SAVE', () => {
    it('returns error when no session and no review session', async () => {
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_SAVE)!({});
      expect(result).toEqual({ success: false, error: 'No session to save' });
    });

    it('returns error when review session provided without savedSessionDir', async () => {
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_SAVE)!({}, { id: 'review-1' }, undefined);
      expect(result).toEqual({ success: false, error: 'A review session and saved report folder are required.' });
    });

    it('returns error when savedSessionDir provided without review session', async () => {
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_SAVE)!({}, undefined, '/some/dir');
      expect(result).toEqual({ success: false, error: 'A review session and saved report folder are required.' });
    });

    it('delegates to updateSavedReviewSession for review saves', async () => {
      const reviewSession = { id: 'review-1', items: [] };
      const dir = '/tmp/test-output/session-1';
      await handlers.get(IPC_CHANNELS.OUTPUT_SAVE)!({}, reviewSession, dir);
      expect(updateSavedReviewSession).toHaveBeenCalledWith(reviewSession, dir, '/tmp/test-output');
    });

    it('saves active session with AI processing', async () => {
      vi.mocked(sessionController.getSession).mockReturnValueOnce({
        id: 'active-1',
        metadata: { sourceName: 'My App' },
      } as never);
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_SAVE)!({});
      expect(result).toMatchObject({ success: true });
    });

    it('catches thrown errors and returns failure', async () => {
      vi.mocked(sessionController.getSession).mockImplementationOnce(() => {
        throw new Error('session exploded');
      });
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_SAVE)!({});
      expect(result).toEqual({ success: false, error: 'session exploded' });
    });
  });

  describe('OUTPUT_COPY_CLIPBOARD', () => {
    it('returns false when no session', async () => {
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_COPY_CLIPBOARD)!({});
      expect(result).toBe(false);
    });

    it('copies session summary when session exists', async () => {
      vi.mocked(sessionController.getSession).mockReturnValueOnce({ id: 'sess-1' } as never);
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_COPY_CLIPBOARD)!({});
      expect(result).toBe(true);
      expect(outputManager.copySessionSummary).toHaveBeenCalled();
    });
  });

  describe('OUTPUT_OPEN_FOLDER', () => {
    it('opens the output directory when no sessionDir given', async () => {
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_OPEN_FOLDER)!({});
      expect(result).toEqual({ success: true });
      expect(shell.openPath).toHaveBeenCalled();
    });

    it('rejects non-string sessionDir', async () => {
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_OPEN_FOLDER)!({}, 42);
      expect(result).toEqual({ success: false, error: 'Invalid directory path' });
    });

    it('rejects paths outside output directory', async () => {
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_OPEN_FOLDER)!({}, '/etc/passwd');
      expect(result).toEqual({ success: false, error: 'Invalid directory path' });
    });

    it('opens a subdirectory within the output directory', async () => {
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_OPEN_FOLDER)!({}, '/tmp/test-output/session-1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('OUTPUT_LIST_SESSIONS', () => {
    it('returns empty array when no sessions', async () => {
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_LIST_SESSIONS)!({});
      expect(result).toEqual([]);
    });

    it('returns sorted session history items', async () => {
      vi.mocked(fileManager.listSessions).mockResolvedValueOnce([
        {
          dir: '/tmp/test-output/session-a',
          metadata: { sessionId: 'a', startTime: 1000, endTime: 2000, itemCount: 1, screenshotCount: 0 },
        },
        {
          dir: '/tmp/test-output/session-b',
          metadata: { sessionId: 'b', startTime: 3000, endTime: 4000, itemCount: 2, screenshotCount: 1, source: { id: 's1', name: 'My App' } },
        },
      ] as never);
      const result = (await handlers.get(IPC_CHANNELS.OUTPUT_LIST_SESSIONS)!({}) as Array<{ id: string; startTime: number; sourceName: string }>);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('b');
      expect(result[0].sourceName).toBe('My App');
      expect(result[1].id).toBe('a');
      expect(result[1].sourceName).toBe('Feedback Session');
    });

    it('returns empty array on error', async () => {
      vi.mocked(fileManager.listSessions).mockRejectedValueOnce(new Error('disk error'));
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_LIST_SESSIONS)!({});
      expect(result).toEqual([]);
    });
  });

  describe('OUTPUT_GET_SESSION_METADATA', () => {
    it('returns null when session not found', async () => {
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_GET_SESSION_METADATA)!({}, 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('OUTPUT_DELETE_SESSION', () => {
    it('rejects empty session ID', async () => {
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_DELETE_SESSION)!({}, '');
      expect(result).toEqual({ success: false, error: 'Invalid session ID' });
    });

    it('rejects non-string session ID', async () => {
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_DELETE_SESSION)!({}, 123);
      expect(result).toEqual({ success: false, error: 'Invalid session ID' });
    });

    it('returns error when session not found', async () => {
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_DELETE_SESSION)!({}, 'unknown-id');
      expect(result).toEqual({ success: false, error: 'Session not found' });
    });

    it('deletes session within output directory', async () => {
      vi.mocked(fileManager.listSessions).mockResolvedValueOnce([
        {
          dir: '/tmp/test-output/session-del',
          metadata: { sessionId: 'del-1', startTime: 1000, itemCount: 0, screenshotCount: 0 },
        },
      ] as never);
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_DELETE_SESSION)!({}, 'del-1');
      expect(result).toEqual({ success: true });
      expect(fs.rm).toHaveBeenCalledWith('/tmp/test-output/session-del', { recursive: true, force: true });
    });
  });

  describe('OUTPUT_DELETE_SESSIONS', () => {
    it('rejects non-array input', async () => {
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_DELETE_SESSIONS)!({}, 'not-an-array');
      expect(result).toEqual({ success: false, deleted: [], failed: [] });
    });

    it('fails invalid session IDs', async () => {
      const result = (await handlers.get(IPC_CHANNELS.OUTPUT_DELETE_SESSIONS)!({}, ['', 'nonexistent'])) as {
        success: boolean;
        deleted: string[];
        failed: string[];
      };
      expect(result.success).toBe(false);
      expect(result.deleted).toEqual([]);
      expect(result.failed).toContain('');
      expect(result.failed).toContain('nonexistent');
    });
  });

  describe('OUTPUT_EXPORT_SESSION', () => {
    it('rejects empty session ID', async () => {
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_EXPORT_SESSION)!({}, '');
      expect(result).toEqual({ success: false, error: 'Invalid session ID' });
    });

    it('rejects non-string session ID', async () => {
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_EXPORT_SESSION)!({}, 42);
      expect(result).toEqual({ success: false, error: 'Invalid session ID' });
    });

    it('returns failure when no matching sessions', async () => {
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_EXPORT_SESSION)!({}, 'nonexistent');
      expect(result).toEqual({ success: false, error: 'Failed to export session' });
    });
  });

  describe('OUTPUT_EXPORT_SESSIONS', () => {
    it('rejects non-array session IDs', async () => {
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_EXPORT_SESSIONS)!({}, 'not-array');
      expect(result).toEqual({ success: false, error: 'Invalid session IDs' });
    });

    it('rejects array with non-string elements', async () => {
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_EXPORT_SESSIONS)!({}, [1, 2]);
      expect(result).toEqual({ success: false, error: 'Invalid session IDs' });
    });
  });

  describe('OUTPUT_EXPORT', () => {
    it('returns success from runReviewExportInPrivateDirectory', async () => {
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_EXPORT)!(
        {},
        { id: 'review-1', items: [] },
        { format: 'markdown', includeImages: true },
      );
      expect(result).toMatchObject({ success: true, status: 'success' });
    });

    it('returns error status on export failure', async () => {
      vi.mocked(runReviewExportInPrivateDirectory).mockResolvedValueOnce({
        success: false,
        error: 'format not supported',
      } as never);
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_EXPORT)!({}, { id: 'r1' }, { format: 'pdf' });
      expect(result).toMatchObject({ success: false, status: 'error' });
    });

    it('catches thrown errors', async () => {
      vi.mocked(sanitizeReviewExportOptions).mockImplementationOnce(() => {
        throw new Error('bad options');
      });
      const result = await handlers.get(IPC_CHANNELS.OUTPUT_EXPORT)!({}, {}, {});
      expect(result).toMatchObject({ success: false, status: 'error', error: 'bad options' });
    });
  });

  describe('COPY_TO_CLIPBOARD', () => {
    it('delegates to clipboardService', async () => {
      const result = await handlers.get(IPC_CHANNELS.COPY_TO_CLIPBOARD)!({}, 'some text');
      expect(result).toEqual({ success: true });
    });
  });

  describe('session history with markdown preview', () => {
    it('extracts preview from feedback block', async () => {
      vi.mocked(fileManager.listSessions).mockResolvedValueOnce([
        {
          dir: '/tmp/test-output/session-preview',
          metadata: { sessionId: 'preview-test', startTime: 1000, itemCount: 0, screenshotCount: 0 },
        },
      ] as never);
      vi.mocked(fs.readFile).mockResolvedValueOnce(
        '#### Feedback\n> The button is misaligned on mobile\n\n---' as never,
      );
      vi.mocked(fs.readdir).mockResolvedValueOnce([] as never);
      const result = (await handlers.get(IPC_CHANNELS.OUTPUT_LIST_SESSIONS)!({}) as Array<{ transcriptionPreview: string }>);
      expect(result[0].transcriptionPreview).toBe('The button is misaligned on mobile');
    });

    it('falls back to first blockquote line', async () => {
      vi.mocked(fileManager.listSessions).mockResolvedValueOnce([
        {
          dir: '/tmp/test-output/session-fallback',
          metadata: { sessionId: 'fallback-test', startTime: 1000, itemCount: 0, screenshotCount: 0 },
        },
      ] as never);
      vi.mocked(fs.readFile).mockResolvedValueOnce(
        '# Report\n> Quick note about the UI\n' as never,
      );
      vi.mocked(fs.readdir).mockResolvedValueOnce([] as never);
      const result = (await handlers.get(IPC_CHANNELS.OUTPUT_LIST_SESSIONS)!({}) as Array<{ transcriptionPreview: string }>);
      expect(result[0].transcriptionPreview).toBe('Quick note about the UI');
    });

    it('resolves first thumbnail from screenshots directory', async () => {
      vi.mocked(fileManager.listSessions).mockResolvedValueOnce([
        {
          dir: '/tmp/test-output/session-thumb',
          metadata: { sessionId: 'thumb-test', startTime: 1000, itemCount: 0, screenshotCount: 1 },
        },
      ] as never);
      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('no file'));
      vi.mocked(fs.readdir).mockResolvedValueOnce(['screenshot-001.png', 'screenshot-002.png'] as never);
      const result = (await handlers.get(IPC_CHANNELS.OUTPUT_LIST_SESSIONS)!({}) as Array<{ firstThumbnail: string }>);
      expect(result[0].firstThumbnail).toContain('screenshot-001.png');
    });
  });
});
