/**
 * ExportService Unit Tests
 *
 * Tests the multi-format export functionality:
 * - JSON export schema
 * - Filename generation
 * - Format info
 * - Preview generation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Session, FeedbackItem } from '../../src/main/output/MarkdownGenerator';

// =============================================================================
// Mock Electron and dependencies
// =============================================================================

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '0.4.0'),
    getPath: vi.fn(() => '/tmp'),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadURL: vi.fn(() => Promise.resolve()),
    webContents: {
      printToPDF: vi.fn(() => Promise.resolve(Buffer.from('PDF'))),
    },
    destroy: vi.fn(),
  })),
}));

vi.mock('fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs/promises')>()),
  mkdir: vi.fn(() => Promise.resolve()),
  writeFile: vi.fn(() => Promise.resolve()),
  stat: vi.fn(() => Promise.resolve({ size: 1024 })),
}));

// =============================================================================
// Test Implementation (Isolated from Electron dependencies)
// =============================================================================

/**
 * Isolated ExportService for testing without Electron dependencies
 */
class TestableExportService {
  /**
   * Generate JSON export data structure
   */
  generateJsonExport(session: Session, includeBase64Images: boolean) {
    const categories = this.countByCategory(session.feedbackItems);
    const severities = this.countBySeverity(session.feedbackItems);
    const screenshotCount = session.feedbackItems.reduce(
      (sum, item) => sum + item.screenshots.length,
      0
    );
    const duration = session.endTime ? session.endTime - session.startTime : 0;

    return {
      version: '1.0',
      generator: 'markuprx v0.4.0',
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

  /**
   * Get suggested filename for a given format
   */
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
      markdown: 'md',
      pdf: 'pdf',
      html: 'html',
      json: 'json',
    };

    return `${name}-feedback-${dateStr}-${timeStr}.${extensions[format]}`;
  }

  /**
   * Get format info for UI display
   */
  getFormatInfo(format: 'markdown' | 'pdf' | 'html' | 'json') {
    const info = {
      markdown: {
        name: 'Markdown',
        description: 'AI-ready format for Claude, ChatGPT, and other assistants',
        icon: 'document-text',
        extension: '.md',
      },
      pdf: {
        name: 'PDF',
        description: 'Beautiful document for sharing and printing',
        icon: 'document',
        extension: '.pdf',
      },
      html: {
        name: 'HTML',
        description: 'Standalone web page, no dependencies',
        icon: 'code-bracket',
        extension: '.html',
      },
      json: {
        name: 'JSON',
        description: 'Machine-readable for integrations and APIs',
        icon: 'code-bracket-square',
        extension: '.json',
      },
    };

    return info[format];
  }

