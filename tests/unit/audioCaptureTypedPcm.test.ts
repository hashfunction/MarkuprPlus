import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import {
  AUDIO_IPC_CHANNELS,
  AudioCaptureServiceImpl,
} from '../../src/main/audio/AudioCapture';

describe('AudioCapture typed PCM IPC', () => {
  let service: AudioCaptureServiceImpl;
  let sendToRenderer: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(ipcMain, { removeListener: vi.fn() });
    sendToRenderer = vi.fn();
    service = new AudioCaptureServiceImpl();
    service.setMainWindow({
      webContents: { send: sendToRenderer },
    } as never);
  });

  afterEach(async () => {
    if (service.isCapturing()) {
      const stopPromise = service.stop();
      const stoppedHandler = vi.mocked(ipcMain.on).mock.calls
        .filter(([channel]) => channel === AUDIO_IPC_CHANNELS.CAPTURE_STOPPED)
        .at(-1)?.[1];
      stoppedHandler?.({} as never);
      await stopPromise;
    }
    await service.clearRecoveryBuffers();
    service.clearCapturedAudio();
  });

  it('buffers Float32Array samples delivered through Electron IPC', async () => {
    const startPromise = service.start();
    await vi.waitFor(() => {
      expect(
        vi.mocked(ipcMain.once).mock.calls.some(
          ([channel]) => channel === AUDIO_IPC_CHANNELS.CAPTURE_STARTED,
        ),
      ).toBe(true);
    });
    const startedHandler = vi.mocked(ipcMain.once).mock.calls
      .find(([channel]) => channel === AUDIO_IPC_CHANNELS.CAPTURE_STARTED)?.[1];
    startedHandler?.({} as never);
    await startPromise;

    const chunkHandler = vi.mocked(ipcMain.on).mock.calls
      .filter(([channel]) => channel === AUDIO_IPC_CHANNELS.AUDIO_CHUNK)
      .at(-1)?.[1];
    const backingSamples = new Float32Array([9, 0.25, -0.5, 0.75, 9]);
    chunkHandler?.({} as never, {
      samples: backingSamples.subarray(1, 4),
      timestamp: 42,
      duration: 0.1875,
    });

    const captured = service.getCapturedAudioBuffer();
    expect(captured).not.toBeNull();
    expect(Array.from(new Float32Array(
      captured!.buffer,
      captured!.byteOffset,
      captured!.byteLength / Float32Array.BYTES_PER_ELEMENT,
    ))).toEqual([0.25, -0.5, 0.75]);
  });

  it('cancels a pending start and ignores a late renderer acknowledgement', async () => {
    const startPromise = service.start();
    await vi.waitFor(() => {
      expect(
        vi.mocked(ipcMain.once).mock.calls.some(
          ([channel]) => channel === AUDIO_IPC_CHANNELS.CAPTURE_STARTED,
        ),
      ).toBe(true);
    });
    const startedHandler = vi.mocked(ipcMain.once).mock.calls
      .find(([channel]) => channel === AUDIO_IPC_CHANNELS.CAPTURE_STARTED)?.[1];

    const stopPromise = service.stop();
    const stoppedHandler = vi.mocked(ipcMain.on).mock.calls
      .filter(([channel]) => channel === AUDIO_IPC_CHANNELS.CAPTURE_STOPPED)
      .at(-1)?.[1];
    stoppedHandler?.({} as never);
    startedHandler?.({} as never);

    await expect(startPromise).rejects.toThrow(/cancelled/i);
    await expect(stopPromise).resolves.toBeUndefined();
    expect(service.isCapturing()).toBe(false);
  });

  it('arms cancellation before asynchronous permission discovery can finish', async () => {
    let resolvePermission: ((granted: boolean) => void) | undefined;
    vi.spyOn(service, 'checkPermission').mockImplementation(() => (
      new Promise<boolean>((resolve) => {
        resolvePermission = resolve;
      })
    ));

    let startSettled = false;
    const startOutcome = service.start().then(
      () => {
        startSettled = true;
        return null;
      },
      (error: unknown) => {
        startSettled = true;
        return error;
      },
    );
    await vi.waitFor(() => expect(resolvePermission).toBeTypeOf('function'));

    const stopPromise = service.stop();
    const stoppedHandler = vi.mocked(ipcMain.on).mock.calls
      .filter(([channel]) => channel === AUDIO_IPC_CHANNELS.CAPTURE_STOPPED)
      .at(-1)?.[1];
    stoppedHandler?.({} as never);
    resolvePermission?.(true);

    await vi.waitFor(() => {
      const rendererStartWasSent = sendToRenderer.mock.calls.some(
        ([channel]) => channel === AUDIO_IPC_CHANNELS.START_CAPTURE,
      );
      expect(startSettled || rendererStartWasSent).toBe(true);
    });
    const lateStartedHandler = vi.mocked(ipcMain.once).mock.calls
      .filter(([channel]) => channel === AUDIO_IPC_CHANNELS.CAPTURE_STARTED)
      .at(-1)?.[1];
    lateStartedHandler?.({} as never);

    expect(await startOutcome).toMatchObject({ message: expect.stringMatching(/cancelled/i) });
    await expect(stopPromise).resolves.toBeUndefined();
    expect(sendToRenderer).not.toHaveBeenCalledWith(
      AUDIO_IPC_CHANNELS.START_CAPTURE,
      expect.anything(),
    );
    expect(service.isCapturing()).toBe(false);
  });

  it('joins an existing stop instead of settling it during a second stop call', async () => {
    const startOutcome = service.start().then(
      () => null,
      (error: unknown) => error,
    );
    await vi.waitFor(() => {
      expect(
        vi.mocked(ipcMain.once).mock.calls.some(
          ([channel]) => channel === AUDIO_IPC_CHANNELS.CAPTURE_STARTED,
        ),
      ).toBe(true);
    });

    let firstStopSettled = false;
    const firstStop = service.stop().then(() => {
      firstStopSettled = true;
    });
    const secondStop = service.stop();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(firstStopSettled).toBe(false);
    const stoppedHandler = vi.mocked(ipcMain.on).mock.calls
      .filter(([channel]) => channel === AUDIO_IPC_CHANNELS.CAPTURE_STOPPED)
      .at(-1)?.[1];
    stoppedHandler?.({} as never);

    await expect(startOutcome).resolves.toMatchObject({
      message: expect.stringMatching(/cancelled/i),
    });
    await expect(Promise.all([firstStop, secondStop])).resolves.toEqual([undefined, undefined]);
    expect(service.isCapturing()).toBe(false);
  });
});
