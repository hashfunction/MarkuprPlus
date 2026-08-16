/**
 * Output Module
 *
 * Handles:
 * - Markdown document generation
 * - Screenshot embedding (base64)
 * - Timestamp formatting
 * - Clipboard integration
 * - File output management
 */

import type { FeedbackSession, OutputDocument, Screenshot, TranscriptionSegment } from '../../shared/types';
import { clipboardService, type ClipboardService } from './ClipboardService';
import type { Session } from '../SessionController';

export class OutputManager {
  private clipboard: ClipboardService;

  constructor() {
    this.clipboard = clipboardService;
  }
  /**
   * Generate a Markdown document from a feedback session
   */
  generateMarkdown(session: FeedbackSession): OutputDocument {
    const { id, screenshots, transcription, startedAt, endedAt } = session;

    // Build markdown content
    let markdown = '# Feedback Session\n\n';

    // Session metadata
    markdown += `**Session ID:** ${id}\n`;
    markdown += `**Started:** ${new Date(startedAt).toISOString()}\n`;
    if (endedAt) {
      markdown += `**Ended:** ${new Date(endedAt).toISOString()}\n`;
      markdown += `**Duration:** ${Math.round((endedAt - startedAt) / 1000)}s\n`;
    }
    markdown += '\n---\n\n';

    // Interleave transcription and screenshots by timestamp
    const timeline = this.buildTimeline(transcription, screenshots);

    for (const item of timeline) {
      if (item.type === 'text') {
        markdown += `${item.content}\n\n`;
      } else if (item.type === 'screenshot') {
        markdown += `![Screenshot at ${this.formatTimestamp(item.timestamp)}](${item.content})\n\n`;
      }
    }

    return {
      sessionId: id,
      generatedAt: Date.now(),
      markdown,
      screenshots,
    };
  }

  /**
   * Build a timeline interleaving transcription and screenshots
   */
  private buildTimeline(
    transcription: TranscriptionSegment[],
    screenshots: Screenshot[]
  ): Array<{ type: 'text' | 'screenshot'; content: string; timestamp: number }> {
    const timeline: Array<{ type: 'text' | 'screenshot'; content: string; timestamp: number }> = [];

    // Add transcription segments
    for (const segment of transcription) {
      timeline.push({
        type: 'text',
        content: segment.text,
        timestamp: segment.startTime,
      });
    }

    // Add screenshots
    for (const screenshot of screenshots) {
      timeline.push({
        type: 'screenshot',
        content: screenshot.base64 || screenshot.imagePath,
        timestamp: screenshot.timestamp,
      });
    }

    // Sort by timestamp
    timeline.sort((a, b) => a.timestamp - b.timestamp);

    return timeline;
  }

  /**
   * Format a timestamp as a readable string
   */
  private formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  /**
   * Copy a summary of the session to clipboard with notification
   */
  async copySessionSummary(
    session: Session,
    reportPath?: string
  ): Promise<boolean> {
    const summary = this.clipboard.generateClipboardSummary(session, {
      mode: 'compact',
      maxLength: 1500,
      includeReportPath: !!reportPath,
      reportPath,
    });

    return this.clipboard.copyWithNotification(
      summary,
      'Feedback Captured!'
    );
  }

  /**
   * Copy custom content to clipboard with notification
   */
  async copyToClipboard(content: string, title?: string): Promise<boolean> {
    return this.clipboard.copyWithNotification(content, title);
  }

  /**
   * Get the clipboard service for direct access
   */
  getClipboardService(): ClipboardService {
    return this.clipboard;
  }
}

// Singleton instance
export const outputManager = new OutputManager();

export default OutputManager;

// Re-export clipboard service types and instance
export { clipboardService, type ClipboardService, type SummaryOptions } from './ClipboardService';

// Re-export file manager types and instance
export { FileManager, fileManager, type SaveResult, type MarkdownDocument } from './FileManager';

// Re-export new llms.txt-inspired markdown generator
export {
  markdownGenerator,
  MarkdownGenerator,
  adaptFeedbackSession,
  type IMarkdownGenerator,
  type Session as MarkdownSession,
  type FeedbackItem,
  type FeedbackCategory,
  type FeedbackSeverity,
  type GenerateOptions,
  type MarkdownDocument as EnhancedMarkdownDocument,
  type SessionMetadata,
} from './MarkdownGenerator';

// Re-export session adapter for type conversion
export {
  adaptSessionForMarkdown,
  generateDocumentForFileManager,
  generateClipboardSummary,
} from './sessionAdapter';

export {
  assignMarkedIssueComments,
  buildMarkedIssueFeedbackItems,
  insertMarkedIssuesSection,
  renderMarkedIssuesMarkdown,
  renderMarkedIssuesJira,
  type MarkedIssueCommentContext,
} from './MarkedIssueReportBuilder';

// Re-export export service for multi-format export
export {
  exportService,
  ExportService,
  generateHtmlDocument,
  type ExportFormat,
  type ExportOptions,
  type ExportResult,
  type PdfOptions,
  type HtmlOptions,
  type JsonOptions,
  type MarkdownOptions,
  type JsonExportSchema,
  type HtmlExportOptions,
} from './ExportService';
