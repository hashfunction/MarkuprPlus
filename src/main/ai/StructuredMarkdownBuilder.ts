/**
 * StructuredMarkdownBuilder
 *
 * Converts a provider's structured JSON analysis (AIAnalysisResult) into polished,
 * actionable markdown documents. The output is consumed by:
 * 1. Claude Code via /review-feedback skill (primary consumer)
 * 2. Users reading in GitHub or any markdown viewer
 * 3. Other AI coding agents
 *
 * Maintains compatibility with the existing MarkdownGenerator's FB-XXX ID scheme
 * and screenshot reference patterns.
 */

import type {
  AIAnalysisResult,
  AIFeedbackItem,
  AIFeedbackPriority,
  Session,
  Screenshot,
} from './types';

// =============================================================================
// Builder Options
// =============================================================================

export interface MarkdownBuildOptions {
  /** Project name shown in the report header. */
  projectName: string;
  /** Relative path for screenshot references (e.g., "./screenshots"). */
  screenshotDir: string;
  /** Whether a session recording video exists. */
  hasRecording?: boolean;
  /** Filename of the session recording (default: "session-recording.webm"). */
  recordingFilename?: string;
  /** Claude model ID used for analysis (shown in footer). */
  modelId?: string;
  /** Human-readable analysis provider used in report attribution. */
  providerLabel?: string;
}

// =============================================================================
// StructuredMarkdownBuilder
// =============================================================================

export class StructuredMarkdownBuilder {
  /**
   * Build a complete AI-enhanced markdown document from session data and Claude's analysis.
   */
  buildDocument(
    session: Session,
    aiResult: AIAnalysisResult,
    options: MarkdownBuildOptions,
  ): string {
    const sections: string[] = [];

    sections.push(this.buildHeader(session, aiResult, options));
    sections.push(this.buildSummary(aiResult));
    sections.push(this.buildFeedbackItems(session, aiResult, options));

    if (aiResult.themes.length > 0) {
      sections.push(this.buildThemes(aiResult.themes));
    }

    if (aiResult.positiveNotes.length > 0) {
      sections.push(this.buildPositiveNotes(aiResult.positiveNotes));
    }

    if (options.hasRecording) {
      sections.push(this.buildRecordingSection(options));
    }

    sections.push(this.buildSessionInfo(session, aiResult, options));
    sections.push(this.buildFooter(options));

    return sections.join('\n');
  }

  // ===========================================================================
  // Section Builders
  // ===========================================================================

  private buildHeader(
    session: Session,
    aiResult: AIAnalysisResult,
    options: MarkdownBuildOptions,
  ): string {
    const date = this.formatDate(session.endTime ?? Date.now());
    const duration = session.endTime
      ? this.formatDuration(session.endTime - session.startTime)
      : 'In Progress';
    const screenshotCount = session.screenshotBuffer.length;

    return [
      `# Feedback Report: ${options.projectName} - ${date}`,
      '',
      `> AI-analyzed by ${options.providerLabel ?? 'AI'} | Duration: ${duration} | ${screenshotCount} screenshots | ${aiResult.items.length} items identified`,
      '',
    ].join('\n');
  }

  private buildSummary(aiResult: AIAnalysisResult): string {
    return [
      '## Summary',
      '',
      aiResult.summary,
      '',
      '---',
      '',
    ].join('\n');
  }

  private buildFeedbackItems(
    session: Session,
    aiResult: AIAnalysisResult,
    options: MarkdownBuildOptions,
  ): string {
    const grouped = this.groupByPriority(aiResult.items);
    const lines: string[] = [];

    const priorityOrder: AIFeedbackPriority[] = ['Critical', 'High', 'Medium', 'Low'];
    const sectionTitles: Record<AIFeedbackPriority, string> = {
      Critical: 'Critical Issues',
      High: 'High Priority',
      Medium: 'Improvements Needed',
      Low: 'Suggestions',
    };

    let sequentialIndex = 0;
    for (const priority of priorityOrder) {
      const items = grouped[priority];
      if (!items || items.length === 0) continue;

      lines.push(`## ${sectionTitles[priority]}`);
      lines.push('');

      for (const { item } of items) {
        lines.push(
          this.buildSingleItem(item, sequentialIndex, session, options),
        );
        sequentialIndex++;
      }
    }

    return lines.join('\n');
  }

  private buildSingleItem(
    item: AIFeedbackItem,
    index: number,
    session: Session,
    options: MarkdownBuildOptions,
  ): string {
    const timestamp = this.estimateItemTimestamp(item, session);
    const lines: string[] = [];

    lines.push(`### ${this.formatItemId(index)}: ${item.title}`);
    lines.push(`> "${item.quote}"`);
    lines.push('');

    // Screenshot references
    for (const ssIndex of item.screenshotIndices) {
      const screenshotFilename = this.resolveScreenshotFilename(session, ssIndex);
      if (!screenshotFilename) {
        continue;
      }
      lines.push(`![screenshot-${ssIndex + 1}](${options.screenshotDir}/${screenshotFilename})`);
    }

    if (item.screenshotIndices.length > 0) {
      lines.push('');
    }

    lines.push(`- **Priority:** ${item.priority}`);
    lines.push(`- **Category:** ${item.category}`);
    lines.push(`- **Area:** ${item.area}`);
    lines.push(`- **Timestamp:** ${timestamp}`);
    lines.push(
      `- **Action:** ${item.actionItem}`,
    );
    lines.push('');
    lines.push('---');
    lines.push('');

    return lines.join('\n');
  }

