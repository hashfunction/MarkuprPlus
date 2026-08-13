/**
 * ClaudeAnalyzer - Core AI analysis engine for markupR
 *
 * Takes a session's transcript + screenshots, sends to Claude Sonnet 4.5 with vision,
 * and returns structured feedback analysis as AIAnalysisResult.
 *
 * On any error, returns null so the caller can fall back to the free tier.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Session } from '../SessionController';
import type {
  AIAnalysisResult,
  ClaudeAnalyzerOptions,
  OptimizedImage,
} from './types';
import {
  DEFAULT_CLAUDE_ANALYZER_OPTIONS,
  AIPipelineError,
} from './types';
import { optimizeForAPI } from './ImageOptimizer';
import type { ImageOptimizeOptions } from './types';
import {
  ANALYSIS_SYSTEM_PROMPT,
  buildTranscriptText,
  parseAnalysisResult,
  toRelativeTimestamp,
} from './analysisContract';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build the Claude API message content array with text + image blocks.
 */
function buildUserContent(
  session: Session,
  optimizedImages: OptimizedImage[],
): Anthropic.Messages.ContentBlockParam[] {
  const sourceName = session.metadata?.sourceName || 'Application';
  const transcriptText = buildTranscriptText(session);

  // Map optimized images back to their original screenshot timestamps
  const screenshotTimestamps = new Map<string, number>();
  for (const s of session.screenshotBuffer) {
    screenshotTimestamps.set(s.id, s.timestamp);
  }

  // Build the text preamble
  let textContent = `## Transcript\n\nThe user narrated the following while reviewing the application "${sourceName}":\n\n${transcriptText}`;

  if (optimizedImages.length > 0) {
    textContent += `\n\n---\n\n## Screenshots\n\n${optimizedImages.length} screenshots were captured at natural pause points during narration.\nThey are provided as images below in chronological order.`;
  }

  const content: Anthropic.Messages.ContentBlockParam[] = [
    { type: 'text', text: textContent },
  ];

  // Add image blocks
  for (let i = 0; i < optimizedImages.length; i++) {
    const img = optimizedImages[i];
    const originalTs = screenshotTimestamps.get(img.originalScreenshotId) ?? session.startTime;
    const rel = toRelativeTimestamp(originalTs, session.startTime);

    content.push({
      type: 'text',
      text: `Screenshot ${i + 1} (captured at ${rel}):`,
    });

    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mediaType,
        data: img.data.toString('base64'),
      },
    });
  }

  return content;
}

// =============================================================================
// ClaudeAnalyzer
// =============================================================================

export class ClaudeAnalyzer {
  private client: Anthropic;
  private options: ClaudeAnalyzerOptions;

  constructor(apiKey: string, options?: Partial<ClaudeAnalyzerOptions>, baseUrl?: string) {
    this.options = { ...DEFAULT_CLAUDE_ANALYZER_OPTIONS, ...options };

    const clientOptions: ConstructorParameters<typeof Anthropic>[0] = { apiKey };
    if (baseUrl) {
      clientOptions.baseURL = baseUrl;
    }
    this.client = new Anthropic(clientOptions);
  }

  /**
   * Analyze a session using Claude's vision API.
   *
   * @param session - The completed session with transcript and screenshots
   * @param imageOptions - Optional image optimization settings
   * @returns Structured analysis result, or null on any error
   */
  async analyze(
    session: Session,
    imageOptions?: Partial<ImageOptimizeOptions>,
  ): Promise<AIAnalysisResult | null> {
    try {
      // Short-circuit: skip API call when there's nothing useful to analyze.
      // The free tier produces better output for empty sessions.
      const transcriptText = buildTranscriptText(session);
      const optimizedImages = optimizeForAPI(session.screenshotBuffer, imageOptions);

      if (transcriptText === '[No transcript available]' && optimizedImages.length === 0) {
        console.log('[ClaudeAnalyzer] Skipping API call: no transcript and no screenshots');
        return null;
      }

      // Build message content
      const userContent = buildUserContent(session, optimizedImages);

      // Call Claude API
      let timeoutHandle: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(
            new AIPipelineError(
              `Claude API request timed out after ${this.options.timeoutMs}ms`,
              'API_TIMEOUT',
            ),
          );
        }, this.options.timeoutMs);
      });

      const response = await Promise.race([
        this.client.messages.create({
          model: this.options.model,
          max_tokens: this.options.maxTokens,
          temperature: this.options.temperature,
          system: ANALYSIS_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userContent }],
        }),
        timeoutPromise,
      ]).finally(() => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
      });

      // Extract text from response
      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new AIPipelineError('No text content in Claude response', 'INVALID_RESPONSE');
      }

      // Parse JSON from response
      const result = parseAnalysisResult(textBlock.text);
      return result;
    } catch (error) {
      if (error instanceof AIPipelineError) {
        console.error(`[ClaudeAnalyzer] Pipeline error (${error.code}):`, error.message);
      } else {
        console.error('[ClaudeAnalyzer] Unexpected error:', error instanceof Error ? error.message : error);
      }
      return null;
    }
  }
}
