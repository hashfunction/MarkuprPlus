/**
 * MarkdownGenerator - AI-Ready Output Generator for markupR
 *
 * Generates structured Markdown documents following llms.txt-inspired format.
 * Designed to be easily parsed by AI coding assistants like Claude Code.
 *
 * Features:
 * - Full document with all feedback items, screenshots, and metadata
 * - Clipboard summary (<1500 chars) for quick sharing
 * - File references for images (no base64 bloat)
 * - Consistent FB-XXX item numbering
 */

import * as path from 'path';
import type {
  FeedbackSession,
  Screenshot,
  TranscriptionSegment,
  CaptureContextSnapshot,
} from '../../shared/types';
import type { PostProcessResult, TranscriptSegment, ExtractedFrame } from '../pipeline/PostProcessor';

const REPORT_SUPPORT_LINE = '*If this report saved you time, support development: [Ko-fi](https://ko-fi.com/eddiesanjuan)*';

// ============================================================================
// Types for Enhanced Output Generation
// ============================================================================

/**
 * Category types for feedback items
 */
export type FeedbackCategory = 'Bug' | 'UX Issue' | 'Suggestion' | 'Performance' | 'Question' | 'General';

/**
 * Severity levels for prioritization
 */
export type FeedbackSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

/**
 * A single feedback item with transcription and associated screenshots
 */
export interface FeedbackItem {
  id: string;
  transcription: string;
  timestamp: number;
  screenshots: Screenshot[];
  title?: string;
  keywords?: string[];
  category?: FeedbackCategory;
  severity?: FeedbackSeverity;
}

/**
 * Session metadata for context
 */
export interface SessionMetadata {
  os?: string;
  sourceName?: string;
  sourceType?: 'screen' | 'window' | 'region';
  captureContexts?: CaptureContextSnapshot[];
}

/**
 * Enhanced session structure for markdown generation
 */
export interface Session {
  id: string;
  startTime: number;
  endTime?: number;
  feedbackItems: FeedbackItem[];
  metadata?: SessionMetadata;
}

/**
 * Options for generating the full markdown document
 */
export interface GenerateOptions {
  projectName: string;
  screenshotDir: string; // Relative path for image references
}

/**
 * The generated markdown document with metadata
 */
export interface MarkdownDocument {
  content: string;
  filename: string;
  metadata: {
    itemCount: number;
    screenshotCount: number;
    duration: number;
    types: Record<string, number>;
  };
}

/**
 * Interface for the MarkdownGenerator
 */
export interface IMarkdownGenerator {
  generateFullDocument(session: Session, options: GenerateOptions): MarkdownDocument;
  generateFromPostProcess(result: PostProcessResult, sessionDir: string): string;
  generateClipboardSummary(session: Session, projectName?: string, reportPath?: string): string;
  generateFeedbackItemId(index: number): string;
}

// ============================================================================
// Adapter: Convert FeedbackSession to Session
// ============================================================================

/**
 * Convert the existing FeedbackSession type to the enhanced Session type.
 * Groups transcription segments with their associated screenshots.
 */
export function adaptFeedbackSession(
  feedbackSession: FeedbackSession,
  options?: { pauseThresholdMs?: number }
): Session {
  const pauseThreshold = options?.pauseThresholdMs ?? 1500;
  const { id, startedAt, endedAt, screenshots, transcription } = feedbackSession;

  // Group transcription segments into feedback items
  // A new item starts when there's a significant pause between segments
  const feedbackItems: FeedbackItem[] = [];
  let currentItem: FeedbackItem | null = null;

  const sortedTranscription = [...transcription].sort((a, b) => a.startTime - b.startTime);
  const sortedScreenshots = [...screenshots].sort((a, b) => a.timestamp - b.timestamp);

  for (const segment of sortedTranscription) {
    const shouldStartNewItem =
      !currentItem ||
      (segment.startTime - (currentItem.timestamp + getPreviousSegmentDuration(currentItem, sortedTranscription))) > pauseThreshold;

    if (shouldStartNewItem) {
      // Save previous item
      if (currentItem) {
        feedbackItems.push(currentItem);
      }

      // Start new item
      currentItem = {
        id: `item-${feedbackItems.length + 1}`,
        transcription: segment.text,
        timestamp: segment.startTime,
        screenshots: [],
        category: inferCategory(segment.text),
      };
    } else if (currentItem) {
      // Continue current item
      currentItem.transcription += ' ' + segment.text;
    }
  }

  // Don't forget the last item
  if (currentItem) {
    feedbackItems.push(currentItem);
  }

  // Associate screenshots with feedback items
  for (const screenshot of sortedScreenshots) {
    // Find the feedback item that this screenshot belongs to
    // (screenshot timestamp falls within or just after the item's timeframe)
    const matchingItem = findMatchingItem(feedbackItems, screenshot.timestamp, pauseThreshold);
    if (matchingItem) {
      matchingItem.screenshots.push(screenshot);
    } else if (feedbackItems.length > 0) {
      // Associate with the last item if no match found
      feedbackItems[feedbackItems.length - 1].screenshots.push(screenshot);
    }
  }

  return {
    id,
    startTime: startedAt,
    endTime: endedAt,
    feedbackItems,
    metadata: {
      os: process?.platform || 'Unknown',
      sourceName: 'markupR Session',
      sourceType: 'screen',
    },
  };
}

