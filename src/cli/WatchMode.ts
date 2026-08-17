/**
 * WatchMode.ts - Directory watcher for auto-processing new recordings
 *
 * Monitors a directory for new video files (.mov, .mp4, .webm) and
 * automatically runs them through CLIPipeline when they appear and
 * are stable (done being written to disk).
 */

import { watch, existsSync, mkdirSync, readdirSync, type FSWatcher } from 'fs';
import { stat, readdir, appendFile } from 'fs/promises';
import { join, resolve, extname, basename } from 'path';
import { CLIPipeline, type CLIPipelineOptions } from './CLIPipeline';

// ============================================================================
// Types
// ============================================================================

export interface WatchModeOptions {
  /** Directory to watch for new recordings */
  watchDir: string;
  /** Output directory for processed files (default: <watchDir>/markuprx-output) */
  outputDir?: string;
  /** Whisper model path override */
  whisperModelPath?: string;
  /** Skip frame extraction */
  skipFrames: boolean;
  /** Verbose logging */
  verbose: boolean;
  /** Stability check interval in ms (default: 2000) */
  stabilityInterval?: number;
  /** Maximum number of stability checks before giving up (default: 30 = ~60s) */
  maxStabilityChecks?: number;
}

export interface WatchModeCallbacks {
  onLog: (message: string) => void;
  onFileDetected: (filePath: string) => void;
  onProcessingStart: (filePath: string) => void;
  onProcessingComplete: (filePath: string, outputPath: string) => void;
  onProcessingError: (filePath: string, error: Error) => void;
}

/** Supported video file extensions */
export const VIDEO_EXTENSIONS = new Set(['.mov', '.mp4', '.webm']);

/** Name of the watch log file */
export const WATCH_LOG_FILENAME = '.markuprx-watch.log';

// ============================================================================
// WatchMode Class
// ============================================================================

export class WatchMode {
  private options: WatchModeOptions;
  private callbacks: WatchModeCallbacks;
  private watcher: FSWatcher | null = null;
  private processing = new Set<string>();
  private processed = new Set<string>();
  private pendingStabilityChecks = new Map<string, NodeJS.Timeout>();
  private stopped = false;
  private stopResolve: (() => void) | null = null;
  private resolvedOutputDir: string;

  constructor(options: WatchModeOptions, callbacks: WatchModeCallbacks) {
    this.options = options;
    this.callbacks = callbacks;
    this.resolvedOutputDir = options.outputDir
      ? resolve(options.outputDir)
      : join(resolve(options.watchDir), 'markuprx-output');
  }

  /**
   * Start watching the directory. Returns a promise that resolves when
   * the watcher is stopped (via stop() or SIGINT).
   */
  async start(): Promise<void> {
    const watchDir = resolve(this.options.watchDir);

    // Validate watch directory exists
    if (!existsSync(watchDir)) {
      throw new Error(`Watch directory does not exist: ${watchDir}`);
    }

    // Ensure output directory exists
    if (!existsSync(this.resolvedOutputDir)) {
      mkdirSync(this.resolvedOutputDir, { recursive: true });
    }

    // Scan for existing files that already have output (mark as processed)
    await this.scanExistingFiles(watchDir);

    this.callbacks.onLog(`Watching: ${watchDir}`);
    this.callbacks.onLog(`Output:   ${this.resolvedOutputDir}`);
    this.callbacks.onLog(`Watching for: ${[...VIDEO_EXTENSIONS].join(', ')}`);

    // Start the fs.watch watcher
    this.watcher = watch(watchDir, (eventType, filename) => {
      if (this.stopped || !filename) return;
      this.handleFileEvent(watchDir, filename);
    });

    this.watcher.on('error', (err) => {
      this.callbacks.onLog(`Watcher error: ${err.message}`);
    });

    // Wait until stop() is called
    return new Promise<void>((resolvePromise) => {
      if (this.stopped) {
        resolvePromise();
        return;
      }
      this.stopResolve = resolvePromise;
    });
  }

  /**
   * Stop watching and clean up.
   */
  stop(): void {
    this.stopped = true;

    // Clear all pending stability checks
    for (const [, timeout] of this.pendingStabilityChecks) {
      clearTimeout(timeout);
    }
    this.pendingStabilityChecks.clear();

    // Close the watcher
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    // Resolve the start() promise
    if (this.stopResolve) {
      this.stopResolve();
      this.stopResolve = null;
    }
  }

  /**
   * Check if the watcher has been stopped.
   */
  isStopped(): boolean {
    return this.stopped;
  }

  /**
   * Get the set of files currently being processed.
   */
  getProcessingFiles(): ReadonlySet<string> {
    return this.processing;
  }

  /**
   * Get the set of files that have been processed.
   */
  getProcessedFiles(): ReadonlySet<string> {
    return this.processed;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Scan existing files in the watch directory and mark ones that already
   * have corresponding output as processed.
   */
  private async scanExistingFiles(watchDir: string): Promise<void> {
    try {
      const entries = await readdir(watchDir);
      for (const entry of entries) {
        const ext = extname(entry).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          const fullPath = join(watchDir, entry);
          if (this.hasExistingOutput(entry)) {
            this.processed.add(fullPath);
            if (this.options.verbose) {
              this.callbacks.onLog(`Skipping (already processed): ${entry}`);
            }
          }
        }
      }
    } catch {
      // If we can't read the directory, we'll discover files via the watcher
    }
  }