  private resolveScreenshotFilename(session: Session, screenshotIndex: number): string | null {
    if (!Number.isInteger(screenshotIndex) || screenshotIndex < 0) {
      return null;
    }

    const screenshot = session.screenshotBuffer[screenshotIndex];
    if (!screenshot) {
      return null;
    }

    const matchedFeedbackIndex = session.feedbackItems.findIndex(
      (item) => item.screenshot?.id === screenshot.id,
    );
    const index = matchedFeedbackIndex >= 0 ? matchedFeedbackIndex : screenshotIndex;
    return `fb-${(index + 1).toString().padStart(3, '0')}.png`;
  }

  private buildThemes(themes: string[]): string {
    const lines: string[] = [
      '## Themes',
      '',
    ];

    for (const theme of themes) {
      lines.push(`- ${theme}`);
    }

    lines.push('');
    lines.push('---');
    lines.push('');
    return lines.join('\n');
  }

  private buildPositiveNotes(notes: string[]): string {
    const lines: string[] = [
      '## Positive Notes',
      '',
    ];

    for (const note of notes) {
      lines.push(`- ${note}`);
    }

    lines.push('');
    lines.push('---');
    lines.push('');
    return lines.join('\n');
  }

  private buildRecordingSection(options: MarkdownBuildOptions): string {
    const filename = options.recordingFilename ?? 'session-recording.webm';
    return [
      '## Session Recording',
      '',
      `[Watch full session recording](./${filename})`,
      '',
      '---',
      '',
    ].join('\n');
  }

  private buildSessionInfo(
    session: Session,
    aiResult: AIAnalysisResult,
    options: MarkdownBuildOptions,
  ): string {
    const duration = session.endTime
      ? this.formatDuration(session.endTime - session.startTime)
      : 'In Progress';
    const screenshotCount = session.screenshotBuffer.length;
    const modelLabel = options.modelId
      ? `${options.providerLabel ?? 'AI'} (${options.modelId})`
      : options.providerLabel ?? 'AI';
    const platform = process?.platform ?? 'Unknown';

    const lines: string[] = [
      '## Session Info',
      '',
      `- **Session ID:** \`${session.id}\``,
      `- **Source:** ${session.metadata.sourceName ?? 'Unknown'} (${session.metadata.windowTitle ? 'window' : 'screen'})`,
      `- **Platform:** ${platform}`,
      `- **Duration:** ${duration}`,
      `- **Screenshots:** ${screenshotCount}`,
      `- **Segments:** ${session.transcriptBuffer.length}`,
    ];

    if (options.hasRecording) {
      const filename = options.recordingFilename ?? 'session-recording.webm';
      lines.push(`- **Recording:** [${filename}](./${filename})`);
    }

    lines.push(`- **Analysis:** ${modelLabel} (AI-enhanced)`);
    lines.push(`- **Items:** ${aiResult.metadata.totalItems} total, ${aiResult.metadata.criticalCount} critical, ${aiResult.metadata.highCount} high`);
    lines.push('');
    lines.push('---');
    lines.push('');
    return lines.join('\n');
  }

  private buildFooter(options: MarkdownBuildOptions): string {
    const model = options.modelId
      ? ` with ${options.providerLabel ?? 'AI'} (${options.modelId})`
      : options.providerLabel
        ? ` with ${options.providerLabel}`
        : ' with AI analysis';
    return `*Generated by [markupR](https://markupr.com)${model}*\n*If this report saved you time, support development: [Ko-fi](https://ko-fi.com/eddiesanjuan)*\n`;
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /**
   * Group items by priority, preserving original indices for FB-XXX IDs.
   */
  private groupByPriority(
    items: AIFeedbackItem[],
  ): Record<AIFeedbackPriority, { item: AIFeedbackItem; originalIndex: number }[]> {
    const grouped: Record<AIFeedbackPriority, { item: AIFeedbackItem; originalIndex: number }[]> = {
      Critical: [],
      High: [],
      Medium: [],
      Low: [],
    };

    items.forEach((item, index) => {
      grouped[item.priority].push({ item, originalIndex: index });
    });

    return grouped;
  }

  /**
   * Format a 0-based index as FB-001, FB-002, etc.
   */
  formatItemId(index: number): string {
    return `FB-${(index + 1).toString().padStart(3, '0')}`;
  }

  /**
   * Estimate item timestamp as MM:SS relative to session start.
   * Uses the quote text to find a matching transcript segment, or falls back to item order.
   */
  private estimateItemTimestamp(item: AIFeedbackItem, session: Session): string {
    // Try to match transcript buffer by quote text
    const quotePrefix = item.quote.slice(0, 30);
    const matchingSegment = session.transcriptBuffer.find(
      (seg) => seg.text.includes(quotePrefix),
    );

    if (matchingSegment) {
      // TranscriptEvent.timestamp is in epoch seconds; convert to ms first
      const tsMs = Math.round(matchingSegment.timestamp * 1000);
      const relativeMs = tsMs - session.startTime;
      return this.formatTimestamp(relativeMs);
    }

    // If screenshotIndices reference a real screenshot, use its timestamp
    if (item.screenshotIndices.length > 0) {
      const ssIndex = item.screenshotIndices[0];
      const screenshot: Screenshot | undefined = session.screenshotBuffer[ssIndex];
      if (screenshot) {
        const relativeMs = screenshot.timestamp - session.startTime;
        return this.formatTimestamp(relativeMs);
      }
    }

    return '--:--';
  }

  /**
   * Format milliseconds as MM:SS.
   */
  private formatTimestamp(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Format milliseconds as M:SS for duration display.
   */
  private formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Format a timestamp as a human-readable date string.
   */
  private formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
}

/**
 * Singleton instance for easy import.
 */
export const structuredMarkdownBuilder = new StructuredMarkdownBuilder();