function getPreviousSegmentDuration(item: FeedbackItem, _allSegments: TranscriptionSegment[]): number {
  // Estimate duration based on transcription length (rough: 150 words/min)
  const words = item.transcription.split(/\s+/).length;
  return (words / 150) * 60 * 1000; // ms
}

function findMatchingItem(
  items: FeedbackItem[],
  timestamp: number,
  threshold: number
): FeedbackItem | undefined {
  // Find item where screenshot timestamp is within item timeframe + threshold
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    const estimatedDuration = (item.transcription.split(/\s+/).length / 150) * 60 * 1000;
    const itemEnd = item.timestamp + estimatedDuration + threshold;

    if (timestamp >= item.timestamp && timestamp <= itemEnd) {
      return item;
    }
  }
  return undefined;
}

function inferCategory(text: string): FeedbackCategory {
  const lowerText = text.toLowerCase();

  if (lowerText.includes('bug') || lowerText.includes('broken') || lowerText.includes('error') ||
      lowerText.includes('crash') || lowerText.includes('doesn\'t work') || lowerText.includes('not working')) {
    return 'Bug';
  }

  if (lowerText.includes('confusing') || lowerText.includes('hard to') || lowerText.includes('unclear') ||
      lowerText.includes('ux') || lowerText.includes('user experience') || lowerText.includes('usability')) {
    return 'UX Issue';
  }

  if (lowerText.includes('slow') || lowerText.includes('lag') || lowerText.includes('sluggish') ||
      lowerText.includes('performance') || lowerText.includes('latency') || lowerText.includes('janky')) {
    return 'Performance';
  }

  if (/\bshould (add|have|include|be|provide)\b/.test(lowerText) || /\bcould (add|have|include|be)\b/.test(lowerText) ||
      lowerText.includes('would be nice') || lowerText.includes('suggestion') ||
      /\bfeature\b/.test(lowerText) || /\badd (a|an|the|this|some|more)\b/.test(lowerText)) {
    return 'Suggestion';
  }

  if (lowerText.includes('?') || lowerText.includes('how') || lowerText.includes('why') ||
      lowerText.includes('what') || lowerText.includes('question')) {
    return 'Question';
  }

  return 'General';
}

// ============================================================================
// MarkdownGenerator Implementation
// ============================================================================

