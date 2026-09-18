import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: unknown[]) => unknown>();
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp'),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
  },
  desktopCapturer: {
    getSources: vi.fn(async () => [
      {
        id: 'screen:0',
        name: 'Display 1',
        thumbnail: { toDataURL: () => 'data:image/png;base64,thumb' },
        appIcon: null,
      },
      {
        id: 'window:1',
        name: 'Chrome',
        thumbnail: { toDataURL: () => 'data:image/png;base64,win' },
        appIcon: { toDataURL: () => 'data:image/png;base64,icon' },
      },
    ]),
  },
}));

vi.mock('../../../src/main/SessionController', () => ({
  sessionController: {
    getSession: vi.fn(() => null),
    registerCaptureCue: vi.fn(() => ({ id: 'cue-1' })),
  },
}));

vi.mock('../../../src/main/capture/CaptureContextProbe', () => ({
  probeCaptureContext: vi.fn(async () => ({})),
}));

vi.mock('../../../src/main/capture/CaptureOverlayManager', () => ({
  captureOverlayManager: {
    selectTarget: vi.fn(async () => ({ type: 'screen', id: 'screen:0' })),
    beginAnnotation: vi.fn(async () => undefined),
    endAnnotation: vi.fn(),
    finalizePendingIssue: vi.fn(() => ({ snapshotRevision: 1 })),
    setAnnotationMode: vi.fn(() => ({ success: true })),
    getOverlayState: vi.fn(() => ({ active: false })),
    confirmTarget: vi.fn(() => ({ success: true })),
    cancelSelection: vi.fn(),
    setSelectionMode: vi.fn(() => ({ success: true })),
    submitAnnotationEvent: vi.fn(() => ({ success: true })),
  },
}));

vi.mock('../../../src/main/capture/MarkedIssueArtifactStore', () => ({
  MarkedIssueArtifactStore: vi.fn().mockImplementation(() => ({
    stageCandidate: vi.fn(async () => undefined),
    promoteIssues: vi.fn(),
    cleanupSession: vi.fn(),
  })),
}));

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
  };
});

import { registerCaptureHandlers, extensionFromMimeType } from '../../../src/main/ipc/captureHandlers';
import { IPC_CHANNELS } from '../../../src/shared/types';
import { sessionController } from '../../../src/main/SessionController';
import { captureOverlayManager } from '../../../src/main/capture/CaptureOverlayManager';
import type { IpcContext } from '../../../src/main/ipc/types';

function makeCtx(): IpcContext {
  return {
    getMainWindow: () => ({ webContents: { send: vi.fn() } } as never),
    getPopover: () => null,
    getSettingsManager: () => ({
      getAll: vi.fn(() => ({})),
      update: vi.fn(),
    } as never),
    getWindowsTaskbar: () => null,
    getHasCompletedOnboarding: () => true,
    setHasCompletedOnboarding: vi.fn(),
  };
}

describe('extensionFromMimeType', () => {
  it('returns .mp4 for mp4', () => {
    expect(extensionFromMimeType('video/mp4')).toBe('.mp4');
  });

  it('returns .mov for quicktime', () => {
    expect(extensionFromMimeType('video/quicktime')).toBe('.mov');
  });

  it('returns .webm for webm or unknown', () => {
    expect(extensionFromMimeType('video/webm')).toBe('.webm');
    expect(extensionFromMimeType(undefined)).toBe('.webm');
    expect(extensionFromMimeType('')).toBe('.webm');
  });
});

