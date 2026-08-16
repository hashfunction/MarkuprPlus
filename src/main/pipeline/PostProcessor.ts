/**
 * PostProcessor.ts - Post-Recording Pipeline Orchestrator
 *
 * Runs the full post-processing pipeline after a recording session stops:
 *   1. Transcribe audio via WhisperService batch mode
 *   2. Analyze transcript to find key moments (heuristic-based)
 *   3. Extract video frames at those timestamps via ffmpeg
 *   4. Return combined result for markdown report generation
 *
 * Designed to degrade gracefully: if frame extraction fails (e.g. ffmpeg
 * not installed), the pipeline still returns a transcript-only result.
 *
 * Part of the post-processing pipeline that runs after recording stops.
 */

import { whisperService } from '../transcription/WhisperService';
import { TranscriptAnalyzer, transcriptAnalyzer } from './TranscriptAnalyzer';
import { FrameExtractor, frameExtractor } from './FrameExtractor';
import type { KeyMoment } from './TranscriptAnalyzer';
import type { CaptureContextSnapshot } from '../../shared/types';

// ============================================================================
// Types
// ============================================================================

export interface TranscriptSegment {
  text: string;
  startTime: number; // seconds from start of recording
  endTime: number;
  confidence: number;
}

export interface ExtractedFrame {
  path: string; // path to extracted PNG
  timestamp: number; // seconds from start of recording
  reason: string; // why this frame was selected
  markedIssueId?: string; // stable identity for separately committed marked issues
  transcriptSegment?: TranscriptSegment; // associated transcript segment
  captureContext?: CaptureContextSnapshot; // nearest cue-time metadata snapshot
}

export interface PostProcessResult {
  transcriptSegments: TranscriptSegment[];
  extractedFrames: ExtractedFrame[];
  reportPath: string;
  captureContexts?: CaptureContextSnapshot[];
}

export interface PostProcessProgress {
  step: 'transcribing' | 'analyzing' | 'extracting-frames' | 'generating-report';
  percent: number;
  message: string;
}

export interface PostProcessOptions {
  videoPath: string;
  audioPath: string;
  sessionDir: string;
  transcriptSegments?: TranscriptSegment[];
  aiMomentHints?: KeyMoment[];
  onProgress?: (progress: PostProcessProgress) => void;
}

// ============================================================================
// PostProcessor Class
// ============================================================================

export class PostProcessor {
  private analyzer: TranscriptAnalyzer;
  private extractor: FrameExtractor;

  constructor(
    analyzer: TranscriptAnalyzer = transcriptAnalyzer,
    extractor: FrameExtractor = frameExtractor
  ) {
    this.analyzer = analyzer;
    this.extractor = extractor;
  }

