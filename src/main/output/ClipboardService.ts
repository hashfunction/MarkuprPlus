/**
 * ClipboardService - Auto-copy on save with native notifications
 *
 * Features:
 * - Copy generated summary to clipboard automatically
 * - Toast notification confirms copy
 * - Summary truncation to <1500 chars
 * - Include path to full report
 * - Support both full and compact modes
 */

import { clipboard, Notification, app, BrowserWindow } from 'electron';
import path from 'path';
import { Session, FeedbackItem } from '../SessionController';
import { PUBLIC_BRAND_NAME } from '../../shared/publicBrand';

// =============================================================================
// Types
// =============================================================================

export interface ClipboardService {
  copy(content: string): Promise<boolean>;
  copyWithNotification(content: string, title?: string): Promise<boolean>;
  estimateSize(content: string): number;
  generateClipboardSummary(session: Session, options?: SummaryOptions): string;
}

export interface SummaryOptions {
  mode: 'full' | 'compact';
  maxLength: number;
  includeReportPath: boolean;
  reportPath?: string;
}

export const DEFAULT_SUMMARY_OPTIONS: SummaryOptions = {
  mode: 'compact',
  maxLength: 1500,
  includeReportPath: true,
};

// =============================================================================
// ClipboardService Implementation
// =============================================================================

class ClipboardServiceImpl implements ClipboardService {
  private lastNotificationTime = 0;
  private readonly NOTIFICATION_DEBOUNCE_MS = 1000;

  /**
   * Copy content to system clipboard
   */
  async copy(content: string): Promise<boolean> {
    try {
      clipboard.writeText(content);
      console.log(`[Clipboard] Copied ${content.length} characters`);
      return true;
    } catch (error) {
      console.error('[Clipboard] Failed to copy:', error);
      return false;
    }
  }

  /**
   * Copy content to clipboard and show native notification
   */
  async copyWithNotification(content: string, title?: string): Promise<boolean> {
    const success = await this.copy(content);

    // Debounce notifications
    const now = Date.now();
    if (now - this.lastNotificationTime < this.NOTIFICATION_DEBOUNCE_MS) {
      return success;
    }
    this.lastNotificationTime = now;

    if (success) {
      this.showNotification(
        title || PUBLIC_BRAND_NAME,
        'Summary copied to clipboard!',
        'Paste into your AI coding assistant.'
      );
    } else {
      this.showNotification(
        PUBLIC_BRAND_NAME,
        'Failed to copy',
        'Please try again or copy manually.'
      );
    }

    return success;
  }

  /**
   * Estimate byte size for UTF-8 content
   */
  estimateSize(content: string): number {
    // Calculate UTF-8 byte size
    return Buffer.byteLength(content, 'utf8');
  }

  /**
   * Generate a clipboard-friendly summary from a session
   * Follows llms.txt format for AI consumption
   */
  generateClipboardSummary(
    session: Session,
    options: Partial<SummaryOptions> = {}
  ): string {
    const opts: SummaryOptions = { ...DEFAULT_SUMMARY_OPTIONS, ...options };

    const duration = session.endTime
      ? Math.round((session.endTime - session.startTime) / 1000)
      : Math.round((Date.now() - session.startTime) / 1000);

    const feedbackItems = session.feedbackItems;

    // Build summary based on mode
    let summary: string;

    if (opts.mode === 'full') {
      summary = this.generateFullSummary(feedbackItems, duration);
    } else {
      summary = this.generateCompactSummary(feedbackItems, duration);
    }

    // Add report path if available
    if (opts.includeReportPath && opts.reportPath) {
      summary += `\n\n---\nFull report: ${opts.reportPath}`;
    }

    // Truncate if needed
    if (summary.length > opts.maxLength) {
      summary = this.truncateSummary(summary, opts.maxLength);
    }

    return summary;
  }

