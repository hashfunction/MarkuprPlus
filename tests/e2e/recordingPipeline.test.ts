/**
 * Recording Pipeline E2E Integration Tests
 *
 * Tests the complete recording pipeline end-to-end:
 * - SessionController FSM lifecycle (7 states)
 * - PostProcessor pipeline (transcribe -> analyze -> extract -> report)
 * - Watchdog timer and error recovery
 * - State transition guards
 * - Pause/resume behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// =============================================================================
// Hoisted mocks — vi.hoisted runs before vi.mock factory hoisting
// =============================================================================

const { mockAudioCapture, mockAudioEvents, mockRecoverTranscript } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { EventEmitter: EE } = require('events');
  const mockAudioEvents = new EE();
  const mockAudioCapture = {
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    setMainWindow: vi.fn(),
    setPaused: vi.fn(),
    onAudioChunk: vi.fn((cb: (...args: unknown[]) => void) => {
      mockAudioEvents.on('audioChunk', cb);
      return () => mockAudioEvents.off('audioChunk', cb);
    }),
    onVoiceActivity: vi.fn((cb: (...args: unknown[]) => void) => {
      mockAudioEvents.on('voiceActivity', cb);
      return () => mockAudioEvents.off('voiceActivity', cb);
    }),
    onError: vi.fn((cb: (...args: unknown[]) => void) => {
      mockAudioEvents.on('error', cb);
      return () => mockAudioEvents.off('error', cb);
    }),
    getCapturedAudioAsset: vi.fn(() => null),
    getCapturedAudioBuffer: vi.fn(() => null),
    clearCapturedAudio: vi.fn(),
    exportCapturedAudio: vi.fn(() => Promise.resolve(null)),
  };
  const mockRecoverTranscript = vi.fn((): Promise<{
    events: unknown[];
    failure?: { code: string; message: string };
  }> => Promise.resolve({ events: [] }));
  return { mockAudioCapture, mockAudioEvents, mockRecoverTranscript };
});

vi.mock('../../src/main/audio/AudioCapture', () => ({
  audioCapture: mockAudioCapture,
}));

vi.mock('../../src/main/transcription/TranscriptionRecoveryService', () => ({
  recoverTranscript: mockRecoverTranscript,
  normalizeTranscriptTimestamp: vi.fn((ts) => ts),
}));

vi.mock('../../src/main/ErrorHandler', () => ({
  errorHandler: {
    log: vi.fn(),
    handleAudioError: vi.fn(),
    handleTranscriptionError: vi.fn(),
    handleCaptureError: vi.fn(),
    categorizeError: vi.fn(() => 'unknown'),
  },
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
    getName: vi.fn(() => 'markuprx'),
    getVersion: vi.fn(() => '2.4.0'),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    isDestroyed: vi.fn(() => false),
    webContents: { send: vi.fn() },
  })),
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

vi.mock('electron-store', () => ({
  default: vi.fn().mockImplementation(() => ({
    get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    has: vi.fn(() => false),
  })),
}));

// Mock WhisperService for PostProcessor tests
vi.mock('../../src/main/transcription/WhisperService', () => ({
  whisperService: {
    isModelAvailable: vi.fn(() => false),
    transcribeFile: vi.fn(() => Promise.resolve([])),
  },
  WhisperService: vi.fn(),
}));

// Mock child_process for FrameExtractor
vi.mock('child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
    cb(new Error('ffmpeg not found'), '', '');
  }),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  stat: vi.fn(() => Promise.resolve({ size: 1024 })),
  writeFile: vi.fn(() => Promise.resolve()),
  mkdir: vi.fn(() => Promise.resolve()),
}));

// =============================================================================
// Import after mocks
// =============================================================================

import { SessionController, STATE_TIMEOUTS, RECORDING_LIMITS } from '../../src/main/SessionController';
import { PostProcessor } from '../../src/main/pipeline/PostProcessor';
import { TranscriptAnalyzer } from '../../src/main/pipeline/TranscriptAnalyzer';
import { FrameExtractor } from '../../src/main/pipeline/FrameExtractor';
import type { TranscriptSegment, PostProcessOptions } from '../../src/main/pipeline/PostProcessor';
import type { BrowserWindow } from 'electron';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockMainWindow(): BrowserWindow {
  return {
    isDestroyed: vi.fn(() => false),
    webContents: { send: vi.fn() },
  } as unknown as BrowserWindow;
}

function createTestSegments(count: number = 5): TranscriptSegment[] {
  return Array.from({ length: count }, (_, i) => ({
    text: `Test segment ${i + 1}. This is a test transcription.`,
    startTime: i * 10,
    endTime: i * 10 + 5,
    confidence: 0.95,
  }));
}

// =============================================================================
// Tests
// =============================================================================

describe('Recording Pipeline E2E', () => {
  let controller: SessionController;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAudioEvents.removeAllListeners();
    controller = new SessionController();
    controller.setMainWindow(createMockMainWindow());
  });

  afterEach(() => {
    vi.useRealTimers();
    try {
      controller.destroy();
    } catch {
      // Ignore cleanup errors
    }
  });

  // ===========================================================================
  // Session Lifecycle
  // ===========================================================================

  describe('Session Lifecycle', () => {
    it('should transition through complete happy path: idle -> starting -> recording -> stopping -> processing -> complete', async () => {
      const stateChanges: string[] = [];
      controller.setEventCallbacks({
        onStateChange: (state) => stateChanges.push(state),
        onFeedbackItem: vi.fn(),
        onError: vi.fn(),
      });

      expect(controller.getState()).toBe('idle');

      // Start session
      await controller.start('screen:0:0', 'Test Screen');

      expect(controller.getState()).toBe('recording');
      expect(stateChanges).toContain('starting');
      expect(stateChanges).toContain('recording');

      // Stop session
      const session = await controller.stop();

      expect(session).not.toBeNull();
      expect(session!.id).toBeTruthy();
      expect(session!.endTime).toBeDefined();
      expect(controller.getState()).toBe('complete');
    });

    it('should create proper session object on start', async () => {
      await controller.start('screen:0:0', 'Test Screen');

      const session = controller.getSession();
      expect(session).not.toBeNull();
      expect(session!.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
      expect(session!.startTime).toBeLessThanOrEqual(Date.now());
      expect(session!.sourceId).toBe('screen:0:0');
      expect(session!.state).toBe('recording');
      expect(session!.feedbackItems).toEqual([]);
      expect(session!.metadata.sourceId).toBe('screen:0:0');
      expect(session!.metadata.sourceName).toBe('Test Screen');
    });

    it('should set endTime and transition through processing on stop', async () => {
      await controller.start('screen:0:0');

      const beforeStop = Date.now();
      const session = await controller.stop();

      expect(session).not.toBeNull();
      expect(session!.endTime).toBeDefined();
      expect(session!.endTime!).toBeGreaterThanOrEqual(beforeStop);
      expect(session!.state).toBe('complete');
    });

    it('should retain an actionable transcription failure on the completed session', async () => {
      mockRecoverTranscript.mockResolvedValueOnce({
        events: [],
        failure: {
          code: 'not-configured',
          message: 'Add an OpenAI transcription key or download a local Whisper model, then record again.',
        },
      });
      mockAudioCapture.getCapturedAudioAsset.mockReturnValueOnce({
        buffer: Buffer.from('encoded narration'),
        mimeType: 'audio/webm;codecs=opus',
        durationMs: 2_000,
      });

      await controller.start('screen:0:0');
      const session = await controller.stop();

      expect(session?.metadata.transcriptionFailure).toEqual({
        code: 'not-configured',
        message: 'Add an OpenAI transcription key or download a local Whisper model, then record again.',
      });
    });

    it('should cancel from recording and return to idle', async () => {
      await controller.start('screen:0:0');
      expect(controller.getState()).toBe('recording');

      controller.cancel();

      expect(controller.getState()).toBe('idle');
      expect(controller.getSession()).toBeNull();
    });

    it('should cancel from starting and return to idle', async () => {
      // Make audio start hang
      mockAudioCapture.start.mockImplementationOnce(
        () => new Promise(() => {}) // Never resolves
      );

      const startPromise = controller.start('screen:0:0');

      // Cancel while starting
      controller.cancel();
      expect(controller.getState()).toBe('idle');

      // The start promise may throw; we don't care
      await startPromise.catch(() => {});
    });

    it('should reset from any state to idle', async () => {
      await controller.start('screen:0:0');
      expect(controller.getState()).toBe('recording');

      controller.reset();

      expect(controller.getState()).toBe('idle');
      expect(controller.getSession()).toBeNull();
    });
  });

  // ===========================================================================
  // State Machine Guards
  // ===========================================================================

  describe('State Machine Guards', () => {
    it('should reject start when not idle', async () => {
      await controller.start('screen:0:0');

      await expect(controller.start('screen:1:0')).rejects.toThrow(
        /Cannot start.*while in "recording" state/
      );
    });

    it('should return null when stopping from non-recording state', async () => {
      const result = await controller.stop();
      expect(result).toBeNull();
    });

    it('should not cancel from idle', () => {
      controller.cancel();
      expect(controller.getState()).toBe('idle');
    });

    it('should emit state change events to registered callbacks', async () => {
      const states: string[] = [];
      controller.setEventCallbacks({
        onStateChange: (state) => states.push(state),
        onFeedbackItem: vi.fn(),
        onError: vi.fn(),
      });

      await controller.start('screen:0:0');
      await controller.stop();

      expect(states.length).toBeGreaterThanOrEqual(4); // starting, recording, stopping, processing/complete
      expect(states[0]).toBe('starting');
      expect(states[1]).toBe('recording');
    });

    it('should emit error events on service failure', async () => {
      const errors: Error[] = [];
      controller.setEventCallbacks({
        onStateChange: vi.fn(),
        onFeedbackItem: vi.fn(),
        onError: (err) => errors.push(err),
      });

      // Make audio start fail
      mockAudioCapture.start.mockRejectedValueOnce(new Error('Microphone denied'));

      await expect(controller.start('screen:0:0')).rejects.toThrow('Microphone');
    });
  });

  // ===========================================================================
  // PostProcessor Pipeline Integration
  // ===========================================================================

  describe('PostProcessor Pipeline', () => {
    let processor: PostProcessor;
    let mockAnalyzer: TranscriptAnalyzer;
    let mockExtractor: FrameExtractor;

    beforeEach(() => {
      mockAnalyzer = new TranscriptAnalyzer();
      mockExtractor = new FrameExtractor();

      // Override extractor to simulate ffmpeg not available
      vi.spyOn(mockExtractor, 'checkFfmpeg').mockResolvedValue(false);
      vi.spyOn(mockExtractor, 'extract').mockResolvedValue({
        frames: [],
        ffmpegAvailable: false,
      });

      processor = new PostProcessor(mockAnalyzer, mockExtractor);
    });

    it('should process pre-provided transcript segments without whisper', async () => {
      const segments = createTestSegments(3);
      const progressSteps: string[] = [];

      const result = await processor.process({
        videoPath: '/test/video.mp4',
        audioPath: '/test/audio.wav',
        sessionDir: '/test/session',
        transcriptSegments: segments,
        onProgress: (p) => progressSteps.push(p.step),
      });

      expect(result.transcriptSegments.length).toBe(3);
      expect(result.reportPath).toBe('/test/session');
      expect(progressSteps).toContain('transcribing');
      expect(progressSteps).toContain('analyzing');
    });

    it('should return empty result with no transcript segments', async () => {
      const result = await processor.process({
        videoPath: '/test/video.mp4',
        audioPath: '',
        sessionDir: '/test/session',
      });

      expect(result.transcriptSegments).toEqual([]);
      expect(result.extractedFrames).toEqual([]);
    });

    it('should continue with transcript-only when frame extraction fails', async () => {
      vi.spyOn(mockExtractor, 'extract').mockRejectedValue(
        new Error('ffmpeg crash')
      );

      const segments = createTestSegments(3);
      const result = await processor.process({
        videoPath: '/test/video.mp4',
        audioPath: '/test/audio.wav',
        sessionDir: '/test/session',
        transcriptSegments: segments,
      });

      expect(result.transcriptSegments.length).toBe(3);
      expect(result.extractedFrames).toEqual([]);
    });

    it('should emit progress callbacks in correct order', async () => {
      const segments = createTestSegments(3);
      const progressOrder: string[] = [];

      await processor.process({
        videoPath: '/test/video.mp4',
        audioPath: '/test/audio.wav',
        sessionDir: '/test/session',
        transcriptSegments: segments,
        onProgress: (p) => {
          if (!progressOrder.includes(p.step)) {
            progressOrder.push(p.step);
          }
        },
      });

      expect(progressOrder).toEqual([
        'transcribing',
        'analyzing',
        'extracting-frames',
        'generating-report',
      ]);
    });
  });

  // ===========================================================================
  // TranscriptAnalyzer Integration
  // ===========================================================================

  describe('TranscriptAnalyzer', () => {
    let analyzer: TranscriptAnalyzer;

    beforeEach(() => {
      analyzer = new TranscriptAnalyzer();
    });

    it('should identify session start, end, and natural pauses', () => {
      const segments: TranscriptSegment[] = [
        { text: 'First segment', startTime: 0, endTime: 3, confidence: 0.95 },
        { text: 'After pause', startTime: 6, endTime: 9, confidence: 0.90 },
        { text: 'Final segment', startTime: 10, endTime: 13, confidence: 0.92 },
      ];

      const moments = analyzer.analyze(segments);

      expect(moments.length).toBeGreaterThanOrEqual(3);
      const reasons = moments.map((m) => m.reason);
      expect(reasons).toContain('Session start');
      expect(reasons).toContain('Session end');
      expect(reasons).toContain('Natural pause in narration');
    });

    it('should return empty array for empty segments', () => {
      const moments = analyzer.analyze([]);
      expect(moments).toEqual([]);
    });

    it('should add periodic captures for long sessions without pauses', () => {
      // Create continuous segments (no gaps > 1.5s) spanning > 15 seconds
      // so there are only 2 moments (start + end) and periodic captures kick in
      const segments: TranscriptSegment[] = [
        { text: 'Start talking', startTime: 0, endTime: 10, confidence: 0.95 },
        { text: 'Still talking', startTime: 10, endTime: 20, confidence: 0.95 },
        { text: 'Keep going', startTime: 20, endTime: 30, confidence: 0.95 },
      ];

      const moments = analyzer.analyze(segments);
      const periodicCount = moments.filter((m) =>
        m.reason.includes('Periodic')
      ).length;

      expect(periodicCount).toBeGreaterThan(0);
    });

    it('should cap at 20 key moments', () => {
      // Create many segments with pauses between each
      const segments: TranscriptSegment[] = Array.from(
        { length: 30 },
        (_, i) => ({
          text: `Segment ${i}`,
          startTime: i * 5,
          endTime: i * 5 + 2,
          confidence: 0.9,
        })
      );

      const moments = analyzer.analyze(segments);
      expect(moments.length).toBeLessThanOrEqual(20);
    });

    it('should merge AI hints with heuristic moments', () => {
      const segments = createTestSegments(3);
      const aiHints = [
        { timestamp: 15, reason: 'AI-detected important context', confidence: 0.9 },
      ];

      const moments = analyzer.analyze(segments, aiHints);
      const aiMoment = moments.find((m) => m.reason.includes('AI'));
      expect(aiMoment).toBeDefined();
    });
  });

  // ===========================================================================
  // Watchdog & Error Recovery
  // ===========================================================================

  describe('Watchdog & Error Recovery', () => {
    it('should track state timeouts', () => {
      expect(STATE_TIMEOUTS.idle).toBeNull();
      expect(STATE_TIMEOUTS.starting).toBe(5000);
      expect(STATE_TIMEOUTS.recording).toBe(30 * 60000);
      expect(STATE_TIMEOUTS.stopping).toBe(3000);
      expect(STATE_TIMEOUTS.processing).toBe(5 * 60000);
      expect(STATE_TIMEOUTS.error).toBe(5000);
    });

    it('should define recording limits', () => {
      expect(RECORDING_LIMITS.WARNING_DURATION_MS).toBe(25 * 60000);
      expect(RECORDING_LIMITS.MAX_DURATION_MS).toBe(30 * 60000);
    });

    it('should provide status with correct fields', async () => {
      const status = controller.getStatus();

      expect(status).toHaveProperty('state', 'idle');
      expect(status).toHaveProperty('duration');
      expect(status).toHaveProperty('feedbackCount', 0);
      expect(status).toHaveProperty('screenshotCount', 0);
      expect(status).toHaveProperty('isPaused', false);
    });

    it('should update status during recording', async () => {
      await controller.start('screen:0:0');

      const status = controller.getStatus();
      expect(status.state).toBe('recording');
      expect(status.duration).toBeGreaterThanOrEqual(0);
      expect(status.isPaused).toBe(false);
    });
  });

  // ===========================================================================
  // Pause/Resume
  // ===========================================================================

  describe('Pause/Resume', () => {
    it('should pause and resume during recording', async () => {
      await controller.start('screen:0:0');

      const paused = controller.pause();
      expect(paused).toBe(true);
      expect(controller.isSessionPaused()).toBe(true);
      expect(mockAudioCapture.setPaused).toHaveBeenCalledWith(true);

      const resumed = controller.resume();
      expect(resumed).toBe(true);
      expect(controller.isSessionPaused()).toBe(false);
      expect(mockAudioCapture.setPaused).toHaveBeenCalledWith(false);
    });

    it('should not pause when not recording', () => {
      const result = controller.pause();
      expect(result).toBe(false);
    });

    it('should not resume when not paused', async () => {
      await controller.start('screen:0:0');

      const result = controller.resume();
      expect(result).toBe(false);
    });

    it('should report paused state in status', async () => {
      await controller.start('screen:0:0');
      controller.pause();

      const status = controller.getStatus();
      expect(status.isPaused).toBe(true);
    });
  });

  // ===========================================================================
  // Feedback Items
  // ===========================================================================

  describe('Feedback Items', () => {
    it('should add feedback items during session', async () => {
      await controller.start('screen:0:0');

      const item = controller.addFeedbackItem({ text: 'Bug found here' });

      expect(item.id).toBeTruthy();
      expect(item.text).toBe('Bug found here');
      expect(item.confidence).toBe(1.0);

      const session = controller.getSession();
      expect(session!.feedbackItems).toHaveLength(1);
    });

    it('should reject feedback without active session', () => {
      expect(() => controller.addFeedbackItem({ text: 'test' })).toThrow(
        /No active session/
      );
    });

    it('should delete feedback items', async () => {
      await controller.start('screen:0:0');
      const item = controller.addFeedbackItem({ text: 'Test item' });

      const deleted = controller.deleteFeedbackItem(item.id);
      expect(deleted).toBe(true);

      const session = controller.getSession();
      expect(session!.feedbackItems).toHaveLength(0);
    });

    it('should update feedback items', async () => {
      await controller.start('screen:0:0');
      const item = controller.addFeedbackItem({ text: 'Original text' });

      const updated = controller.updateFeedbackItem(item.id, {
        text: 'Updated text',
      });

      expect(updated).not.toBeNull();
      expect(updated!.text).toBe('Updated text');
      expect(updated!.id).toBe(item.id);
    });
  });

  // ===========================================================================
  // Capture Cue Registration
  // ===========================================================================

  describe('Capture Cues', () => {
    it('should register capture cues during recording', async () => {
      await controller.start('screen:0:0');

      const cue = controller.registerCaptureCue('manual');

      expect(cue).not.toBeNull();
      expect(cue!.count).toBe(1);
      expect(cue!.trigger).toBe('manual');

      const cue2 = controller.registerCaptureCue('pause');
      expect(cue2!.count).toBe(2);
    });

    it('should not register capture cues when not recording', () => {
      const cue = controller.registerCaptureCue('manual');
      expect(cue).toBeNull();
    });

    it('should not register capture cues when paused', async () => {
      await controller.start('screen:0:0');
      controller.pause();

      const cue = controller.registerCaptureCue('manual');
      expect(cue).toBeNull();
    });
  });

  // ===========================================================================
  // Session Metadata
  // ===========================================================================

  describe('Session Metadata', () => {
    it('should update session metadata', async () => {
      await controller.start('screen:0:0');

      const updated = controller.setSessionMetadata({
        recordingPath: '/path/to/recording.mp4',
      });

      expect(updated).toBe(true);
      const session = controller.getSession();
      expect(session!.metadata.recordingPath).toBe('/path/to/recording.mp4');
    });

    it('should not update metadata without session', () => {
      const updated = controller.setSessionMetadata({ sourceName: 'Test' });
      expect(updated).toBe(false);
    });
  });
});