  /**
   * Run the full post-processing pipeline.
   *
   * @param options - Pipeline configuration (paths, progress callback)
   * @returns Combined result with transcript, frames, and report path
   */
  async process(options: PostProcessOptions): Promise<PostProcessResult> {
    const { videoPath, audioPath, sessionDir, transcriptSegments, aiMomentHints, onProgress } = options;

    const emitProgress = (progress: PostProcessProgress): void => {
      if (onProgress) {
        onProgress(progress);
      }
    };

    // -----------------------------------------------------------------------
    // Step 1: Transcribe audio (0-40%)
    // -----------------------------------------------------------------------
    emitProgress({
      step: 'transcribing',
      percent: 0,
      message: 'Transcribing audio...',
    });

    let segments: TranscriptSegment[] = [];
    const providedSegments = (transcriptSegments || [])
      .map((segment) => ({
        text: segment.text?.trim() || '',
        startTime: Number.isFinite(segment.startTime) ? Math.max(0, segment.startTime) : 0,
        endTime: Number.isFinite(segment.endTime)
          ? Math.max(0, segment.endTime)
          : (Number.isFinite(segment.startTime) ? Math.max(0, segment.startTime) + 1.5 : 1.5),
        confidence: Number.isFinite(segment.confidence) ? segment.confidence : 0.8,
      }))
      .filter((segment) => segment.text.length > 0);

    // Strategy: prefer Whisper file-based transcription when available because
    // it produces higher quality output than the live-streamed segments captured
    // during recording. Fall back to pre-provided segments only when Whisper is
    // unavailable or fails.
    const whisperAvailable = audioPath && whisperService.isModelAvailable();

    if (whisperAvailable) {
      this.log(
        `Whisper model available, attempting file-based transcription` +
        (providedSegments.length > 0
          ? ` (${providedSegments.length} pre-provided segments available as fallback)`
          : '')
      );
      try {
        emitProgress({
          step: 'transcribing',
          percent: 5,
          message: 'Loading Whisper model...',
        });

        const whisperResults = await whisperService.transcribeFile(audioPath);

        segments = whisperResults.map((result) => ({
          text: result.text,
          startTime: result.startTime,
          endTime: result.endTime,
          confidence: result.confidence,
        }));

        if (segments.length > 0) {
          emitProgress({
            step: 'transcribing',
            percent: 40,
            message: `Whisper transcription complete: ${segments.length} segments`,
          });
          this.log(`Whisper file transcription complete: ${segments.length} segments`);
        } else {
          this.log('Whisper returned 0 segments, will try pre-provided segments as fallback');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log(`Whisper file transcription failed: ${message}`);
        // Fall through to use pre-provided segments below
      }
    } else {
      this.log(
        `Whisper file transcription skipped: ${!audioPath ? 'no audio file path' : 'model not available'}`
      );
    }

    // Fall back to pre-provided segments if Whisper did not produce results
    if (segments.length === 0 && providedSegments.length > 0) {
      segments = providedSegments.sort((a, b) => a.startTime - b.startTime);
      emitProgress({
        step: 'transcribing',
        percent: 40,
        message: `Using captured transcript (${segments.length} segments)`,
      });
      this.log(`Using pre-provided transcript segments as fallback: ${segments.length}`);
    }

    // If neither Whisper nor pre-provided segments produced anything, and we
    // have an audio path but Whisper was not available, attempt Whisper anyway
    // as a last resort (it will throw if the model truly cannot load).
    if (segments.length === 0 && audioPath && !whisperAvailable) {
      try {
        emitProgress({
          step: 'transcribing',
          percent: 5,
          message: 'Attempting transcription...',
        });

        const whisperResults = await whisperService.transcribeFile(audioPath);
        segments = whisperResults.map((result) => ({
          text: result.text,
          startTime: result.startTime,
          endTime: result.endTime,
          confidence: result.confidence,
        }));

        if (segments.length > 0) {
          emitProgress({
            step: 'transcribing',
            percent: 40,
            message: `Transcription complete: ${segments.length} segments`,
          });
          this.log(`Whisper last-resort transcription complete: ${segments.length} segments`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log(`Whisper last-resort transcription failed: ${message}`);
      }
    }

    const hasVideoMomentHints = Boolean(videoPath) && Boolean(aiMomentHints?.length);
    if (segments.length === 0 && !hasVideoMomentHints) {
      this.log('No transcript segments found, returning empty result');
      emitProgress({
        step: 'generating-report',
        percent: 100,
        message: 'No speech detected in recording',
      });

      return {
        transcriptSegments: [],
        extractedFrames: [],
        reportPath: sessionDir,
      };
    }
    if (segments.length === 0) {
      this.log(`No transcript segments found; continuing with ${aiMomentHints?.length || 0} video moment hints`);
    }

    // -----------------------------------------------------------------------
    // Step 2: Analyze transcript for key moments (40-50%)
    // -----------------------------------------------------------------------
    emitProgress({
      step: 'analyzing',
      percent: 40,
      message: 'Analyzing transcript for key moments...',
    });

    const keyMoments = this.analyzer.analyze(segments, aiMomentHints || []);

    emitProgress({
      step: 'analyzing',
      percent: 50,
      message: `Found ${keyMoments.length} key moments`,
    });

    this.log(`Analysis complete: ${keyMoments.length} key moments identified`);

    // -----------------------------------------------------------------------
    // Step 3: Extract frames from video (50-90%)
    // -----------------------------------------------------------------------
    emitProgress({
      step: 'extracting-frames',
      percent: 50,
      message: 'Extracting video frames...',
    });

    let extractedFrames: ExtractedFrame[] = [];

    try {
      const timestamps = keyMoments.map((m) => m.timestamp);

      const hasMarkedIssueMoments = keyMoments.some((moment) => Boolean(moment.markedIssueId));
      const extractionResult = await this.extractor.extract({
        videoPath,
        timestamps,
        ...(hasMarkedIssueMoments ? { moments: keyMoments } : {}),
        outputDir: sessionDir,
      });

      if (!extractionResult.ffmpegAvailable) {
        this.log('ffmpeg not available, skipping frame extraction');
        emitProgress({
          step: 'extracting-frames',
          percent: 90,
          message: 'Frame extraction skipped (ffmpeg not installed)',
        });
      } else {
        // Map extraction results to ExtractedFrame with associated transcript segments
        extractedFrames = extractionResult.frames
          .filter((f) => f.success)
          .map((frame) => {
            // Find the key moment that corresponds to this frame
            const moment = frame.markedIssueId
              ? keyMoments.find((candidate) => candidate.markedIssueId === frame.markedIssueId)
              : keyMoments.find((candidate) => Math.abs(candidate.timestamp - frame.timestamp) < 0.5);

            // Find the closest transcript segment
            const closestSegment = this.findClosestSegment(
              frame.timestamp,
              segments
            );

            return {
              path: frame.path,
              timestamp: frame.timestamp,
              reason: moment?.reason ?? 'Extracted frame',
              ...(frame.markedIssueId ? { markedIssueId: frame.markedIssueId } : {}),
              transcriptSegment: closestSegment,
            };
          });

        emitProgress({
          step: 'extracting-frames',
          percent: 90,
          message: `Extracted ${extractedFrames.length} frames`,
        });

        this.log(`Frame extraction complete: ${extractedFrames.length} frames`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`Frame extraction failed: ${message} - continuing with transcript only`);

      emitProgress({
        step: 'extracting-frames',
        percent: 90,
        message: 'Frame extraction failed, continuing with transcript only',
      });

      // Continue with transcript-only result - do not throw
    }

    // -----------------------------------------------------------------------
    // Step 4: Return result (90-100%)
    // -----------------------------------------------------------------------
    emitProgress({
      step: 'generating-report',
      percent: 90,
      message: 'Preparing results...',
    });

    const result: PostProcessResult = {
      transcriptSegments: segments,
      extractedFrames,
      reportPath: sessionDir,
    };

    emitProgress({
      step: 'generating-report',
      percent: 100,
      message: 'Post-processing complete',
    });

    this.log(
      `Pipeline complete: ${segments.length} segments, ${extractedFrames.length} frames`
    );

    return result;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Find the transcript segment closest to a given timestamp.
   * Prefers segments that contain the timestamp; falls back to nearest start time.
   */
  private findClosestSegment(
    timestamp: number,
    segments: TranscriptSegment[]
  ): TranscriptSegment | undefined {
    if (segments.length === 0) {
      return undefined;
    }

    // First, check if timestamp falls within any segment
    for (const segment of segments) {
      if (timestamp >= segment.startTime && timestamp <= segment.endTime) {
        return segment;
      }
    }

    // Otherwise, find the closest segment by start time
    let closest = segments[0];
    let minDistance = Math.abs(timestamp - closest.startTime);

    for (let i = 1; i < segments.length; i++) {
      const distance = Math.abs(timestamp - segments[i].startTime);
      if (distance < minDistance) {
        minDistance = distance;
        closest = segments[i];
      }
    }

    return closest;
  }

  /**
   * Log helper with consistent prefix.
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[PostProcessor ${timestamp}] ${message}`);
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const postProcessor = new PostProcessor();
export default PostProcessor;
