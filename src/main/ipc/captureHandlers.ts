/**
 * Capture IPC Handlers
 *
 * Registers IPC handlers for screen capture source enumeration,
 * persisted screen recording (start/chunk/stop), and audio device management.
 */

import { ipcMain, desktopCapturer, app } from 'electron';
import * as fs from 'fs/promises';
import { join } from 'path';
import { sessionController } from '../SessionController';
import {
  IPC_CHANNELS,
  DEFAULT_SETTINGS,
  type CaptureSource,
  type AudioDevice,
  type FocusedElementHint,
  type AnnotationEvent,
  type AnnotationMode,
  type CaptureTarget,
} from '../../shared/types';
import type { IpcContext } from './types';
import { probeCaptureContext } from '../capture/CaptureContextProbe';
import { captureOverlayManager } from '../capture/CaptureOverlayManager';

// =============================================================================
// Screen Recording State
// =============================================================================

interface RecordingArtifact {
  tempPath: string;
  mimeType: string;
  bytesWritten: number;
  writeChain: Promise<void>;
  lastChunkAt: number;
  startTime?: number;
}

interface FinalizedRecordingArtifact {
  tempPath: string;
  mimeType: string;
  bytesWritten: number;
  startTime?: number;
}

const activeScreenRecordings = new Map<string, RecordingArtifact>();
const finalizedScreenRecordings = new Map<string, FinalizedRecordingArtifact>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function extensionFromMimeType(mimeType?: string): string {
  const normalized = (mimeType || '').toLowerCase();
  if (normalized.includes('mp4')) {
    return '.mp4';
  }
  if (normalized.includes('quicktime') || normalized.includes('mov')) {
    return '.mov';
  }
  return '.webm';
}

export async function finalizeScreenRecording(sessionId: string): Promise<FinalizedRecordingArtifact | null> {
  const active = activeScreenRecordings.get(sessionId);
  if (active) {
    const QUIET_PERIOD_MS = 750;
    const MAX_WAIT_MS = 6000;
    const waitStartedAt = Date.now();

    while (Date.now() - waitStartedAt < MAX_WAIT_MS) {
      try {
        await active.writeChain;
      } catch (error) {
        console.warn('[Main] Screen recording write chain failed during finalize:', error);
      }

      const idleMs = Date.now() - active.lastChunkAt;
      if (idleMs >= QUIET_PERIOD_MS) {
        break;
      }

      await sleep(Math.min(180, QUIET_PERIOD_MS - idleMs));
    }

    try {
      await active.writeChain;
    } catch (error) {
      console.warn('[Main] Screen recording write chain failed during finalize:', error);
    }

    activeScreenRecordings.delete(sessionId);
    finalizedScreenRecordings.set(sessionId, {
      tempPath: active.tempPath,
      mimeType: active.mimeType,
      bytesWritten: active.bytesWritten,
      startTime: active.startTime,
    });
  }

  return finalizedScreenRecordings.get(sessionId) || null;
}

export function getScreenRecordingSnapshot(sessionId: string): FinalizedRecordingArtifact | null {
  const active = activeScreenRecordings.get(sessionId);
  if (active) {
    return {
      tempPath: active.tempPath,
      mimeType: active.mimeType,
      bytesWritten: active.bytesWritten,
      startTime: active.startTime,
    };
  }

  return finalizedScreenRecordings.get(sessionId) || null;
}

export function deleteFinalizedRecording(sessionId: string): void {
  finalizedScreenRecordings.delete(sessionId);
}

export function getActiveScreenRecordings(): Map<string, RecordingArtifact> {
  return activeScreenRecordings;
}

export function getFinalizedScreenRecordings(): Map<string, FinalizedRecordingArtifact> {
  return finalizedScreenRecordings;
}

// =============================================================================
// IPC Registration
// =============================================================================

