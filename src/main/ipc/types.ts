/**
 * IPC Handler Dependency Types
 *
 * Defines the context interface that IPC handler modules receive
 * from the main process entry point. Getters are used for mutable state
 * that changes after initialization.
 */

import type { BrowserWindow } from 'electron';
import type { SettingsManager } from '../settings';
import type { PopoverManager } from '../windows';
import type { WindowsTaskbar } from '../platform';
import type { Session } from '../SessionController';
import type {
  SessionPayload,
  PermissionType,
  CaptureTarget,
} from '../../shared/types';

/**
 * Shared context passed to all IPC handler modules.
 * Singleton services are imported directly by each module;
 * only mutable/lazy state needs to flow through here.
 */
export interface IpcContext {
  getMainWindow: () => BrowserWindow | null;
  getPopover: () => PopoverManager | null;
  getSettingsManager: () => SettingsManager | null;
  getWindowsTaskbar: () => WindowsTaskbar | null;
  getHasCompletedOnboarding: () => boolean;
  setHasCompletedOnboarding: (value: boolean) => void;
}

/**
 * Session-related action functions defined in the main entry point.
 * These encapsulate complex multi-service orchestration and are
 * passed to handler modules rather than imported.
 */
export interface SessionActions {
  startSession: (target?: CaptureTarget | string, sourceName?: string) => Promise<{
    success: boolean;
    sessionId?: string;
    cancelled?: boolean;
    error?: string;
  }>;
  stopSession: () => Promise<{
    success: boolean;
    session?: SessionPayload;
    reportPath?: string;
    sessionDir?: string;
    recordingPath?: string;
    audioPath?: string;
    error?: string;
  }>;
  pauseSession: () => { success: boolean; error?: string };
  resumeSession: () => { success: boolean; error?: string };
  cancelSession: () => { success: boolean };
  serializeSession: (session: Session) => SessionPayload;
  checkPermission: (type: PermissionType) => Promise<boolean>;
  requestPermission: (type: PermissionType) => Promise<boolean>;
}
