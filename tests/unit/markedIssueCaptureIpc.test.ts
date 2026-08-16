import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import type { IpcContext } from '../../src/main/ipc/types';
import { IPC_CHANNELS } from '../../src/shared/types';
import {
  getMarkedIssueArtifactStore,
  registerCaptureHandlers,
} from '../../src/main/ipc/captureHandlers';
import { sessionController } from '../../src/main/SessionController';
import { captureOverlayManager } from '../../src/main/capture/CaptureOverlayManager';

const SESSION_ID = '123e4567-e89b-42d3-a456-426614174000';
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);

function context(): IpcContext {
  return {
    getMainWindow: () => null,
    getPopover: () => null,
    getSettingsManager: () => null,
    getWindowsTaskbar: () => null,
    getHasCompletedOnboarding: () => true,
    setHasCompletedOnboarding: () => undefined,
  };
}

function registeredHandler(channel: string): (...args: unknown[]) => unknown {
  const registration = vi.mocked(ipcMain.handle).mock.calls.find(([name]) => name === channel);
  if (!registration) throw new Error(`Handler not registered for ${channel}`);
  return registration[1] as (...args: unknown[]) => unknown;
}

describe('marked issue capture IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(sessionController, 'getSession').mockReturnValue({
      id: SESSION_ID,
      state: 'recording',
      startTime: 1_000,
      sourceId: 'screen:0:0',
      feedbackItems: [],
      metadata: {},
    } as never);
    registerCaptureHandlers(context());
  });

  it('stages only bounded PNG bytes owned by the active session', async () => {
    const stage = vi.spyOn(getMarkedIssueArtifactStore(), 'stageCandidate')
      .mockResolvedValue(undefined);
    const handler = registeredHandler(IPC_CHANNELS.CAPTURE_STAGE_MARKED_ISSUE_CANDIDATE);

    await expect(handler({}, {
      sessionId: SESSION_ID,
      revision: 2,
      bytes: PNG,
    })).resolves.toEqual({ success: true });

    expect(stage).toHaveBeenCalledWith(SESSION_ID, 2, PNG);
  });

  it('rejects mismatched ownership and malformed payloads before touching disk', async () => {
    const stage = vi.spyOn(getMarkedIssueArtifactStore(), 'stageCandidate')
      .mockResolvedValue(undefined);
    const handler = registeredHandler(IPC_CHANNELS.CAPTURE_STAGE_MARKED_ISSUE_CANDIDATE);

    await expect(handler({}, {
      sessionId: '223e4567-e89b-42d3-a456-426614174000',
      revision: 1,
      bytes: PNG,
    })).resolves.toMatchObject({ success: false, error: expect.stringMatching(/session/i) });
    await expect(handler({}, {
      sessionId: SESSION_ID,
      revision: -1,
      bytes: PNG,
    })).resolves.toMatchObject({ success: false, error: expect.stringMatching(/revision/i) });
    await expect(handler({}, {
      sessionId: SESSION_ID,
      revision: 1,
      bytes: new Uint8Array([1, 2, 3]),
    })).resolves.toMatchObject({ success: false, error: expect.stringMatching(/PNG/i) });
    await expect(handler({}, {
      sessionId: SESSION_ID,
      revision: 1,
      bytes: 'not bytes',
    })).resolves.toMatchObject({ success: false, error: expect.stringMatching(/bytes/i) });

    expect(stage).not.toHaveBeenCalled();
  });

  it('surfaces staging failures as a recoverable renderer response', async () => {
    vi.spyOn(getMarkedIssueArtifactStore(), 'stageCandidate')
      .mockRejectedValue(new Error('disk full'));
    const handler = registeredHandler(IPC_CHANNELS.CAPTURE_STAGE_MARKED_ISSUE_CANDIDATE);

    await expect(handler({}, {
      sessionId: SESSION_ID,
      revision: 1,
      bytes: PNG,
    })).resolves.toEqual({ success: false, error: 'disk full' });
  });

  it('returns the final snapshot revision before ending the overlay on stop', () => {
    const finalized = vi.spyOn(captureOverlayManager, 'finalizePendingIssue')
      .mockReturnValue({
        id: 'marked-issue-003',
        ordinal: 3,
        startedAt: 1_000,
        markedAt: 1_100,
        completedAt: 1_200,
        strokeIds: ['stroke-3'],
        tools: ['circle'],
        colors: ['#ff3b30'],
        fallbackVideoTimestamp: 1.1,
        transcriptionStatus: 'pending',
        snapshotRevision: 7,
        transcriptSegmentIds: [],
      });
    const ended = vi.spyOn(captureOverlayManager, 'endAnnotation')
      .mockImplementation(() => undefined);
    const handler = registeredHandler(IPC_CHANNELS.CAPTURE_ANNOTATION_END);

    expect(handler({}, true)).toEqual({ success: true, snapshotRevision: 7 });
    expect(finalized).toHaveBeenCalledOnce();
    expect(ended).toHaveBeenCalledOnce();
    expect(finalized.mock.invocationCallOrder[0]).toBeLessThan(ended.mock.invocationCallOrder[0]);
  });
});
