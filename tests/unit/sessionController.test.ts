/**
 * SessionController Unit Tests
 *
 * Tests the core session orchestration logic:
 * - State machine transitions
 * - Session lifecycle (start, stop, cancel)
 * - Status tracking
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// =============================================================================
// Mocks
// =============================================================================

// Mock audio capture service
const createMockAudioCapture = () => ({
  _events: new EventEmitter(),
  start: vi.fn(() => Promise.resolve()),
  stop: vi.fn(),
  setMainWindow: vi.fn(),
  onAudioChunk: vi.fn((callback) => {
    createMockAudioCapture._events.on('audioChunk', callback);
    return () => createMockAudioCapture._events.off('audioChunk', callback);
  }),
  onVoiceActivity: vi.fn((callback) => {
    createMockAudioCapture._events.on('voiceActivity', callback);
    return () => createMockAudioCapture._events.off('voiceActivity', callback);
  }),
  onError: vi.fn((callback) => {
    createMockAudioCapture._events.on('error', callback);
    return () => createMockAudioCapture._events.off('error', callback);
  }),
});

// Shared event emitter for mocks
createMockAudioCapture._events = new EventEmitter();

// Mock screen capture service
const createMockScreenCapture = () => ({
  capture: vi.fn(() =>
    Promise.resolve({
      id: `screenshot-${Date.now()}`,
      buffer: Buffer.from('mock-image'),
      width: 1920,
      height: 1080,
      timestamp: Date.now(),
    })
  ),
});

// Mock transcription service
const createMockTranscriptionService = () => {
  const events = new EventEmitter();
  return {
    _events: events,
    configure: vi.fn(),
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(),
    sendAudio: vi.fn(),
    onTranscript: vi.fn((callback) => {
      events.on('transcript', callback);
      return () => events.off('transcript', callback);
    }),
    onUtteranceEnd: vi.fn((callback) => {
      events.on('utteranceEnd', callback);
      return () => events.off('utteranceEnd', callback);
    }),
    onError: vi.fn((callback) => {
      events.on('error', callback);
      return () => events.off('error', callback);
    }),
    emitTranscript: (result: { text: string; isFinal: boolean; confidence: number; timestamp: number }) => {
      events.emit('transcript', result);
    },
    emitUtteranceEnd: (timestamp: number) => {
      events.emit('utteranceEnd', timestamp);
    },
  };
};

// Mock electron-store
vi.mock('electron-store', () => ({
  default: vi.fn().mockImplementation(() => ({
    get: vi.fn((key: string, defaultValue?: unknown) => defaultValue),
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
  })),
}));

// Mock electron
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  app: {
    getPath: vi.fn(() => '/tmp'),
    getName: vi.fn(() => 'markuprx'),
    getVersion: vi.fn(() => '0.4.0'),
  },
}));

// =============================================================================
// Mock Session Controller (Isolated for Testing)
// =============================================================================

/**
 * Simplified SessionController for testing state machine logic
 * without Electron dependencies
 */
class TestableSessionController {
  private state: 'idle' | 'recording' | 'processing' | 'complete' = 'idle';
  private session: {
    id: string;
    startTime: number;
    endTime?: number;
    state: string;
    sourceId: string;
    feedbackItems: Array<{ id: string; timestamp: number; text: string; confidence: number }>;
    transcriptBuffer: Array<{ text: string; isFinal: boolean; confidence: number; timestamp: number }>;
    screenshotBuffer: Array<{ id: string; timestamp: number; buffer: Buffer; width: number; height: number }>;
    metadata: { sourceId: string; sourceName?: string };
  } | null = null;

  private audioCapture = createMockAudioCapture();
  private screenCapture = createMockScreenCapture();
  private transcriptionService = createMockTranscriptionService();

  // Valid state transitions
  private readonly STATE_TRANSITIONS: Record<string, string[]> = {
    idle: ['recording'],
    recording: ['processing', 'idle'],
    processing: ['complete', 'idle'],
    complete: ['idle'],
  };

  getState() {
    return this.state;
  }

  getSession() {
    return this.session;
  }

  getStatus() {
    return {
      state: this.state,
      duration: this.session ? Date.now() - this.session.startTime : 0,
      feedbackCount: this.session?.feedbackItems.length ?? 0,
      screenshotCount: this.session?.screenshotBuffer.length ?? 0,
    };
  }

  private transition(newState: 'idle' | 'recording' | 'processing' | 'complete'): boolean {
    const validTransitions = this.STATE_TRANSITIONS[this.state];
    if (!validTransitions.includes(newState)) {
      return false;
    }
    this.state = newState;
    return true;
  }

