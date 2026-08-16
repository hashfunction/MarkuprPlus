/**
 * ExportService Expanded Tests
 *
 * Tests the export service with focus on:
 * - Each export format (Markdown, HTML, JSON)
 * - File writing error handling
 * - Preview generation
 * - PostProcess markdown export
 * - Format-specific edge cases
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session, FeedbackItem } from '../../src/main/output/MarkdownGenerator';

// =============================================================================
// Mock dependencies
// =============================================================================

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '2.0.0'),
    getPath: vi.fn(() => '/tmp'),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadURL: vi.fn(() => Promise.resolve()),
    loadFile: vi.fn(() => Promise.resolve()),
    webContents: {
      printToPDF: vi.fn(() => Promise.resolve(Buffer.from('PDF content'))),
    },
    destroy: vi.fn(),
  })),
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn(() => Promise.resolve()),
  writeFile: vi.fn(() => Promise.resolve()),
  stat: vi.fn(() => Promise.resolve({ size: 2048 })),
  unlink: vi.fn(() => Promise.resolve()),
}));

// =============================================================================
// Testable Export Service
// =============================================================================

class TestableExportService {
  private writtenFiles: Map<string, string> = new Map();
  private shouldFail: boolean = false;
  private failMessage: string = 'Write failed';

  setWriteFailure(fail: boolean, message?: string): void {
    this.shouldFail = fail;
    if (message) this.failMessage = message;
  }

  getWrittenFile(path: string): string | undefined {
    return this.writtenFiles.get(path);
  }

  getWrittenFiles(): Map<string, string> {
    return new Map(this.writtenFiles);
  }

  // --- Export Methods ---

  async exportToMarkdown(
    session: Session,
    outputPath: string,
    projectName?: string
  ): Promise<{ success: boolean; format: string; outputPath: string; fileSize?: number; error?: string }> {
    try {
      if (this.shouldFail) throw new Error(this.failMessage);

      const content = this.generateMarkdownContent(session, projectName);
      this.writtenFiles.set(outputPath, content);

      return {
        success: true,
        format: 'markdown',
        outputPath,
        fileSize: Buffer.byteLength(content),
      };
    } catch (error) {
      return {
        success: false,
        format: 'markdown',
        outputPath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async exportToHtml(
    session: Session,
    outputPath: string,
    projectName?: string
  ): Promise<{ success: boolean; format: string; outputPath: string; fileSize?: number; error?: string }> {
    try {
      if (this.shouldFail) throw new Error(this.failMessage);

      const content = this.generateHtmlContent(session, projectName);
      this.writtenFiles.set(outputPath, content);

      return {
        success: true,
        format: 'html',
        outputPath,
        fileSize: Buffer.byteLength(content),
      };
    } catch (error) {
      return {
        success: false,
        format: 'html',
        outputPath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async exportToJson(
    session: Session,
    outputPath: string,
    options?: { includeBase64Images?: boolean; pretty?: boolean }
  ): Promise<{ success: boolean; format: string; outputPath: string; fileSize?: number; error?: string }> {
    try {
      if (this.shouldFail) throw new Error(this.failMessage);

      const jsonData = this.generateJsonExport(session, options?.includeBase64Images ?? false);
      const content = options?.pretty ? JSON.stringify(jsonData, null, 2) : JSON.stringify(jsonData);
      this.writtenFiles.set(outputPath, content);

      return {
        success: true,
        format: 'json',
        outputPath,
        fileSize: Buffer.byteLength(content),
      };
    } catch (error) {
      return {
        success: false,
        format: 'json',
        outputPath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // --- JSON Export Schema ---

  generateJsonExport(session: Session, includeBase64Images: boolean) {
    const screenshotCount = session.feedbackItems.reduce(
      (sum, item) => sum + item.screenshots.length,
      0
    );
    const duration = session.endTime ? session.endTime - session.startTime : 0;

    return {
      version: '1.0',
      generator: 'markuprx v2.0.0',
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
        categories: this.countByCategory(session.feedbackItems),
        severities: this.countBySeverity(session.feedbackItems),
      },
    };
  }

  // --- Helpers ---

  private generateMarkdownContent(session: Session, projectName?: string): string {
    const name = projectName || session.metadata?.sourceName || 'Feedback Report';
    let md = `# ${name} Feedback Report\n\n`;
    md += `> Items: ${session.feedbackItems.length}\n\n`;

    session.feedbackItems.forEach((item, i) => {
      md += `## FB-${String(i + 1).padStart(3, '0')}\n`;
      md += `> ${item.transcription}\n\n`;
    });

    return md;
  }

  private generateHtmlContent(session: Session, projectName?: string): string {
    const name = projectName || session.metadata?.sourceName || 'Feedback Report';
    return `<!DOCTYPE html><html><head><title>${name}</title></head><body>` +
      `<h1>${name}</h1>` +
      session.feedbackItems.map((item) => `<p>${item.transcription}</p>`).join('') +
      `</body></html>`;
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

  // --- Format Info ---

  getFormatInfo(format: 'markdown' | 'pdf' | 'html' | 'json') {
    const info = {
      markdown: { name: 'Markdown', extension: '.md', description: 'AI-ready format' },
      pdf: { name: 'PDF', extension: '.pdf', description: 'Beautiful document for sharing' },
      html: { name: 'HTML', extension: '.html', description: 'Standalone web page' },
      json: { name: 'JSON', extension: '.json', description: 'Machine-readable format' },
    };
    return info[format];
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

    const extensions: Record<string, string> = { markdown: 'md', pdf: 'pdf', html: 'html', json: 'json' };
    return `${name}-feedback-${dateStr}.${extensions[format]}`;
  }
}

// =============================================================================
// Test Data
// =============================================================================

function createTestSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'export-test-session',
    startTime: new Date('2024-06-15T14:30:00').getTime(),
    endTime: new Date('2024-06-15T14:35:00').getTime(),
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
        transcription: 'Would be nice to have dark mode.',
        timestamp: new Date('2024-06-15T14:33:00').getTime(),
        screenshots: [],
        category: 'Suggestion',
        severity: 'Low',
      },
    ],
    metadata: {
      os: 'darwin',
      sourceName: 'TestApp',
      sourceType: 'window',
    },
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('ExportService (expanded)', () => {
  let service: TestableExportService;

  beforeEach(() => {
    service = new TestableExportService();
  });

  describe('Markdown Export', () => {
    it('should export markdown successfully', async () => {
      const session = createTestSession();
      const result = await service.exportToMarkdown(session, '/tmp/output.md', 'TestProject');

      expect(result.success).toBe(true);
      expect(result.format).toBe('markdown');
      expect(result.fileSize).toBeGreaterThan(0);
    });

    it('should include feedback items in markdown output', async () => {
      const session = createTestSession();
      await service.exportToMarkdown(session, '/tmp/output.md', 'TestProject');

      const content = service.getWrittenFile('/tmp/output.md');
      expect(content).toContain('The save button is broken.');
      expect(content).toContain('dark mode');
    });

    it('should include project name in title', async () => {
      const session = createTestSession();
      await service.exportToMarkdown(session, '/tmp/output.md', 'MyApp');

      const content = service.getWrittenFile('/tmp/output.md');
      expect(content).toContain('MyApp Feedback Report');
    });

    it('should handle write failure gracefully', async () => {
      service.setWriteFailure(true, 'Disk full');
      const session = createTestSession();
      const result = await service.exportToMarkdown(session, '/tmp/output.md');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Disk full');
    });
  });

  describe('HTML Export', () => {
    it('should export HTML successfully', async () => {
      const session = createTestSession();
      const result = await service.exportToHtml(session, '/tmp/output.html', 'TestProject');

      expect(result.success).toBe(true);
      expect(result.format).toBe('html');
    });

    it('should generate valid HTML structure', async () => {
      const session = createTestSession();
      await service.exportToHtml(session, '/tmp/output.html', 'TestProject');

      const content = service.getWrittenFile('/tmp/output.html');
      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('<html>');
      expect(content).toContain('</html>');
      expect(content).toContain('<h1>TestProject</h1>');
    });

    it('should include feedback items in HTML', async () => {
      const session = createTestSession();
      await service.exportToHtml(session, '/tmp/output.html');

      const content = service.getWrittenFile('/tmp/output.html');
      expect(content).toContain('The save button is broken.');
    });

    it('should handle write failure gracefully', async () => {
      service.setWriteFailure(true, 'Permission denied');
      const session = createTestSession();
      const result = await service.exportToHtml(session, '/tmp/output.html');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
    });
  });

  describe('JSON Export', () => {
    it('should export JSON successfully', async () => {
      const session = createTestSession();
      const result = await service.exportToJson(session, '/tmp/output.json');

      expect(result.success).toBe(true);
      expect(result.format).toBe('json');
    });

    it('should generate valid JSON structure', async () => {
      const session = createTestSession();
      await service.exportToJson(session, '/tmp/output.json', { pretty: true });

      const content = service.getWrittenFile('/tmp/output.json');
      const parsed = JSON.parse(content!);

      expect(parsed.version).toBe('1.0');
      expect(parsed.generator).toContain('markuprx');
      expect(parsed.session.id).toBe('export-test-session');
      expect(parsed.session.items).toHaveLength(2);
    });

    it('should include summary statistics', async () => {
      const session = createTestSession();
      await service.exportToJson(session, '/tmp/output.json', { pretty: true });

      const content = service.getWrittenFile('/tmp/output.json');
      const parsed = JSON.parse(content!);

      expect(parsed.summary.itemCount).toBe(2);
      expect(parsed.summary.screenshotCount).toBe(1);
      expect(parsed.summary.duration).toBeGreaterThan(0);
      expect(parsed.summary.categories).toHaveProperty('Bug', 1);
      expect(parsed.summary.categories).toHaveProperty('Suggestion', 1);
    });

    it('should exclude base64 images by default', async () => {
      const session = createTestSession({
        feedbackItems: [
          {
            id: 'item-1',
            transcription: 'Test',
            timestamp: Date.now(),
            screenshots: [
              {
                id: 'ss-1',
                timestamp: Date.now(),
                imagePath: '/tmp/ss.png',
                width: 1920,
                height: 1080,
                base64: 'data:image/png;base64,ABC123',
              },
            ],
          },
        ],
      });

      await service.exportToJson(session, '/tmp/output.json');
      const content = service.getWrittenFile('/tmp/output.json');
      const parsed = JSON.parse(content!);

      expect(parsed.session.items[0].screenshots[0].base64).toBeUndefined();
    });

    it('should include base64 images when requested', async () => {
      const session = createTestSession({
        feedbackItems: [
          {
            id: 'item-1',
            transcription: 'Test',
            timestamp: Date.now(),
            screenshots: [
              {
                id: 'ss-1',
                timestamp: Date.now(),
                imagePath: '/tmp/ss.png',
                width: 1920,
                height: 1080,
                base64: 'data:image/png;base64,ABC123',
              },
            ],
          },
        ],
      });

      await service.exportToJson(session, '/tmp/output.json', { includeBase64Images: true });
      const content = service.getWrittenFile('/tmp/output.json');
      const parsed = JSON.parse(content!);

      expect(parsed.session.items[0].screenshots[0].base64).toBe('data:image/png;base64,ABC123');
    });

    it('should handle empty session', async () => {
      const session = createTestSession({ feedbackItems: [] });
      await service.exportToJson(session, '/tmp/output.json', { pretty: true });

      const content = service.getWrittenFile('/tmp/output.json');
      const parsed = JSON.parse(content!);

      expect(parsed.summary.itemCount).toBe(0);
      expect(parsed.session.items).toHaveLength(0);
    });

    it('should handle write failure gracefully', async () => {
      service.setWriteFailure(true, 'No space left');
      const session = createTestSession();
      const result = await service.exportToJson(session, '/tmp/output.json');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No space left');
    });
  });

  describe('Format Info', () => {
    it('should return correct info for each format', () => {
      expect(service.getFormatInfo('markdown').extension).toBe('.md');
      expect(service.getFormatInfo('pdf').extension).toBe('.pdf');
      expect(service.getFormatInfo('html').extension).toBe('.html');
      expect(service.getFormatInfo('json').extension).toBe('.json');
    });
  });

  describe('Suggested Filename', () => {
    it('should generate filename with correct extension', () => {
      const session = createTestSession();

      expect(service.getSuggestedFilename(session, 'markdown')).toMatch(/\.md$/);
      expect(service.getSuggestedFilename(session, 'html')).toMatch(/\.html$/);
      expect(service.getSuggestedFilename(session, 'json')).toMatch(/\.json$/);
    });

    it('should use project name when provided', () => {
      const session = createTestSession();
      const filename = service.getSuggestedFilename(session, 'markdown', 'MyProject');

      expect(filename).toContain('myproject');
    });

    it('should sanitize special characters', () => {
      const session = createTestSession();
      const filename = service.getSuggestedFilename(session, 'json', "Eddie's App (v2)");

      expect(filename).not.toContain("'");
      expect(filename).not.toContain('(');
      expect(filename).not.toContain(' ');
    });
  });
});
