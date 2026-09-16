/**
 * Shared Types for Transcription Services
 *
 * Available tiers (post-process architecture):
 * - Tier 1: Local Whisper (post-session batch transcription)
 * - Tier 2: Timer-only (fallback, no transcription)
 */

// ============================================================================
// Transcription Tier Types
// ============================================================================

/**
 * Available transcription tiers in priority order
 */
export type TranscriptionTier = 'whisper' | 'timer-only';

/**
 * Whisper model sizes available for download
 */
export type WhisperModel = 'tiny' | 'base' | 'small' | 'medium' | 'large' | 'large-turbo';

/**
 * Status of a transcription tier
 */
export interface TierStatus {
  tier: TranscriptionTier;
  available: boolean;
  reason?: string;
}

/**
 * Quality information for a tier
 */
export interface TierQuality {
  accuracy: string;
  latency: string;
}

// ============================================================================
// Transcript Event Types
// ============================================================================

/**
 * Unified transcript event from any tier
 */
export interface TranscriptEvent {
  text: string;
  isFinal: boolean;
  confidence: number;
  /** Timestamp in epoch seconds (not milliseconds). Multiply by 1000 for ms. */
  timestamp: number;
  tier: TranscriptionTier;
}

/**
 * Pause detection event (triggers screenshots)
 */
export interface PauseEvent {
  timestamp: number;
  tier: TranscriptionTier;
}

// ============================================================================
// Whisper-Specific Types
// ============================================================================

/**
 * Result from Whisper transcription
 */
export interface WhisperTranscriptResult {
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

/**
 * Whisper service configuration
 */
export interface WhisperConfig {
  modelPath: string;
  language: string;
  threads: number;
  translateToEnglish: boolean;
  /** Vocabulary/style hint passed to whisper.cpp as its initial prompt. */
  initialPrompt: string;
}

// ============================================================================
// Model Download Types
// ============================================================================

/**
 * Information about a Whisper model
 */
export interface ModelInfo {
  name: WhisperModel;
  filename: string;
  sizeBytes: number;
  sizeMB: number;
  ramRequired: string;
  quality: string;
  url: string;
}

/**
 * Progress information during model download
 */
export interface DownloadProgress {
  model: WhisperModel;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  speedBps: number;
  estimatedSecondsRemaining: number;
}

/**
 * Result of a model download operation
 */
export interface DownloadResult {
  success: boolean;
  model: WhisperModel;
  path: string;
  error?: string;
}

// ============================================================================
// Callback Types
// ============================================================================

export type TranscriptCallback = (event: TranscriptEvent) => void;
export type PauseCallback = (event: PauseEvent) => void;
export type TierChangeCallback = (oldTier: TranscriptionTier, newTier: TranscriptionTier, reason: string) => void;
export type ErrorCallback = (error: Error, tier?: TranscriptionTier) => void;
export type ProgressCallback = (progress: DownloadProgress) => void;
export type CompleteCallback = (result: DownloadResult) => void;
