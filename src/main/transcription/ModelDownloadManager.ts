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
import type { IncomingMessage } from 'http';
import type { WhisperModelDownloadStatus } from '../../shared/types';
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
export const DEFAULT_DOWNLOAD_MODEL: WhisperModel = 'tiny';

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
  'large-turbo': {
    name: 'large-turbo',
    filename: 'ggml-large-v3-turbo-q5_0.bin',
    sizeBytes: 574_000_000,
    sizeMB: 574,
    ramRequired: '~3.6GB',
    quality: 'Very high - Fast large-v3 variant',
    url: `${HUGGINGFACE_BASE_URL}/ggml-large-v3-turbo-q5_0.bin`,
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
  private pendingDownloads = new Map<WhisperModel, Promise<DownloadResult>>();
  private downloadProgress = new Map<WhisperModel, DownloadProgress>();
  private downloadErrors = new Map<WhisperModel, string>();

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
    return this.isModelFileValid(model, this.getModelPath(model));
  }

  private isModelFileValid(model: WhisperModel, path: string): boolean {
    if (!existsSync(path)) {
      return false;
    }

    // Check file size matches expected (with 5% variance for compression differences)
    const stats = statSync(path);
    const expectedSize = this.getModelInfo(model).sizeBytes;
    const variance = expectedSize * 0.05;
    return stats.isFile() && Math.abs(stats.size - expectedSize) < variance;
  }

  /**
   * Get the default (best available) model
   */
  getDefaultModel(): WhisperModel {
    // Prefer the highest-quality locally available model.
    const preference: WhisperModel[] = ['large-turbo', 'medium', 'small', 'base', 'tiny', 'large'];

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
    const models: WhisperModel[] = ['tiny', 'base', 'small', 'medium', 'large-turbo', 'large'];
    return models.some((model) => this.isModelDownloaded(model));
  }

  /**
   * Provision a small model without replacing an existing installation.
   */
  async ensureDefaultModel(): Promise<DownloadResult | null> {
    if (this.hasAnyModel()) return null;
    return this.downloadModel(DEFAULT_DOWNLOAD_MODEL);
  }

  getDownloadStatus(model: WhisperModel): WhisperModelDownloadStatus {
    return {
      model,
      isDownloading: this.isDownloading(model),
      percent: this.downloadProgress.get(model)?.percent ?? null,
      error: this.downloadErrors.get(model) ?? null,
    };
  }

  async downloadModel(model: WhisperModel): Promise<DownloadResult> {
    if (this.isModelDownloaded(model)) {
      this.log(`Model ${model} already downloaded`);
      return { success: true, model, path: this.getModelPath(model) };
    }
    const pending = this.pendingDownloads.get(model);
    if (pending) return pending;
    const download = this.performDownload(model);
    this.pendingDownloads.set(model, download);
    try {
      return await download;
    } finally {
      this.pendingDownloads.delete(model);
    }
  }

  private performDownload(model: WhisperModel): Promise<DownloadResult> {
    const info = this.getModelInfo(model);
    const targetPath = this.getModelPath(model);
    const tempPath = `${targetPath}.download`;
    this.downloadErrors.delete(model);
    this.downloadProgress.delete(model);
    this.log(`Starting download: ${model} (${info.sizeMB}MB)`);

    return new Promise((resolve, reject) => {
      let downloadedBytes = existsSync(tempPath) ? statSync(tempPath).size : 0;
      let lastProgressTime = Date.now();
      let lastDownloadedBytes = downloadedBytes;
      let settled = false;
      let responseStream: IncomingMessage | undefined;
      let writeStream: ReturnType<typeof createWriteStream> | undefined;

      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        this.activeDownloads.get(model)?.request?.destroy();
        responseStream?.destroy();
        writeStream?.destroy();
        this.handleDownloadError(error, model, tempPath);
        reject(error);
      };
      this.activeDownloads.set(model, { abort: () => fail(new Error(`Download cancelled: ${model}`)) });

      const request = (url: string, redirects = 0): void => {
        if (settled) return;
        const current = https.get(url, {
          headers: downloadedBytes > 0 ? { Range: `bytes=${downloadedBytes}-` } : {},
        }, (response) => {
          if (settled) {
            response.destroy();
            return;
          }
          responseStream = response;
          response.on('error', fail);
          response.on('aborted', () => fail(new Error('Whisper model download interrupted')));
          if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
            const location = response.headers.location;
            if (!location || redirects >= 5) {
              fail(new Error('Invalid or excessive model download redirects'));
              return;
            }
            response.resume();
            try {
              request(new URL(location, url).href, redirects + 1);
            } catch (error) {
              fail(error instanceof Error ? error : new Error(String(error)));
            }
            return;
          }
          if (response.statusCode !== 200 && response.statusCode !== 206) {
            if (response.statusCode === 416 && downloadedBytes > 0) {
              downloadedBytes = 0;
              response.resume();
              request(info.url);
              return;
            }
            fail(new Error(`Download failed: HTTP ${response.statusCode}`));
            return;
          }

          // A server may ignore Range and send the entire file again.
          if (response.statusCode === 200) downloadedBytes = 0;
          lastDownloadedBytes = downloadedBytes;
          const totalBytes = downloadedBytes + Number(response.headers['content-length'] || 0);
          writeStream = createWriteStream(tempPath, { flags: downloadedBytes > 0 ? 'a' : 'w' });
          writeStream.on('error', fail);
          response.on('data', (chunk: Buffer) => {
            if (settled) return;
            downloadedBytes += chunk.length;
            const now = Date.now();
            const timeDelta = (now - lastProgressTime) / 1000;
            if (timeDelta < 0.1) return;
            const speedBps = (downloadedBytes - lastDownloadedBytes) / timeDelta;
            const progress: DownloadProgress = {
              model,
              downloadedBytes,
              totalBytes,
              percent: totalBytes > 0 ? Math.min(100, Math.round(downloadedBytes / totalBytes * 100)) : 0,
              speedBps: Math.round(speedBps),
              estimatedSecondsRemaining: speedBps > 0 ? Math.max(0, (totalBytes - downloadedBytes) / speedBps) : 0,
            };
            this.downloadProgress.set(model, progress);
            this.progressCallbacks.forEach((callback) => callback(progress));
            this.emit('progress', progress);
            lastProgressTime = now;
            lastDownloadedBytes = downloadedBytes;
          });

          writeStream.on('finish', () => {
            if (settled) return;
            try {
              if (!this.isModelFileValid(model, tempPath)) {
                fail(new Error('Downloaded file size mismatch - download may be corrupted'));
                return;
              }
              renameSync(tempPath, targetPath);
            } catch (error) {
              fail(error instanceof Error ? error : new Error(String(error)));
              return;
            }
            settled = true;
            this.activeDownloads.delete(model);
            const result: DownloadResult = { success: true, model, path: targetPath };
            this.completeCallbacks.forEach((cb) => cb(result));
            this.emit('complete', result);
            this.log(`Download complete: ${model}`);
            resolve(result);
          });
          response.pipe(writeStream);
        });
        current.on('error', fail);
        current.setTimeout(30_000, () => fail(new Error('Whisper model download timed out')));
        const active = this.activeDownloads.get(model);
        if (active) active.request = current;
      };
      try {
        request(info.url);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
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
    this.downloadErrors.set(model, error.message);

    // Keep partial download for resume (don't delete tempPath)
    this.errorCallbacks.forEach((cb) => cb(error, model));
    if (this.listenerCount('error') > 0) this.emit('error', error, model);
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
