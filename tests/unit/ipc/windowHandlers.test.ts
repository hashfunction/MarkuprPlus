import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: unknown[]) => unknown>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
  },
  app: { getVersion: vi.fn(() => '3.1.2') },
}));

vi.mock('../../../src/main/transcription/TierManager', () => ({
  tierManager: {
    getTierStatuses: vi.fn(async () => [
      { tier: 'whisper', available: true },
      { tier: 'timer-only', available: true },
    ]),
    tierProvidesTranscription: vi.fn((tier: string) => tier === 'whisper'),
    getPreferredTier: vi.fn(() => 'auto'),
    getCurrentTier: vi.fn(() => null),
    selectBestTier: vi.fn(async () => 'whisper'),
    setPreferredTier: vi.fn(),
    hasTranscriptionCapability: vi.fn(async () => true),
  },
}));

vi.mock('../../../src/main/transcription/ModelDownloadManager', () => ({
  DEFAULT_DOWNLOAD_MODEL: 'tiny',
  modelDownloadManager: {
    hasAnyModel: vi.fn(() => true),
    isModelDownloaded: vi.fn((model: string) => model === 'tiny'),
    getDefaultModel: vi.fn(() => 'tiny'),
    getModelInfo: vi.fn(() => ({ sizeMB: 75 })),
    getDownloadStatus: vi.fn(() => null),
    getAvailableModels: vi.fn(() => [
      { name: 'tiny', filename: 'tiny.bin', sizeMB: 75, ramRequired: '1GB', quality: 'basic' },
    ]),
    downloadModel: vi.fn(async () => ({ success: true })),
    cancelDownload: vi.fn(),
    onProgress: vi.fn(() => vi.fn()),
    onComplete: vi.fn(() => vi.fn()),
    onError: vi.fn(() => vi.fn()),
  },
}));

vi.mock('../../../src/main/transcription/WhisperService', () => ({
  whisperService: { setModelPath: vi.fn() },
}));

vi.mock('../../../src/main/windows', () => ({
  POPOVER_SIZES: { idle: { width: 460, height: 680 }, recording: { width: 460, height: 680 } },
}));

import { registerWindowHandlers } from '../../../src/main/ipc/windowHandlers';
import { IPC_CHANNELS } from '../../../src/shared/types';
import { tierManager } from '../../../src/main/transcription/TierManager';
import { modelDownloadManager } from '../../../src/main/transcription/ModelDownloadManager';
import type { IpcContext } from '../../../src/main/ipc/types';

function makeMockWindow() {
  return {
    minimize: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    isDestroyed: vi.fn(() => false),
    webContents: { send: vi.fn() },
  };
}

function makeMockPopover() {
  return {
    show: vi.fn(),
    hide: vi.fn(),
    toggle: vi.fn(),
    resize: vi.fn(),
    resizeToState: vi.fn(),
  };
}

function makeMockTaskbar() {
  return {
    setProgress: vi.fn(),
    flashFrame: vi.fn(),
    setOverlayIcon: vi.fn(),
  };
}

