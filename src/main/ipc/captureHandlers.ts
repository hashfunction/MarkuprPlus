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
  type CaptureSource,
  type AudioDevice,
  type FocusedElementHint,
  type AnnotationEvent,
  type AnnotationMode,
  type CaptureTarget,
  MAX_MARKED_SCREENSHOT_BYTES,
  type MarkedIssueCandidatePayload,
} from '../../shared/types';
import { isValidPublicSettingValue } from '../../shared/publicSettings';
import { sameCaptureTarget } from '../../shared/captureGeometry';
import type { IpcContext } from './types';
import { probeCaptureContext } from '../capture/CaptureContextProbe';
import { captureOverlayManager } from '../capture/CaptureOverlayManager';
import { MarkedIssueArtifactStore } from '../capture/MarkedIssueArtifactStore';
import {
  clearPrivateCaptureFiles,
  ensurePrivateCaptureArea,
  privateCaptureAreaPath,
} from '../security/PrivateCaptureStorage';
import { randomUUID } from 'node:crypto';
import { audioCapture } from '../audio';

const markedIssueArtifactStore = new MarkedIssueArtifactStore(
  privateCaptureAreaPath('marked-issues'),
  join(app.getPath('temp'), 'markuprx-marked-issues'),
);

export function getMarkedIssueArtifactStore(): MarkedIssueArtifactStore {
  return markedIssueArtifactStore;
}

function validateMarkedIssueCandidatePayload(
  payload: unknown,
): { success: true; value: MarkedIssueCandidatePayload } | { success: false; error: string } {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'Marked screenshot payload must contain bytes.' };
  }
  const candidate = payload as Partial<MarkedIssueCandidatePayload>;
  if (typeof candidate.sessionId !== 'string' || !candidate.sessionId) {
    return { success: false, error: 'Invalid marked screenshot session.' };
  }
  if (!Number.isSafeInteger(candidate.revision) || Number(candidate.revision) <= 0) {
    return { success: false, error: 'Invalid marked screenshot revision.' };
  }
  if (!(candidate.bytes instanceof Uint8Array)) {
    return { success: false, error: 'Marked screenshot bytes must be a Uint8Array.' };
  }
  if (candidate.bytes.byteLength > MAX_MARKED_SCREENSHOT_BYTES) {
    return { success: false, error: 'Marked screenshot exceeds the size limit.' };
  }
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (candidate.bytes.byteLength < signature.length
    || signature.some((byte, index) => candidate.bytes?.[index] !== byte)) {
    return { success: false, error: 'Marked screenshot does not have a valid PNG signature.' };
  }
  return {
    success: true,
    value: {
      sessionId: candidate.sessionId,
      revision: Number(candidate.revision),
      bytes: candidate.bytes,
    },
  };
}

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

/** Remove every app-owned temporary screen recording and surface any failure. */
export async function clearScreenRecordingArtifacts(): Promise<void> {
  const pendingWrites = [...activeScreenRecordings.values()].map((recording) => recording.writeChain);
  const writeResults = await Promise.allSettled(pendingWrites);
  const writeFailures = writeResults.filter((result) => result.status === 'rejected');
  if (writeFailures.length > 0) {
    throw new Error('A screen recording write is still incomplete.');
  }

  await clearPrivateCaptureFiles('recordings', 'Screen recording root');
  activeScreenRecordings.clear();
  finalizedScreenRecordings.clear();
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
        const activeSession = sessionController.getSession();
        const expectedTarget = activeSession?.metadata.captureTarget;
        if (!activeSession || activeSession.id !== sessionId || !expectedTarget
          || !sameCaptureTarget(expectedTarget, target as CaptureTarget)) {
          return { success: false, error: 'Annotation target does not match the active recording.' };
        }
        await captureOverlayManager.beginAnnotation(
          sessionId,
          target as CaptureTarget,
          activeSession.metadata.videoStartTime || activeSession.startTime,
        );
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to open annotation overlay.',
        };
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.CAPTURE_ANNOTATION_END, (_, finalizePendingIssue?: unknown) => {
    if (finalizePendingIssue !== undefined && typeof finalizePendingIssue !== 'boolean') {
      return { success: false, error: 'Invalid annotation finalization request.' };
    }
    const issue = finalizePendingIssue === true
      ? captureOverlayManager.finalizePendingIssue()
      : null;
    captureOverlayManager.endAnnotation();
    return {
      success: true,
      ...(issue ? { snapshotRevision: issue.snapshotRevision } : {}),
    };
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

  ipcMain.handle(IPC_CHANNELS.CAPTURE_OVERLAY_SET_SELECTION_MODE, (event, mode: unknown) => {
    if (mode !== 'window' && mode !== 'region' && mode !== 'screen') {
      return { success: false, error: 'Invalid selection mode.' };
    }
    return captureOverlayManager.setSelectionMode(event.sender.id, mode);
  });

  ipcMain.handle(IPC_CHANNELS.CAPTURE_OVERLAY_ANNOTATION_EVENT, (event, annotationEvent: unknown) => {
    if (!annotationEvent || typeof annotationEvent !== 'object') {
      return { success: false, error: 'Invalid annotation event.' };
    }
    return captureOverlayManager.submitAnnotationEvent(event.sender.id, annotationEvent as AnnotationEvent);
  });

  ipcMain.handle(
    IPC_CHANNELS.CAPTURE_STAGE_MARKED_ISSUE_CANDIDATE,
    async (_, payload: unknown): Promise<{ success: boolean; error?: string }> => {
      const validated = validateMarkedIssueCandidatePayload(payload);
      if (!validated.success) return validated;
      const activeSession = sessionController.getSession();
      if (!activeSession || activeSession.id !== validated.value.sessionId
        || (activeSession.state !== 'recording' && activeSession.state !== 'stopping')) {
        return { success: false, error: 'Marked screenshot does not belong to the active session.' };
      }
      try {
        await markedIssueArtifactStore.stageCandidate(
          validated.value.sessionId,
          validated.value.revision,
          validated.value.bytes,
        );
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to stage marked screenshot.',
        };
      }
    },
  );

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
        const recordingsDir = await ensurePrivateCaptureArea('recordings');

        const tempPath = join(recordingsDir, `${sessionId}-${randomUUID()}${extension}`);
        await fs.writeFile(tempPath, Buffer.alloc(0), { flag: 'wx', mode: 0o600 });

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
    return audioCapture.getDevices();
  });

  ipcMain.handle(IPC_CHANNELS.AUDIO_SET_DEVICE, async (_, deviceId: unknown) => {
    if (!isValidPublicSettingValue('audioDeviceId', deviceId)) {
      return { success: false, error: 'Invalid audio device.' };
    }
    const settingsManager = ctx.getSettingsManager();
    settingsManager?.update({ audioDeviceId: deviceId });
    return { success: true };
  });
}
