/**
 * Output IPC Handlers
 *
 * Registers IPC handlers for session output operations:
 * save, clipboard, session history, export, and deletion.
 */

import { app, ipcMain, shell } from 'electron';
import * as fs from 'fs/promises';
import { join, basename, resolve } from 'path';
import { sessionController } from '../SessionController';
import {
  adaptSessionForReview,
  exportService,
  fileManager,
  outputManager,
  clipboardService,
  generateDocumentForFileManager,
} from '../output';
import {
  runReviewExportInPrivateDirectory,
  sanitizeReviewExportOptions,
  trustedReviewExportSession,
} from '../output/ReviewExportRequest';
import { updateSavedReviewSession } from '../output/SavedReviewUpdater';
import { getElectronTestReviewSaveDelay } from '../e2e/ElectronTestHarness';
import { processSession as aiProcessSession } from '../ai';
import {
  IPC_CHANNELS,
  type ReviewSession,
  type ReviewExportResult,
  type SaveResult,
} from '../../shared/types';
import type { IpcContext } from './types';

// =============================================================================
// Session History Types and Helpers
// =============================================================================

interface ListedSessionMetadata {
  sessionId: string;
  startTime: number;
  endTime?: number;
  itemCount: number;
  screenshotCount: number;
  source?: {
    id: string;
    name?: string;
  };
}

interface SessionHistoryItem {
  id: string;
  startTime: number;
  endTime: number;
  itemCount: number;
  screenshotCount: number;
  sourceName: string;
  firstThumbnail?: string;
  folder: string;
  transcriptionPreview?: string;
}

async function waitForElectronTestReviewSaveDelay(): Promise<void> {
  const delayMs = getElectronTestReviewSaveDelay({
    requested: process.env.MARKUPRX_E2E === '1',
    isPackaged: app.isPackaged,
    value: process.env.MARKUPRX_E2E_REVIEW_SAVE_DELAY_MS,
  });

  if (delayMs > 0) {
    await new Promise<void>((resolveDelay) => {
      setTimeout(resolveDelay, delayMs);
    });
  }
}

