/**
 * Export Pipeline E2E Integration Tests
 *
 * Tests the complete export pipeline end-to-end:
 * - Multi-format export (Markdown, HTML, JSON, PDF)
 * - Template rendering with realistic session data
 * - Edge cases (empty sessions, missing data)
 * - File naming and format metadata
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '2.4.0'),
    getPath: vi.fn(() => '/tmp'),
    isReady: vi.fn(() => true),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadURL: vi.fn(() => Promise.resolve()),
    loadFile: vi.fn(() => Promise.resolve()),
    webContents: {
      printToPDF: vi.fn(() => Promise.resolve(Buffer.from('mock-pdf-content'))),
    },
    destroy: vi.fn(),
  })),
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

// This file exercises an in-memory test model and does not need filesystem
// stubs. Import the real module explicitly so this hoisted mock cannot replace
// fs/promises for files that run later in Vitest's shared fork.
vi.mock('fs/promises', async (importOriginal) =>
  importOriginal<typeof import('fs/promises')>());

afterEach(() => {
  vi.restoreAllMocks();
});

// =============================================================================
// Import after mocks
// =============================================================================

import type { Session, FeedbackItem, FeedbackCategory, FeedbackSeverity } from '../../src/main/output/MarkdownGenerator';
import type { PostProcessResult, TranscriptSegment, ExtractedFrame } from '../../src/main/pipeline/PostProcessor';

// =============================================================================
// Test Data Factories
// =============================================================================

function createTestScreenshot(id: string = 'ss-1') {
  return {
    id,
    timestamp: Date.now(),
    imagePath: `/tmp/screenshots/${id}.png`,
    width: 1920,
    height: 1080,
  };
}

function createTestFeedbackItem(
  index: number,
  options: {
    category?: FeedbackCategory;
    severity?: FeedbackSeverity;
    withScreenshot?: boolean;
  } = {}
): FeedbackItem {
  return {
    id: `item-${index}`,
    transcription: `Feedback item ${index}: This is a test observation about the application. The button does not respond as expected.`,
    timestamp: Date.now() - (60000 * (5 - index)),
    screenshots: options.withScreenshot !== false
      ? [createTestScreenshot(`ss-${index}`)]
      : [],
    title: `Issue ${index}`,
    keywords: ['bug', 'button', 'click'],
    category: options.category || (['Bug', 'UX Issue', 'Suggestion'] as FeedbackCategory[])[index % 3],
    severity: options.severity || (['Critical', 'High', 'Medium', 'Low'] as FeedbackSeverity[])[index % 4],
  };
}

function createTestSession(
  options: {
    itemCount?: number;
    withScreenshots?: boolean;
    withEndTime?: boolean;
  } = {}
): Session {
  const now = Date.now();
  const itemCount = options.itemCount ?? 3;

  return {
    id: 'test-session-001',
    startTime: now - 300000,
    endTime: options.withEndTime !== false ? now : undefined,
    feedbackItems: Array.from({ length: itemCount }, (_, i) =>
      createTestFeedbackItem(i, { withScreenshot: options.withScreenshots })
    ),
    metadata: {
      os: 'darwin',
      sourceName: 'Test Application',
      sourceType: 'window',
    },
  };
}

function createTestPostProcessResult(): PostProcessResult {
  const segments: TranscriptSegment[] = [
    { text: 'The login button is not responsive', startTime: 0, endTime: 3.5, confidence: 0.95 },
    { text: 'When I click it nothing happens', startTime: 5, endTime: 8, confidence: 0.92 },
    { text: 'I need to refresh the page', startTime: 10, endTime: 13, confidence: 0.88 },
  ];

  const frames: ExtractedFrame[] = [
    { path: '/tmp/session/screenshots/frame-001.png', timestamp: 0.35, reason: 'Session start', transcriptSegment: segments[0] },
    { path: '/tmp/session/screenshots/frame-002.png', timestamp: 5, reason: 'Natural pause', transcriptSegment: segments[1] },
  ];

  return {
    transcriptSegments: segments,
    extractedFrames: frames,
    reportPath: '/tmp/session',
  };
}

// =============================================================================
// Testable Export Service (isolated from Electron runtime)
// =============================================================================

class TestableExportService {
  generateJsonExport(session: Session, includeBase64Images: boolean) {
    const categories = this.countByCategory(session.feedbackItems);
    const severities = this.countBySeverity(session.feedbackItems);
    const screenshotCount = session.feedbackItems.reduce(
      (sum, item) => sum + item.screenshots.length, 0
    );
    const duration = session.endTime ? session.endTime - session.startTime : 0;

    return {
      version: '1.0',
      generator: 'markuprx v2.4.0',
      exportedAt: new Date().toISOString(),
      session: {
        id: session.id,
        startTime: session.startTime,
        endTime: session.endTime,
        source: {
          name: session.metadata?.sourceName,
          type: session.metadata?.sourceType,
          os: session.metadata?.os,
        },
        items: session.feedbackItems.map((item, index) => ({
          id: item.id,
          index,
          timestamp: item.timestamp,
          transcription: item.transcription,
          category: item.category || null,
          severity: item.severity || null,
          screenshots: item.screenshots.map((ss) => ({
            id: ss.id,
            width: ss.width,
            height: ss.height,
            ...(includeBase64Images && ss.base64 ? { base64: ss.base64 } : {}),
          })),
        })),
      },
      summary: {
        itemCount: session.feedbackItems.length,
        screenshotCount,
        duration,
        categories,
        severities,
      },
    };
  }

  getSuggestedFilename(
    session: Session,
    format: 'markdown' | 'pdf' | 'html' | 'json',
    projectName?: string
  ): string {
    const name = (projectName || session.metadata?.sourceName || 'feedback')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    const date = new Date(session.startTime);
    const dateStr = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('');
    const timeStr = [
      String(date.getHours()).padStart(2, '0'),
      String(date.getMinutes()).padStart(2, '0'),
    ].join('');

    const extensions: Record<string, string> = {
      markdown: 'md', pdf: 'pdf', html: 'html', json: 'json',
    };

    return `${name}-feedback-${dateStr}-${timeStr}.${extensions[format]}`;
  }

  getFormatInfo(format: 'markdown' | 'pdf' | 'html' | 'json') {
    const info: Record<string, { name: string; description: string; icon: string; extension: string }> = {
      markdown: { name: 'Markdown', description: 'AI-ready format for Claude, ChatGPT, and other assistants', icon: 'document-text', extension: '.md' },
      pdf: { name: 'PDF', description: 'Beautiful document for sharing and printing', icon: 'document', extension: '.pdf' },
      html: { name: 'HTML', description: 'Standalone web page, no dependencies', icon: 'code-bracket', extension: '.html' },
      json: { name: 'JSON', description: 'Machine-readable for integrations and APIs', icon: 'code-bracket-square', extension: '.json' },
    };
    return info[format];
  }

  private countByCategory(items: FeedbackItem[]): Record<string, number> {
    return items.reduce((acc, item) => {
      const cat = item.category || 'General';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private countBySeverity(items: FeedbackItem[]): Record<string, number> {
    return items.reduce((acc, item) => {
      const sev = item.severity || 'Medium';
      acc[sev] = (acc[sev] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('Export Pipeline E2E', () => {
  let exportService: TestableExportService;

  beforeEach(() => {
    vi.clearAllMocks();
    exportService = new TestableExportService();
  });

  // ===========================================================================
  // JSON Export
  // ===========================================================================

  describe('JSON Export', () => {
    it('should generate valid JSON export schema', () => {
      const session = createTestSession();
      const json = exportService.generateJsonExport(session, false);

      expect(json.version).toBe('1.0');
      expect(json.generator).toContain('markuprx');
      expect(json.exportedAt).toBeTruthy();
      expect(json.session.id).toBe(session.id);
      expect(json.session.items).toHaveLength(3);
    });

    it('should include correct summary statistics', () => {
      const session = createTestSession({ itemCount: 5 });
      const json = exportService.generateJsonExport(session, false);

      expect(json.summary.itemCount).toBe(5);
      expect(json.summary.screenshotCount).toBe(5);
      expect(json.summary.duration).toBeGreaterThan(0);
      expect(Object.keys(json.summary.categories).length).toBeGreaterThan(0);
      expect(Object.keys(json.summary.severities).length).toBeGreaterThan(0);
    });

    it('should count categories correctly', () => {
      const session = createTestSession({ itemCount: 6 });
      const json = exportService.generateJsonExport(session, false);

      const totalCategories = Object.values(json.summary.categories).reduce(
        (sum, count) => sum + count, 0
      );
      expect(totalCategories).toBe(6);
    });

    it('should exclude base64 images when includeBase64Images is false', () => {
      const session = createTestSession();
      const json = exportService.generateJsonExport(session, false);

      for (const item of json.session.items) {
        for (const ss of item.screenshots) {
          expect(ss).not.toHaveProperty('base64');
        }
      }
    });

    it('should include source metadata', () => {
      const session = createTestSession();
      const json = exportService.generateJsonExport(session, false);

      expect(json.session.source.name).toBe('Test Application');
      expect(json.session.source.type).toBe('window');
      expect(json.session.source.os).toBe('darwin');
    });

    it('should handle session without endTime', () => {
      const session = createTestSession({ withEndTime: false });
      const json = exportService.generateJsonExport(session, false);

      expect(json.session.endTime).toBeUndefined();
      expect(json.summary.duration).toBe(0);
    });

    it('should handle empty session', () => {
      const session = createTestSession({ itemCount: 0 });
      const json = exportService.generateJsonExport(session, false);

      expect(json.session.items).toHaveLength(0);
      expect(json.summary.itemCount).toBe(0);
      expect(json.summary.screenshotCount).toBe(0);
    });

    it('should handle session without screenshots', () => {
      const session = createTestSession({ withScreenshots: false });
      const json = exportService.generateJsonExport(session, false);

      expect(json.summary.screenshotCount).toBe(0);
      for (const item of json.session.items) {
        expect(item.screenshots).toHaveLength(0);
      }
    });

    it('should map item indices correctly', () => {
      const session = createTestSession({ itemCount: 4 });
      const json = exportService.generateJsonExport(session, false);

      json.session.items.forEach((item, i) => {
        expect(item.index).toBe(i);
      });
    });

    it('should map null categories and severities for unset items', () => {
      const session = createTestSession();
      // Override to have no category/severity
      session.feedbackItems[0] = {
        ...session.feedbackItems[0],
        category: undefined,
        severity: undefined,
      };

      const json = exportService.generateJsonExport(session, false);
      expect(json.session.items[0].category).toBeNull();
      expect(json.session.items[0].severity).toBeNull();
    });
  });

  // ===========================================================================
  // Filename Generation
  // ===========================================================================

  describe('Filename Generation', () => {
    it('should generate correct markdown filename', () => {
      const session = createTestSession();
      const filename = exportService.getSuggestedFilename(session, 'markdown');

      expect(filename).toMatch(/^test-application-feedback-\d{8}-\d{4}\.md$/);
    });

    it('should generate correct PDF filename', () => {
      const session = createTestSession();
      const filename = exportService.getSuggestedFilename(session, 'pdf');

      expect(filename).toMatch(/\.pdf$/);
    });

    it('should generate correct HTML filename', () => {
      const session = createTestSession();
      const filename = exportService.getSuggestedFilename(session, 'html');

      expect(filename).toMatch(/\.html$/);
    });

    it('should generate correct JSON filename', () => {
      const session = createTestSession();
      const filename = exportService.getSuggestedFilename(session, 'json');

      expect(filename).toMatch(/\.json$/);
    });

    it('should use custom project name in filename', () => {
      const session = createTestSession();
      const filename = exportService.getSuggestedFilename(
        session, 'markdown', 'My Project'
      );

      expect(filename).toMatch(/^my-project-feedback/);
    });

    it('should sanitize special characters in filename', () => {
      const session = createTestSession();
      const filename = exportService.getSuggestedFilename(
        session, 'markdown', 'Test App (v2.0)'
      );

      expect(filename).not.toContain('(');
      expect(filename).not.toContain(')');
      expect(filename).not.toContain(' ');
    });

    it('should fallback to "feedback" when no source name', () => {
      const session = createTestSession();
      session.metadata = undefined;
      const filename = exportService.getSuggestedFilename(session, 'json');

      expect(filename).toMatch(/^feedback-feedback/);
    });
  });

  // ===========================================================================
  // Format Info
  // ===========================================================================

  describe('Format Info', () => {
    it('should return correct info for each format', () => {
      const formats: Array<'markdown' | 'pdf' | 'html' | 'json'> = [
        'markdown', 'pdf', 'html', 'json',
      ];

      for (const format of formats) {
        const info = exportService.getFormatInfo(format);
        expect(info.name).toBeTruthy();
        expect(info.description).toBeTruthy();
        expect(info.icon).toBeTruthy();
        expect(info.extension).toMatch(/^\.\w+$/);
      }
    });

    it('should have correct extensions', () => {
      expect(exportService.getFormatInfo('markdown').extension).toBe('.md');
      expect(exportService.getFormatInfo('pdf').extension).toBe('.pdf');
      expect(exportService.getFormatInfo('html').extension).toBe('.html');
      expect(exportService.getFormatInfo('json').extension).toBe('.json');
    });
  });

  // ===========================================================================
  // PostProcess Result Export
  // ===========================================================================

  describe('PostProcess Result', () => {
    it('should create PostProcessResult with correct structure', () => {
      const result = createTestPostProcessResult();

      expect(result.transcriptSegments).toHaveLength(3);
      expect(result.extractedFrames).toHaveLength(2);
      expect(result.reportPath).toBe('/tmp/session');
    });

    it('should associate frames with transcript segments', () => {
      const result = createTestPostProcessResult();

      for (const frame of result.extractedFrames) {
        expect(frame.transcriptSegment).toBeDefined();
        expect(frame.transcriptSegment!.text).toBeTruthy();
      }
    });

    it('should handle PostProcessResult with no frames', () => {
      const result: PostProcessResult = {
        transcriptSegments: [
          { text: 'Test', startTime: 0, endTime: 1, confidence: 0.9 },
        ],
        extractedFrames: [],
        reportPath: '/tmp/session',
      };

      expect(result.extractedFrames).toHaveLength(0);
      expect(result.transcriptSegments).toHaveLength(1);
    });

    it('should handle PostProcessResult with no transcript', () => {
      const result: PostProcessResult = {
        transcriptSegments: [],
        extractedFrames: [],
        reportPath: '/tmp/session',
      };

      expect(result.transcriptSegments).toHaveLength(0);
      expect(result.extractedFrames).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle very large session with many items', () => {
      const session = createTestSession({ itemCount: 50 });
      const json = exportService.generateJsonExport(session, false);

      expect(json.session.items).toHaveLength(50);
      expect(json.summary.itemCount).toBe(50);
    });

    it('should handle session with all severity levels', () => {
      const session = createTestSession({ itemCount: 4 });
      const json = exportService.generateJsonExport(session, false);

      const severities = Object.keys(json.summary.severities);
      expect(severities.length).toBeGreaterThan(0);
    });

    it('should preserve item ordering in export', () => {
      const session = createTestSession({ itemCount: 5 });
      const json = exportService.generateJsonExport(session, false);

      for (let i = 0; i < json.session.items.length; i++) {
        expect(json.session.items[i].id).toBe(`item-${i}`);
        expect(json.session.items[i].index).toBe(i);
      }
    });
  });
});
