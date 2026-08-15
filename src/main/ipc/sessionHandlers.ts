/**
 * Session IPC Handlers
 *
 * Registers IPC handlers for session lifecycle operations:
 * start, stop, pause, resume, cancel, status queries.
 */

import { ipcMain } from 'electron';
import { sessionController } from '../SessionController';
import {
  IPC_CHANNELS,
  type CaptureTarget,
  type SessionStatusPayload,
  type SessionPayload,
} from '../../shared/types';
import type { IpcContext, SessionActions } from './types';

export function registerSessionHandlers(ctx: IpcContext, actions: SessionActions): void {
  ipcMain.handle(IPC_CHANNELS.SESSION_START, async (_, target?: CaptureTarget | string, sourceName?: string) => {
    try {
      console.log('[Main] Starting session');
      return await actions.startSession(target, sourceName);
    } catch (error) {
      console.error('[IPC] SESSION_START failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to start session' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_STOP, async () => {
    try {
      console.log('[Main] Stopping session');
      return await actions.stopSession();
    } catch (error) {
      console.error('[IPC] SESSION_STOP failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to stop session' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_PAUSE, async () => {
    try {
      console.log('[Main] Pausing session');
      return await actions.pauseSession();
    } catch (error) {
      console.error('[IPC] SESSION_PAUSE failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to pause session' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_RESUME, async () => {
    try {
      console.log('[Main] Resuming session');
      return await actions.resumeSession();
    } catch (error) {
      console.error('[IPC] SESSION_RESUME failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to resume session' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_CANCEL, async () => {
    try {
      console.log('[Main] Cancelling session');
      return await actions.cancelSession();
    } catch (error) {
      console.error('[IPC] SESSION_CANCEL failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to cancel session' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_GET_STATUS, (): SessionStatusPayload => {
    try {
      return sessionController.getStatus();
    } catch (error) {
      console.error('[IPC] SESSION_GET_STATUS failed:', error);
      return { state: 'idle', duration: 0, feedbackCount: 0, screenshotCount: 0, isPaused: false };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_GET_CURRENT, (): SessionPayload | null => {
    try {
      const session = sessionController.getSession();
      return session ? actions.serializeSession(session) : null;
    } catch (error) {
      console.error('[IPC] SESSION_GET_CURRENT failed:', error);
      return null;
    }
  });

  // Legacy session handlers (for backwards compatibility)
  ipcMain.handle(IPC_CHANNELS.START_SESSION, async (_, sourceId?: string) => {
    try {
      return await actions.startSession(sourceId);
    } catch (error) {
      console.error('[IPC] START_SESSION failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to start session' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.STOP_SESSION, async () => {
    try {
      return await actions.stopSession();
    } catch (error) {
      console.error('[IPC] STOP_SESSION failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to stop session' };
    }
  });
}