export function registerCaptureHandlers(ctx: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.CAPTURE_SELECT_TARGET, async (): Promise<CaptureTarget | null> => {
    return captureOverlayManager.selectTarget();
  });

  ipcMain.handle(
    IPC_CHANNELS.CAPTURE_ANNOTATION_BEGIN,
    async (_, sessionId: unknown, target: unknown): Promise<{ success: boolean; error?: string }> => {
      if (typeof sessionId !== 'string' || !sessionId || !target || typeof target !== 'object') {
        return { success: false, error: 'Invalid annotation target.' };
      }
      try {
        await captureOverlayManager.beginAnnotation(sessionId, target as CaptureTarget);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to open annotation overlay.',
        };
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.CAPTURE_ANNOTATION_END, () => {
    captureOverlayManager.endAnnotation();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.CAPTURE_ANNOTATION_SET_MODE, (_, mode: unknown) => {
    if (mode !== 'interact' && mode !== 'draw') {
      return { success: false, error: 'Invalid annotation mode.' };
    }
    return captureOverlayManager.setAnnotationMode(mode as AnnotationMode);
  });

  ipcMain.handle(IPC_CHANNELS.CAPTURE_OVERLAY_GET_STATE, (event) => {
    return captureOverlayManager.getOverlayState(event.sender.id);
  });

  ipcMain.handle(IPC_CHANNELS.CAPTURE_OVERLAY_CONFIRM, (event, target: unknown) => {
    if (!target || typeof target !== 'object') {
      return { success: false, error: 'Invalid capture target.' };
    }
    return captureOverlayManager.confirmTarget(event.sender.id, target as CaptureTarget);
  });

  ipcMain.handle(IPC_CHANNELS.CAPTURE_OVERLAY_CANCEL, () => {
    captureOverlayManager.cancelSelection();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.CAPTURE_OVERLAY_ANNOTATION_EVENT, (event, annotationEvent: unknown) => {
    if (!annotationEvent || typeof annotationEvent !== 'object') {
      return { success: false, error: 'Invalid annotation event.' };
    }
    return captureOverlayManager.submitAnnotationEvent(event.sender.id, annotationEvent as AnnotationEvent);
  });

  ipcMain.handle(IPC_CHANNELS.CAPTURE_GET_SOURCES, async (): Promise<CaptureSource[]> => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      });

      return sources.map((source) => ({
        id: source.id,
        name: source.name,
        type: source.id.startsWith('screen') ? 'screen' : 'window',
        thumbnail: source.thumbnail.toDataURL(),
        appIcon: source.appIcon?.toDataURL(),
      }));
    } catch (error) {
      console.error('[Main] Failed to get capture sources:', error);
      return [];
    }
  });

  ipcMain.handle(IPC_CHANNELS.CAPTURE_MANUAL_SCREENSHOT, async (_, payload?: {
    focusedElementHint?: FocusedElementHint;
  }) => {
    const session = sessionController.getSession();
    const captureContext = await probeCaptureContext({
      trigger: 'manual',
      sourceId: session?.sourceId,
      sourceName: session?.metadata?.sourceName,
      focusedElementHint: payload?.focusedElementHint,
    });

    const cue = sessionController.registerCaptureCue('manual', captureContext);
    if (!cue) {
      return { success: false, error: 'Manual capture is only available while recording and not paused.' };
    }
    return { success: true };
  });

  ipcMain.handle(
    IPC_CHANNELS.SCREEN_RECORDING_START,
    async (_, sessionId: string, mimeType: string, startTime?: number): Promise<{ success: boolean; path?: string; error?: string }> => {
      try {
        const currentSession = sessionController.getSession();
        if (!currentSession || currentSession.id !== sessionId) {
          return { success: false, error: 'No matching active session for screen recording.' };
        }

        const extension = extensionFromMimeType(mimeType);
        const recordingsDir = join(app.getPath('temp'), 'markupr-recordings');
        await fs.mkdir(recordingsDir, { recursive: true });

        const tempPath = join(recordingsDir, `${sessionId}${extension}`);
        await fs.writeFile(tempPath, Buffer.alloc(0));

        activeScreenRecordings.set(sessionId, {
          tempPath,
          mimeType: mimeType || 'video/webm',
          bytesWritten: 0,
          writeChain: Promise.resolve(),
          lastChunkAt: Date.now(),
          startTime,
        });
        if (Number.isFinite(startTime)) currentSession.metadata.videoStartTime = startTime;

        return { success: true, path: tempPath };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to initialize screen recording.',
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SCREEN_RECORDING_CHUNK,
    async (
      _,
      sessionId: string,
      chunk: Uint8Array | ArrayBuffer
    ): Promise<{ success: boolean; error?: string }> => {
      const recording = activeScreenRecordings.get(sessionId);
      if (!recording) {
        return { success: false, error: 'No active recording writer for this session.' };
      }

      let buffer: Buffer;
      if (chunk instanceof ArrayBuffer) {
        buffer = Buffer.from(chunk);
      } else if (ArrayBuffer.isView(chunk)) {
        buffer = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      } else {
        return { success: false, error: 'Unsupported recording chunk format.' };
      }

      recording.writeChain = recording.writeChain
        .catch(() => {}) // Don't let previous failures block new writes
        .then(() => fs.appendFile(recording.tempPath, buffer))
        .then(() => {
          recording.bytesWritten += buffer.byteLength;
          recording.lastChunkAt = Date.now();
        });

      try {
        await recording.writeChain;
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to append recording chunk.',
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SCREEN_RECORDING_STOP,
    async (
      _,
      sessionId: string
    ): Promise<{ success: boolean; path?: string; bytes?: number; mimeType?: string; error?: string }> => {
      try {
        const artifact = await finalizeScreenRecording(sessionId);
        if (!artifact) {
          return { success: true };
        }

        return {
          success: true,
          path: artifact.tempPath,
          bytes: artifact.bytesWritten,
          mimeType: artifact.mimeType,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to finalize screen recording.',
        };
      }
    }
  );

  // Audio device handlers
  ipcMain.handle(IPC_CHANNELS.AUDIO_GET_DEVICES, async (): Promise<AudioDevice[]> => {
    return [];
  });

  ipcMain.handle(IPC_CHANNELS.AUDIO_SET_DEVICE, async (_, deviceId: string) => {
    const settingsManager = ctx.getSettingsManager();
    const settings = settingsManager?.getAll() || DEFAULT_SETTINGS;
    settingsManager?.update({ ...settings, preferredAudioDevice: deviceId });
    ctx.getMainWindow()?.webContents.send(IPC_CHANNELS.AUDIO_SET_DEVICE, deviceId);
    return { success: true };
  });
}