  /**
   * Generate full summary with all feedback items
   */
  private generateFullSummary(items: FeedbackItem[], durationSec: number): string {
    const lines: string[] = [
      '# Feedback Session',
      '',
      `**Duration:** ${this.formatDuration(durationSec)}`,
      `**Items:** ${items.length}`,
      '',
      '---',
      '',
    ];

    for (const item of items) {
      const time = new Date(item.timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      lines.push(`## [${time}]`);
      lines.push('');
      lines.push(item.text);

      if (item.screenshot) {
        lines.push('');
        lines.push(`_[Screenshot captured: ${item.screenshot.width}x${item.screenshot.height}]_`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate compact summary optimized for clipboard
   */
  private generateCompactSummary(items: FeedbackItem[], durationSec: number): string {
    const lines: string[] = [
      '# Feedback Summary',
      '',
      `Duration: ${this.formatDuration(durationSec)} | ${items.length} items | ${items.filter((i) => i.screenshot).length} screenshots`,
      '',
    ];

    // Group similar items and extract key points
    const keyPoints = this.extractKeyPoints(items);

    if (keyPoints.length > 0) {
      lines.push('## Key Points');
      lines.push('');

      for (const point of keyPoints) {
        lines.push(`- ${point}`);
      }

      lines.push('');
    }

    // Add timeline summary
    lines.push('## Timeline');
    lines.push('');

    for (const item of items) {
      const time = new Date(item.timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });

      // Truncate text for compact view
      const text =
        item.text.length > 100 ? item.text.substring(0, 97) + '...' : item.text;

      const screenshotIndicator = item.screenshot ? ' [img]' : '';
      lines.push(`- **${time}:** ${text}${screenshotIndicator}`);
    }

    return lines.join('\n');
  }

  /**
   * Extract key points from feedback items
   * Simple heuristics for now, could be enhanced with NLP
   */
  private extractKeyPoints(items: FeedbackItem[]): string[] {
    const keyPoints: string[] = [];

    // Filter out very short or low-confidence items
    const significantItems = items.filter(
      (item) => item.text.length > 20 && item.confidence > 0.7
    );

    // Extract unique key phrases
    const seen = new Set<string>();

    for (const item of significantItems) {
      // Look for action words and important phrases
      const text = item.text.toLowerCase();

      // Skip if too similar to existing points
      const normalized = text.substring(0, 50);
      if (seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);

      // Capitalize first letter and add
      const point = item.text.charAt(0).toUpperCase() + item.text.slice(1);
      keyPoints.push(point);

      // Limit to 5 key points
      if (keyPoints.length >= 5) {
        break;
      }
    }

    return keyPoints;
  }

  /**
   * Truncate summary while keeping it readable
   */
  private truncateSummary(summary: string, maxLength: number): string {
    if (summary.length <= maxLength) {
      return summary;
    }

    // Find a good break point (end of line or sentence)
    const targetLength = maxLength - 50; // Leave room for truncation notice
    let breakPoint = summary.lastIndexOf('\n', targetLength);

    if (breakPoint === -1 || breakPoint < targetLength * 0.7) {
      // Try sentence boundary
      breakPoint = summary.lastIndexOf('. ', targetLength);

      if (breakPoint === -1 || breakPoint < targetLength * 0.5) {
        breakPoint = targetLength;
      } else {
        breakPoint += 1; // Include the period
      }
    }

    return (
      summary.substring(0, breakPoint) +
      '\n\n_[Truncated - see full report for details]_'
    );
  }

  /**
   * Format duration in human-readable form
   */
  private formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes < 60) {
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return `${hours}h ${remainingMinutes}m`;
  }

  /**
   * Show native notification
   */
  private showNotification(title: string, body: string, subtitle?: string): void {
    // Check if notifications are supported
    if (!Notification.isSupported()) {
      console.log(`[Notification] (unsupported) ${title}: ${body}`);
      return;
    }

    const notification = new Notification({
      title,
      body,
      subtitle,
      silent: false,
      icon: this.getIconPath(),
      timeoutType: 'default', // Auto-dismiss
    });

    notification.on('click', () => {
      // Focus the app when notification is clicked
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        windows[0].focus();
      }
      console.log('[Notification] Clicked - focusing app');
    });

    notification.on('close', () => {
      console.log('[Notification] Dismissed');
    });

    notification.show();
  }

  /**
   * Get app icon path for notification
   */
  private getIconPath(): string | undefined {
    // macOS uses the app icon automatically
    if (process.platform === 'darwin') {
      return undefined;
    }

    // For Windows/Linux, try to find the icon
    // This would be in the app resources after packaging
    try {
      const iconPath = path.join(app.getAppPath(), 'assets', 'icon.png');
      return iconPath;
    } catch {
      return undefined;
    }
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const clipboardService = new ClipboardServiceImpl();
export default ClipboardService;
