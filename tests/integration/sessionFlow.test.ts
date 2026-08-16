/**
 * Session Flow Integration Tests
 *
 * Tests the full session lifecycle with mocked services:
 * - Complete recording session flow
 * - Transcript to screenshot matching
 * - Feedback item creation
 * - Output generation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// =============================================================================
// Mocks for Integration Testing
// =============================================================================

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
  BrowserWindow: vi.fn().mockImplementation(() => ({
    webContents: { send: vi.fn() },
    isDestroyed: vi.fn(() => false),
    destroy: vi.fn(),
  })),
  app: {
    getPath: vi.fn(() => '/tmp'),
    getName: vi.fn(() => 'markuprx'),
    getVersion: vi.fn(() => '0.4.0'),
  },
  clipboard: {
    writeText: vi.fn(),
  },
  Notification: {
    isSupported: vi.fn(() => false),
  },
}));

// =============================================================================
// Integrated Test Controller
// =============================================================================

interface TranscriptResult {
  text: string;
  isFinal: boolean;
  confidence: number;
  timestamp: number;
}

interface Screenshot {
  id: string;
  buffer: Buffer;
  width: number;
  height: number;
  timestamp: number;
}

interface FeedbackItem {
  id: string;
  timestamp: number;
  text: string;
  screenshot?: Screenshot;
  confidence: number;
}

/**
 * Integration test harness that simulates the full session flow
 */
class IntegrationTestHarness {
  private state: 'idle' | 'recording' | 'processing' | 'complete' = 'idle';
  private session: {
    id: string;
    startTime: number;
    endTime?: number;
    feedbackItems: FeedbackItem[];
    transcriptBuffer: TranscriptResult[];
    screenshotBuffer: Screenshot[];
  } | null = null;

  private events = new EventEmitter();
  private pendingScreenshots: Screenshot[] = [];
  private readonly MATCH_WINDOW_MS = 3000;

  // Service mock events
  public transcriptionEvents = new EventEmitter();
  public captureEvents = new EventEmitter();

