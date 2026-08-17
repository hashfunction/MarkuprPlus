/**
 * CLIPipeline.ts - Pipeline wrapper for CLI usage
 *
 * Orchestrates the existing post-processing pipeline without any Electron
 * dependencies. Handles: audio extraction, transcription, analysis, frame
 * extraction, and markdown generation.
 */

import { existsSync, mkdirSync } from 'fs';
import { stat, unlink, writeFile, chmod } from 'fs/promises';
import { join, basename } from 'path';
import { execFile as execFileCb, type ChildProcess } from 'child_process';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

import { TranscriptAnalyzer } from '../main/pipeline/TranscriptAnalyzer';
import { FrameExtractor } from '../main/pipeline/FrameExtractor';
import { MarkdownGenerator } from '../main/output/MarkdownGenerator';
import { WhisperService } from '../main/transcription/WhisperService';
import { templateRegistry } from '../main/output/templates/index';

import type { PostProcessResult, TranscriptSegment } from '../main/pipeline/PostProcessor';
import type { CaptureContextSnapshot } from '../shared/types';

// ============================================================================
// Types
// ============================================================================

export interface CLIPipelineOptions {
  videoPath: string;
  audioPath?: string;
  outputDir: string;
  whisperModelPath?: string;
  skipFrames: boolean;
  verbose: boolean;
  /** Output template name (default: 'markdown') */
  template?: string;
  /** Optional cue-time context snapshots to enrich extracted frames */
  captureContexts?: CaptureContextSnapshot[];
}

export interface CLIPipelineResult {
  outputPath: string;
  transcriptSegments: number;
  extractedFrames: number;
  durationSeconds: number;
}

type LogFn = (message: string) => void;

// ============================================================================
// Exit code constants
// ============================================================================

export const EXIT_SUCCESS = 0;
export const EXIT_USER_ERROR = 1;
export const EXIT_SYSTEM_ERROR = 2;
export const EXIT_SIGINT = 130;

// ============================================================================
// CLIPipeline Class
// ============================================================================

export class CLIPipeline {
  private options: CLIPipelineOptions;
  private log: LogFn;
  private progress: LogFn;
  private tempFiles: string[] = [];
  private activeProcesses: Set<ChildProcess> = new Set();

  constructor(options: CLIPipelineOptions, log: LogFn, progress?: LogFn) {
    this.options = options;
    this.log = log;
    this.progress = progress ?? (() => {});
  }

  /**
   * Run the full pipeline: audio extraction -> transcription -> analysis ->
   * frame extraction -> markdown generation.
   */
  async run(): Promise<CLIPipelineResult> {
    try {
      return await this.runPipeline();
    } finally {
      await this.cleanup();
    }
  }

