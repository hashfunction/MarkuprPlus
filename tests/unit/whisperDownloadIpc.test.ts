import { BrowserWindow, ipcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../../src/shared/types';
import { registerWindowHandlers } from '../../src/main/ipc/windowHandlers';

const { models, whisper } = vi.hoisted(() => ({
  models: {
    onProgress: vi.fn(), onComplete: vi.fn(), onError: vi.fn(),
    hasAnyModel: vi.fn(() => false),
    isModelDownloaded: vi.fn(() => false),
    getDefaultModel: vi.fn(() => 'tiny'),
    getModelInfo: vi.fn(() => ({ sizeMB: 75 })),
    getDownloadStatus: vi.fn(() => ({ model: 'tiny', isDownloading: true, percent: 42, error: null })),
    downloadModel: vi.fn(),
  },
  whisper: { setModelPath: vi.fn() },
}));
vi.mock('../../src/main/transcription/ModelDownloadManager', () => ({
  DEFAULT_DOWNLOAD_MODEL: 'tiny', modelDownloadManager: models,
}));
vi.mock('../../src/main/transcription/WhisperService', () => ({ whisperService: whisper }));
vi.mock('../../src/main/transcription/TierManager', () => ({ tierManager: {} }));

describe('Whisper download IPC notifications', () => {
  let window: BrowserWindow;
  beforeEach(() => {
    vi.clearAllMocks();
    window = new BrowserWindow();
    registerWindowHandlers({
      getMainWindow: () => window,
      getPopover: () => null,
      getWindowsTaskbar: () => null,
    });
  });

  it('activates models and forwards completion without a renderer-initiated download', () => {
    models.onComplete.mock.calls[0][0]({ success: true, model: 'tiny', path: '/models/ggml-tiny.bin' });
    expect(whisper.setModelPath).toHaveBeenCalledWith('/models/ggml-tiny.bin');
    expect(window.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.WHISPER_DOWNLOAD_COMPLETE, {
      model: 'tiny', path: '/models/ggml-tiny.bin',
    });
    expect(models.downloadModel).not.toHaveBeenCalled();
  });

  it('forwards background progress and errors to the current window', () => {
    const progress = { model: 'tiny', percent: 42 };
    models.onProgress.mock.calls[0][0](progress);
    models.onError.mock.calls[0][0](new Error('offline'), 'tiny');
    expect(window.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.WHISPER_DOWNLOAD_PROGRESS, progress);
    expect(window.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.WHISPER_DOWNLOAD_ERROR, {
      model: 'tiny', error: 'offline',
    });
  });

  it('includes in-progress status for settings opened after the download started', () => {
    const handler = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => channel === IPC_CHANNELS.WHISPER_CHECK_MODEL)?.[1];
    if (!handler) throw new Error('Missing Whisper model check handler');
    expect(Reflect.apply(handler, undefined, [])).toMatchObject({
      recommendedModel: 'tiny',
      downloadStatus: { model: 'tiny', isDownloading: true, percent: 42, error: null },
    });
  });

  it('does not send events to a destroyed window during shutdown', () => {
    vi.mocked(window.isDestroyed).mockReturnValue(true);
    models.onError.mock.calls[0][0](new Error('cancelled'), 'tiny');
    expect(window.webContents.send).not.toHaveBeenCalled();
  });
});