  constructor() {
    // Set up internal event handlers
    this.transcriptionEvents.on('transcript', (result: TranscriptResult) => {
      this.handleTranscript(result);
    });

    this.transcriptionEvents.on('utteranceEnd', (_timestamp: number) => {
      this.handleUtteranceEnd();
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async start(sourceId: string): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error(`Cannot start from state: ${this.state}`);
    }

    this.session = {
      id: `session-${Date.now()}`,
      startTime: Date.now(),
      feedbackItems: [],
      transcriptBuffer: [],
      screenshotBuffer: [],
    };

    this.state = 'recording';
    this.events.emit('stateChange', this.state);
  }

  async stop(): Promise<typeof this.session> {
    if (this.state !== 'recording') {
      return null;
    }

    this.state = 'processing';

    // Process any remaining pending screenshots
    this.processPendingScreenshots();

    if (this.session) {
      this.session.endTime = Date.now();
    }

    this.state = 'complete';
    this.events.emit('stateChange', this.state);

    return this.session ? { ...this.session } : null;
  }

  reset(): void {
    this.state = 'idle';
    this.session = null;
    this.pendingScreenshots = [];
  }

  getState() {
    return this.state;
  }

  getSession() {
    return this.session;
  }

  onStateChange(callback: (state: string) => void): () => void {
    this.events.on('stateChange', callback);
    return () => this.events.off('stateChange', callback);
  }

  onFeedbackItem(callback: (item: FeedbackItem) => void): () => void {
    this.events.on('feedbackItem', callback);
    return () => this.events.off('feedbackItem', callback);
  }

  // ---------------------------------------------------------------------------
  // Simulate Events (for testing)
  // ---------------------------------------------------------------------------

  simulateTranscript(text: string, options: Partial<TranscriptResult> = {}): void {
    const result: TranscriptResult = {
      text,
      isFinal: options.isFinal ?? true,
      confidence: options.confidence ?? 0.95,
      timestamp: options.timestamp ?? Date.now() / 1000,
    };
    this.transcriptionEvents.emit('transcript', result);
  }

  simulateUtteranceEnd(): void {
    this.transcriptionEvents.emit('utteranceEnd', Date.now() / 1000);
  }

  simulateScreenshot(): Screenshot {
    const screenshot: Screenshot = {
      id: `ss-${Date.now()}`,
      buffer: Buffer.from('mock-image'),
      width: 1920,
      height: 1080,
      timestamp: Date.now(),
    };

    if (this.session) {
      this.session.screenshotBuffer.push(screenshot);
      this.pendingScreenshots.push(screenshot);
      this.tryMatchScreenshotToTranscript(screenshot);
    }

    return screenshot;
  }

  // ---------------------------------------------------------------------------
  // Internal Handlers
  // ---------------------------------------------------------------------------

  private handleTranscript(result: TranscriptResult): void {
    if (!this.session || this.state !== 'recording') {
      return;
    }

    this.session.transcriptBuffer.push(result);

    if (result.isFinal) {
      this.tryMatchTranscriptToScreenshot(result);
    }
  }

  private handleUtteranceEnd(): void {
    if (!this.session || this.state !== 'recording') {
      return;
    }

    // Utterance end triggers screenshot capture
    this.simulateScreenshot();
  }

  private tryMatchScreenshotToTranscript(screenshot: Screenshot): void {
    if (!this.session) return;

    const screenshotTimeSec = screenshot.timestamp / 1000;
    const recentTranscripts = this.session.transcriptBuffer.filter(
      (t) => t.isFinal && screenshotTimeSec - t.timestamp < this.MATCH_WINDOW_MS / 1000
    );

    if (recentTranscripts.length > 0) {
      const combinedText = recentTranscripts.map((t) => t.text).join(' ').trim();
      const avgConfidence =
        recentTranscripts.reduce((sum, t) => sum + t.confidence, 0) / recentTranscripts.length;

      const feedbackItem: FeedbackItem = {
        id: `fb-${Date.now()}`,
        timestamp: screenshot.timestamp,
        text: combinedText,
        screenshot,
        confidence: avgConfidence,
      };

      this.session.feedbackItems.push(feedbackItem);
      this.events.emit('feedbackItem', feedbackItem);

      // Remove from pending
      const idx = this.pendingScreenshots.findIndex((s) => s.id === screenshot.id);
      if (idx !== -1) {
        this.pendingScreenshots.splice(idx, 1);
      }
    }
  }

  private tryMatchTranscriptToScreenshot(result: TranscriptResult): void {
    if (!this.session || this.pendingScreenshots.length === 0) return;

    const resultTimeMs = result.timestamp * 1000;

    for (const screenshot of [...this.pendingScreenshots]) {
      if (screenshot.timestamp - resultTimeMs < this.MATCH_WINDOW_MS && screenshot.timestamp >= resultTimeMs) {
        const screenshotTimeSec = screenshot.timestamp / 1000;
        const windowTranscripts = this.session.transcriptBuffer.filter(
          (t) =>
            t.isFinal &&
            screenshotTimeSec - t.timestamp < this.MATCH_WINDOW_MS / 1000 &&
            screenshotTimeSec >= t.timestamp
        );

        const combinedText = windowTranscripts.map((t) => t.text).join(' ').trim();

        if (combinedText) {
          const avgConfidence =
            windowTranscripts.reduce((sum, t) => sum + t.confidence, 0) / windowTranscripts.length;

          const feedbackItem: FeedbackItem = {
            id: `fb-${Date.now()}`,
            timestamp: screenshot.timestamp,
            text: combinedText,
            screenshot,
            confidence: avgConfidence,
          };

          this.session.feedbackItems.push(feedbackItem);
          this.events.emit('feedbackItem', feedbackItem);

          // Remove from pending
          const idx = this.pendingScreenshots.findIndex((s) => s.id === screenshot.id);
          if (idx !== -1) {
            this.pendingScreenshots.splice(idx, 1);
          }
        }
      }
    }
  }

  private processPendingScreenshots(): void {
    if (!this.session) return;

    for (const screenshot of this.pendingScreenshots) {
      const screenshotTimeSec = screenshot.timestamp / 1000;
      const nearbyTranscripts = this.session.transcriptBuffer.filter(
        (t) => t.isFinal && Math.abs(screenshotTimeSec - t.timestamp) < (this.MATCH_WINDOW_MS * 2) / 1000
      );

      const combinedText = nearbyTranscripts.map((t) => t.text).join(' ').trim();

      const feedbackItem: FeedbackItem = {
        id: `fb-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: screenshot.timestamp,
        text: combinedText || '[No matching narration]',
        screenshot,
        confidence: nearbyTranscripts.length > 0
          ? nearbyTranscripts.reduce((sum, t) => sum + t.confidence, 0) / nearbyTranscripts.length
          : 0,
      };

      this.session.feedbackItems.push(feedbackItem);
    }

    this.pendingScreenshots = [];
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('Session Flow Integration', () => {
  let harness: IntegrationTestHarness;

  beforeEach(() => {
    harness = new IntegrationTestHarness();
  });

  afterEach(() => {
    harness.reset();
  });

  describe('Complete Session Flow', () => {
    it('should complete a full recording session', async () => {
      // Start session
      await harness.start('screen:0:0');
      expect(harness.getState()).toBe('recording');

      // Simulate some transcription
      harness.simulateTranscript('The save button is broken.');
      harness.simulateUtteranceEnd();

      // Simulate more transcription
      harness.simulateTranscript('It does not respond to clicks.');
      harness.simulateUtteranceEnd();

      // Stop session
      const session = await harness.stop();

      expect(harness.getState()).toBe('complete');
      expect(session).not.toBeNull();
      expect(session!.feedbackItems.length).toBeGreaterThan(0);
      expect(session!.endTime).toBeDefined();
    });

    it('should track state changes throughout session', async () => {
      const stateChanges: string[] = [];
      harness.onStateChange((state) => stateChanges.push(state));

      await harness.start('screen:0:0');
      await harness.stop();

      expect(stateChanges).toContain('recording');
      expect(stateChanges).toContain('complete');
    });

    it('should emit feedback items as they are created', async () => {
      const feedbackItems: FeedbackItem[] = [];
      harness.onFeedbackItem((item) => feedbackItems.push(item));

      await harness.start('screen:0:0');

      // Simulate feedback creation
      harness.simulateTranscript('First piece of feedback.');
      harness.simulateUtteranceEnd();

      await new Promise((r) => setTimeout(r, 10));

      expect(feedbackItems.length).toBeGreaterThan(0);
      expect(feedbackItems[0].text).toContain('First piece of feedback');
    });
  });

  describe('Transcript to Screenshot Matching', () => {
    it('should match screenshot to recent transcript', async () => {
      await harness.start('screen:0:0');

      // Transcript first
      harness.simulateTranscript('Testing the UI flow.');

      // Then screenshot (triggered by utterance end)
      harness.simulateUtteranceEnd();

      const session = await harness.stop();

      // Should have created a feedback item
      expect(session!.feedbackItems.length).toBe(1);
      expect(session!.feedbackItems[0].text).toContain('Testing the UI flow');
      expect(session!.feedbackItems[0].screenshot).toBeDefined();
    });

    it('should combine multiple transcripts for single screenshot', async () => {
      await harness.start('screen:0:0');

      const now = Date.now() / 1000;

      // Multiple transcripts in quick succession
      harness.simulateTranscript('First part of feedback.', { timestamp: now });
      harness.simulateTranscript('Second part continues.', { timestamp: now + 0.5 });
      harness.simulateTranscript('Third part wraps up.', { timestamp: now + 1 });

      // Then utterance end triggers screenshot
      harness.simulateUtteranceEnd();

      const session = await harness.stop();

      // Should combine into one feedback item
      expect(session!.feedbackItems.length).toBe(1);
      expect(session!.feedbackItems[0].text).toContain('First part');
      expect(session!.feedbackItems[0].text).toContain('Second part');
      expect(session!.feedbackItems[0].text).toContain('Third part');
    });

    it('should calculate average confidence from matched transcripts', async () => {
      await harness.start('screen:0:0');

      const now = Date.now() / 1000;

      harness.simulateTranscript('High confidence.', { timestamp: now, confidence: 0.98 });
      harness.simulateTranscript('Lower confidence.', { timestamp: now + 0.5, confidence: 0.82 });

      harness.simulateUtteranceEnd();

      const session = await harness.stop();

      // Average of 0.98 and 0.82 = 0.90
      expect(session!.feedbackItems[0].confidence).toBeCloseTo(0.9, 1);
    });

    it('should handle screenshots with no matching transcript', async () => {
      await harness.start('screen:0:0');

      // Screenshot without any transcript
      harness.simulateScreenshot();

      const session = await harness.stop();

      // Should still create feedback item (with placeholder text)
      expect(session!.feedbackItems.length).toBe(1);
      expect(session!.feedbackItems[0].text).toBe('[No matching narration]');
      expect(session!.feedbackItems[0].confidence).toBe(0);
    });
  });

  describe('Session Data Integrity', () => {
    it('should preserve all screenshots in buffer', async () => {
      await harness.start('screen:0:0');

      // Multiple utterance ends = multiple screenshots
      harness.simulateTranscript('First');
      harness.simulateUtteranceEnd();

      harness.simulateTranscript('Second');
      harness.simulateUtteranceEnd();

      harness.simulateTranscript('Third');
      harness.simulateUtteranceEnd();

      const session = await harness.stop();

      expect(session!.screenshotBuffer.length).toBe(3);
    });

    it('should preserve all transcripts in buffer', async () => {
      await harness.start('screen:0:0');

      harness.simulateTranscript('First transcript', { isFinal: true });
      harness.simulateTranscript('Interim text', { isFinal: false });
      harness.simulateTranscript('Second transcript', { isFinal: true });
      harness.simulateTranscript('Third transcript', { isFinal: true });

      const session = await harness.stop();

      expect(session!.transcriptBuffer.length).toBe(4);
      expect(session!.transcriptBuffer.filter((t) => t.isFinal).length).toBe(3);
    });

    it('should set correct timestamps', async () => {
      const startTime = Date.now();

      await harness.start('screen:0:0');

      await new Promise((r) => setTimeout(r, 50));

      harness.simulateTranscript('Test');
      harness.simulateUtteranceEnd();

      const session = await harness.stop();

      expect(session!.startTime).toBeGreaterThanOrEqual(startTime);
      expect(session!.endTime).toBeGreaterThan(session!.startTime);
      expect(session!.feedbackItems[0].timestamp).toBeGreaterThanOrEqual(session!.startTime);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty session (no transcripts)', async () => {
      await harness.start('screen:0:0');

      const session = await harness.stop();

      expect(session).not.toBeNull();
      expect(session!.feedbackItems).toHaveLength(0);
      expect(session!.transcriptBuffer).toHaveLength(0);
    });

    it('should handle rapid utterance ends', async () => {
      await harness.start('screen:0:0');

      // Rapid fire utterance ends
      harness.simulateTranscript('Quick');
      harness.simulateUtteranceEnd();
      harness.simulateUtteranceEnd();
      harness.simulateUtteranceEnd();

      const session = await harness.stop();

      // Should have multiple screenshots (no debounce in this simple test harness)
      expect(session!.screenshotBuffer.length).toBe(3);
    });

    it('should not accept events after stop', async () => {
      await harness.start('screen:0:0');
      await harness.stop();

      // These should be ignored
      harness.simulateTranscript('Late transcript');
      harness.simulateUtteranceEnd();

      const session = harness.getSession();

      // Session should not have the late transcript
      expect(session!.transcriptBuffer).not.toContainEqual(
        expect.objectContaining({ text: 'Late transcript' })
      );
    });

    it('should handle start after reset', async () => {
      await harness.start('screen:0:0');
      harness.simulateTranscript('First session');
      await harness.stop();

      harness.reset();

      await harness.start('screen:0:0');
      harness.simulateTranscript('Second session');

      const session = await harness.stop();

      // Should only have second session content
      expect(session!.transcriptBuffer.length).toBe(1);
      expect(session!.transcriptBuffer[0].text).toBe('Second session');
    });
  });
});
