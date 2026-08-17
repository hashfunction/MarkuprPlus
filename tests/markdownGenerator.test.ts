/**
 * MarkdownGenerator Tests
 *
 * Tests for the llms.txt-inspired markdown output generator.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MarkdownGenerator,
  markdownGenerator,
  adaptFeedbackSession,
  type Session,
  type FeedbackItem,
  type GenerateOptions,
} from '../src/main/output/MarkdownGenerator';
import type { FeedbackSession, Screenshot, TranscriptionSegment } from '../src/shared/types';

describe('MarkdownGenerator', () => {
  let generator: MarkdownGenerator;

  beforeEach(() => {
    generator = new MarkdownGenerator();
  });

  describe('generateFeedbackItemId', () => {
    it('should generate FB-001 format IDs', () => {
      expect(generator.generateFeedbackItemId(0)).toBe('FB-001');
      expect(generator.generateFeedbackItemId(1)).toBe('FB-002');
      expect(generator.generateFeedbackItemId(9)).toBe('FB-010');
      expect(generator.generateFeedbackItemId(99)).toBe('FB-100');
    });
  });

  describe('generateFullDocument', () => {
    const mockSession: Session = {
      id: 'test-session-123',
      startTime: new Date('2024-01-15T10:00:00').getTime(),
      endTime: new Date('2024-01-15T10:05:30').getTime(),
      feedbackItems: [
        {
          id: 'item-1',
          transcription: 'The button is broken and does not submit the form.',
          timestamp: new Date('2024-01-15T10:00:30').getTime(),
          screenshots: [
            {
              id: 'ss-1',
              timestamp: new Date('2024-01-15T10:00:35').getTime(),
              imagePath: '/tmp/ss-1.png',
              width: 1920,
              height: 1080,
            },
          ],
          category: 'Bug',
        },
        {
          id: 'item-2',
          transcription: 'This form is confusing. The labels are unclear.',
          timestamp: new Date('2024-01-15T10:02:00').getTime(),
          screenshots: [],
          category: 'UX Issue',
        },
        {
          id: 'item-3',
          transcription: 'It would be nice if there was a dark mode option.',
          timestamp: new Date('2024-01-15T10:04:00').getTime(),
          screenshots: [
            {
              id: 'ss-2',
              timestamp: new Date('2024-01-15T10:04:05').getTime(),
              imagePath: '/tmp/ss-2.png',
              width: 1920,
              height: 1080,
            },
            {
              id: 'ss-3',
              timestamp: new Date('2024-01-15T10:04:10').getTime(),
              imagePath: '/tmp/ss-3.png',
              width: 1920,
              height: 1080,
            },
          ],
          category: 'Suggestion',
        },
      ],
      metadata: {
        os: 'darwin',
        sourceName: 'TestApp',
        sourceType: 'window',
      },
    };

    const defaultOptions: GenerateOptions = {
      projectName: 'TestApp',
      screenshotDir: './screenshots',
    };

    it('should generate a complete markdown document', () => {
      const result = generator.generateFullDocument(mockSession, defaultOptions);

      expect(result.content).toContain('# TestApp Feedback Report');
      expect(result.content).toContain('Duration: 5:30');
      expect(result.content).toContain('Items: 3');
      expect(result.content).toContain('Screenshots: 3');
    });

    it('should include session context', () => {
      const result = generator.generateFullDocument(mockSession, defaultOptions);

      expect(result.content).toContain('**Session ID:** `test-session-123`');
      expect(result.content).toContain('darwin');
      expect(result.content).toContain('TestApp');
    });

    it('should format feedback items with FB-XXX IDs', () => {
      const result = generator.generateFullDocument(mockSession, defaultOptions);

      expect(result.content).toContain('### FB-001:');
      expect(result.content).toContain('### FB-002:');
      expect(result.content).toContain('### FB-003:');
    });

    it('should include transcription in blockquote', () => {
      const result = generator.generateFullDocument(mockSession, defaultOptions);

      expect(result.content).toContain('> The button is broken');
    });

    it('should include category/type for each item', () => {
      const result = generator.generateFullDocument(mockSession, defaultOptions);

      expect(result.content).toContain('**Type:** Bug');
      expect(result.content).toContain('**Type:** UX Issue');
      expect(result.content).toContain('**Type:** Suggestion');
    });

    it('should include screenshot references', () => {
      const result = generator.generateFullDocument(mockSession, defaultOptions);

      expect(result.content).toContain('![FB-001](./screenshots/fb-001.png)');
      expect(result.content).toContain('![FB-003-1](./screenshots/fb-003-1.png)');
      expect(result.content).toContain('![FB-003-2](./screenshots/fb-003-2.png)');
    });

    it('should include summary table', () => {
      const result = generator.generateFullDocument(mockSession, defaultOptions);

      expect(result.content).toContain('## Summary');
      expect(result.content).toContain('| Bug | 1 |');
      expect(result.content).toContain('| UX Issue | 1 |');
      expect(result.content).toContain('| Suggestion | 1 |');
      expect(result.content).toContain('| **Total** | **3** |');
    });

    it('should generate correct filename', () => {
      const result = generator.generateFullDocument(mockSession, defaultOptions);

      expect(result.filename).toMatch(/^testapp-feedback-\d{8}-\d{6}\.md$/);
    });

    it('should return correct metadata', () => {
      const result = generator.generateFullDocument(mockSession, defaultOptions);

      expect(result.metadata.itemCount).toBe(3);
      expect(result.metadata.screenshotCount).toBe(3);
      expect(result.metadata.duration).toBe(5.5 * 60 * 1000); // 5:30 in ms
      expect(result.metadata.types).toEqual({
        Bug: 1,
        'UX Issue': 1,
        Suggestion: 1,
      });
    });

    it('should handle empty session', () => {
      const emptySession: Session = {
        id: 'empty-session',
        startTime: Date.now(),
        endTime: Date.now() + 1000,
        feedbackItems: [],
      };

      const result = generator.generateFullDocument(emptySession, defaultOptions);

      expect(result.content).toContain('# TestApp Feedback Report');
      expect(result.content).toContain('_No feedback items were captured during this session._');
      expect(result.content).not.toContain('## Actionable Feedback');
      expect(result.metadata.itemCount).toBe(0);
      expect(result.metadata.screenshotCount).toBe(0);
    });

    it('should handle special characters in project name', () => {
      const options = {
        projectName: "Eddie's App (Beta)",
        screenshotDir: './screenshots',
      };

      const result = generator.generateFullDocument(mockSession, options);

      expect(result.content).toContain("# Eddie's App (Beta) Feedback Report");
      // Special chars get converted to dashes, consecutive dashes get collapsed
      expect(result.filename).toMatch(/^eddie-s-app-beta--feedback-/);
    });
  });

  describe('generateClipboardSummary', () => {
    const mockSession: Session = {
      id: 'test-session',
      startTime: Date.now() - 60000,
      endTime: Date.now(),
      feedbackItems: [
        {
          id: '1',
          transcription: 'First feedback item about a bug.',
          timestamp: Date.now() - 50000,
          screenshots: [],
          category: 'Bug',
        },
        {
          id: '2',
          transcription: 'Second feedback item about UX.',
          timestamp: Date.now() - 40000,
          screenshots: [],
          category: 'UX Issue',
        },
        {
          id: '3',
          transcription: 'Third feedback item suggestion.',
          timestamp: Date.now() - 30000,
          screenshots: [],
          category: 'Suggestion',
        },
        {
          id: '4',
          transcription: 'Fourth feedback item question.',
          timestamp: Date.now() - 20000,
          screenshots: [],
          category: 'Question',
        },
      ],
      metadata: {
        sourceName: 'MyApp',
      },
    };

    it('should generate summary under 1500 chars', () => {
      const summary = generator.generateClipboardSummary(mockSession, 'MyApp');

      expect(summary.length).toBeLessThanOrEqual(1500);
    });

    it('should include project name and item count', () => {
      const summary = generator.generateClipboardSummary(mockSession, 'MyApp');

      expect(summary).toContain('# Feedback: MyApp - 4 items');
    });

    it('should show first 3 items as priority', () => {
      const summary = generator.generateClipboardSummary(mockSession, 'MyApp');

      expect(summary).toContain('## Priority Items');
      expect(summary).toContain('FB-001');
      expect(summary).toContain('FB-002');
      expect(summary).toContain('FB-003');
    });

    it('should reference remaining items', () => {
      const summary = generator.generateClipboardSummary(mockSession, 'MyApp');

      expect(summary).toContain('## Other');
      expect(summary).toContain('FB-004');
      expect(summary).toContain('see full report');
    });

    it('should include link to full report', () => {
      const summary = generator.generateClipboardSummary(mockSession, 'MyApp');

      expect(summary).toContain('**Full report:** ./feedback-report.md');
    });

    it('should use sourceName when projectName not provided', () => {
      const summary = generator.generateClipboardSummary(mockSession);

      expect(summary).toContain('# Feedback: MyApp');
    });
  });

  describe('singleton export', () => {
    it('should export a singleton instance', () => {
      expect(markdownGenerator).toBeDefined();
      expect(markdownGenerator.generateFeedbackItemId(0)).toBe('FB-001');
    });
  });
});

describe('adaptFeedbackSession', () => {
  it('should convert FeedbackSession to Session', () => {
    const feedbackSession: FeedbackSession = {
      id: 'test-123',
      startedAt: Date.now() - 60000,
      endedAt: Date.now(),
      status: 'complete',
      screenshots: [
        {
          id: 'ss-1',
          timestamp: Date.now() - 30000,
          imagePath: '/tmp/ss1.png',
          width: 1920,
          height: 1080,
        },
      ],
      transcription: [
        {
          id: 'seg-1',
          text: 'This is broken.',
          startTime: Date.now() - 50000,
          endTime: Date.now() - 45000,
          confidence: 0.95,
          isFinal: true,
        },
        {
          id: 'seg-2',
          text: 'It should work better.',
          startTime: Date.now() - 44000,
          endTime: Date.now() - 40000,
          confidence: 0.92,
          isFinal: true,
        },
      ],
    };

    const session = adaptFeedbackSession(feedbackSession);

    expect(session.id).toBe('test-123');
    expect(session.startTime).toBe(feedbackSession.startedAt);
    expect(session.endTime).toBe(feedbackSession.endedAt);
    expect(session.metadata?.sourceName).toBe('MarkuprPlus Session');
    expect(session.feedbackItems.length).toBeGreaterThan(0);
  });

  it('should group transcription segments by pause threshold', () => {
    const now = Date.now();
    const feedbackSession: FeedbackSession = {
      id: 'test-456',
      startedAt: now - 60000,
      status: 'complete',
      screenshots: [],
      transcription: [
        {
          id: 'seg-1',
          text: 'First thought.',
          startTime: now - 50000,
          endTime: now - 48000,
          confidence: 0.95,
          isFinal: true,
        },
        {
          id: 'seg-2',
          text: 'Still first thought.',
          startTime: now - 47000, // Close to previous - same item
          endTime: now - 45000,
          confidence: 0.95,
          isFinal: true,
        },
        {
          id: 'seg-3',
          text: 'New thought after pause.',
          startTime: now - 30000, // Big gap - new item
          endTime: now - 28000,
          confidence: 0.95,
          isFinal: true,
        },
      ],
    };

    const session = adaptFeedbackSession(feedbackSession, { pauseThresholdMs: 5000 });

    expect(session.feedbackItems.length).toBe(2);
    expect(session.feedbackItems[0].transcription).toContain('First thought');
    expect(session.feedbackItems[0].transcription).toContain('Still first thought');
    expect(session.feedbackItems[1].transcription).toContain('New thought');
  });

  it('should infer category from transcription text', () => {
    const now = Date.now();
    const feedbackSession: FeedbackSession = {
      id: 'test-789',
      startedAt: now - 60000,
      status: 'complete',
      screenshots: [],
      transcription: [
        {
          id: 'seg-1',
          text: 'This feature is broken and crashes.',
          startTime: now - 50000,
          endTime: now - 48000,
          confidence: 0.95,
          isFinal: true,
        },
      ],
    };

    const session = adaptFeedbackSession(feedbackSession);

    expect(session.feedbackItems[0].category).toBe('Bug');
  });

  it('should handle empty transcription', () => {
    const feedbackSession: FeedbackSession = {
      id: 'empty-test',
      startedAt: Date.now(),
      status: 'complete',
      screenshots: [],
      transcription: [],
    };

    const session = adaptFeedbackSession(feedbackSession);

    expect(session.feedbackItems).toHaveLength(0);
  });
});
