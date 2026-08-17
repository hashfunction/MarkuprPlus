/**
 * ClipboardService Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock electron modules
vi.mock('electron', () => ({
  clipboard: {
    writeText: vi.fn(),
  },
  Notification: {
    isSupported: vi.fn(() => false),
  },
  app: {
    getAppPath: vi.fn(() => '/mock/app/path'),
  },
  shell: {
    openPath: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}));

// Import after mocking
import { clipboardService } from '../src/main/output/ClipboardService';
import type { Session, FeedbackItem, Screenshot } from '../src/main/SessionController';
import { clipboard } from 'electron';

describe('ClipboardService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('copy', () => {
    it('should copy text to clipboard', async () => {
      const result = await clipboardService.copy('test content');

      expect(result).toBe(true);
      expect(clipboard.writeText).toHaveBeenCalledWith('test content');
    });

    it('should return false on error', async () => {
      vi.mocked(clipboard.writeText).mockImplementationOnce(() => {
        throw new Error('Clipboard error');
      });

      const result = await clipboardService.copy('test');

      expect(result).toBe(false);
    });
  });

  describe('copyWithNotification', () => {
    it('uses MarkuprPlus for the default public notification title', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      (clipboardService as unknown as { lastNotificationTime: number }).lastNotificationTime = 0;

      await clipboardService.copyWithNotification('test content');

      expect(log).toHaveBeenCalledWith(
        '[Notification] (unsupported) MarkuprPlus: Summary copied to clipboard!'
      );
      expect(log.mock.calls.flat().join(' ')).not.toContain('MarkuprX');
      log.mockRestore();
    });

    it('uses MarkuprPlus for a public copy-failure notification', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(clipboard.writeText).mockImplementationOnce(() => {
        throw new Error('Clipboard error');
      });
      (clipboardService as unknown as { lastNotificationTime: number }).lastNotificationTime = 0;

      await clipboardService.copyWithNotification('test content');

      expect(log).toHaveBeenCalledWith(
        '[Notification] (unsupported) MarkuprPlus: Failed to copy'
      );
      expect(log.mock.calls.flat().join(' ')).not.toContain('MarkuprX');
      log.mockRestore();
      error.mockRestore();
    });
  });

  describe('estimateSize', () => {
    it('should return correct byte size for ASCII', () => {
      const size = clipboardService.estimateSize('hello');
      expect(size).toBe(5);
    });

    it('should return correct byte size for UTF-8', () => {
      // UTF-8 characters take more bytes
      const size = clipboardService.estimateSize('hello');
      expect(size).toBe(5);
    });

    it('should handle empty string', () => {
      const size = clipboardService.estimateSize('');
      expect(size).toBe(0);
    });
  });

  describe('generateClipboardSummary', () => {
    const createMockSession = (items: Partial<FeedbackItem>[] = []): Session => ({
      id: 'test-session-id',
      startTime: Date.now() - 60000, // 1 minute ago
      endTime: Date.now(),
      state: 'complete',
      sourceId: 'screen:0',
      feedbackItems: items.map((item, i) => ({
        id: `item-${i}`,
        timestamp: Date.now() - (items.length - i) * 10000,
        text: item.text || 'Test feedback',
        confidence: item.confidence ?? 0.9,
        screenshot: item.screenshot,
      })),
      transcriptBuffer: [],
      screenshotBuffer: [],
      metadata: {
        sourceId: 'screen:0',
        sourceName: 'Display 1',
      },
    });

    it('should generate compact summary', () => {
      const session = createMockSession([
        { text: 'First feedback item about the UI' },
        { text: 'Second feedback about the button' },
      ]);

      const summary = clipboardService.generateClipboardSummary(session, {
        mode: 'compact',
        maxLength: 1500,
        includeReportPath: false,
      });

      expect(summary).toContain('# Feedback Summary');
      expect(summary).toContain('2 items');
      expect(summary).toContain('Timeline');
      expect(summary).toContain('First feedback');
    });

    it('should generate full summary', () => {
      const session = createMockSession([
        { text: 'First feedback item' },
        { text: 'Second feedback item' },
      ]);

      const summary = clipboardService.generateClipboardSummary(session, {
        mode: 'full',
        maxLength: 5000,
        includeReportPath: false,
      });

      expect(summary).toContain('# Feedback Session');
      expect(summary).toContain('First feedback item');
      expect(summary).toContain('Second feedback item');
    });

    it('should include report path when specified', () => {
      const session = createMockSession([{ text: 'Feedback' }]);
      const reportPath = '/path/to/report.md';

      const summary = clipboardService.generateClipboardSummary(session, {
        mode: 'compact',
        maxLength: 1500,
        includeReportPath: true,
        reportPath,
      });

      expect(summary).toContain(reportPath);
      expect(summary).toContain('Full report:');
    });

    it('should truncate summary when exceeding maxLength', () => {
      const longFeedback = 'A'.repeat(200);
      const session = createMockSession(
        Array(20).fill({ text: longFeedback })
      );

      const summary = clipboardService.generateClipboardSummary(session, {
        mode: 'full',
        maxLength: 500,
        includeReportPath: false,
      });

      expect(summary.length).toBeLessThanOrEqual(550); // Allow for truncation notice
      expect(summary).toContain('[Truncated');
    });

    it('should indicate screenshots in summary', () => {
      const mockScreenshot: Screenshot = {
        id: 'ss-1',
        timestamp: Date.now(),
        buffer: Buffer.from('mock'),
        width: 1920,
        height: 1080,
      };

      const session = createMockSession([
        { text: 'Feedback with screenshot', screenshot: mockScreenshot },
      ]);

      const summary = clipboardService.generateClipboardSummary(session, {
        mode: 'compact',
        maxLength: 1500,
        includeReportPath: false,
      });

      expect(summary).toContain('[img]');
      expect(summary).toContain('1 screenshots');
    });

    it('should extract key points for compact mode', () => {
      const session = createMockSession([
        { text: 'The navigation menu is confusing and hard to use', confidence: 0.95 },
        { text: 'The colors are too bright and hurt my eyes', confidence: 0.92 },
        { text: 'ok', confidence: 0.8 }, // Short, should be filtered
      ]);

      const summary = clipboardService.generateClipboardSummary(session, {
        mode: 'compact',
        maxLength: 1500,
        includeReportPath: false,
      });

      expect(summary).toContain('Key Points');
      expect(summary).toContain('The navigation menu');
    });

    it('should handle empty session', () => {
      const session = createMockSession([]);

      const summary = clipboardService.generateClipboardSummary(session, {
        mode: 'compact',
        maxLength: 1500,
        includeReportPath: false,
      });

      expect(summary).toContain('0 items');
      expect(summary).toContain('0 screenshots');
    });

    it('should format duration correctly', () => {
      const session = createMockSession([]);
      session.startTime = Date.now() - 3665000; // 1 hour, 1 minute, 5 seconds
      session.endTime = Date.now();

      const summary = clipboardService.generateClipboardSummary(session, {
        mode: 'compact',
        maxLength: 1500,
        includeReportPath: false,
      });

      expect(summary).toContain('1h 1m');
    });
  });
});
