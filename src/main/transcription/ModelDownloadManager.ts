/**
 * ModelDownloadManager.ts - Whisper Model Download and Management
 *
 * Handles:
 * - Downloading Whisper models from Hugging Face
 * - Progress tracking with events
 * - Resume support for interrupted downloads
 * - Storage management
 */

import { EventEmitter } from 'events';
import { app } from 'electron';
import { createWriteStream, existsSync, statSync, unlinkSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import * as https from 'https';
import type {
  WhisperModel,
  ModelInfo,
  DownloadProgress,
  DownloadResult,
  ProgressCallback,
  CompleteCallback,
} from './types';

// ============================================================================
// Constants
// ============================================================================

const HUGGINGFACE_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

const MODEL_INFO: Record<WhisperModel, ModelInfo> = {
  tiny: {
    name: 'tiny',
    filename: 'ggml-tiny.bin',
    sizeBytes: 75_000_000,
    sizeMB: 75,
    ramRequired: '~400MB',
    quality: 'Low - Fast, less accurate',
    url: `${HUGGINGFACE_BASE_URL}/ggml-tiny.bin`,
  },
  base: {
    name: 'base',
    filename: 'ggml-base.bin',
    sizeBytes: 142_000_000,
    sizeMB: 142,
    ramRequired: '~700MB',
    quality: 'Medium - Balanced',
    url: `${HUGGINGFACE_BASE_URL}/ggml-base.bin`,
  },
  small: {
    name: 'small',
    filename: 'ggml-small.bin',
    sizeBytes: 466_000_000,
    sizeMB: 466,
    ramRequired: '~1.2GB',
    quality: 'Good - Recommended for low RAM',
    url: `${HUGGINGFACE_BASE_URL}/ggml-small.bin`,
  },
  medium: {
    name: 'medium',
    filename: 'ggml-medium.bin',
    sizeBytes: 1_500_000_000,
    sizeMB: 1500,
    ramRequired: '~2.5GB',
    quality: 'High - Recommended default',
    url: `${HUGGINGFACE_BASE_URL}/ggml-medium.bin`,
  },
  large: {
    name: 'large',
    filename: 'ggml-large-v3.bin',
    sizeBytes: 3_100_000_000,
    sizeMB: 3100,
    ramRequired: '~5GB',
    quality: 'Best - Most accurate, slowest',
    url: `${HUGGINGFACE_BASE_URL}/ggml-large-v3.bin`,
  },
};

// ============================================================================
// ModelDownloadManager Class
// ============================================================================

export class ModelDownloadManager extends EventEmitter {
  private modelsDir: string;
  private activeDownloads: Map<WhisperModel, { abort: () => void; request?: ReturnType<typeof https.get> }> = new Map();

  // Callbacks
  private progressCallbacks: ProgressCallback[] = [];
  private completeCallbacks: CompleteCallback[] = [];
  private errorCallbacks: Array<(error: Error, model: WhisperModel) => void> = [];

  constructor() {
    super();
    this.modelsDir = this.getModelsDirectory();
    this.ensureModelsDirectory();
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get the directory where models are stored
   */
  getModelsDirectory(): string {
    // Handle case where app is not ready yet
    try {
      return join(app.getPath('userData'), 'whisper-models');
    } catch {
      // Fallback for testing or early initialization
      const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
      return join(homeDir, '.markuprx', 'whisper-models');
    }
  }

  /**
   * Get information about all available models
   */
  getAvailableModels(): ModelInfo[] {
    return Object.values(MODEL_INFO);
  }

  /**
   * Get information about a specific model
   */
  getModelInfo(model: WhisperModel): ModelInfo {
    return MODEL_INFO[model];
  }

  /**
   * Get the path for a model file
   */
  getModelPath(model: WhisperModel): string {
    return join(this.modelsDir, MODEL_INFO[model].filename);
  }

  /**
   * Check if a model is downloaded and valid
   */
  isModelDownloaded(model: WhisperModel): boolean {
    const path = this.getModelPath(model);
    if (!existsSync(path)) {
      return false;
    }

    // Check file size matches expected (with 5% variance for compression differences)
    const stats = statSync(path);
    const expectedSize = MODEL_INFO[model].sizeBytes;
    const variance = expectedSize * 0.05;
    return Math.abs(stats.size - expectedSize) < variance;
  }

  /**
   * Get the default (best available) model
   */
  getDefaultModel(): WhisperModel {
    // Prefer medium, fall back to smaller models
    const preference: WhisperModel[] = ['medium', 'small', 'base', 'tiny'];

    for (const model of preference) {
      if (this.isModelDownloaded(model)) {
        return model;
      }
    }

    return 'medium'; // Default to download medium
  }

  /**
   * Check if any Whisper model is downloaded
   */
  hasAnyModel(): boolean {
    const models: WhisperModel[] = ['tiny', 'base', 'small', 'medium', 'large'];
    return models.some((model) => this.isModelDownloaded(model));
  }

  /**
   * Download a model with progress tracking
   */
  async downloadModel(model: WhisperModel): Promise<DownloadResult> {
    const info = MODEL_INFO[model];
    const targetPath = this.getModelPath(model);
    const tempPath = `${targetPath}.download`;

    // Check if already downloaded
    if (this.isModelDownloaded(model)) {
      this.log(`Model ${model} already downloaded`);
      return { success: true, model, path: targetPath };
    }

    // Check if download already in progress
    if (this.activeDownloads.has(model)) {
      throw new Error(`Download already in progress for ${model}`);
    }

    this.log(`Starting download: ${model} (${info.sizeMB}MB)`);

    return new Promise((resolve, reject) => {
      let downloadedBytes = 0;
      let lastProgressTime = Date.now();
      let lastDownloadedBytes = 0;
      let aborted = false;

      // Create abort controller
      const abort = (): void => {
        aborted = true;
        const download = this.activeDownloads.get(model);
        if (download?.request) {
          download.request.destroy();
        }
        // Keep partial download for resume
        this.activeDownloads.delete(model);
        this.log(`Download cancelled: ${model}`);
      };

      this.activeDownloads.set(model, { abort });

      // Check for partial download (resume support)
      if (existsSync(tempPath)) {
        const stats = statSync(tempPath);
        downloadedBytes = stats.size;
        lastDownloadedBytes = downloadedBytes;
        this.log(`Resuming download from ${Math.round(downloadedBytes / 1024 / 1024)}MB`);
      }

      // Create write stream (append mode if resuming)
      const writeStream = createWriteStream(tempPath, {
        flags: downloadedBytes > 0 ? 'a' : 'w',
      });

      const handleResponse = (response: import('http').IncomingMessage, redirectCount: number = 0): void => {
        if (aborted) {
          return;
        }

        // Handle redirects (Hugging Face uses redirects)
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
          if (redirectCount > 5) {
            const error = new Error('Too many redirects');
            this.handleDownloadError(error, model, tempPath);
            reject(error);
            return;
          }

          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.log(`Following redirect to: ${redirectUrl.substring(0, 50)}...`);
            const redirectRequest = https.get(
              redirectUrl,
              {
                headers: downloadedBytes > 0 ? { Range: `bytes=${downloadedBytes}-` } : {},
              },
              (redirectResponse) => {
                handleResponse(redirectResponse, redirectCount + 1);
              }
            );

            redirectRequest.on('error', (error) => {
              this.handleDownloadError(error, model, tempPath);
              reject(error);
            });

            // Store request for abort
            const download = this.activeDownloads.get(model);
            if (download) {
              download.request = redirectRequest;
            }
            return;
          }
        }

        // Handle partial content (resume) or full content
        if (response.statusCode !== 200 && response.statusCode !== 206) {
          const error = new Error(`Download failed: HTTP ${response.statusCode}`);
          this.handleDownloadError(error, model, tempPath);
          reject(error);
          return;
        }

        const contentLength = parseInt(response.headers['content-length'] || '0', 10);
        const totalBytes = downloadedBytes + contentLength;

        response.on('data', (chunk: Buffer) => {
          if (aborted) {
            response.destroy();
            return;
          }

          downloadedBytes += chunk.length;

          // Calculate progress
          const now = Date.now();
          const timeDelta = (now - lastProgressTime) / 1000;

          if (timeDelta >= 0.1) {
            // Update every 100ms
            const bytesDelta = downloadedBytes - lastDownloadedBytes;
            const speedBps = timeDelta > 0 ? bytesDelta / timeDelta : 0;
            const remainingBytes = totalBytes - downloadedBytes;
            const estimatedSecondsRemaining = speedBps > 0 ? remainingBytes / speedBps : 0;

            const progress: DownloadProgress = {
              model,
              downloadedBytes,
              totalBytes,
              percent: totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0,
              speedBps: Math.round(speedBps),
              estimatedSecondsRemaining: Math.round(estimatedSecondsRemaining),
            };

            this.progressCallbacks.forEach((cb) => cb(progress));
            this.emit('progress', progress);

            lastProgressTime = now;
            lastDownloadedBytes = downloadedBytes;
          }
        });

        response.pipe(writeStream);

        writeStream.on('finish', () => {
          if (aborted) {
            return;
          }

          this.activeDownloads.delete(model);

          // Rename temp file to final
          try {
            renameSync(tempPath, targetPath);
          } catch (renameError) {
            this.handleDownloadError(renameError as Error, model, tempPath);
            reject(renameError);
            return;
          }

          // Verify download
          if (this.isModelDownloaded(model)) {
            const result: DownloadResult = { success: true, model, path: targetPath };
            this.completeCallbacks.forEach((cb) => cb(result));
            this.emit('complete', result);
            this.log(`Download complete: ${model}`);
            resolve(result);
          } else {
            const error = new Error('Downloaded file size mismatch - download may be corrupted');
            this.handleDownloadError(error, model, targetPath);
            reject(error);
          }
        });

        writeStream.on('error', (error) => {
          this.handleDownloadError(error, model, tempPath);
          reject(error);
        });
      };

      // Make initial HTTP request
      const request = https.get(
        info.url,
        {
          headers: downloadedBytes > 0 ? { Range: `bytes=${downloadedBytes}-` } : {},
        },
        (response) => {
          handleResponse(response);
        }
      );

      request.on('error', (error) => {
        this.handleDownloadError(error, model, tempPath);
        reject(error);
      });

      // Store request for abort
      const download = this.activeDownloads.get(model);
      if (download) {
        download.request = request;
      }
    });
  }

  /**
   * Cancel an active download
   */
  cancelDownload(model: WhisperModel): void {
    const download = this.activeDownloads.get(model);
    if (download) {
      download.abort();
    }
  }

  /**
   * Check if a download is in progress
   */
  isDownloading(model: WhisperModel): boolean {
    return this.activeDownloads.has(model);
  }

  /**
   * Delete a downloaded model
   */
  deleteModel(model: WhisperModel): void {
    const path = this.getModelPath(model);
    if (existsSync(path)) {
      unlinkSync(path);
      this.log(`Model deleted: ${model}`);
    }

    // Also delete partial download if exists
    const tempPath = `${path}.download`;
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
  }

  /**
   * Get storage usage information
   */
  getStorageInfo(): { totalBytes: number; models: Array<{ model: WhisperModel; sizeBytes: number }> } {
    const models: Array<{ model: WhisperModel; sizeBytes: number }> = [];
    let totalBytes = 0;

    for (const model of Object.keys(MODEL_INFO) as WhisperModel[]) {
      const path = this.getModelPath(model);
      if (existsSync(path)) {
        const stats = statSync(path);
        models.push({ model, sizeBytes: stats.size });
        totalBytes += stats.size;
      }
    }

    return { totalBytes, models };
  }

  // ============================================================================
  // Event Subscriptions
  // ============================================================================

  onProgress(callback: ProgressCallback): () => void {
    this.progressCallbacks.push(callback);
    return () => {
      this.progressCallbacks = this.progressCallbacks.filter((cb) => cb !== callback);
    };
  }

  onComplete(callback: CompleteCallback): () => void {
    this.completeCallbacks.push(callback);
    return () => {
      this.completeCallbacks = this.completeCallbacks.filter((cb) => cb !== callback);
    };
  }

  onError(callback: (error: Error, model: WhisperModel) => void): () => void {
    this.errorCallbacks.push(callback);
    return () => {
      this.errorCallbacks = this.errorCallbacks.filter((cb) => cb !== callback);
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private ensureModelsDirectory(): void {
    if (!existsSync(this.modelsDir)) {
      mkdirSync(this.modelsDir, { recursive: true });
      this.log(`Created models directory: ${this.modelsDir}`);
    }
  }

  private handleDownloadError(error: Error, model: WhisperModel, _tempPath: string): void {
    this.activeDownloads.delete(model);

    // Keep partial download for resume (don't delete tempPath)
    this.errorCallbacks.forEach((cb) => cb(error, model));
    this.emit('error', error, model);
    this.logError(`Download failed: ${model}`, error);
  }

  private log(message: string): void {
    console.log(`[ModelDownloadManager] ${message}`);
  }

  private logError(message: string, error?: unknown): void {
    const errorStr = error instanceof Error ? error.message : String(error);
    console.error(`[ModelDownloadManager] ERROR: ${message} - ${errorStr}`);
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const modelDownloadManager = new ModelDownloadManager();
export default ModelDownloadManager;
