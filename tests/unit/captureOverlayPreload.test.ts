import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { contextBridge, ipcRenderer } from 'electron';
import type {
  AnnotationEvent,
  CaptureOverlayState,
  CaptureTarget,
  MarkedIssueCandidatePayload,
} from '../../src/shared/types';

interface ExposedApi {
  capture: {
    selectTarget(): Promise<CaptureTarget | null>;
    beginAnnotation(sessionId: string, target: CaptureTarget): Promise<{ success: boolean }>;
    endAnnotation(): Promise<{ success: boolean }>;
    setAnnotationMode(mode: 'interact' | 'draw'): Promise<{ success: boolean }>;
    onAnnotationEvent(callback: (event: AnnotationEvent) => void): () => void;
    stageMarkedIssueCandidate(payload: MarkedIssueCandidatePayload): Promise<{ success: boolean }>;
  };
  captureOverlay: {
    getState(): Promise<CaptureOverlayState | null>;
    confirmTarget(target: CaptureTarget): Promise<{ success: boolean }>;
    cancel(): Promise<{ success: boolean }>;
    sendAnnotation(event: AnnotationEvent): Promise<{ success: boolean }>;
  };
}

const target: CaptureTarget = {
  kind: 'window',
  sourceId: 'window:220:0',
  sourceName: 'Documentation',
  nativeWindowId: '220',
  appName: 'Safari',
  bounds: { x: 10, y: 20, width: 800, height: 600 },
};

let api: ExposedApi;

describe('capture overlay preload bridge', () => {
  beforeAll(async () => {
    vi.resetModules();
    await import('../../src/preload/index');
    const exposure = vi.mocked(contextBridge.exposeInMainWorld).mock.calls.find(([name]) => name === 'markupr');
    if (!exposure) throw new Error('markupr preload API was not exposed');
    api = exposure[1] as ExposedApi;
  });

  beforeEach(() => {
    vi.mocked(ipcRenderer.invoke).mockReset();
    vi.mocked(ipcRenderer.on).mockReset();
    vi.mocked(ipcRenderer.removeListener).mockReset();
  });

  it('invokes fixed channels for target selection and annotation lifecycle', async () => {
    vi.mocked(ipcRenderer.invoke).mockResolvedValue({ success: true });

    await api.capture.selectTarget();
    await api.capture.beginAnnotation('session-1', target);
    await api.capture.setAnnotationMode('draw');
    await api.capture.endAnnotation();

    expect(ipcRenderer.invoke.mock.calls).toEqual([
      ['markupr:capture:select-target'],
      ['markupr:capture:annotation-begin', 'session-1', target],
      ['markupr:capture:annotation-set-mode', 'draw'],
      ['markupr:capture:annotation-end'],
    ]);
  });

  it('invokes fixed sender-scoped overlay channels', async () => {
    const event: AnnotationEvent = { type: 'clear', sessionId: 'session-1' };
    vi.mocked(ipcRenderer.invoke).mockResolvedValue({ success: true });

    await api.captureOverlay.getState();
    await api.captureOverlay.confirmTarget(target);
    await api.captureOverlay.sendAnnotation(event);
    await api.captureOverlay.cancel();

    expect(ipcRenderer.invoke.mock.calls).toEqual([
      ['markupr:capture-overlay:get-state'],
      ['markupr:capture-overlay:confirm', target],
      ['markupr:capture-overlay:annotation-event', event],
      ['markupr:capture-overlay:cancel'],
    ]);
  });

  it('subscribes and unsubscribes annotation events without exposing arbitrary channels', () => {
    const callback = vi.fn();
    const unsubscribe = api.capture.onAnnotationEvent(callback);
    const registration = vi.mocked(ipcRenderer.on).mock.calls[0];
    expect(registration[0]).toBe('markupr:capture:annotation-event');

    const payload: AnnotationEvent = { type: 'undo', sessionId: 'session-1' };
    (registration[1] as Function)({}, payload);
    expect(callback).toHaveBeenCalledWith(payload);

    unsubscribe();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(registration[0], registration[1]);
  });

  it('stages marked screenshot bytes through one fixed validated IPC channel', async () => {
    vi.mocked(ipcRenderer.invoke).mockResolvedValue({ success: true });
    const payload: MarkedIssueCandidatePayload = {
      sessionId: '123e4567-e89b-42d3-a456-426614174000',
      revision: 3,
      bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    };

    await api.capture.stageMarkedIssueCandidate(payload);

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      'markupr:capture:stage-marked-issue-candidate',
      payload,
    );
  });
});