class MarkdownGeneratorImpl implements IMarkdownGenerator {
  /**
   * Generate a full markdown document with all feedback items and metadata.
   * Follows llms.txt-inspired format for AI readability.
   */
  generateFullDocument(session: Session, options: GenerateOptions): MarkdownDocument {
    const { projectName, screenshotDir } = options;
    const items = session.feedbackItems;
    const duration = session.endTime
      ? this.formatDuration(session.endTime - session.startTime)
      : 'In Progress';
    const timestamp = this.formatTimestamp(session.endTime || Date.now());
    const filename = this.generateFilename(projectName, session.startTime);

    // Early return for empty sessions — produce a clean minimal document
    if (items.length === 0) {
      const content = `# ${projectName} Feedback Report
> Generated by markupR on ${timestamp}
> Duration: ${duration}

_No feedback items were captured during this session._

---
*Generated by [markupR](https://markupr.com)*
${REPORT_SUPPORT_LINE}
`;
      return {
        content,
        filename,
        metadata: {
          itemCount: 0,
          screenshotCount: 0,
          duration: session.endTime ? session.endTime - session.startTime : 0,
          types: {},
        },
      };
    }

    // Count types
    const typeCounts = this.countTypes(items);
    const severityCounts = this.countSeverities(items);
    const screenshotCount = this.countScreenshots(items);
    const topThemes = this.extractTopThemes(items);
    const highImpactCount = (severityCounts.Critical || 0) + (severityCounts.High || 0);

    const platform = session.metadata?.os || process?.platform || 'Unknown';

    let content = `# ${projectName} Feedback Report
> Generated by markupR on ${timestamp}
> Duration: ${duration} | Items: ${items.length} | Screenshots: ${screenshotCount}

## Session Overview
- **Session ID:** \`${session.id}\`
- **Source:** ${session.metadata?.sourceName || 'Unknown'} (${session.metadata?.sourceType || 'screen'})
- **Platform:** ${platform}
- **Segments:** ${items.length}
- **High-impact items:** ${highImpactCount}

---

## Executive Summary

- ${items.length} total feedback items were captured.
- ${highImpactCount} items are categorized as **Critical** or **High** priority.
- ${screenshotCount} screenshots were aligned to spoken context.
`;

    if (topThemes.length > 0) {
      content += `- Top themes: ${topThemes.join(', ')}.\n`;
    }

    content += `
---

## Actionable Feedback

`;

    items.forEach((item, index) => {
      const id = this.generateFeedbackItemId(index);
      const title = item.title || this.generateTitle(item.transcription);
      const itemTimestamp = this.formatItemTimestamp(item.timestamp - session.startTime);
      const category = item.category || 'General';
      const severity = item.severity || this.defaultSeverityForCategory(category);
      const signals = item.keywords?.slice(0, 5) || [];
      const suggestedAction = this.suggestAction(category, severity, item.transcription);

      content += `### ${id}: ${title}
- **Severity:** ${severity}
- **Type:** ${category}
- **Timestamp:** ${itemTimestamp}
`;

      if (signals.length > 0) {
        content += `- **Signals:** ${signals.join(', ')}\n`;
      }

      content += `
#### What Happened

> ${this.wrapTranscription(item.transcription)}

`;

      if (item.screenshots.length > 0) {
        content += `#### Evidence\n`;
        item.screenshots.forEach((ss, ssIndex) => {
          // Use the item's position index (not the FB-XXX display ID) for the
          // filename so it stays aligned with FileManager.saveSession which
          // names files by the original feedbackItems array index.
          const screenshotFilename = this.generateScreenshotFilename(index, ssIndex, item.screenshots.length);
          content += `![${id}${item.screenshots.length > 1 ? `-${ssIndex + 1}` : ''}](${screenshotDir}/${screenshotFilename})\n\n`;
        });
      } else {
        content += `#### Evidence\n_No screenshot captured for this item._\n\n`;
      }

      content += `#### Suggested Next Step
- ${suggestedAction}

`;

      content += `---

`;
    });

    // Summary tables
    content += `## Summary

| Type | Count |
|------|-------|
`;
    Object.entries(typeCounts).forEach(([type, count]) => {
      content += `| ${type} | ${count} |\n`;
    });
    content += `| **Total** | **${items.length}** |\n`;

    content += `
| Severity | Count |
|----------|-------|
`;
    Object.entries(severityCounts).forEach(([severity, count]) => {
      content += `| ${severity} | ${count} |\n`;
    });
    content += `| **Total** | **${items.length}** |\n`;

    content += `
---
*Generated by [markupR](https://markupr.com)*
${REPORT_SUPPORT_LINE}
`;

    return {
      content,
      filename,
      metadata: {
        itemCount: items.length,
        screenshotCount,
        duration: session.endTime ? session.endTime - session.startTime : 0,
        types: typeCounts,
      },
    };
  }

