/**
 * AI Pipeline Types
 *
 * Type definitions for the AI analysis pipeline that transforms raw session data
 * (transcript + screenshots) into structured, actionable feedback documents using Claude.
 */

import type { Session } from '../SessionController';
import type { AnalysisProvider } from '../../shared/types';

// =============================================================================
// Tier & Configuration
// =============================================================================

/**
 * AI analysis tier determining which pipeline is used.
 * - 'free': Rule-based analysis (existing pipeline, no API call)
 * - 'byok': User's own Anthropic API key stored in OS keychain
 * - 'premium': Proxied through markupR's Cloudflare Worker
 */
export type AITier = 'free' | 'byok' | 'premium';

/**
 * Options for the ImageOptimizer.
 */
export interface ImageOptimizeOptions {
  /** Max width in pixels. Claude recommends 1568px on longest edge. */
  maxWidth: number;
  /** JPEG quality (0-100) when converting from PNG. */
  jpegQuality: number;
  /** Size threshold in bytes above which PNG is converted to JPEG. */
  pngToJpegThreshold: number;
  /** Maximum number of screenshots to send to the API. */
  maxScreenshots: number;
}

export const DEFAULT_IMAGE_OPTIMIZE_OPTIONS: ImageOptimizeOptions = {
  maxWidth: 1568,
  jpegQuality: 80,
  pngToJpegThreshold: 500 * 1024, // 500KB
  maxScreenshots: 20,
};

/**
 * Options for ClaudeAnalyzer.
 */
export interface ClaudeAnalyzerOptions {
  /** Claude model ID. */
  model: string;
  /** Maximum output tokens. */
  maxTokens: number;
  /** Sampling temperature (0-1). Lower = more deterministic. */
  temperature: number;
  /** API request timeout in milliseconds. */
  timeoutMs: number;
}

export const DEFAULT_CLAUDE_ANALYZER_OPTIONS: ClaudeAnalyzerOptions = {
  model: 'claude-sonnet-4-5-20250929',
  maxTokens: 4096,
  temperature: 0.3,
  timeoutMs: 30_000,
};

/**
 * Top-level options for the AI pipeline.
 */
export interface AIPipelineOptions {
  /** Which tier to use for analysis. */
  tier: AITier;
  /** Anthropic API key (required for 'byok' and 'premium' tiers). */
  apiKey?: string;
  /** Base URL for the Anthropic API (overridden for premium proxy). */
  baseUrl?: string;
  /** Image optimization settings. */
  imageOptions?: Partial<ImageOptimizeOptions>;
  /** Claude analyzer settings. */
  analyzerOptions?: Partial<ClaudeAnalyzerOptions>;
}

// =============================================================================
// AI Analysis Result (Claude's structured output)
// =============================================================================

/**
 * Category assigned by Claude to each feedback item.
 */
export type AIFeedbackCategory =
  | 'Bug'
  | 'UX Issue'
  | 'Performance'
  | 'Suggestion'
  | 'Question'
  | 'Positive Note';

/**
 * Priority level assigned by Claude.
 */
export type AIFeedbackPriority = 'Critical' | 'High' | 'Medium' | 'Low';

/**
 * A single feedback item from AI analysis.
 * Maps directly to the JSON schema in the Claude system prompt.
 */
export interface AIFeedbackItem {
  /** Short descriptive title (5-10 words). */
  title: string;
  /** Feedback category. */
  category: AIFeedbackCategory;
  /** Priority level. */
  priority: AIFeedbackPriority;
  /** User's exact words (relevant excerpt). */
  quote: string;
  /** Indices of related screenshots (0-based). */
  screenshotIndices: number[];
  /** Concrete 1-sentence action for a developer. */
  actionItem: string;
  /** Component or area of the app this relates to. */
  area: string;
}

/**
 * Metadata summary included in the AI analysis result.
 */
export interface AIAnalysisMetadata {
  totalItems: number;
  criticalCount: number;
  highCount: number;
}

/**
 * The complete structured output from Claude's analysis.
 * This is the JSON response parsed from the API call.
 */
export interface AIAnalysisResult {
  /** 2-3 sentence overview of key findings. */
  summary: string;
  /** Individual feedback items with categories, priorities, and actions. */
  items: AIFeedbackItem[];
  /** Cross-cutting themes identified across feedback. */
  themes: string[];
  /** Things the user explicitly praised. */
  positiveNotes: string[];
  /** Summary counts. */
  metadata: AIAnalysisMetadata;
}

// =============================================================================
// Optimized Image (output of ImageOptimizer)
// =============================================================================

/**
 * Media type for images sent to the Claude API.
 */
export type ImageMediaType = 'image/png' | 'image/jpeg';

/**
 * An optimized image ready to be sent to the Claude Vision API.
 */
export interface OptimizedImage {
  /** The image data buffer (resized and possibly re-encoded). */
  data: Buffer;
  /** MIME type of the image data. */
  mediaType: ImageMediaType;
  /** Original screenshot this was optimized from. */
  originalScreenshotId: string;
  /** Width after resize. */
  width: number;
  /** Height after resize. */
  height: number;
}

// =============================================================================
// Pipeline Progress & Errors
// =============================================================================

/**
 * Progress stages emitted during AI pipeline processing.
 */
export type AIPipelineStage =
  | 'optimizing-images'
  | 'building-prompt'
  | 'calling-api'
  | 'parsing-response'
  | 'building-markdown'
  | 'complete'
  | 'error'
  | 'fallback';

/**
 * Progress event emitted to the renderer during processing.
 */
export interface AIPipelineProgress {
  stage: AIPipelineStage;
  message: string;
  /** 0-100 progress percentage (approximate). */
  percent: number;
}

/**
 * Typed error codes for AI pipeline failures.
 */
export type AIPipelineErrorCode =
  | 'API_TIMEOUT'
  | 'API_AUTH_ERROR'
  | 'API_RATE_LIMIT'
  | 'API_SERVER_ERROR'
  | 'NETWORK_OFFLINE'
  | 'INVALID_RESPONSE'
  | 'IMAGE_OPTIMIZATION_FAILED'
  | 'UNKNOWN';

/**
 * Structured error from the AI pipeline.
 */
export class AIPipelineError extends Error {
  constructor(
    message: string,
    public readonly code: AIPipelineErrorCode,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'AIPipelineError';
  }
}

// =============================================================================
// Pipeline Input/Output
// =============================================================================

/**
 * Input to the AI pipeline — the raw session data.
 * Re-exported for convenience; the pipeline accepts the Session from SessionController.
 */
export type AIPipelineInput = Session;

/**
 * Output from the AI pipeline — either AI-enhanced or fallback markdown.
 */
export interface AIPipelineOutput {
  /** The final formatted markdown document. */
  markdown: string;
  /** Whether AI analysis was used (vs. free tier fallback). */
  aiEnhanced: boolean;
  /** The raw analysis result (only present when aiEnhanced is true). */
  analysis?: AIAnalysisResult;
  /** Processing duration in milliseconds. */
  processingTimeMs: number;
  /** Which tier was used. */
  tier: AITier;
  /** Concrete analysis provider selected for the session. */
  provider: AnalysisProvider;
  /** Human-readable provider attribution. */
  providerLabel?: string;
  /** Error info if AI failed and fell back to free tier. */
  fallbackReason?: string;
}

// =============================================================================
// Re-exports for convenience
// =============================================================================

export type { Screenshot, Session } from '../SessionController';
