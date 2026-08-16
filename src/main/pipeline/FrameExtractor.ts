/**
 * FrameExtractor.ts - Video Frame Extraction via ffmpeg
 *
 * Extracts PNG frames from a video file at specific timestamps using the
 * system-installed ffmpeg binary. Degrades gracefully if ffmpeg is not
 * available (returns empty result with ffmpegAvailable: false).
 *
 * Part of the post-processing pipeline that runs after recording stops.
 */

import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync } from 'fs';
import { stat as statFile } from 'fs/promises';
import { join } from 'path';
import type { KeyMoment } from './TranscriptAnalyzer';

const execFile = promisify(execFileCb);

// ============================================================================
// Types
// ============================================================================

export interface FrameExtractionRequest {
  videoPath: string;
  timestamps: number[]; // seconds from start of recording
  outputDir: string; // directory to save PNGs
  maxFrames?: number; // cap at 20 by default
  /** Identity-bearing requests used for separately committed marked issues. */
  moments?: KeyMoment[];
}

export interface FrameExtractionResult {
  frames: Array<{
    path: string;
    timestamp: number;
    success: boolean;
    markedIssueId?: string;
  }>;
  ffmpegAvailable: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Default maximum number of frames to extract */
const DEFAULT_MAX_FRAMES = 20;

/** Timeout for decode-accurate frame extraction */
const FFMPEG_ACCURATE_FRAME_TIMEOUT_MS = 20_000;

/** Timeout for fast-seek fallback extraction */
const FFMPEG_FAST_FRAME_TIMEOUT_MS = 10_000;

/** Timeout for ffmpeg version check (5 seconds) */
const FFMPEG_CHECK_TIMEOUT_MS = 5_000;

/** Avoid extracting on startup/teardown edge frames, which are often corrupted */
const FRAME_EDGE_MARGIN_SECONDS = 0.35;

/** Collapse nearly-identical timestamps after clamping */
const TIMESTAMP_DEDUPE_WINDOW_SECONDS = 0.15;

const MAX_MARKED_FRAME_REQUESTS = 200;

/** Minimal env for child processes - avoids leaking API keys to ffmpeg */
const SAFE_CHILD_ENV = {
  PATH: process.env.PATH,
  HOME: process.env.HOME || process.env.USERPROFILE,
  USERPROFILE: process.env.USERPROFILE,
  LANG: process.env.LANG,
  TMPDIR: process.env.TMPDIR || process.env.TEMP,
  TEMP: process.env.TEMP,
};

function distributeMoments(sorted: KeyMoment[], count: number): KeyMoment[] {
  if (sorted.length <= count) return sorted;
  if (count <= 0) return [];
  if (count === 1) return [sorted[0]];
  const result = [sorted[0]];
  const step = (sorted.length - 1) / (count - 1);
  for (let index = 1; index < count - 1; index += 1) {
    result.push(sorted[Math.round(index * step)]);
  }
  result.push(sorted[sorted.length - 1]);
  return result;
}

function clampFrameTimestamp(timestamp: number, durationSeconds: number | null): number {
  const clean = Math.max(0, timestamp);
  if (!durationSeconds || durationSeconds <= 0) return clean;
  const minimum = Math.min(FRAME_EDGE_MARGIN_SECONDS, Math.max(0, durationSeconds - 0.05));
  const maximum = Math.max(minimum, durationSeconds - FRAME_EDGE_MARGIN_SECONDS);
  return Math.max(minimum, Math.min(clean, maximum));
}

export function selectFrameMomentRequests(
  moments: KeyMoment[],
  durationSeconds: number | null,
  maxOrdinaryFrames = DEFAULT_MAX_FRAMES,
): KeyMoment[] {
  const normalized = moments
    .filter((moment) => Number.isFinite(moment.timestamp))
    .map((moment) => ({
      ...moment,
      timestamp: clampFrameTimestamp(moment.timestamp, durationSeconds),
    }));
  const marked = normalized
    .filter((moment) => Boolean(moment.markedIssueId))
    .slice(0, MAX_MARKED_FRAME_REQUESTS);
  const ordinary = distributeMoments(
    normalized.filter((moment) => !moment.markedIssueId)
      .sort((left, right) => left.timestamp - right.timestamp),
    maxOrdinaryFrames,
  ).filter((moment, index, selected) => index === 0
    || Math.abs(moment.timestamp - selected[index - 1].timestamp) >= TIMESTAMP_DEDUPE_WINDOW_SECONDS);
  return [...marked, ...ordinary].sort((left, right) => left.timestamp - right.timestamp);
}

// ============================================================================
// FrameExtractor Class
// ============================================================================

export class FrameExtractor {
  private ffmpegPath: string = 'ffmpeg';
  private ffprobePath: string = 'ffprobe';
  private ffmpegChecked: boolean = false;
  private ffmpegAvailable: boolean = false;

