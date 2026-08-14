import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import {
  AUDIO_IPC_CHANNELS,
  AudioCaptureServiceImpl,
} from '../../src/main/audio/AudioCapture';

describe('AudioCapture typed PCM IPC', () => {
  let service: AudioCaptureServiceImpl;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(ipcMain, { removeListener: vi.fn() });
    service = new AudioCaptureServiceImpl();
    service.setMainWindow({
      webContents: { send: vi.fn() },
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
});