  /**
   * Check if a video file already has corresponding output in the output directory.
   */
  hasExistingOutput(filename: string): boolean {
    const videoName = basename(filename)
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-');

    // Check if any file in the output directory starts with the sanitized video name
    if (!existsSync(this.resolvedOutputDir)) return false;

    try {
      const outputFiles = readdirSync(this.resolvedOutputDir);
      return outputFiles.some(
        (f) => f.startsWith(videoName) && f.endsWith('.md')
      );
    } catch {
      return false;
    }
  }

  /**
   * Handle a file event from fs.watch.
   */
  private handleFileEvent(watchDir: string, filename: string): void {
    const ext = extname(filename).toLowerCase();
    if (!VIDEO_EXTENSIONS.has(ext)) return;

    const fullPath = join(watchDir, filename);

    // Skip if already processed or being processed
    if (this.processed.has(fullPath) || this.processing.has(fullPath)) return;

    // Skip if already waiting for stability
    if (this.pendingStabilityChecks.has(fullPath)) return;

    this.callbacks.onFileDetected(fullPath);
    this.startStabilityCheck(fullPath);
  }

  /**
   * Start a stability check for a file. The file is considered stable when
   * its size doesn't change over the configured interval (default: 2s).
   */
  private startStabilityCheck(filePath: string, previousSize?: number, checks = 0): void {
    const interval = this.options.stabilityInterval ?? 2000;
    const maxChecks = this.options.maxStabilityChecks ?? 30;

    if (this.stopped) return;

    if (checks >= maxChecks) {
      this.callbacks.onLog(`Gave up waiting for file to stabilize: ${basename(filePath)}`);
      this.pendingStabilityChecks.delete(filePath);
      return;
    }

    const timeout = setTimeout(async () => {
      if (this.stopped) {
        this.pendingStabilityChecks.delete(filePath);
        return;
      }

      try {
        if (!existsSync(filePath)) {
          // File was removed before stabilizing
          this.pendingStabilityChecks.delete(filePath);
          return;
        }

        const stats = await stat(filePath);
        const currentSize = stats.size;

        if (currentSize === 0) {
          // Empty file, keep checking
          this.pendingStabilityChecks.delete(filePath);
          this.startStabilityCheck(filePath, currentSize, checks + 1);
          return;
        }

        if (previousSize !== undefined && currentSize === previousSize) {
          // Size hasn't changed — file is stable
          this.pendingStabilityChecks.delete(filePath);
          this.processFile(filePath);
        } else {
          // Size changed or first check — keep watching
          if (this.options.verbose) {
            this.callbacks.onLog(
              `File size: ${currentSize} bytes (check ${checks + 1}/${maxChecks}): ${basename(filePath)}`
            );
          }
          this.pendingStabilityChecks.delete(filePath);
          this.startStabilityCheck(filePath, currentSize, checks + 1);
        }
      } catch {
        // stat failed — file may have been removed
        this.pendingStabilityChecks.delete(filePath);
      }
    }, interval);

    this.pendingStabilityChecks.set(filePath, timeout);
  }

  /**
   * Process a stable video file through CLIPipeline.
   */
  private async processFile(filePath: string): Promise<void> {
    if (this.stopped || this.processing.has(filePath) || this.processed.has(filePath)) return;

    this.processing.add(filePath);
    this.callbacks.onProcessingStart(filePath);

    const pipelineOptions: CLIPipelineOptions = {
      videoPath: filePath,
      outputDir: this.resolvedOutputDir,
      whisperModelPath: this.options.whisperModelPath,
      skipFrames: this.options.skipFrames,
      verbose: this.options.verbose,
    };

    const logFn = this.options.verbose ? this.callbacks.onLog : () => {};

    const pipeline = new CLIPipeline(pipelineOptions, logFn, this.callbacks.onLog);

    try {
      const result = await pipeline.run();
      this.processed.add(filePath);
      this.callbacks.onProcessingComplete(filePath, result.outputPath);

      // Log to watch log file
      await this.appendToWatchLog(filePath, result.outputPath);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.callbacks.onProcessingError(filePath, err);
    } finally {
      this.processing.delete(filePath);
    }
  }

  /**
   * Append a processed file entry to the watch log.
   */
  private async appendToWatchLog(inputPath: string, outputPath: string): Promise<void> {
    const logPath = join(resolve(this.options.watchDir), WATCH_LOG_FILENAME);
    const timestamp = new Date().toISOString();
    const entry = `${timestamp}\t${inputPath}\t${outputPath}\n`;

    try {
      await appendFile(logPath, entry, 'utf-8');
    } catch {
      // Non-critical — don't fail the pipeline for a log write error
    }
  }
}