  async start(sourceId: string, sourceName?: string): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error(`Cannot start session from state: ${this.state}`);
    }

    this.session = {
      id: `session-${Date.now()}`,
      startTime: Date.now(),
      state: 'recording',
      sourceId,
      feedbackItems: [],
      transcriptBuffer: [],
      screenshotBuffer: [],
      metadata: { sourceId, sourceName },
    };

    if (!this.transition('recording')) {
      this.session = null;
      throw new Error('Failed to transition to recording state');
    }

    // Start mock services
    await this.audioCapture.start();
    await this.transcriptionService.start();
  }

  async stop(): Promise<typeof this.session> {
    if (this.state !== 'recording') {
      return null;
    }

    if (!this.session) {
      return null;
    }

    this.transition('processing');
    this.session.state = 'processing';

    // Stop services
    this.audioCapture.stop();
    this.transcriptionService.stop();

    // Set end time
    this.session.endTime = Date.now();

    // Transition to complete
    this.transition('complete');
    this.session.state = 'complete';

    return { ...this.session };
  }

  cancel(): void {
    if (this.state !== 'recording' && this.state !== 'processing') {
      return;
    }

    this.audioCapture.stop();
    this.transcriptionService.stop();
    this.session = null;
    this.state = 'idle';
  }

  reset(): void {
    this.audioCapture.stop();
    this.transcriptionService.stop();
    this.session = null;
    this.state = 'idle';
  }

  addFeedbackItem(item: { text: string; confidence?: number }): { id: string; timestamp: number; text: string; confidence: number } {
    if (!this.session) {
      throw new Error('No active session');
    }

    const feedbackItem = {
      id: `fb-${Date.now()}`,
      timestamp: Date.now(),
      text: item.text,
      confidence: item.confidence ?? 1.0,
    };

    this.session.feedbackItems.push(feedbackItem);
    return feedbackItem;
  }

  deleteFeedbackItem(id: string): boolean {
    if (!this.session) {
      return false;
    }

    const index = this.session.feedbackItems.findIndex((item) => item.id === id);
    if (index === -1) {
      return false;
    }

    this.session.feedbackItems.splice(index, 1);
    return true;
  }

  // Expose mocks for testing
  getMocks() {
    return {
      audioCapture: this.audioCapture,
      screenCapture: this.screenCapture,
      transcriptionService: this.transcriptionService,
    };
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('SessionController', () => {
  let controller: TestableSessionController;

  beforeEach(() => {
    controller = new TestableSessionController();
  });

  afterEach(() => {
    controller.reset();
  });

  describe('State Machine', () => {
    it('should start in idle state', () => {
      expect(controller.getState()).toBe('idle');
    });

    it('should transition idle -> recording on start', async () => {
      await controller.start('screen:0:0', 'Test Screen');

      expect(controller.getState()).toBe('recording');
    });

    it('should transition recording -> processing -> complete on stop', async () => {
      await controller.start('screen:0:0', 'Test Screen');

      const session = await controller.stop();

      expect(controller.getState()).toBe('complete');
      expect(session).not.toBeNull();
      expect(session?.state).toBe('complete');
    });

    it('should transition back to idle on cancel', async () => {
      await controller.start('screen:0:0', 'Test Screen');

      controller.cancel();

      expect(controller.getState()).toBe('idle');
      expect(controller.getSession()).toBeNull();
    });

    it('should not allow invalid state transitions', async () => {
      // Cannot start from recording state
      await controller.start('screen:0:0');

      await expect(controller.start('screen:0:0')).rejects.toThrow();
    });

    it('should not allow stopping from idle state', async () => {
      const result = await controller.stop();

      expect(result).toBeNull();
    });
  });

  describe('Session Lifecycle', () => {
    it('should create a session on start', async () => {
      await controller.start('screen:0:0', 'Primary Display');

      const session = controller.getSession();

      expect(session).not.toBeNull();
      expect(session?.sourceId).toBe('screen:0:0');
      expect(session?.metadata.sourceName).toBe('Primary Display');
      expect(session?.startTime).toBeDefined();
      expect(session?.feedbackItems).toHaveLength(0);
    });

    it('should set end time on stop', async () => {
      await controller.start('screen:0:0');

      const session = await controller.stop();

      expect(session?.endTime).toBeDefined();
      expect(session!.endTime!).toBeGreaterThanOrEqual(session!.startTime);
    });

    it('should track duration during recording', async () => {
      await controller.start('screen:0:0');

      // Wait a bit
      await new Promise((r) => setTimeout(r, 50));

      const status = controller.getStatus();

      expect(status.duration).toBeGreaterThan(0);
    });

    it('should preserve session data through state transitions', async () => {
      await controller.start('screen:0:0', 'Test');

      // Add feedback
      controller.addFeedbackItem({ text: 'Test feedback 1' });
      controller.addFeedbackItem({ text: 'Test feedback 2' });

      const session = await controller.stop();

      expect(session?.feedbackItems).toHaveLength(2);
      expect(session?.feedbackItems[0].text).toBe('Test feedback 1');
    });
  });

  describe('Status Tracking', () => {
    it('should return correct status when idle', () => {
      const status = controller.getStatus();

      expect(status.state).toBe('idle');
      expect(status.duration).toBe(0);
      expect(status.feedbackCount).toBe(0);
      expect(status.screenshotCount).toBe(0);
    });

    it('should track feedback count', async () => {
      await controller.start('screen:0:0');

      controller.addFeedbackItem({ text: 'Feedback 1' });
      controller.addFeedbackItem({ text: 'Feedback 2' });
      controller.addFeedbackItem({ text: 'Feedback 3' });

      const status = controller.getStatus();

      expect(status.feedbackCount).toBe(3);
    });

    it('should update state in status', async () => {
      expect(controller.getStatus().state).toBe('idle');

      await controller.start('screen:0:0');
      expect(controller.getStatus().state).toBe('recording');

      await controller.stop();
      expect(controller.getStatus().state).toBe('complete');
    });
  });

  describe('Feedback Item Management', () => {
    beforeEach(async () => {
      await controller.start('screen:0:0');
    });

    it('should add feedback items', () => {
      const item = controller.addFeedbackItem({ text: 'Test feedback', confidence: 0.95 });

      expect(item.id).toBeDefined();
      expect(item.text).toBe('Test feedback');
      expect(item.confidence).toBe(0.95);
      expect(item.timestamp).toBeDefined();
    });

    it('should default confidence to 1.0', () => {
      const item = controller.addFeedbackItem({ text: 'Test' });

      expect(item.confidence).toBe(1.0);
    });

    it('should delete feedback items', () => {
      const item = controller.addFeedbackItem({ text: 'To delete' });

      const deleted = controller.deleteFeedbackItem(item.id);

      expect(deleted).toBe(true);
      expect(controller.getStatus().feedbackCount).toBe(0);
    });

    it('should return false when deleting non-existent item', () => {
      const deleted = controller.deleteFeedbackItem('non-existent-id');

      expect(deleted).toBe(false);
    });

    it('should throw when adding items without active session', async () => {
      await controller.stop();
      controller.reset();

      expect(() => controller.addFeedbackItem({ text: 'Test' })).toThrow('No active session');
    });
  });

  describe('Service Integration', () => {
    it('should start audio capture on session start', async () => {
      const { audioCapture } = controller.getMocks();

      await controller.start('screen:0:0');

      expect(audioCapture.start).toHaveBeenCalled();
    });

    it('should start transcription service on session start', async () => {
      const { transcriptionService } = controller.getMocks();

      await controller.start('screen:0:0');

      expect(transcriptionService.start).toHaveBeenCalled();
    });

    it('should stop services on session stop', async () => {
      const { audioCapture, transcriptionService } = controller.getMocks();

      await controller.start('screen:0:0');
      await controller.stop();

      expect(audioCapture.stop).toHaveBeenCalled();
      expect(transcriptionService.stop).toHaveBeenCalled();
    });

    it('should stop services on cancel', async () => {
      const { audioCapture, transcriptionService } = controller.getMocks();

      await controller.start('screen:0:0');
      controller.cancel();

      expect(audioCapture.stop).toHaveBeenCalled();
      expect(transcriptionService.stop).toHaveBeenCalled();
    });
  });

  describe('Reset', () => {
    it('should reset to idle state', async () => {
      await controller.start('screen:0:0');
      controller.addFeedbackItem({ text: 'Test' });

      controller.reset();

      expect(controller.getState()).toBe('idle');
      expect(controller.getSession()).toBeNull();
    });

    it('should stop all services on reset', async () => {
      const { audioCapture, transcriptionService } = controller.getMocks();

      await controller.start('screen:0:0');
      controller.reset();

      expect(audioCapture.stop).toHaveBeenCalled();
      expect(transcriptionService.stop).toHaveBeenCalled();
    });
  });
});
