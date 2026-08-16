/**
 * ExportService - Multi-Format Export for markupr
 *
 * Supports:
 * - Markdown (default, via MarkdownGenerator)
 * - PDF (using Electron's built-in PDF rendering)
 * - HTML (standalone, self-contained)
 * - JSON (machine-readable for integrations)
 *
 * Design principles:
 * - Each format should feel intentional and polished
 * - HTML and PDF should be visually beautiful
 * - JSON should be comprehensive and well-structured
 * - All formats support embedded or referenced images
 */

import { BrowserWindow, app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import type { Session, FeedbackItem, FeedbackCategory, FeedbackSeverity } from './MarkdownGenerator';
import { markdownGenerator } from './MarkdownGenerator';
import type { PostProcessResult } from '../pipeline/PostProcessor';
import { generateHtmlDocument } from './templates/html-template';
import type { CaptureContextSnapshot, MarkedIssuePayload } from '../../shared/types';

/**
 * JSON export schema version. Bump when the schema changes:
 * - Patch (1.0.x): additive fields, no breaking changes
 * - Minor (1.x.0): new top-level sections, no removals
 * - Major (x.0.0): breaking changes to existing fields
 *
 * Last changed: v1.0 (initial schema, 2024-01-01)
 */
const JSON_EXPORT_SCHEMA_VERSION = '1.0';

// ============================================================================
// Types
// ============================================================================

export type ExportFormat = 'markdown' | 'pdf' | 'html' | 'json';

export interface ExportOptions {
  format: ExportFormat;
  outputPath: string;
  projectName?: string;
  includeImages?: boolean;
  theme?: 'dark' | 'light';
}

export interface PdfOptions extends Omit<ExportOptions, 'format'> {
  format: 'pdf';
  pageSize?: 'A4' | 'Letter' | 'Legal';
  landscape?: boolean;
  margins?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  printBackground?: boolean;
}

export interface HtmlOptions extends Omit<ExportOptions, 'format'> {
  format: 'html';
}

export interface JsonOptions extends Omit<ExportOptions, 'format'> {
  format: 'json';
  includeBase64Images?: boolean;
  pretty?: boolean;
}

export interface MarkdownOptions extends Omit<ExportOptions, 'format'> {
  format: 'markdown';
  screenshotDir?: string;
}

export interface ExportResult {
  success: boolean;
  format: ExportFormat;
  outputPath: string;
  fileSize?: number;
  error?: string;
}

export interface JsonExportSchema {
  version: string;
  generator: string;
  exportedAt: string;
  session: {
    id: string;
    startTime: number;
    endTime?: number;
    source: {
      name?: string;
      type?: string;
      os?: string;
      captureContexts?: CaptureContextSnapshot[];
    };
    markedIssues: MarkedIssuePayload[];
    items: Array<{
      id: string;
      index: number;
      timestamp: number;
      transcription: string;
      category: FeedbackCategory | null;
      severity: FeedbackSeverity | null;
      screenshots: Array<{
        id: string;
        width: number;
        height: number;
        base64?: string;
      }>;
    }>;
  };
  summary: {
    itemCount: number;
    screenshotCount: number;
    duration: number;
    categories: Record<string, number>;
    severities: Record<string, number>;
  };
}

// ============================================================================
// Export Service Class
// ============================================================================

class ExportServiceImpl {
  /**
   * Export a session to the specified format
   */
  async export(session: Session, options: ExportOptions): Promise<ExportResult> {
    try {
      switch (options.format) {
        case 'pdf':
          return await this.exportToPdf(session, options as PdfOptions);
        case 'html':
          return await this.exportToHtml(session, options as HtmlOptions);
        case 'json':
          return await this.exportToJson(session, options as JsonOptions);
        case 'markdown':
        default:
          return await this.exportToMarkdown(session, options as MarkdownOptions);
      }
    } catch (error) {
      console.error(`[ExportService] Export failed:`, error);
      return {
        success: false,
        format: options.format,
        outputPath: options.outputPath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Export to PDF using Electron's built-in PDF rendering
   *
   * Creates a hidden BrowserWindow, loads the HTML, and prints to PDF.
   * This approach ensures consistent rendering without external dependencies.
   */
  async exportToPdf(session: Session, options: PdfOptions): Promise<ExportResult> {
    const {
      outputPath,
      projectName,
      includeImages = true,
      theme = 'dark',
      pageSize = 'A4',
      landscape = false,
      margins = { top: 72, bottom: 72, left: 72, right: 72 }, // 1 inch in points
      printBackground = true,
    } = options;

    // Generate HTML content
    const htmlContent = generateHtmlDocument(session, {
      projectName,
      includeImages,
      theme,
      version: app.getVersion(),
    });

    // Create a hidden browser window for PDF rendering
    const pdfWindow = new BrowserWindow({
      show: false,
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        offscreen: true,
      },
    });

    // Write HTML to a temp file to avoid Chromium's ~2MB data: URL limit
    // which breaks sessions with 5+ base64-embedded screenshots.
    const tmpHtmlPath = path.join(tmpdir(), `markupr-pdf-export-${Date.now()}.html`);

    try {
      await fs.writeFile(tmpHtmlPath, htmlContent, 'utf-8');

      // Load from file instead of data: URL
      await pdfWindow.loadFile(tmpHtmlPath);

      // Wait for content to fully render
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Generate PDF
      const pdfBuffer = await pdfWindow.webContents.printToPDF({
        pageSize,
        landscape,
        printBackground,
        margins: {
          top: (margins.top ?? 72) / 72, // Convert points to inches
          bottom: (margins.bottom ?? 72) / 72,
          left: (margins.left ?? 72) / 72,
          right: (margins.right ?? 72) / 72,
        },
      });

      // Ensure output directory exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Write PDF file
      await fs.writeFile(outputPath, pdfBuffer);

      const stats = await fs.stat(outputPath);

      console.log(`[ExportService] PDF exported to ${outputPath} (${stats.size} bytes)`);

      return {
        success: true,
        format: 'pdf',
        outputPath,
        fileSize: stats.size,
      };
    } finally {
      // Always close the window and clean up temp file
      pdfWindow.destroy();
      await fs.unlink(tmpHtmlPath).catch(() => {});
    }
  }

  /**
   * Export to standalone HTML
   *
   * Creates a self-contained HTML file with embedded styles and images.
   * No external dependencies required.
   */
  async exportToHtml(session: Session, options: HtmlOptions): Promise<ExportResult> {
    const { outputPath, projectName, includeImages = true, theme = 'dark' } = options;

    const htmlContent = generateHtmlDocument(session, {
      projectName,
      includeImages,
      theme,
      version: app.getVersion(),
    });

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write HTML file
    await fs.writeFile(outputPath, htmlContent, 'utf-8');

    const stats = await fs.stat(outputPath);

    console.log(`[ExportService] HTML exported to ${outputPath} (${stats.size} bytes)`);

    return {
      success: true,
      format: 'html',
      outputPath,
      fileSize: stats.size,
    };
  }

  /**
   * Export to JSON
   *
   * Machine-readable format suitable for:
   * - Integration with other tools
   * - Data analysis
   * - Backup/restore
   * - API consumption
   */
  async exportToJson(session: Session, options: JsonOptions): Promise<ExportResult> {
    const { outputPath, includeBase64Images = false, pretty = true } = options;

    const jsonData = this.generateJsonExport(session, includeBase64Images);
    const jsonString = pretty ? JSON.stringify(jsonData, null, 2) : JSON.stringify(jsonData);

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write JSON file
    await fs.writeFile(outputPath, jsonString, 'utf-8');

    const stats = await fs.stat(outputPath);

    console.log(`[ExportService] JSON exported to ${outputPath} (${stats.size} bytes)`);

    return {
      success: true,
      format: 'json',
      outputPath,
      fileSize: stats.size,
    };
  }

  /**
   * Export to Markdown
   *
   * Uses the existing MarkdownGenerator for consistent output.
   */
  async exportToMarkdown(session: Session, options: MarkdownOptions): Promise<ExportResult> {
    const { outputPath, projectName, screenshotDir = './screenshots' } = options;

    const document = markdownGenerator.generateFullDocument(session, {
      projectName: projectName || session.metadata?.sourceName || 'Feedback Report',
      screenshotDir,
    });

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Write Markdown file
    await fs.writeFile(outputPath, document.content, 'utf-8');

    const stats = await fs.stat(outputPath);

    console.log(`[ExportService] Markdown exported to ${outputPath} (${stats.size} bytes)`);

    return {
      success: true,
      format: 'markdown',
      outputPath,
      fileSize: stats.size,
    };
  }

  /**
   * Export a PostProcessResult to Markdown.
   *
   * Uses the new generateFromPostProcess method on MarkdownGenerator
   * to produce a clean transcript + frame document.
   *
   * @param result - PostProcessResult from the post-recording pipeline
   * @param sessionDir - Absolute path to the session directory
   * @param outputPath - Where to write the markdown file
   */
  async exportPostProcessToMarkdown(
    result: PostProcessResult,
    sessionDir: string,
    outputPath: string
  ): Promise<ExportResult> {
    try {
      const content = markdownGenerator.generateFromPostProcess(result, sessionDir);

      // Ensure output directory exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Write Markdown file
      await fs.writeFile(outputPath, content, 'utf-8');

      const stats = await fs.stat(outputPath);

      console.log(`[ExportService] Post-process Markdown exported to ${outputPath} (${stats.size} bytes)`);

      return {
        success: true,
        format: 'markdown',
        outputPath,
        fileSize: stats.size,
      };
    } catch (error) {
      console.error(`[ExportService] Post-process Markdown export failed:`, error);
      return {
        success: false,
        format: 'markdown',
        outputPath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate JSON export data structure
   */
  generateJsonExport(session: Session, includeBase64Images: boolean): JsonExportSchema {
    const categories = this.countByCategory(session.feedbackItems);
    const severities = this.countBySeverity(session.feedbackItems);
    const screenshotCount = session.feedbackItems.reduce(
      (sum, item) => sum + item.screenshots.length,
      0
    ) + (session.metadata?.markedIssues ?? []).filter((issue) => Boolean(issue.screenshotPath)).length;
    const markedIssues = structuredClone(session.metadata?.markedIssues ?? []);
    const duration = session.endTime ? session.endTime - session.startTime : 0;

    return {
      version: JSON_EXPORT_SCHEMA_VERSION,
      generator: `markupR v${app.getVersion()}`,
      exportedAt: new Date().toISOString(),
      session: {
        id: session.id,
        startTime: session.startTime,
        endTime: session.endTime,
        source: {
          name: session.metadata?.sourceName,
          type: session.metadata?.sourceType,
          os: session.metadata?.os,
          captureContexts: session.metadata?.captureContexts,
        },
        markedIssues,
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
        itemCount: session.feedbackItems.length + markedIssues.length,
        screenshotCount,
        duration,
        categories,
        severities,
      },
    };
  }

  /**
   * Get a preview of what the export will look like (for HTML/Markdown)
   */
  getPreview(session: Session, format: ExportFormat, options: Partial<ExportOptions> = {}): string {
    switch (format) {
      case 'html':
        return generateHtmlDocument(session, {
          projectName: options.projectName,
          includeImages: options.includeImages ?? false, // Don't include images in preview
          theme: options.theme ?? 'dark',
        });
      case 'json':
        return JSON.stringify(this.generateJsonExport(session, false), null, 2);
      case 'markdown':
      default:
        return markdownGenerator.generateFullDocument(session, {
          projectName: options.projectName || session.metadata?.sourceName || 'Preview',
          screenshotDir: './screenshots',
        }).content;
    }
  }

  /**
   * Get suggested filename for a given format
   */
  getSuggestedFilename(session: Session, format: ExportFormat, projectName?: string): string {
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

    const extensions: Record<ExportFormat, string> = {
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
  getFormatInfo(format: ExportFormat): {
    name: string;
    description: string;
    icon: string;
    extension: string;
  } {
    const info: Record<
      ExportFormat,
      { name: string; description: string; icon: string; extension: string }
    > = {
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

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

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

// ============================================================================
// Exports
// ============================================================================

export const exportService = new ExportServiceImpl();
export { ExportServiceImpl as ExportService };

// Re-export HTML template for direct use
export { generateHtmlDocument, type HtmlExportOptions } from './templates/html-template';