  private async runPipeline(): Promise<CLIPipelineResult> {
    const startTime = Date.now();

    // Step 0: Validate video file
    await this.validateVideoFile();

    // Step 1: Check ffmpeg availability (required unless --audio + --no-frames)
    if (!(this.options.audioPath && this.options.skipFrames)) {
      await this.checkFfmpegAvailable();
    }

    // Step 2: Ensure output directory exists
    try {
      if (!existsSync(this.options.outputDir)) {
        mkdirSync(this.options.outputDir, { recursive: true });
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EACCES') {
        throw new CLIPipelineError(
          `Permission denied: cannot create output directory: ${this.options.outputDir}`,
          'user'
        );
      }
      throw new CLIPipelineError(
        `Cannot create output directory: ${this.options.outputDir} (${code})`,
        'system'
      );
    }

    // Step 3: Resolve audio path - extract from video if not provided
    this.progress('Extracting audio...');
    const audioPath = await this.resolveAudioPath();

    // Step 4: Transcribe audio
    this.progress('Transcribing (this may take a while)...');
    const segments = await this.transcribe(audioPath);

    // Step 5: Analyze transcript for key moments
    const analyzer = new TranscriptAnalyzer();
    const keyMoments = analyzer.analyze(segments);
    this.log(`  Found ${keyMoments.length} key moment(s)`);

    // Step 6: Extract frames (unless --no-frames)
    let extractedFrames: PostProcessResult['extractedFrames'] = [];
    if (!this.options.skipFrames) {
      this.progress('Extracting frames...');
      extractedFrames = await this.extractFrames(keyMoments, segments);
    } else {
      this.log('  Frame extraction skipped (--no-frames)');
    }

    // Step 7: Generate report (using template system if specified)
    this.progress('Generating report...');
    const result: PostProcessResult = {
      transcriptSegments: segments,
      extractedFrames,
      reportPath: this.options.outputDir,
      captureContexts: this.normalizeCaptureContexts(this.options.captureContexts || []),
    };

    if (result.captureContexts && result.captureContexts.length > 0 && result.extractedFrames.length > 0) {
      result.extractedFrames = this.attachCaptureContextsToFrames(
        result.extractedFrames,
        result.captureContexts,
      );
    }

    let reportContent: string;
    let reportExtension = '.md';

    const templateName = this.options.template;
    if (templateName && templateName !== 'markdown') {
      const template = templateRegistry.get(templateName);
      if (!template) {
        const available = templateRegistry.list().join(', ');
        throw new CLIPipelineError(
          `Unknown template "${templateName}". Available: ${available}`,
          'user'
        );
      }
      const output = template.render({ result, sessionDir: this.options.outputDir });
      reportContent = output.content;
      reportExtension = output.fileExtension;
    } else {
      const generator = new MarkdownGenerator();
      reportContent = generator.generateFromPostProcess(result, this.options.outputDir);
    }

    // Step 8: Write output
    const outputFilename = this.generateOutputFilename(reportExtension);
    const outputPath = join(this.options.outputDir, outputFilename);
    try {
      await writeFile(outputPath, reportContent, 'utf-8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      throw new CLIPipelineError(
        `Failed to write output file: ${outputPath}\n` +
        `  Reason: ${code === 'ENOSPC' ? 'Disk is full' : (error as Error).message}`,
        'system'
      );
    }

    const durationSeconds = (Date.now() - startTime) / 1000;

    return {
      outputPath,
      transcriptSegments: segments.length,
      extractedFrames: extractedFrames.length,
      durationSeconds,
    };
  }

  /**
   * Abort the pipeline: kill active child processes and clean up temp files.
   */
  async abort(): Promise<void> {
    for (const proc of this.activeProcesses) {
      proc.kill('SIGTERM');
    }
    this.activeProcesses.clear();
    await this.cleanup();
  }