  /**
   * Generate markdown from a PostProcessResult (post-recording pipeline output).
   *
   * Produces a clean, AI-readable document with:
   * - Session header with human-readable timestamp
   * - Each transcript segment as a heading with [M:SS] timestamp
   * - Blockquoted transcript text
   * - Associated frame images referenced as relative paths
   *
   * @param result - The combined transcript + frame output from PostProcessor
   * @param sessionDir - Absolute path to the session directory (used to compute relative frame paths)
   * @returns The generated markdown string
   */
  generateFromPostProcess(result: PostProcessResult, sessionDir: string): string {
    const { transcriptSegments, extractedFrames } = result;
    const sessionTimestamp = this.formatDateDeterministic(new Date());

    // Compute session duration from transcript span
    const sessionDuration = transcriptSegments.length > 0
      ? this.formatDuration(
          (transcriptSegments[transcriptSegments.length - 1].endTime - transcriptSegments[0].startTime) * 1000
        )
      : '0:00';

    let md = `# markupR Session — ${sessionTimestamp}\n`;
    md += `> Segments: ${transcriptSegments.length} | Frames: ${extractedFrames.length} | Duration: ${sessionDuration}\n\n`;

    if (transcriptSegments.length === 0) {
      md += `_No speech was detected during this recording._\n\n`;
      if (extractedFrames.length > 0) {
        md += `## Captured Moments\n\n`;
        for (const frame of extractedFrames.slice().sort((a, b) => a.timestamp - b.timestamp)) {
          const frameTimestamp = this.formatPostProcessTimestamp(frame.timestamp);
          const relativePath = this.computeRelativeFramePath(frame.path, sessionDir);
          md += `![Frame at ${frameTimestamp}](${relativePath})\n\n`;
          const contextLine = this.formatCaptureContextLine(frame.captureContext);
          if (contextLine) md += `> ${contextLine}\n\n`;
        }
      }
      md += `---\n*Generated by [markupR](https://markupr.com)*\n${REPORT_SUPPORT_LINE}\n`;
      return md;
    }

    md += `## Transcript\n\n`;

    // Build a map from transcript segment index to associated frames.
    // A frame is associated with the segment whose time range contains the
    // frame timestamp, or the closest segment by start time.
    const segmentFrameMap = this.mapFramesToSegments(transcriptSegments, extractedFrames);

    for (let i = 0; i < transcriptSegments.length; i++) {
      const segment = transcriptSegments[i];
      const formattedTime = this.formatPostProcessTimestamp(segment.startTime);
      const title = this.generateSegmentTitle(segment.text);

      md += `### [${formattedTime}] ${title}\n`;
      md += `> ${this.wrapTranscription(segment.text)}\n\n`;

      // Append any frames associated with this segment
      const frames = segmentFrameMap.get(i);
      if (frames && frames.length > 0) {
        for (const frame of frames) {
          const frameTimestamp = this.formatPostProcessTimestamp(frame.timestamp);
          const relativePath = this.computeRelativeFramePath(frame.path, sessionDir);
          md += `![Frame at ${frameTimestamp}](${relativePath})\n\n`;
          const contextLine = this.formatCaptureContextLine(frame.captureContext);
          if (contextLine) {
            md += `> ${contextLine}\n\n`;
          }
        }
      }
    }

    md += `---\n*Generated by [markupR](https://markupr.com)*\n${REPORT_SUPPORT_LINE}\n`;

    return md;
  }