function extractPreviewFromMarkdown(content: string): string | undefined {
  const blockMatch = content.match(/#### Feedback\s*\n> ([\s\S]*?)(?:\n\n|\n---|$)/);
  const fallbackLine = content.split('\n').find((line) => line.startsWith('> '));
  const rawPreview = blockMatch?.[1] || fallbackLine?.replace(/^>\s*/, '');

  if (!rawPreview) {
    return undefined;
  }

  const singleLine = rawPreview.replace(/\n>\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return singleLine.slice(0, 220);
}

async function resolveSessionThumbnail(sessionDir: string): Promise<string | undefined> {
  const screenshotsDir = join(sessionDir, 'screenshots');

  try {
    const files = await fs.readdir(screenshotsDir);
    const firstImage = files
      .filter((file) => /\.(png|jpe?g|webp)$/i.test(file))
      .sort()[0];

    if (!firstImage) {
      return undefined;
    }

    return join(screenshotsDir, firstImage);
  } catch {
    return undefined;
  }
}

async function buildSessionHistoryItem(
  dir: string,
  metadata: ListedSessionMetadata
): Promise<SessionHistoryItem> {
  const markdownPath = join(dir, 'feedback-report.md');

  let transcriptionPreview: string | undefined;
  try {
    const markdown = await fs.readFile(markdownPath, 'utf-8');
    transcriptionPreview = extractPreviewFromMarkdown(markdown);
  } catch {
    transcriptionPreview = undefined;
  }

  return {
    id: metadata.sessionId,
    startTime: metadata.startTime,
    endTime: metadata.endTime || metadata.startTime,
    itemCount: metadata.itemCount || 0,
    screenshotCount: metadata.screenshotCount || 0,
    sourceName: metadata.source?.name || 'Feedback Session',
    firstThumbnail: await resolveSessionThumbnail(dir),
    folder: dir,
    transcriptionPreview,
  };
}

export async function listSessionHistoryItems(): Promise<SessionHistoryItem[]> {
  const sessions = await fileManager.listSessions();
  const items = await Promise.all(
    sessions.map(({ dir, metadata }) =>
      buildSessionHistoryItem(dir, metadata as ListedSessionMetadata)
    )
  );
  return items.sort((a, b) => b.startTime - a.startTime);
}

async function getSessionHistoryItem(sessionId: string): Promise<SessionHistoryItem | null> {
  const sessions = await listSessionHistoryItems();
  return sessions.find((session) => session.id === sessionId) || null;
}

async function getSavedSessionDirectory(sessionId: string): Promise<string | null> {
  const sessions = await fileManager.listSessions();
  return sessions.find(({ metadata }) => metadata.sessionId === sessionId)?.dir ?? null;
}

async function exportSessionFolders(sessionIds: string[]): Promise<string> {
  const sessions = await listSessionHistoryItems();
  const selected = sessions.filter((session) => sessionIds.includes(session.id));

  if (!selected.length) {
    throw new Error('No matching sessions found. Make sure the selected sessions still exist in your session history.');
  }

  const exportRoot = join(fileManager.getOutputDirectory(), 'exports');
  const bundleDir = join(exportRoot, `bundle-${Date.now()}`);
  await fs.mkdir(bundleDir, { recursive: true });

  for (const session of selected) {
    const destination = join(bundleDir, basename(session.folder));
    await fs.cp(session.folder, destination, { recursive: true });
  }

  return bundleDir;
}

// =============================================================================
// IPC Registration
// =============================================================================

export function registerOutputHandlers(ctx: IpcContext): void {
  const { getSettingsManager } = ctx;

  ipcMain.handle(IPC_CHANNELS.OUTPUT_SAVE, async (
    _,
    reviewSession?: ReviewSession,
    savedSessionDir?: string,
  ): Promise<SaveResult> => {
    try {
      if (reviewSession !== undefined || savedSessionDir !== undefined) {
        if (!reviewSession || typeof savedSessionDir !== 'string') {
          return { success: false, error: 'A review session and saved report folder are required.' };
        }
        await waitForElectronTestReviewSaveDelay();
        return await updateSavedReviewSession(
          reviewSession,
          savedSessionDir,
          fileManager.getOutputDirectory(),
        );
      }

      const session = sessionController.getSession();
      if (!session) {
        return { success: false, error: 'No session to save' };
      }

      const settingsManager = getSettingsManager();
      const { document } = settingsManager
        ? await aiProcessSession(session, {
            settingsManager,
            projectName: session.metadata?.sourceName || 'Feedback Session',
            screenshotDir: './screenshots',
          })
        : {
            document: generateDocumentForFileManager(session, {
              projectName: session.metadata?.sourceName || 'Feedback Session',
              screenshotDir: './screenshots',
            }),
          };

      const result = await fileManager.saveSession(session, document);
      return {
        success: result.success,
        path: result.sessionDir,
        error: result.error,
      };
    } catch (error) {
      console.error('[Main] Failed to save session:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.OUTPUT_COPY_CLIPBOARD, async (): Promise<boolean> => {
    try {
      const session = sessionController.getSession();
      if (!session) {
        console.warn('[Main] No session to copy');
        return false;
      }

      return await outputManager.copySessionSummary(session);
    } catch (error) {
      console.error('[Main] Failed to copy to clipboard:', error);
      return false;
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.OUTPUT_EXPORT,
    async (_, rendererSession: unknown, rendererOptions: unknown): Promise<ReviewExportResult> => {
      try {
        const options = sanitizeReviewExportOptions(rendererOptions);
        const controllerSession = sessionController.getSession();
        const mainOwnedReview = controllerSession
          ? adaptSessionForReview(controllerSession)
          : null;
        const session = await trustedReviewExportSession(
          rendererSession as ReviewSession,
          {
            mainOwnedSession: mainOwnedReview,
            sessionDirectory: await getSavedSessionDirectory(
              (rendererSession as Partial<ReviewSession>)?.id ?? '',
            ),
            outputRoot: fileManager.getOutputDirectory(),
            format: options.format,
            includeImages: options.includeImages,
          },
        );
        const result = await runReviewExportInPrivateDirectory(
          fileManager.getOutputDirectory(),
          session,
          options,
          async (outputPath) => {
            const exportOptions = {
              ...options,
              outputPath,
              ...(options.format === 'markdown' ? { screenshotDir: './assets' } : {}),
            };
            return exportService.export(session, exportOptions);
          },
        );
        if (!result.success) {
          return {
            success: false,
            status: 'error',
            error: result.error || 'Unable to export the feedback session.',
          };
        }
        return {
          success: true,
          status: 'success',
          path: result.outputPath,
          format: result.format,
          ...(result.fileSize === undefined ? {} : { fileSize: result.fileSize }),
        };
      } catch (error) {
        console.error('[Main] Failed to export review session:', error);
        return {
          success: false,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unable to export the feedback session.',
        };
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.OUTPUT_OPEN_FOLDER, async (_, sessionDir?: unknown) => {
    try {
      if (sessionDir !== undefined && typeof sessionDir !== 'string') {
        return { success: false, error: 'Invalid directory path' };
      }
      const baseDir = fileManager.getOutputDirectory();
      const dir = sessionDir || baseDir;
      // Path containment: only allow opening paths within the output directory
      const resolved = resolve(dir);
      if (sessionDir && !resolved.startsWith(resolve(baseDir))) {
        return { success: false, error: 'Invalid directory path' };
      }
      await shell.openPath(resolved);
      return { success: true };
    } catch (error) {
      console.error('[Main] Failed to open folder:', error);
      return { success: false, error: 'Failed to open folder' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.OUTPUT_LIST_SESSIONS, async () => {
    try {
      return await listSessionHistoryItems();
    } catch (error) {
      console.error('[Main] Failed to list sessions:', error);
      return [];
    }
  });

  ipcMain.handle(IPC_CHANNELS.OUTPUT_GET_SESSION_METADATA, async (_, sessionId: string) => {
    try {
      return await getSessionHistoryItem(sessionId);
    } catch (error) {
      console.error('[Main] Failed to get session metadata:', error);
      return null;
    }
  });

  ipcMain.handle(IPC_CHANNELS.OUTPUT_DELETE_SESSION, async (_, sessionId: string) => {
    try {
      if (typeof sessionId !== 'string' || sessionId.length === 0) {
        return { success: false, error: 'Invalid session ID' };
      }
      const session = await getSessionHistoryItem(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }
      // Path containment: only delete folders within the output directory
      const baseDir = fileManager.getOutputDirectory();
      if (!resolve(session.folder).startsWith(resolve(baseDir))) {
        return { success: false, error: 'Invalid session path' };
      }

      await fs.rm(session.folder, { recursive: true, force: true });
      return { success: true };
    } catch (error) {
      console.error('[Main] Failed to delete session:', error);
      return { success: false, error: 'Failed to delete session' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.OUTPUT_DELETE_SESSIONS, async (_, sessionIds: string[]) => {
    if (!Array.isArray(sessionIds)) {
      return { success: false, deleted: [], failed: [] };
    }

    const deleted: string[] = [];
    const failed: string[] = [];
    const baseDir = fileManager.getOutputDirectory();

    for (const sessionId of sessionIds) {
      try {
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
          failed.push(String(sessionId));
          continue;
        }

        const session = await getSessionHistoryItem(sessionId);
        if (!session) {
          failed.push(sessionId);
          continue;
        }

        // Path containment: only delete folders within the output directory
        if (!resolve(session.folder).startsWith(resolve(baseDir))) {
          failed.push(sessionId);
          continue;
        }

        await fs.rm(session.folder, { recursive: true, force: true });
        deleted.push(sessionId);
      } catch {
        failed.push(sessionId);
      }
    }

    return {
      success: failed.length === 0,
      deleted,
      failed,
    };
  });

  const ALLOWED_EXPORT_FORMATS = new Set(['markdown', 'json', 'pdf']);

  ipcMain.handle(
    IPC_CHANNELS.OUTPUT_EXPORT_SESSION,
    async (_, sessionId: unknown, format: unknown = 'markdown') => {
      try {
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
          return { success: false, error: 'Invalid session ID' };
        }
        const safeFormat = typeof format === 'string' && ALLOWED_EXPORT_FORMATS.has(format) ? format : 'markdown';
        console.log(`[Main] Exporting session ${sessionId} as ${safeFormat}`);
        const exportPath = await exportSessionFolders([sessionId]);
        return { success: true, path: exportPath };
      } catch (error) {
        console.error('[Main] Failed to export session:', error);
        return { success: false, error: 'Failed to export session' };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.OUTPUT_EXPORT_SESSIONS,
    async (_, sessionIds: unknown, format: unknown = 'markdown') => {
      try {
        if (!Array.isArray(sessionIds) || sessionIds.some((id) => typeof id !== 'string')) {
          return { success: false, error: 'Invalid session IDs' };
        }
        const safeFormat = typeof format === 'string' && ALLOWED_EXPORT_FORMATS.has(format) ? format : 'markdown';
        console.log(`[Main] Exporting ${sessionIds.length} sessions as ${safeFormat}`);
        const exportPath = await exportSessionFolders(sessionIds as string[]);
        return { success: true, path: exportPath };
      } catch (error) {
        console.error('[Main] Failed to export sessions:', error);
        return { success: false, error: 'Failed to export sessions' };
      }
    }
  );

  // Legacy clipboard handler
  ipcMain.handle(IPC_CHANNELS.COPY_TO_CLIPBOARD, async (_, text: string) => {
    const success = await clipboardService.copyWithNotification(text);
    return { success };
  });
}