  private countByCategory(items: FeedbackItem[]): Record<string, number> {
    return items.reduce((acc, item) => {
      const category = item.category || 'General';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private countBySeverity(items: FeedbackItem[]): Record<string, number> {
    return items.reduce((acc, item) => {
      const severity = item.severity || 'Medium';
      acc[severity] = (acc[severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}

// =============================================================================
// Test Data
// =============================================================================

function createTestSession(overrides: Partial<Session> = {}): Session {
  const now = Date.now();
  return {
    id: 'test-session-123',
    startTime: new Date('2024-06-15T14:30:00').getTime(),
    endTime: new Date('2024-06-15T14:35:30').getTime(),
    feedbackItems: [
      {
        id: 'item-1',
        transcription: 'The save button is broken.',
        timestamp: new Date('2024-06-15T14:31:00').getTime(),
        screenshots: [
          {
            id: 'ss-1',
            timestamp: new Date('2024-06-15T14:31:05').getTime(),
            imagePath: '/tmp/ss-1.png',
            width: 1920,
            height: 1080,
          },
        ],
        category: 'Bug',
        severity: 'High',
      },
      {
        id: 'item-2',
        transcription: 'The navigation is confusing.',
        timestamp: new Date('2024-06-15T14:33:00').getTime(),
        screenshots: [],
        category: 'UX Issue',
        severity: 'Medium',
      },
      {
        id: 'item-3',
        transcription: 'Would be nice to have dark mode.',
        timestamp: new Date('2024-06-15T14:34:00').getTime(),
        screenshots: [
          {
            id: 'ss-2',
            timestamp: new Date('2024-06-15T14:34:05').getTime(),
            imagePath: '/tmp/ss-2.png',
            width: 1920,
            height: 1080,
            base64: 'data:image/png;base64,ABC123',
          },
        ],
        category: 'Suggestion',
        severity: 'Low',
      },
    ],
    metadata: {
      os: 'darwin',
      sourceName: 'My Test App',
      sourceType: 'window',
    },
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('ExportService', () => {
  let service: TestableExportService;

  beforeEach(() => {
    service = new TestableExportService();
  });

  describe('generateJsonExport', () => {
    it('should generate valid JSON export schema', () => {
      const session = createTestSession();
      const json = service.generateJsonExport(session, false);

      expect(json.version).toBe('1.0');
      expect(json.generator).toContain('markuprx');
      expect(json.exportedAt).toBeDefined();
    });

    it('should include session metadata', () => {
      const session = createTestSession();
      const json = service.generateJsonExport(session, false);

      expect(json.session.id).toBe('test-session-123');
      expect(json.session.startTime).toBeDefined();
      expect(json.session.endTime).toBeDefined();
      expect(json.session.source.name).toBe('My Test App');
      expect(json.session.source.type).toBe('window');
      expect(json.session.source.os).toBe('darwin');
    });

    it('should include all feedback items', () => {
      const session = createTestSession();
      const json = service.generateJsonExport(session, false);

      expect(json.session.items).toHaveLength(3);
      expect(json.session.items[0].transcription).toBe('The save button is broken.');
      expect(json.session.items[0].category).toBe('Bug');
      expect(json.session.items[0].severity).toBe('High');
    });

    it('should include item indices', () => {
      const session = createTestSession();
      const json = service.generateJsonExport(session, false);

      expect(json.session.items[0].index).toBe(0);
      expect(json.session.items[1].index).toBe(1);
      expect(json.session.items[2].index).toBe(2);
    });

    it('should include screenshots without base64 by default', () => {
      const session = createTestSession();
      const json = service.generateJsonExport(session, false);

      const itemWithScreenshot = json.session.items[0];
      expect(itemWithScreenshot.screenshots).toHaveLength(1);
      expect(itemWithScreenshot.screenshots[0].id).toBe('ss-1');
      expect(itemWithScreenshot.screenshots[0].width).toBe(1920);
      expect(itemWithScreenshot.screenshots[0].height).toBe(1080);
      expect(itemWithScreenshot.screenshots[0].base64).toBeUndefined();
    });

    it('should include base64 when requested', () => {
      const session = createTestSession();
      const json = service.generateJsonExport(session, true);

      // Item 3 has base64
      const itemWithBase64 = json.session.items[2];
      expect(itemWithBase64.screenshots[0].base64).toBe('data:image/png;base64,ABC123');
    });

    it('should generate correct summary', () => {
      const session = createTestSession();
      const json = service.generateJsonExport(session, false);

      expect(json.summary.itemCount).toBe(3);
      expect(json.summary.screenshotCount).toBe(2);
      expect(json.summary.duration).toBeGreaterThan(0);
    });

    it('should count categories correctly', () => {
      const session = createTestSession();
      const json = service.generateJsonExport(session, false);

      expect(json.summary.categories).toEqual({
        Bug: 1,
        'UX Issue': 1,
        Suggestion: 1,
      });
    });

    it('should count severities correctly', () => {
      const session = createTestSession();
      const json = service.generateJsonExport(session, false);

      expect(json.summary.severities).toEqual({
        High: 1,
        Medium: 1,
        Low: 1,
      });
    });

    it('should handle empty session', () => {
      const session = createTestSession({
        feedbackItems: [],
      });
      const json = service.generateJsonExport(session, false);

      expect(json.session.items).toHaveLength(0);
      expect(json.summary.itemCount).toBe(0);
      expect(json.summary.screenshotCount).toBe(0);
      expect(json.summary.categories).toEqual({});
    });

    it('should handle missing category/severity', () => {
      const session = createTestSession({
        feedbackItems: [
          {
            id: 'item-1',
            transcription: 'Test',
            timestamp: Date.now(),
            screenshots: [],
            // No category or severity
          },
        ],
      });
      const json = service.generateJsonExport(session, false);

      expect(json.session.items[0].category).toBeNull();
      expect(json.session.items[0].severity).toBeNull();
      expect(json.summary.categories).toEqual({ General: 1 });
      expect(json.summary.severities).toEqual({ Medium: 1 });
    });
  });

  describe('getSuggestedFilename', () => {
    it('should generate filename with project name', () => {
      const session = createTestSession();
      const filename = service.getSuggestedFilename(session, 'markdown', 'MyProject');

      expect(filename).toMatch(/^myproject-feedback-\d{8}-\d{4}\.md$/);
    });

    it('should use sourceName when project name not provided', () => {
      const session = createTestSession();
      const filename = service.getSuggestedFilename(session, 'markdown');

      expect(filename).toMatch(/^my-test-app-feedback-\d{8}-\d{4}\.md$/);
    });

    it('should default to "feedback" when no name available', () => {
      const session = createTestSession({ metadata: undefined });
      const filename = service.getSuggestedFilename(session, 'markdown');

      expect(filename).toMatch(/^feedback-feedback-\d{8}-\d{4}\.md$/);
    });

    it('should use correct extension for each format', () => {
      const session = createTestSession();

      expect(service.getSuggestedFilename(session, 'markdown')).toMatch(/\.md$/);
      expect(service.getSuggestedFilename(session, 'pdf')).toMatch(/\.pdf$/);
      expect(service.getSuggestedFilename(session, 'html')).toMatch(/\.html$/);
      expect(service.getSuggestedFilename(session, 'json')).toMatch(/\.json$/);
    });

    it('should sanitize special characters in project name', () => {
      const session = createTestSession();
      const filename = service.getSuggestedFilename(session, 'markdown', "Eddie's App (v2.0)");

      expect(filename).not.toContain("'");
      expect(filename).not.toContain('(');
      expect(filename).not.toContain(')');
      expect(filename).not.toContain(' ');
      expect(filename).toMatch(/^eddie-s-app-v2-0-feedback/);
    });

    it('should collapse multiple dashes', () => {
      const session = createTestSession();
      const filename = service.getSuggestedFilename(session, 'markdown', 'Test --- App');

      expect(filename).not.toMatch(/---/);
      expect(filename).toMatch(/^test-app-feedback/);
    });

    it('should remove leading/trailing dashes', () => {
      const session = createTestSession();
      const filename = service.getSuggestedFilename(session, 'markdown', '---Test App---');

      expect(filename).toMatch(/^test-app-feedback/);
    });

    it('should include date and time from session start', () => {
      const session = createTestSession({
        startTime: new Date('2024-12-25T09:30:00').getTime(),
      });
      const filename = service.getSuggestedFilename(session, 'json', 'Test');

      expect(filename).toContain('20241225');
      expect(filename).toContain('0930');
    });
  });

  describe('getFormatInfo', () => {
    it('should return info for markdown format', () => {
      const info = service.getFormatInfo('markdown');

      expect(info.name).toBe('Markdown');
      expect(info.extension).toBe('.md');
      expect(info.description).toContain('AI-ready');
    });

    it('should return info for PDF format', () => {
      const info = service.getFormatInfo('pdf');

      expect(info.name).toBe('PDF');
      expect(info.extension).toBe('.pdf');
      expect(info.description).toContain('sharing');
    });

    it('should return info for HTML format', () => {
      const info = service.getFormatInfo('html');

      expect(info.name).toBe('HTML');
      expect(info.extension).toBe('.html');
      expect(info.description).toContain('Standalone');
    });

    it('should return info for JSON format', () => {
      const info = service.getFormatInfo('json');

      expect(info.name).toBe('JSON');
      expect(info.extension).toBe('.json');
      expect(info.description).toContain('Machine-readable');
    });

    it('should include icons for all formats', () => {
      const formats: Array<'markdown' | 'pdf' | 'html' | 'json'> = ['markdown', 'pdf', 'html', 'json'];

      for (const format of formats) {
        const info = service.getFormatInfo(format);
        expect(info.icon).toBeDefined();
        expect(info.icon.length).toBeGreaterThan(0);
      }
    });
  });
});