describe('registerCaptureHandlers', () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    registerCaptureHandlers(makeCtx());
  });

  describe('CAPTURE_GET_SOURCES', () => {
    it('returns capture sources', async () => {
      const result = (await handlers.get(IPC_CHANNELS.CAPTURE_GET_SOURCES)!()) as Array<{ id: string; type: string }>;
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('screen:0');
      expect(result[0].type).toBe('screen');
      expect(result[1].type).toBe('window');
    });
  });

  describe('CAPTURE_SELECT_TARGET', () => {
    it('delegates to overlay manager', async () => {
      const result = await handlers.get(IPC_CHANNELS.CAPTURE_SELECT_TARGET)!();
      expect(captureOverlayManager.selectTarget).toHaveBeenCalled();
      expect(result).toMatchObject({ type: 'screen' });
    });
  });

  describe('CAPTURE_ANNOTATION_BEGIN', () => {
    it('rejects invalid sessionId', async () => {
      const result = await handlers.get(IPC_CHANNELS.CAPTURE_ANNOTATION_BEGIN)!({}, '', {});
      expect(result).toMatchObject({ success: false });
    });

    it('rejects non-object target', async () => {
      const result = await handlers.get(IPC_CHANNELS.CAPTURE_ANNOTATION_BEGIN)!({}, 'sess-1', null);
      expect(result).toMatchObject({ success: false });
    });

    it('rejects when no active session matches', async () => {
      const result = await handlers.get(IPC_CHANNELS.CAPTURE_ANNOTATION_BEGIN)!({}, 'sess-1', { type: 'screen' });
      expect(result).toMatchObject({ success: false, error: 'Annotation target does not match the active recording.' });
    });
  });

  describe('CAPTURE_ANNOTATION_END', () => {
    it('ends annotation without finalizing', () => {
      const result = handlers.get(IPC_CHANNELS.CAPTURE_ANNOTATION_END)!({}) as { success: boolean };
      expect(result.success).toBe(true);
      expect(captureOverlayManager.endAnnotation).toHaveBeenCalled();
    });

    it('finalizes pending issue when requested', () => {
      const result = handlers.get(IPC_CHANNELS.CAPTURE_ANNOTATION_END)!({}, true) as { success: boolean; snapshotRevision: number };
      expect(result.success).toBe(true);
      expect(result.snapshotRevision).toBe(1);
      expect(captureOverlayManager.finalizePendingIssue).toHaveBeenCalled();
    });

    it('rejects non-boolean finalize flag', () => {
      const result = handlers.get(IPC_CHANNELS.CAPTURE_ANNOTATION_END)!({}, 'bad') as { success: boolean };
      expect(result.success).toBe(false);
    });
  });

  describe('CAPTURE_ANNOTATION_SET_MODE', () => {
    it('sets valid mode', () => {
      const result = handlers.get(IPC_CHANNELS.CAPTURE_ANNOTATION_SET_MODE)!({}, 'draw');
      expect(captureOverlayManager.setAnnotationMode).toHaveBeenCalledWith('draw');
      expect(result).toMatchObject({ success: true });
    });

    it('rejects invalid mode', () => {
      const result = handlers.get(IPC_CHANNELS.CAPTURE_ANNOTATION_SET_MODE)!({}, 'invalid') as { success: boolean };
      expect(result.success).toBe(false);
    });
  });

  describe('CAPTURE_OVERLAY_GET_STATE', () => {
    it('returns overlay state for sender', () => {
      const event = { sender: { id: 1 } };
      const result = handlers.get(IPC_CHANNELS.CAPTURE_OVERLAY_GET_STATE)!(event);
      expect(captureOverlayManager.getOverlayState).toHaveBeenCalledWith(1);
      expect(result).toMatchObject({ active: false });
    });
  });

  describe('CAPTURE_OVERLAY_CONFIRM', () => {
    it('confirms valid target', () => {
      const event = { sender: { id: 1 } };
      const result = handlers.get(IPC_CHANNELS.CAPTURE_OVERLAY_CONFIRM)!(event, { type: 'screen', id: 'screen:0' });
      expect(result).toMatchObject({ success: true });
    });

    it('rejects non-object target', () => {
      const event = { sender: { id: 1 } };
      const result = handlers.get(IPC_CHANNELS.CAPTURE_OVERLAY_CONFIRM)!(event, null) as { success: boolean };
      expect(result.success).toBe(false);
    });
  });

  describe('CAPTURE_OVERLAY_CANCEL', () => {
    it('cancels selection', () => {
      const result = handlers.get(IPC_CHANNELS.CAPTURE_OVERLAY_CANCEL)!() as { success: boolean };
      expect(result.success).toBe(true);
      expect(captureOverlayManager.cancelSelection).toHaveBeenCalled();
    });
  });

  describe('CAPTURE_OVERLAY_SET_SELECTION_MODE', () => {
    it('sets valid selection mode', () => {
      const event = { sender: { id: 1 } };
      const result = handlers.get(IPC_CHANNELS.CAPTURE_OVERLAY_SET_SELECTION_MODE)!(event, 'window');
      expect(result).toMatchObject({ success: true });
    });

    it('rejects invalid selection mode', () => {
      const event = { sender: { id: 1 } };
      const result = handlers.get(IPC_CHANNELS.CAPTURE_OVERLAY_SET_SELECTION_MODE)!(event, 'invalid') as { success: boolean };
      expect(result.success).toBe(false);
    });
  });

  describe('CAPTURE_OVERLAY_ANNOTATION_EVENT', () => {
    it('submits valid event', () => {
      const event = { sender: { id: 1 } };
      const result = handlers.get(IPC_CHANNELS.CAPTURE_OVERLAY_ANNOTATION_EVENT)!(event, { type: 'draw', points: [] });
      expect(result).toMatchObject({ success: true });
    });

    it('rejects non-object event', () => {
      const event = { sender: { id: 1 } };
      const result = handlers.get(IPC_CHANNELS.CAPTURE_OVERLAY_ANNOTATION_EVENT)!(event, null) as { success: boolean };
      expect(result.success).toBe(false);
    });
  });

  describe('CAPTURE_STAGE_MARKED_ISSUE_CANDIDATE', () => {
    it('rejects null payload', async () => {
      const result = await handlers.get(IPC_CHANNELS.CAPTURE_STAGE_MARKED_ISSUE_CANDIDATE)!({}, null) as { success: boolean };
      expect(result.success).toBe(false);
    });

    it('rejects missing sessionId', async () => {
      const result = await handlers.get(IPC_CHANNELS.CAPTURE_STAGE_MARKED_ISSUE_CANDIDATE)!({}, { revision: 1, bytes: new Uint8Array(8) }) as { success: boolean };
      expect(result.success).toBe(false);
    });

    it('rejects invalid revision', async () => {
      const result = await handlers.get(IPC_CHANNELS.CAPTURE_STAGE_MARKED_ISSUE_CANDIDATE)!({}, { sessionId: 's1', revision: 0, bytes: new Uint8Array(8) }) as { success: boolean };
      expect(result.success).toBe(false);
    });

    it('rejects non-Uint8Array bytes', async () => {
      const result = await handlers.get(IPC_CHANNELS.CAPTURE_STAGE_MARKED_ISSUE_CANDIDATE)!({}, { sessionId: 's1', revision: 1, bytes: 'not-bytes' }) as { success: boolean };
      expect(result.success).toBe(false);
    });

    it('rejects invalid PNG signature', async () => {
      const bytes = new Uint8Array(16);
      const result = await handlers.get(IPC_CHANNELS.CAPTURE_STAGE_MARKED_ISSUE_CANDIDATE)!({}, { sessionId: 's1', revision: 1, bytes }) as { success: boolean; error: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain('PNG signature');
    });

    it('rejects when no active session matches', async () => {
      const pngSig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0, 0, 0]);
      const result = await handlers.get(IPC_CHANNELS.CAPTURE_STAGE_MARKED_ISSUE_CANDIDATE)!({}, { sessionId: 's1', revision: 1, bytes: pngSig }) as { success: boolean };
      expect(result.success).toBe(false);
    });

    it('stages valid candidate for active recording session', async () => {
      vi.mocked(sessionController.getSession).mockReturnValueOnce({
        id: 's1',
        state: 'recording',
      } as never);
      const pngSig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0, 0, 0]);
      const result = await handlers.get(IPC_CHANNELS.CAPTURE_STAGE_MARKED_ISSUE_CANDIDATE)!({}, { sessionId: 's1', revision: 1, bytes: pngSig }) as { success: boolean };
      expect(result.success).toBe(true);
    });
  });

  describe('CAPTURE_MANUAL_SCREENSHOT', () => {
    it('registers capture cue when session is active', async () => {
      vi.mocked(sessionController.getSession).mockReturnValueOnce({
        id: 's1',
        sourceId: 'screen:0',
        metadata: { sourceName: 'Test' },
      } as never);
      const result = await handlers.get(IPC_CHANNELS.CAPTURE_MANUAL_SCREENSHOT)!({}) as { success: boolean };
      expect(result.success).toBe(true);
    });

    it('returns error when no cue registered', async () => {
      vi.mocked(sessionController.registerCaptureCue).mockReturnValueOnce(null as never);
      const result = await handlers.get(IPC_CHANNELS.CAPTURE_MANUAL_SCREENSHOT)!({}) as { success: boolean };
      expect(result.success).toBe(false);
    });
  });

  describe('SCREEN_RECORDING_START', () => {
    it('rejects when no matching session', async () => {
      const result = await handlers.get(IPC_CHANNELS.SCREEN_RECORDING_START)!({}, 'sess-1', 'video/webm') as { success: boolean };
      expect(result.success).toBe(false);
    });

    it('starts recording for active session', async () => {
      vi.mocked(sessionController.getSession).mockReturnValueOnce({
        id: 'sess-1',
        metadata: {},
      } as never);
      const result = await handlers.get(IPC_CHANNELS.SCREEN_RECORDING_START)!({}, 'sess-1', 'video/webm', 1000) as { success: boolean; path: string };
      expect(result.success).toBe(true);
      expect(result.path).toContain('sess-1');
    });
  });

  describe('SCREEN_RECORDING_CHUNK', () => {
    it('rejects when no active recording', async () => {
      const result = await handlers.get(IPC_CHANNELS.SCREEN_RECORDING_CHUNK)!({}, 'nonexistent', new Uint8Array(4)) as { success: boolean };
      expect(result.success).toBe(false);
    });

    it('rejects unsupported chunk format', async () => {
      vi.mocked(sessionController.getSession).mockReturnValueOnce({
        id: 'chunk-sess',
        metadata: {},
      } as never);
      await handlers.get(IPC_CHANNELS.SCREEN_RECORDING_START)!({}, 'chunk-sess', 'video/webm');
      const result = await handlers.get(IPC_CHANNELS.SCREEN_RECORDING_CHUNK)!({}, 'chunk-sess', 'not-buffer') as { success: boolean };
      expect(result.success).toBe(false);
    });

    it('appends valid chunk', async () => {
      vi.mocked(sessionController.getSession).mockReturnValueOnce({
        id: 'chunk-sess2',
        metadata: {},
      } as never);
      await handlers.get(IPC_CHANNELS.SCREEN_RECORDING_START)!({}, 'chunk-sess2', 'video/webm');
      const result = await handlers.get(IPC_CHANNELS.SCREEN_RECORDING_CHUNK)!({}, 'chunk-sess2', new Uint8Array([1, 2, 3])) as { success: boolean };
      expect(result.success).toBe(true);
    });
  });

  describe('SCREEN_RECORDING_STOP', () => {
    it('returns success with no artifact when not found', async () => {
      const result = await handlers.get(IPC_CHANNELS.SCREEN_RECORDING_STOP)!({}, 'nonexistent') as { success: boolean };
      expect(result.success).toBe(true);
    });
  });

  describe('AUDIO_GET_DEVICES', () => {
    it('returns empty array', async () => {
      const result = await handlers.get(IPC_CHANNELS.AUDIO_GET_DEVICES)!();
      expect(result).toEqual([]);
    });
  });

  describe('AUDIO_SET_DEVICE', () => {
    it('updates preferred audio device', async () => {
      const result = await handlers.get(IPC_CHANNELS.AUDIO_SET_DEVICE)!({}, 'device-1') as { success: boolean };
      expect(result.success).toBe(true);
    });
  });
});