  /**
   * Clean up temp files created during the pipeline run.
   */
  async cleanup(): Promise<void> {
    for (const file of this.tempFiles) {
      try {
        await unlink(file);
      } catch {
        // Ignore cleanup errors — file may already be removed
      }
    }
    this.tempFiles = [];
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Execute a child process while tracking it for cleanup on abort.
   */
  private static readonly SAFE_CHILD_ENV = {
    PATH: process.env.PATH,
    HOME: process.env.HOME || process.env.USERPROFILE,
    USERPROFILE: process.env.USERPROFILE,
    LANG: process.env.LANG,
    TMPDIR: process.env.TMPDIR || process.env.TEMP,
    TEMP: process.env.TEMP,
  };

  private execFileTracked(
    command: string,
    args: string[]
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = execFileCb(command, args, { env: CLIPipeline.SAFE_CHILD_ENV }, (error, stdout, stderr) => {
        this.activeProcesses.delete(child);
        if (error) reject(error);
        else resolve({ stdout: stdout?.toString() ?? '', stderr: stderr?.toString() ?? '' });
      });
      this.activeProcesses.add(child);
    });
  }

  private normalizeCaptureContexts(
    contexts: CaptureContextSnapshot[]
  ): CaptureContextSnapshot[] {
    return contexts
      .filter((context) => Number.isFinite(context.recordedAt))
      .slice()
      .sort((a, b) => a.recordedAt - b.recordedAt);
  }

  private attachCaptureContextsToFrames(
    frames: PostProcessResult['extractedFrames'],
    contexts: CaptureContextSnapshot[]
  ): PostProcessResult['extractedFrames'] {
    const earliestContext = contexts[0]?.recordedAt;
    if (!Number.isFinite(earliestContext)) {
      return frames;
    }

    const maxDistanceMs = 5_000;
    return frames.map((frame) => {
      const frameAtMs = Number(earliestContext) + Math.round(frame.timestamp * 1000);
      let bestMatch: CaptureContextSnapshot | undefined;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const context of contexts) {
        const distance = Math.abs(frameAtMs - context.recordedAt);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMatch = context;
        }
        if (context.recordedAt > frameAtMs && distance > bestDistance) {
          break;
        }
      }

      if (!bestMatch || bestDistance > maxDistanceMs) {
        return frame;
      }

      return {
        ...frame,
        captureContext: bestMatch,
      };
    });
  }

  /**
   * Validate the video file is a real, non-empty file with a video stream.
   */
  private async validateVideoFile(): Promise<void> {
    const { videoPath } = this.options;

    let stats;
    try {
      stats = await stat(videoPath);
    } catch {
      throw new CLIPipelineError(`Video file not found: ${videoPath}`, 'user');
    }

    if (!stats.isFile()) {
      throw new CLIPipelineError(`Not a regular file: ${videoPath}`, 'user');
    }

    if (stats.size === 0) {
      throw new CLIPipelineError(`Video file is empty (0 bytes): ${videoPath}`, 'user');
    }

    // Probe with ffprobe to confirm it contains a video stream
    try {
      const { stdout } = await this.execFileTracked('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v',
        '-show_entries', 'stream=codec_type',
        '-of', 'csv=p=0',
        videoPath,
      ]);
      if (!stdout.trim().includes('video')) {
        throw new CLIPipelineError(
          `No video stream found in file: ${videoPath}`,
          'user'
        );
      }
    } catch (error) {
      if (error instanceof CLIPipelineError) throw error;
      throw new CLIPipelineError(
        `Cannot read video file (is ffprobe installed?): ${videoPath}`,
        'system'
      );
    }
  }

  /**
   * Check that ffmpeg is available on PATH.
   */
  private async checkFfmpegAvailable(): Promise<void> {
    try {
      await this.execFileTracked('ffmpeg', ['-version']);
    } catch {
      const platform = process.platform;
      const installHint =
        platform === 'darwin'
          ? 'brew install ffmpeg'
          : platform === 'win32'
            ? 'winget install ffmpeg (or download from https://ffmpeg.org)'
            : 'apt install ffmpeg (or your package manager)';
      throw new CLIPipelineError(
        `ffmpeg is required but not found on your system.\n` +
        `  Install via: ${installHint}\n` +
        `  Or provide a separate audio file with --audio <file> and --no-frames`,
        'system'
      );
    }
  }

  /**
   * Resolve the audio path. If no separate audio file was provided, probe
   * the video for an audio track and extract it to a temp WAV file.
   */
  private async resolveAudioPath(): Promise<string | null> {
    if (this.options.audioPath) {
      if (!existsSync(this.options.audioPath)) {
        throw new CLIPipelineError(
          `Audio file not found: ${this.options.audioPath}`,
          'user'
        );
      }
      this.log(`  Using provided audio: ${this.options.audioPath}`);
      return this.options.audioPath;
    }

    // Check if video has an audio track
    const hasAudio = await this.videoHasAudioTrack(this.options.videoPath);
    if (!hasAudio) {
      this.log('  No audio track found in video - transcription will be skipped');
      return null;
    }

    // Extract audio from video
    this.log('  Extracting audio from video...');
    const tempAudioPath = join(tmpdir(), `markuprx-cli-audio-${randomUUID()}.wav`);
    this.tempFiles.push(tempAudioPath);

    try {
      await this.execFileTracked('ffmpeg', [
        '-i', this.options.videoPath,
        '-vn',
        '-ar', '16000',
        '-ac', '1',
        '-f', 'wav',
        '-acodec', 'pcm_f32le',
        '-y',
        tempAudioPath,
      ]);
      await chmod(tempAudioPath, 0o600).catch(() => {});
      this.log('  Audio extraction complete');
      return tempAudioPath;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`  WARNING: Audio extraction failed: ${msg}`);
      return null;
    }
  }

  /**
   * Use ffprobe to check whether the video file contains an audio stream.
   */
  private async videoHasAudioTrack(videoPath: string): Promise<boolean> {
    try {
      const { stdout } = await this.execFileTracked('ffprobe', [
        '-v', 'error',
        '-select_streams', 'a',
        '-show_entries', 'stream=codec_type',
        '-of', 'csv=p=0',
        videoPath,
      ]);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Transcribe audio using WhisperService. Falls back gracefully if the
   * model is not available.
   */
  private async transcribe(audioPath: string | null): Promise<TranscriptSegment[]> {
    if (!audioPath) {
      this.log('  No audio available - skipping transcription');
      return [];
    }

    const whisper = new WhisperService(
      this.options.whisperModelPath ? { modelPath: this.options.whisperModelPath } : undefined
    );

    if (!whisper.isModelAvailable()) {
      const modelsDir = whisper.getModelsDirectory();
      this.log(`  Whisper model not found at: ${whisper.getConfig().modelPath}`);
      this.log(`  Models directory: ${modelsDir}`);
      this.log('  Transcription will be skipped. Download a model to enable transcription.');
      return [];
    }

    this.log(`  Transcribing with Whisper (model: ${basename(whisper.getConfig().modelPath)})...`);

    try {
      const results = await whisper.transcribeFile(audioPath, (percent) => {
        if (this.options.verbose) {
          process.stdout.write(`\r  Transcription progress: ${percent}%`);
        }
      });

      if (this.options.verbose && results.length > 0) {
        process.stdout.write('\n');
      }

      const segments: TranscriptSegment[] = results.map((r) => ({
        text: r.text,
        startTime: r.startTime,
        endTime: r.endTime,
        confidence: r.confidence,
      }));

      this.log(`  Transcription complete: ${segments.length} segment(s)`);
      return segments;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`  WARNING: Transcription failed: ${msg}`);
      return [];
    }
  }

  /**
   * Extract video frames at key moment timestamps.
   */
  private async extractFrames(
    keyMoments: Array<{ timestamp: number; reason: string; confidence: number }>,
    segments: TranscriptSegment[]
  ): Promise<PostProcessResult['extractedFrames']> {
    if (keyMoments.length === 0) {
      this.log('  No key moments found - skipping frame extraction');
      return [];
    }

    const extractor = new FrameExtractor();
    const available = await extractor.checkFfmpeg();

    if (!available) {
      this.log('  WARNING: ffmpeg not found - frame extraction skipped');
      this.log('  Install ffmpeg: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)');
      return [];
    }

    this.log(`  Extracting ${keyMoments.length} frame(s)...`);

    const timestamps = keyMoments.map((m) => m.timestamp);
    const extractionResult = await extractor.extract({
      videoPath: this.options.videoPath,
      timestamps,
      outputDir: this.options.outputDir,
    });

    const extractedFrames = extractionResult.frames
      .filter((f) => f.success)
      .map((frame) => {
        const moment = keyMoments.find(
          (m) => Math.abs(m.timestamp - frame.timestamp) < 0.5
        );
        const closestSegment = this.findClosestSegment(frame.timestamp, segments);

        return {
          path: frame.path,
          timestamp: frame.timestamp,
          reason: moment?.reason ?? 'Extracted frame',
          transcriptSegment: closestSegment,
        };
      });

    this.log(`  Extracted ${extractedFrames.length} frame(s)`);
    return extractedFrames;
  }

  /**
   * Find the transcript segment closest to a given timestamp.
   */
  private findClosestSegment(
    timestamp: number,
    segments: TranscriptSegment[]
  ): TranscriptSegment | undefined {
    if (segments.length === 0) return undefined;

    for (const segment of segments) {
      if (timestamp >= segment.startTime && timestamp <= segment.endTime) {
        return segment;
      }
    }

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
   * Generate the output filename based on the video filename and current date (UTC).
   */
  generateOutputFilename(extension = '.md'): string {
    const videoName = basename(this.options.videoPath)
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-');

    const now = new Date();
    const dateStr = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      String(now.getUTCDate()).padStart(2, '0'),
    ].join('');
    const timeStr = [
      String(now.getUTCHours()).padStart(2, '0'),
      String(now.getUTCMinutes()).padStart(2, '0'),
      String(now.getUTCSeconds()).padStart(2, '0'),
    ].join('');

    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    return `${videoName}-feedback-${dateStr}-${timeStr}${ext}`;
  }
}

// ============================================================================
// Error class with severity for exit code distinction
// ============================================================================

export class CLIPipelineError extends Error {
  public readonly severity: 'user' | 'system';

  constructor(message: string, severity: 'user' | 'system') {
    super(message);
    this.name = 'CLIPipelineError';
    this.severity = severity;
  }
}