  /**
   * Check if ffmpeg is installed and accessible on the system PATH.
   * Result is cached after the first successful check.
   */
  async checkFfmpeg(): Promise<boolean> {
    if (this.ffmpegChecked) {
      return this.ffmpegAvailable;
    }

    try {
      await execFile(this.ffmpegPath, ['-version'], {
        timeout: FFMPEG_CHECK_TIMEOUT_MS,
        env: SAFE_CHILD_ENV,
      });
      this.ffmpegAvailable = true;
      this.log('ffmpeg is available');
    } catch {
      this.ffmpegAvailable = false;
      this.log('ffmpeg is not available - frame extraction will be skipped');
    }

    this.ffmpegChecked = true;
    return this.ffmpegAvailable;
  }

  /**
   * Extract frames from a video file at the specified timestamps.
   *
   * @param request - Extraction parameters (video path, timestamps, output dir)
   * @returns Result with extracted frame paths and ffmpeg availability status
   */
  async extract(request: FrameExtractionRequest): Promise<FrameExtractionResult> {
    const available = await this.checkFfmpeg();

    if (!available) {
      return { frames: [], ffmpegAvailable: false };
    }

    const videoDurationSeconds = await this.getVideoDurationSeconds(request.videoPath);
    const maxFrames = request.maxFrames ?? DEFAULT_MAX_FRAMES;
    let selectedMoments: KeyMoment[];
    if (request.moments) {
      selectedMoments = selectFrameMomentRequests(request.moments, videoDurationSeconds, maxFrames);
    } else {
      let timestamps = [...request.timestamps].sort((a, b) => a - b);
      if (timestamps.length > maxFrames) {
        timestamps = this.selectDistributed(timestamps, maxFrames);
      }
      timestamps = this.normalizeTimestamps(timestamps, videoDurationSeconds);
      selectedMoments = timestamps.map((timestamp) => ({
        timestamp,
        reason: 'Extracted frame',
        confidence: 0,
      }));
    }
    if (selectedMoments.length === 0) {
      return { frames: [], ffmpegAvailable: true };
    }

    // Ensure the screenshots subdirectory exists
    const screenshotsDir = join(request.outputDir, 'screenshots');
    if (!existsSync(screenshotsDir)) {
      mkdirSync(screenshotsDir, { recursive: true });
    }

    // Extract each frame
    const frames: FrameExtractionResult['frames'] = [];

    for (let i = 0; i < selectedMoments.length; i++) {
      const moment = selectedMoments[i];
      const timestamp = moment.timestamp;
      const frameNumber = String(i + 1).padStart(3, '0');
      const markedOrdinal = /^marked-issue-(\d{3})$/.exec(moment.markedIssueId || '')?.[1];
      const outputPath = join(
        screenshotsDir,
        markedOrdinal ? `marked-issue-${markedOrdinal}.png` : `frame-${frameNumber}.png`,
      );

      try {
        await this.extractSingleFrame(request.videoPath, timestamp, outputPath);

        const stats = await statFile(outputPath).catch(() => null);
        if (!stats || stats.size <= 0) {
          throw new Error(`ffmpeg did not produce a frame file at timestamp ${timestamp.toFixed(1)}s. The video may be shorter than expected or the codec may not support seeking.`);
        }

        frames.push({
          path: outputPath,
          timestamp,
          success: true,
          ...(moment.markedIssueId ? { markedIssueId: moment.markedIssueId } : {}),
        });

        this.log(`Extracted frame ${frameNumber} at ${timestamp.toFixed(2)}s`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log(`Failed to extract frame at ${timestamp.toFixed(2)}s: ${message}`);

        frames.push({
          path: outputPath,
          timestamp,
          success: false,
          ...(moment.markedIssueId ? { markedIssueId: moment.markedIssueId } : {}),
        });
      }
    }

    return { frames, ffmpegAvailable: true };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extract a single frame from the video at the given timestamp.
   */
  private async extractSingleFrame(
    videoPath: string,
    timestamp: number,
    outputPath: string
  ): Promise<void> {
    // Prefer decode-accurate extraction (-ss after -i) to avoid VP8/VP9
    // keyframe seek artifacts. Fall back to fast seek if needed.
    try {
      await this.extractSingleFrameAccurate(videoPath, timestamp, outputPath);
      return;
    } catch (accurateError) {
      this.log(
        `Accurate extraction failed at ${timestamp.toFixed(2)}s, retrying fast seek: ${
          accurateError instanceof Error ? accurateError.message : String(accurateError)
        }`
      );
    }

    await this.extractSingleFrameFast(videoPath, timestamp, outputPath);
  }

  private async extractSingleFrameAccurate(
    videoPath: string,
    timestamp: number,
    outputPath: string
  ): Promise<void> {
    const args = [
      '-i', videoPath,
      '-ss', String(timestamp),
      '-frames:v', '1',
      '-vf', 'format=rgb24',
      '-q:v', '2',
      '-y',
      outputPath,
    ];

    await execFile(this.ffmpegPath, args, {
      timeout: FFMPEG_ACCURATE_FRAME_TIMEOUT_MS,
      env: SAFE_CHILD_ENV,
    });
  }

  private async extractSingleFrameFast(
    videoPath: string,
    timestamp: number,
    outputPath: string
  ): Promise<void> {
    const args = [
      '-ss', String(timestamp),
      '-i', videoPath,
      '-frames:v', '1',
      '-vf', 'format=rgb24',
      '-q:v', '2',
      '-y', // overwrite output file if it exists
      outputPath,
    ];

    await execFile(this.ffmpegPath, args, {
      timeout: FFMPEG_FAST_FRAME_TIMEOUT_MS,
      env: SAFE_CHILD_ENV,
    });
  }

  /**
   * Select evenly distributed timestamps from a sorted array.
   * Always includes the first and last timestamp.
   */
  private selectDistributed(sorted: number[], count: number): number[] {
    if (sorted.length <= count) {
      return sorted;
    }

    if (count <= 0) {
      return [];
    }

    if (count === 1) {
      return [sorted[0]];
    }

    const result: number[] = [sorted[0]];
    const step = (sorted.length - 1) / (count - 1);

    for (let i = 1; i < count - 1; i++) {
      const index = Math.round(i * step);
      result.push(sorted[index]);
    }

    result.push(sorted[sorted.length - 1]);
    return result;
  }

  private async getVideoDurationSeconds(videoPath: string): Promise<number | null> {
    try {
      const { stdout } = await execFile(
        this.ffprobePath,
        [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          videoPath,
        ],
        { timeout: FFMPEG_CHECK_TIMEOUT_MS, env: SAFE_CHILD_ENV }
      );
      const parsed = Number.parseFloat(String(stdout).trim());
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
      return null;
    } catch (error) {
      this.log(`ffprobe duration probe failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private normalizeTimestamps(timestamps: number[], durationSeconds: number | null): number[] {
    const cleaned = timestamps
      .map((timestamp) => (Number.isFinite(timestamp) ? Math.max(0, timestamp) : 0))
      .sort((a, b) => a - b);

    if (cleaned.length === 0) {
      return [];
    }

    let clamped = cleaned;
    if (durationSeconds && durationSeconds > 0) {
      const minTs = Math.min(FRAME_EDGE_MARGIN_SECONDS, Math.max(0, durationSeconds - 0.05));
      const maxTs = Math.max(minTs, durationSeconds - FRAME_EDGE_MARGIN_SECONDS);
      clamped = cleaned.map((timestamp) => Math.max(minTs, Math.min(timestamp, maxTs)));
    }

    const deduped: number[] = [];
    for (const timestamp of clamped) {
      const previous = deduped[deduped.length - 1];
      if (
        previous === undefined ||
        Math.abs(timestamp - previous) >= TIMESTAMP_DEDUPE_WINDOW_SECONDS
      ) {
        deduped.push(timestamp);
      }
    }

    return deduped;
  }

  /**
   * Log helper with consistent prefix.
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[FrameExtractor ${timestamp}] ${message}`);
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const frameExtractor = new FrameExtractor();
export default FrameExtractor;