describe('registerWindowHandlers', () => {
  let mockWindow: ReturnType<typeof makeMockWindow>;
  let mockPopover: ReturnType<typeof makeMockPopover>;
  let mockTaskbar: ReturnType<typeof makeMockTaskbar>;

  beforeEach(() => {
    handlers.clear();
    mockWindow = makeMockWindow();
    mockPopover = makeMockPopover();
    mockTaskbar = makeMockTaskbar();

    const ctx: IpcContext = {
      getMainWindow: () => mockWindow as never,
      getPopover: () => mockPopover as never,
      getSettingsManager: () => null,
      getWindowsTaskbar: () => mockTaskbar as never,
      getHasCompletedOnboarding: () => true,
      setHasCompletedOnboarding: vi.fn(),
    };
    registerWindowHandlers(ctx);
  });

  describe('app version', () => {
    it('returns app version', () => {
      const result = handlers.get(IPC_CHANNELS.APP_VERSION)!();
      expect(result).toBe('3.1.2');
    });
  });

  describe('window control', () => {
    it('minimizes window', () => {
      handlers.get(IPC_CHANNELS.WINDOW_MINIMIZE)!();
      expect(mockWindow.minimize).toHaveBeenCalled();
    });

    it('hides popover if available', () => {
      handlers.get(IPC_CHANNELS.WINDOW_HIDE)!();
      expect(mockPopover.hide).toHaveBeenCalled();
    });

    it('closes window', () => {
      handlers.get(IPC_CHANNELS.WINDOW_CLOSE)!();
      expect(mockWindow.close).toHaveBeenCalled();
    });
  });

  describe('popover control', () => {
    it('validates resize dimensions', () => {
      expect(handlers.get(IPC_CHANNELS.POPOVER_RESIZE)!({}, -1, 100)).toEqual({ success: false, error: 'Invalid dimensions' });
      expect(handlers.get(IPC_CHANNELS.POPOVER_RESIZE)!({}, 'a', 100)).toEqual({ success: false, error: 'Invalid dimensions' });
      expect(handlers.get(IPC_CHANNELS.POPOVER_RESIZE)!({}, Infinity, 100)).toEqual({ success: false, error: 'Invalid dimensions' });
      expect(handlers.get(IPC_CHANNELS.POPOVER_RESIZE)!({}, 50, 100)).toEqual({ success: false, error: 'Invalid dimensions' });
    });

    it('resizes popover with valid dimensions', () => {
      const result = handlers.get(IPC_CHANNELS.POPOVER_RESIZE)!({}, 400, 600);
      expect(mockPopover.resize).toHaveBeenCalledWith(400, 600);
      expect(result).toEqual({ success: true });
    });

    it('validates resize state', () => {
      expect(handlers.get(IPC_CHANNELS.POPOVER_RESIZE_TO_STATE)!({}, 'invalid')).toEqual({ success: false, error: 'Invalid popover state' });
      expect(handlers.get(IPC_CHANNELS.POPOVER_RESIZE_TO_STATE)!({}, 123)).toEqual({ success: false, error: 'Invalid popover state' });
    });

    it('resizes to valid state', () => {
      const result = handlers.get(IPC_CHANNELS.POPOVER_RESIZE_TO_STATE)!({}, 'idle');
      expect(mockPopover.resizeToState).toHaveBeenCalledWith('idle');
      expect(result).toEqual({ success: true });
    });

    it('shows popover', () => {
      handlers.get(IPC_CHANNELS.POPOVER_SHOW)!();
      expect(mockPopover.show).toHaveBeenCalled();
    });

    it('hides popover', () => {
      handlers.get(IPC_CHANNELS.POPOVER_HIDE)!();
      expect(mockPopover.hide).toHaveBeenCalled();
    });

    it('toggles popover', () => {
      handlers.get(IPC_CHANNELS.POPOVER_TOGGLE)!();
      expect(mockPopover.toggle).toHaveBeenCalled();
    });
  });

  describe('taskbar', () => {
    it('validates progress value', () => {
      expect(handlers.get(IPC_CHANNELS.TASKBAR_SET_PROGRESS)!({}, 'bad')).toEqual({ success: false, error: 'Invalid progress value' });
      expect(handlers.get(IPC_CHANNELS.TASKBAR_SET_PROGRESS)!({}, Infinity)).toEqual({ success: false, error: 'Invalid progress value' });
    });

    it('clamps progress to [0, 1]', () => {
      handlers.get(IPC_CHANNELS.TASKBAR_SET_PROGRESS)!({}, 1.5);
      expect(mockTaskbar.setProgress).toHaveBeenCalledWith(1);

      handlers.get(IPC_CHANNELS.TASKBAR_SET_PROGRESS)!({}, -0.5);
      expect(mockTaskbar.setProgress).toHaveBeenCalledWith(0);
    });

    it('flashes frame', () => {
      handlers.get(IPC_CHANNELS.TASKBAR_FLASH_FRAME)!({});
      expect(mockTaskbar.flashFrame).toHaveBeenCalledWith(undefined);
    });

    it('sanitizes flash count', () => {
      handlers.get(IPC_CHANNELS.TASKBAR_FLASH_FRAME)!({}, 3);
      expect(mockTaskbar.flashFrame).toHaveBeenCalledWith(3);

      handlers.get(IPC_CHANNELS.TASKBAR_FLASH_FRAME)!({}, 100);
      expect(mockTaskbar.flashFrame).toHaveBeenCalledWith(10);
    });

    it('validates overlay state', () => {
      expect(handlers.get(IPC_CHANNELS.TASKBAR_SET_OVERLAY)!({}, 'bad')).toEqual({ success: false, error: 'Invalid overlay state' });
    });

    it('sets valid overlay state', () => {
      handlers.get(IPC_CHANNELS.TASKBAR_SET_OVERLAY)!({}, 'recording');
      expect(mockTaskbar.setOverlayIcon).toHaveBeenCalledWith('recording');
    });
  });

  describe('transcription tiers', () => {
    it('gets tier statuses and marks non-transcription tiers unavailable', async () => {
      const result = await handlers.get(IPC_CHANNELS.TRANSCRIPTION_GET_TIER_STATUSES)!();
      expect(result).toEqual([
        { tier: 'whisper', available: true },
        { tier: 'timer-only', available: false, reason: 'Not supported for narrated feedback reports' },
      ]);
    });

    it('gets current tier from preferred setting', async () => {
      vi.mocked(tierManager.getPreferredTier).mockReturnValueOnce('whisper' as never);
      const result = await handlers.get(IPC_CHANNELS.TRANSCRIPTION_GET_CURRENT_TIER)!();
      expect(result).toBe('whisper');
    });

    it('falls back to current tier when preferred is auto', async () => {
      vi.mocked(tierManager.getCurrentTier).mockReturnValueOnce('whisper' as never);
      const result = await handlers.get(IPC_CHANNELS.TRANSCRIPTION_GET_CURRENT_TIER)!();
      expect(result).toBe('whisper');
    });

    it('selects best tier when none active', async () => {
      const result = await handlers.get(IPC_CHANNELS.TRANSCRIPTION_GET_CURRENT_TIER)!();
      expect(result).toBe('whisper');
    });

    it('returns null when best tier has no transcription', async () => {
      vi.mocked(tierManager.selectBestTier).mockResolvedValueOnce('timer-only' as never);
      vi.mocked(tierManager.tierProvidesTranscription).mockReturnValue(false);
      const result = await handlers.get(IPC_CHANNELS.TRANSCRIPTION_GET_CURRENT_TIER)!();
      expect(result).toBeNull();
    });

    it('sets valid tier', () => {
      const result = handlers.get(IPC_CHANNELS.TRANSCRIPTION_SET_TIER)!({}, 'whisper');
      expect(tierManager.setPreferredTier).toHaveBeenCalledWith('whisper');
      expect(result).toEqual({ success: true });
    });

    it('rejects invalid tier', () => {
      const result = handlers.get(IPC_CHANNELS.TRANSCRIPTION_SET_TIER)!({}, 'openai') as { success: boolean; error: string };
      expect(result.success).toBe(false);
    });
  });

  describe('whisper model channels', () => {
    it('checks model status', () => {
      const result = handlers.get(IPC_CHANNELS.WHISPER_CHECK_MODEL)!() as Record<string, unknown>;
      expect(result).toMatchObject({
        hasAnyModel: true,
        defaultModel: 'tiny',
        recommendedModel: 'tiny',
      });
      expect((result.downloadedModels as string[]).length).toBeGreaterThan(0);
    });

    it('gets transcription capability', async () => {
      const result = await handlers.get(IPC_CHANNELS.WHISPER_HAS_TRANSCRIPTION_CAPABILITY)!();
      expect(result).toBe(true);
    });

    it('lists available models', () => {
      const result = handlers.get(IPC_CHANNELS.WHISPER_GET_AVAILABLE_MODELS)!() as unknown[];
      expect(result).toHaveLength(1);
    });

    it('rejects invalid model for download', async () => {
      const result = await handlers.get(IPC_CHANNELS.WHISPER_DOWNLOAD_MODEL)!({}, 'invalid') as { success: boolean };
      expect(result.success).toBe(false);
    });

    it('downloads valid model', async () => {
      const result = await handlers.get(IPC_CHANNELS.WHISPER_DOWNLOAD_MODEL)!({}, 'tiny') as { success: boolean };
      expect(result.success).toBe(true);
      expect(modelDownloadManager.downloadModel).toHaveBeenCalledWith('tiny');
    });

    it('handles download failure', async () => {
      vi.mocked(modelDownloadManager.downloadModel).mockRejectedValueOnce(new Error('network'));
      const result = await handlers.get(IPC_CHANNELS.WHISPER_DOWNLOAD_MODEL)!({}, 'tiny') as { success: boolean };
      expect(result.success).toBe(false);
    });

    it('rejects invalid model for cancel', () => {
      const result = handlers.get(IPC_CHANNELS.WHISPER_CANCEL_DOWNLOAD)!({}, 999) as { success: boolean };
      expect(result.success).toBe(false);
    });

    it('cancels valid model download', () => {
      const result = handlers.get(IPC_CHANNELS.WHISPER_CANCEL_DOWNLOAD)!({}, 'tiny') as { success: boolean };
      expect(result.success).toBe(true);
      expect(modelDownloadManager.cancelDownload).toHaveBeenCalledWith('tiny');
    });
  });
});