  /**
   * Map extracted frames to their closest transcript segments.
   * Returns a Map from segment index to an array of frames.
   */
  private mapFramesToSegments(
    segments: TranscriptSegment[],
    frames: ExtractedFrame[]
  ): Map<number, ExtractedFrame[]> {
    const map = new Map<number, ExtractedFrame[]>();

    for (const frame of frames) {
      let bestIndex = 0;
      let bestDistance = Infinity;

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];

        // If the frame timestamp falls within the segment range, it is a direct match
        if (frame.timestamp >= seg.startTime && frame.timestamp <= seg.endTime) {
          bestIndex = i;
          bestDistance = 0;
          break;
        }

        // Otherwise track the closest segment by start time
        const distance = Math.abs(frame.timestamp - seg.startTime);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = i;
        }
      }

      const existing = map.get(bestIndex) || [];
      existing.push(frame);
      map.set(bestIndex, existing);
    }

    // Sort frames within each segment by timestamp
    for (const [, frameList] of map) {
      frameList.sort((a, b) => a.timestamp - b.timestamp);
    }

    return map;
  }

  /**
   * Compute a relative path for a frame image from the session directory.
   * If the frame path is already relative, return it as-is.
   * If absolute, compute the relative path from sessionDir.
   */
  private computeRelativeFramePath(framePath: string, sessionDir: string): string {
    if (!path.isAbsolute(framePath)) {
      return framePath;
    }
    return path.relative(sessionDir, framePath);
  }

  private formatCaptureContextLine(
    context: ExtractedFrame['captureContext']
  ): string | undefined {
    if (!context) {
      return undefined;
    }

    const cursor = context.cursor
      ? `Cursor: ${Math.round(context.cursor.x)}, ${Math.round(context.cursor.y)}`
      : undefined;
    const app = context.activeWindow?.appName || context.activeWindow?.sourceName;
    const focus = context.focusedElement?.textPreview
      || context.focusedElement?.label
      || context.focusedElement?.role;
    const annotation = context.annotation
      ? `Annotation: ${context.annotation.tool} (${context.annotation.color})`
      : undefined;

    const parts = [annotation, cursor, app ? `App: ${app}` : undefined, focus ? `Focus: ${focus}` : undefined]
      .filter((part): part is string => Boolean(part));

    return parts.length ? parts.join(' | ') : undefined;
  }

  /**
   * Format a timestamp in seconds to M:SS format for post-process output.
   * Examples: 0 -> "0:00", 15.3 -> "0:15", 125 -> "2:05"
   */
  private formatPostProcessTimestamp(seconds: number): string {
    const totalSeconds = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Generate a short title from transcript text (first sentence, max 60 chars).
   */
  private generateSegmentTitle(text: string): string {
    const firstSentence = text.split(/[.!?]/)[0].trim();
    if (firstSentence.length <= 60) return firstSentence;
    return firstSentence.slice(0, 57) + '...';
  }

  /**
   * Generate a clipboard-friendly summary (<1500 chars).
   * Includes priority items and a reference to the full report.
   *
   * @param session - Session data
   * @param projectName - Optional project name for the header
   * @param reportPath - Optional absolute or relative path to the full report file.
   *                     When provided, the summary links to this path instead of the
   *                     generic ./feedback-report.md placeholder.
   */
  generateClipboardSummary(session: Session, projectName?: string, reportPath?: string): string {
    const name = projectName || session.metadata?.sourceName || 'Project';
    const items = session.feedbackItems;

    let summary = `# Feedback: ${name} - ${items.length} items\n\n`;

    // Priority items (first 3)
    const maxPriorityItems = 3;
    summary += `## Priority Items\n`;

    items.slice(0, maxPriorityItems).forEach((item, index) => {
      const id = this.generateFeedbackItemId(index);
      const title = this.generateTitle(item.transcription);
      const oneLineSummary = this.truncateText(item.transcription, 60);
      summary += `- **${id}:** ${title} - ${oneLineSummary}\n`;
    });

    if (items.length > maxPriorityItems) {
      const remainingIds = items
        .slice(maxPriorityItems)
        .map((_, i) => this.generateFeedbackItemId(i + maxPriorityItems))
        .join(', ');
      summary += `\n## Other\n- ${remainingIds} (see full report)\n`;
    }

    summary += `\n**Full report:** ${reportPath || './feedback-report.md'}`;

    // Ensure we stay under 1500 chars
    if (summary.length > 1500) {
      summary = summary.slice(0, 1497) + '...';
    }

    return summary;
  }

  /**
   * Generate a feedback item ID (FB-001, FB-002, etc.)
   */
  generateFeedbackItemId(index: number): string {
    return `FB-${(index + 1).toString().padStart(3, '0')}`;
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Generate a title from the transcription (first sentence or 50 chars)
   */
  private generateTitle(transcription: string): string {
    // Extract first sentence
    const firstSentence = transcription.split(/[.!?]/)[0].trim();
    if (firstSentence.length <= 50) return firstSentence;
    return firstSentence.slice(0, 47) + '...';
  }

  /**
   * Truncate text to specified length
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
  }

  /**
   * Wrap transcription for markdown blockquote (handle multi-line).
   * Splits on sentence-ending punctuation followed by whitespace so that
   * all multi-sentence inputs (including 2-sentence ones) get proper
   * blockquote continuation lines.
   */
  private wrapTranscription(transcription: string): string {
    if (!transcription.includes('.') && !transcription.includes('!') && !transcription.includes('?')) {
      return transcription;
    }
    const sentences = transcription.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
    if (sentences.length <= 1) return transcription;
    return sentences.join('\n> ');
  }

  /**
   * Format duration from milliseconds to M:SS
   */
  private formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Format timestamp to a deterministic human-readable string.
   * Uses explicit formatting instead of toLocaleString to produce
   * consistent output across platforms and Node.js versions.
   */
  private formatTimestamp(ms: number): string {
    return this.formatDateDeterministic(new Date(ms));
  }

  /**
   * Produce a deterministic date string: "Feb 14, 2026 at 10:30 AM".
   * Avoids toLocaleString which can vary across OS versions.
   */
  private formatDateDeterministic(date: Date): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    const rawHours = date.getHours();
    const ampm = rawHours >= 12 ? 'PM' : 'AM';
    const hours = rawHours % 12 || 12;
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month} ${day}, ${year} at ${hours}:${minutes} ${ampm}`;
  }

  /**
   * Format item timestamp as MM:SS from session start
   */
  private formatItemTimestamp(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Generate filename following pattern: {project}-feedback-{YYYYMMDD-HHmmss}.md
   */
  private generateFilename(projectName: string, startTime: number): string {
    const date = new Date(startTime);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    const dateStr = `${year}${month}${day}`;
    const timeStr = `${hours}${minutes}${seconds}`;
    const safeName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

    return `${safeName}-feedback-${dateStr}-${timeStr}.md`;
  }

  /**
   * Generate screenshot filename for a feedback item.
   * Uses the item's position index to produce `fb-{NNN}.png`, matching the
   * naming convention in FileManager.saveSession.
   */
  private generateScreenshotFilename(itemIndex: number, screenshotIndex: number, total: number): string {
    const num = (itemIndex + 1).toString().padStart(3, '0');
    const suffix = total > 1 ? `-${screenshotIndex + 1}` : '';
    return `fb-${num}${suffix}.png`;
  }

  /**
   * Provide a severity fallback when upstream analysis is unavailable.
   */
  private defaultSeverityForCategory(category: FeedbackCategory): FeedbackSeverity {
    switch (category) {
      case 'Bug':
        return 'High';
      case 'Performance':
        return 'High';
      case 'UX Issue':
        return 'Medium';
      case 'Suggestion':
        return 'Low';
      case 'Question':
        return 'Low';
      default:
        return 'Medium';
    }
  }

  private countSeverities(items: FeedbackItem[]): Record<string, number> {
    return items.reduce((acc, item) => {
      const severity = item.severity || this.defaultSeverityForCategory(item.category || 'General');
      acc[severity] = (acc[severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private extractTopThemes(items: FeedbackItem[]): string[] {
    const counts = new Map<string, number>();

    items.forEach((item) => {
      (item.keywords || []).forEach((keyword) => {
        const normalized = keyword.toLowerCase();
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      });
    });

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([keyword]) => keyword);
  }

  private suggestAction(
    category: FeedbackCategory,
    severity: FeedbackSeverity,
    transcription: string
  ): string {
    const excerpt = this.truncateText(transcription, 120);

    switch (category) {
      case 'Bug':
        return `Reproduce and patch this defect, then add a regression test that validates: "${excerpt}".`;
      case 'Performance':
        return `Profile this flow, target the slow step first, and validate before/after metrics for: "${excerpt}".`;
      case 'UX Issue':
        return `Revise the UI interaction and run a quick usability check focused on: "${excerpt}".`;
      case 'Suggestion':
        return severity === 'High' || severity === 'Critical'
          ? `Treat this suggestion as near-term roadmap work and define implementation scope for: "${excerpt}".`
          : `Track this as an enhancement request and prioritize against current sprint goals: "${excerpt}".`;
      case 'Question':
        return `Answer this explicitly in product/docs so future reviews don't block on: "${excerpt}".`;
      default:
        return `Investigate this item and convert it into a concrete engineering task: "${excerpt}".`;
    }
  }

  /**
   * Count feedback items by type/category
   */
  private countTypes(items: FeedbackItem[]): Record<string, number> {
    return items.reduce((acc, item) => {
      const type = item.category || 'General';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Count total screenshots across all items
   */
  private countScreenshots(items: FeedbackItem[]): number {
    return items.reduce((sum, item) => sum + item.screenshots.length, 0);
  }
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Singleton instance for easy import
 */
export const markdownGenerator = new MarkdownGeneratorImpl();

// Re-export the class for testing
export { MarkdownGeneratorImpl as MarkdownGenerator };
