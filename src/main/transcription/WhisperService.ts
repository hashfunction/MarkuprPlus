/**
 * WhisperService.ts - Local Whisper Transcription (Tier 2)
 *
 * Uses whisper.cpp via whisper-node for on-device transcription.
 * No API key or internet required.
 *
 * Features:
 * - Batch processing of audio chunks
 * - Configurable model and language
 * - Memory-efficient buffer management
 * - Event-based result delivery
 */

import { EventEmitter } from 'events';
import { basename, join } from 'path';
// NOTE: 'electron' is NOT imported at the top level. This allows WhisperService
// to be used in non-Electron environments (e.g. the CLI). The `app` reference
// is lazily required inside getModelsDirectory() with a try/catch fallback.
import { existsSync, statSync } from 'fs';
import { readFile, unlink, chmod } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import * as os from 'os';
import type { WhisperTranscriptResult, WhisperConfig, ErrorCallback } from './types';

const execFileAsync = promisify(execFile);

// ============================================================================
// Types
// ============================================================================

type TranscriptCallback = (result: WhisperTranscriptResult) => void;

export interface WhisperServiceOptions extends Partial<WhisperConfig> {
  modelsDirectory?: string;
}

// Whisper-node module type (loaded dynamically)
interface WhisperModule {
  whisper: (
    samples: Float32Array,
    options: {
      modelPath: string;
      language?: string;
      threads?: number;
      translate?: boolean;
    }
  ) => Promise<Array<{ text: string; start: number; end: number }>>;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: WhisperConfig = {
  modelPath: '', // Set dynamically
  language: 'en',
  threads: Math.max(1, Math.floor(os.cpus().length / 2)), // Half CPU cores
  translateToEnglish: false,
};

// Audio buffer configuration
const CHUNK_DURATION_MS = 3000; // Process 3 seconds at a time
const MAX_BUFFER_DURATION_MS = 30000; // Max 30 seconds before force-processing
const MAX_BUFFER_SIZE_BYTES = 500 * 1024; // 500KB cap as per audit
const SAMPLE_RATE = 16000; // 16kHz mono
const FILE_CHUNK_DURATION_SEC = 30; // 30 seconds per chunk for file transcription
const FILE_CHUNK_SAMPLES = FILE_CHUNK_DURATION_SEC * SAMPLE_RATE;
const MODEL_MEMORY_REQUIREMENTS_BYTES: Record<string, number> = {
  'ggml-tiny.bin': 450 * 1024 * 1024,
  'ggml-base.bin': 800 * 1024 * 1024,
  'ggml-small.bin': 1400 * 1024 * 1024,
  'ggml-medium.bin': 2800 * 1024 * 1024,
  'ggml-large-v3.bin': 5200 * 1024 * 1024,
};
const MODEL_PREFERENCE = [
  'ggml-medium.bin',
  'ggml-small.bin',
  'ggml-base.bin',
  'ggml-tiny.bin',
  'ggml-large-v3.bin',
] as const;

function isUsableModelFile(path: string): boolean {
  try {
    const stats = statSync(path);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}

export function resolveDownloadedWhisperModelPath(modelsDirectory: string): string | null {
  for (const filename of MODEL_PREFERENCE) {
    const candidate = join(modelsDirectory, filename);
    if (isUsableModelFile(candidate)) {
      return candidate;
    }
  }

  return null;
}

// ============================================================================
// WhisperService Class
// ============================================================================

export class WhisperService extends EventEmitter {
  private config: WhisperConfig;
  private readonly modelsDirectory: string;
  private autoDiscoverModelPath: boolean;
  private isInitialized: boolean = false;
  private isProcessing: boolean = false;
  private whisperModule: WhisperModule | null = null;

  // Audio buffering for batch processing
  private audioBuffer: Float32Array[] = [];
  private bufferStartTime: number = 0;
  private totalBufferDuration: number = 0;
  private totalBufferBytes: number = 0;

  // Processing state
  private processingInterval: ReturnType<typeof setInterval> | null = null;

  // Callbacks
  private transcriptCallbacks: TranscriptCallback[] = [];
  private errorCallbacks: ErrorCallback[] = [];

  constructor(options: WhisperServiceOptions = {}) {
    super();
    const { modelsDirectory, ...config } = options;
    this.modelsDirectory = modelsDirectory || this.getModelsDirectory();
    this.autoDiscoverModelPath = !config.modelPath;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Set default model path if not specified
    if (this.autoDiscoverModelPath) {
      this.refreshDiscoveredModelPath();
    }
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Check if Whisper model is available
   */
  isModelAvailable(): boolean {
    this.refreshDiscoveredModelPath();
    return isUsableModelFile(this.config.modelPath);
  }

  /**
   * Get the path where models should be stored
   */
  getModelsDirectory(): string {
    try {
      // Dynamic require to avoid crash in non-Electron environments (e.g. CLI)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('electron');
      return join(app.getPath('userData'), 'whisper-models');
    } catch {
      const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
      return join(homeDir, '.markupr', 'whisper-models');
    }
  }

  /**
   * Get the best available model path, defaulting to whisper-medium's location.
   */
  getDefaultModelPath(): string {
    return resolveDownloadedWhisperModelPath(this.modelsDirectory)
      || join(this.modelsDirectory, 'ggml-medium.bin');
  }

  /**
   * Set the model path
   */
  setModelPath(modelPath: string): void {
    this.config.modelPath = modelPath;
    this.autoDiscoverModelPath = false;
    this.isInitialized = false; // Need to reinitialize with new model
  }

  /**
   * Check if system has enough memory for Whisper
   * Requirement is model-aware (tiny/base/small/medium/large).
   */
  hasEnoughMemory(): boolean {
    const freeMemory = os.freemem();
    const requiredMemory = this.getRequiredMemoryBytes();
    return freeMemory >= requiredMemory;
  }

  /**
   * Get current memory info
   */
  getMemoryInfo(): { freeMemoryMB: number; requiredMemoryMB: number; sufficient: boolean } {
    const freeMemory = os.freemem();
    const requiredMemory = this.getRequiredMemoryBytes();
    return {
      freeMemoryMB: Math.round(freeMemory / 1024 / 1024),
      requiredMemoryMB: Math.round(requiredMemory / 1024 / 1024),
      sufficient: freeMemory >= requiredMemory,
    };
  }

  /**
   * Initialize the Whisper model
   * Call this once before starting transcription
   */
  async initialize(): Promise<void> {
    this.refreshDiscoveredModelPath();
    if (this.isInitialized) {
      return;
    }

    if (!this.isModelAvailable()) {
      throw new Error(`Whisper model not found at ${this.config.modelPath}. Please download the model first.`);
    }

    if (!this.hasEnoughMemory()) {
      const memInfo = this.getMemoryInfo();
      throw new Error(
        `Insufficient memory for Whisper. Need ~${memInfo.requiredMemoryMB}MB free, only ${memInfo.freeMemoryMB}MB available.`
      );
    }

    this.log('Initializing Whisper model...');

    try {
      // Dynamically import whisper-node to avoid startup crashes if not installed
      // @ts-expect-error - whisper-node may not have types
      this.whisperModule = await import('whisper-node');

      // Verify the module loaded correctly
      if (!this.whisperModule || typeof this.whisperModule.whisper !== 'function') {
        throw new Error('whisper-node module loaded but whisper function not found');
      }

      // Do a test transcription with tiny audio to pre-load the model
      this.log('Pre-loading model with test transcription...');
      const testBuffer = new Float32Array(1600); // 16kHz * 0.1s = 100ms of silence

      await this.whisperModule.whisper(testBuffer, {
        modelPath: this.config.modelPath,
        language: this.config.language,
        threads: this.config.threads,
      });

      this.isInitialized = true;
      this.log('Whisper model initialized successfully');
    } catch (error) {
      const initError = new Error(`Failed to initialize Whisper: ${(error as Error).message}`);
      this.errorCallbacks.forEach((cb) => cb(initError));
      throw initError;
    }
  }

  private refreshDiscoveredModelPath(): void {
    if (!this.autoDiscoverModelPath) {
      return;
    }

    this.config.modelPath = this.getDefaultModelPath();
  }

  /**
   * Check if service is initialized and ready
   */
  isReady(): boolean {
    return this.isInitialized && this.whisperModule !== null;
  }

  /**
   * Start accepting audio for transcription
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Reset buffer state
    this.audioBuffer = [];
    this.bufferStartTime = Date.now();
    this.totalBufferDuration = 0;
    this.totalBufferBytes = 0;

    // Start periodic processing
    this.processingInterval = setInterval(() => {
      this.processBufferedAudio();
    }, CHUNK_DURATION_MS);

    this.log('Whisper transcription started');
  }

  /**
   * Stop transcription and process remaining audio
   */
  async stop(): Promise<void> {
    // Clear processing interval
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Process any remaining audio
    await this.processBufferedAudio(true);

    // Clear buffer
    this.audioBuffer = [];
    this.totalBufferDuration = 0;
    this.totalBufferBytes = 0;

    this.log('Whisper transcription stopped');
  }

  /**
   * Add audio data to the buffer
   * @param samples Float32Array of audio samples at 16kHz mono
   * @param durationMs Duration of this chunk in milliseconds
   */
  addAudio(samples: Float32Array, durationMs: number): void {
    const chunkBytes = samples.byteLength;

    // Enforce buffer size cap (500KB as per audit CRIT-006)
    if (this.totalBufferBytes + chunkBytes > MAX_BUFFER_SIZE_BYTES) {
      this.log('Audio buffer full, force-processing before adding new audio');
      this.processBufferedAudio(true);
    }

    this.audioBuffer.push(samples);
    this.totalBufferDuration += durationMs;
    this.totalBufferBytes += chunkBytes;

    // Force process if buffer duration is too long
    if (this.totalBufferDuration >= MAX_BUFFER_DURATION_MS) {
      this.processBufferedAudio(true);
    }
  }

  /**
   * Register callback for transcript results
   */
  onTranscript(callback: TranscriptCallback): () => void {
    this.transcriptCallbacks.push(callback);
    return () => {
      this.transcriptCallbacks = this.transcriptCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Register callback for errors
   */
  onError(callback: ErrorCallback): () => void {
    this.errorCallbacks.push(callback);
    return () => {
      this.errorCallbacks = this.errorCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): WhisperConfig {
    return { ...this.config };
  }

  /**
   * Transcribe a complete Float32 buffer in one pass.
   * Useful for post-session retry workflows when live streaming failed.
   */
  async transcribeSamples(
    samples: Float32Array,
    startTimeSec: number
  ): Promise<WhisperTranscriptResult[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.whisperModule) {
      throw new Error('Whisper module not loaded');
    }

    // Timeout per 30-second chunk to prevent infinite hangs from corrupt models
    const CHUNK_TIMEOUT_MS = 60_000;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('Whisper transcription timed out after 60s')),
        CHUNK_TIMEOUT_MS
      );
    });

    let result: Array<{ text: string; start: number; end: number }>;
    try {
      result = await Promise.race([
        this.whisperModule.whisper(samples, {
          modelPath: this.config.modelPath,
          language: this.config.language,
          threads: this.config.threads,
          translate: this.config.translateToEnglish,
        }),
        timeoutPromise,
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (!result || result.length === 0) {
      return [];
    }

    return result
      .map((segment) => ({
        text: segment.text.trim(),
        startTime: startTimeSec + segment.start,
        endTime: startTimeSec + segment.end,
        confidence: 0.9,
      }))
      .filter((segment) => segment.text.length > 0);
  }

  /**
   * Transcribe an audio file from disk.
   * Loads the file, converts to Float32Array at 16kHz mono, and transcribes.
   * For large files, processes in chunks to manage memory.
   *
   * @param audioPath - Path to the audio file (webm, wav, ogg, m4a)
   * @param onProgress - Optional progress callback (0-100)
   * @returns Array of transcript results with timestamps
   */
  async transcribeFile(
    audioPath: string,
    onProgress?: (percent: number) => void
  ): Promise<WhisperTranscriptResult[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    this.log(`Transcribing file: ${audioPath}`);
    onProgress?.(0);

    // Get Float32Array samples from the file
    const samples = await this.loadAudioAsSamples(audioPath);

    if (samples.length === 0) {
      this.log('Audio file produced no samples');
      onProgress?.(100);
      return [];
    }

    // Split into 30-second chunks and transcribe each
    const totalChunks = Math.ceil(samples.length / FILE_CHUNK_SAMPLES);
    const results: WhisperTranscriptResult[] = [];

    this.log(`Processing ${totalChunks} chunk(s) (${(samples.length / SAMPLE_RATE).toFixed(1)}s total)`);

    for (let i = 0; i < totalChunks; i++) {
      const chunkStart = i * FILE_CHUNK_SAMPLES;
      const chunkEnd = Math.min(chunkStart + FILE_CHUNK_SAMPLES, samples.length);
      const chunk = samples.subarray(chunkStart, chunkEnd);
      const startTimeSec = chunkStart / SAMPLE_RATE;

      const chunkResults = await this.transcribeSamples(chunk, startTimeSec);
      results.push(...chunkResults);

      const percent = Math.round(((i + 1) / totalChunks) * 100);
      onProgress?.(percent);

      // Yield between chunks to avoid blocking the event loop
      if (i < totalChunks - 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    this.log(`Transcription complete: ${results.length} segment(s)`);
    return results;
  }

  /**
   * Check if ffmpeg is available on the system
   */
  async isFfmpegAvailable(): Promise<boolean> {
    try {
      await execFileAsync('ffmpeg', ['-version']);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Load an audio file and return Float32Array samples at 16kHz mono.
   * WAV files are parsed directly; other formats are converted via ffmpeg.
   */
  private async loadAudioAsSamples(audioPath: string): Promise<Float32Array> {
    const ext = audioPath.toLowerCase().split('.').pop() ?? '';

    if (ext === 'wav') {
      return this.parseWavFile(audioPath);
    }

    // For non-WAV formats (webm, ogg, m4a, etc.), convert via ffmpeg
    return this.convertWithFfmpeg(audioPath);
  }

  /**
   * Parse a WAV file and extract PCM data as Float32Array at 16kHz mono.
   * Handles PCM float32 and PCM int16 formats.
   */
  private async parseWavFile(wavPath: string): Promise<Float32Array> {
    const buffer = await readFile(wavPath);

    // Validate RIFF/WAVE header
    const riff = buffer.toString('ascii', 0, 4);
    const wave = buffer.toString('ascii', 8, 12);
    if (riff !== 'RIFF' || wave !== 'WAVE') {
      throw new Error(`Invalid WAV file: missing RIFF/WAVE header in ${wavPath}`);
    }

    // Find the 'fmt ' sub-chunk
    let offset = 12;
    let audioFormat = 0;
    let numChannels = 0;
    let sampleRate = 0;
    let bitsPerSample = 0;
    let fmtFound = false;

    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);

      if (chunkId === 'fmt ') {
        audioFormat = buffer.readUInt16LE(offset + 8);
        numChannels = buffer.readUInt16LE(offset + 10);
        sampleRate = buffer.readUInt32LE(offset + 12);
        bitsPerSample = buffer.readUInt16LE(offset + 22);
        fmtFound = true;
      }

      if (chunkId === 'data') {
        if (!fmtFound) {
          throw new Error('WAV file has data chunk before fmt chunk');
        }

        const dataStart = offset + 8;
        const dataEnd = dataStart + chunkSize;
        const dataSlice = buffer.subarray(dataStart, Math.min(dataEnd, buffer.length));

        return this.extractWavSamples(dataSlice, audioFormat, numChannels, sampleRate, bitsPerSample);
      }

      offset += 8 + chunkSize;
      // Chunks are word-aligned
      if (chunkSize % 2 !== 0) {
        offset += 1;
      }
    }

    throw new Error(`Invalid WAV file: no data chunk found in ${wavPath}`);
  }

  /**
   * Extract samples from WAV data chunk, converting to Float32Array at 16kHz mono.
   */
  private extractWavSamples(
    data: Buffer,
    audioFormat: number,
    numChannels: number,
    sampleRate: number,
    bitsPerSample: number
  ): Float32Array {
    let monoFloat32: Float32Array;

    if (audioFormat === 3 && bitsPerSample === 32) {
      // PCM Float32
      const totalSamples = Math.floor(data.length / 4);
      const allSamples = new Float32Array(totalSamples);
      for (let i = 0; i < totalSamples; i++) {
        allSamples[i] = data.readFloatLE(i * 4);
      }
      monoFloat32 = this.mixToMono(allSamples, numChannels);
    } else if (audioFormat === 1 && bitsPerSample === 16) {
      // PCM Int16
      const totalSamples = Math.floor(data.length / 2);
      const allSamples = new Float32Array(totalSamples);
      for (let i = 0; i < totalSamples; i++) {
        allSamples[i] = data.readInt16LE(i * 2) / 32768.0;
      }
      monoFloat32 = this.mixToMono(allSamples, numChannels);
    } else {
      throw new Error(
        `Unsupported WAV format: audioFormat=${audioFormat}, bitsPerSample=${bitsPerSample}. ` +
        `Expected PCM float32 (format=3, bits=32) or PCM int16 (format=1, bits=16).`
      );
    }

    // Resample to 16kHz if needed
    if (sampleRate !== SAMPLE_RATE) {
      return this.resample(monoFloat32, sampleRate, SAMPLE_RATE);
    }

    return monoFloat32;
  }

  /**
   * Mix multi-channel audio down to mono by averaging channels.
   */
  private mixToMono(samples: Float32Array, numChannels: number): Float32Array {
    if (numChannels === 1) {
      return samples;
    }

    const monoLength = Math.floor(samples.length / numChannels);
    const mono = new Float32Array(monoLength);
    for (let i = 0; i < monoLength; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        sum += samples[i * numChannels + ch];
      }
      mono[i] = sum / numChannels;
    }
    return mono;
  }

  /**
   * Simple linear resampling from one sample rate to another.
   */
  private resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) {
      return samples;
    }

    const ratio = fromRate / toRate;
    const outputLength = Math.floor(samples.length / ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, samples.length - 1);
      const frac = srcIndex - srcIndexFloor;
      output[i] = samples[srcIndexFloor] * (1 - frac) + samples[srcIndexCeil] * frac;
    }

    return output;
  }

  /**
   * Convert a non-WAV audio file to 16kHz mono Float32 WAV using ffmpeg,
   * then parse the resulting WAV.
   */
  private async convertWithFfmpeg(audioPath: string): Promise<Float32Array> {
    const ffmpegAvailable = await this.isFfmpegAvailable();
    if (!ffmpegAvailable) {
      const installHint = process.platform === 'darwin'
        ? 'brew install ffmpeg'
        : process.platform === 'win32'
          ? 'winget install ffmpeg or download from https://ffmpeg.org'
          : 'apt install ffmpeg (Debian/Ubuntu) or dnf install ffmpeg (Fedora)';
      throw new Error(
        'ffmpeg is not available on this system. ' +
        'ffmpeg is required to transcribe non-WAV audio files (webm, ogg, m4a). ' +
        `Install ffmpeg via: ${installHint}.`
      );
    }

    const tempFileName = `markupr-transcode-${randomUUID()}.wav`;
    const tempPath = join(tmpdir(), tempFileName);

    try {
      this.log(`Converting ${audioPath} to WAV via ffmpeg...`);

      await execFileAsync('ffmpeg', [
        '-i', audioPath,
        '-ar', String(SAMPLE_RATE),
        '-ac', '1',
        '-f', 'wav',
        '-acodec', 'pcm_f32le',
        '-y',
        tempPath,
      ], {
        env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG, TMPDIR: process.env.TMPDIR },
      });

      await chmod(tempPath, 0o600).catch(() => {});
      this.log('ffmpeg conversion complete, parsing WAV...');
      return await this.parseWavFile(tempPath);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to convert audio file with ffmpeg: ${msg}`);
    } finally {
      // Clean up temp file
      try {
        await unlink(tempPath);
      } catch {
        // Ignore cleanup errors - temp dir will be cleaned eventually
      }
    }
  }

  /**
   * Process buffered audio through Whisper
   */
  private async processBufferedAudio(force: boolean = false): Promise<void> {
    // Skip if already processing or buffer is too small (unless forced)
    if (this.isProcessing) {
      return;
    }

    if (!force && this.totalBufferDuration < CHUNK_DURATION_MS) {
      return;
    }

    if (this.audioBuffer.length === 0) {
      return;
    }

    if (!this.whisperModule) {
      this.logError('Cannot process: Whisper module not loaded');
      return;
    }

    this.isProcessing = true;
    const processStartTime = this.bufferStartTime;

    try {
      // Concatenate all buffered audio into a single array
      const totalSamples = this.audioBuffer.reduce((sum, arr) => sum + arr.length, 0);
      const combinedAudio = new Float32Array(totalSamples);

      let offset = 0;
      for (const chunk of this.audioBuffer) {
        combinedAudio.set(chunk, offset);
        offset += chunk.length;
      }

      // Clear buffer before processing (to accept new audio while processing)
      const processedDuration = this.totalBufferDuration;
      this.audioBuffer = [];
      this.totalBufferDuration = 0;
      this.totalBufferBytes = 0;
      this.bufferStartTime = Date.now();

      // Run Whisper transcription
      this.log(`Processing ${Math.round(processedDuration)}ms of audio...`);

      const result = await this.whisperModule.whisper(combinedAudio, {
        modelPath: this.config.modelPath,
        language: this.config.language,
        threads: this.config.threads,
        translate: this.config.translateToEnglish,
      });

      // Parse result and emit transcript
      if (result && result.length > 0) {
        for (const segment of result) {
          const transcriptResult: WhisperTranscriptResult = {
            text: segment.text.trim(),
            startTime: processStartTime / 1000 + segment.start,
            endTime: processStartTime / 1000 + segment.end,
            confidence: 0.9, // Whisper doesn't provide confidence, use default
          };

          if (transcriptResult.text) {
            this.transcriptCallbacks.forEach((cb) => cb(transcriptResult));
            this.emit('transcript', transcriptResult);

            const preview =
              transcriptResult.text.length > 50
                ? `${transcriptResult.text.substring(0, 50)}...`
                : transcriptResult.text;
            this.log(`Transcript: "${preview}"`);
          }
        }
      }
    } catch (error) {
      const transcriptionError = new Error(`Whisper transcription failed: ${(error as Error).message}`);
      this.errorCallbacks.forEach((cb) => cb(transcriptionError));
      this.emit('error', transcriptionError);
      this.logError('Transcription error', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Log helper
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[WhisperService ${timestamp}] ${message}`);
  }

  /**
   * Error log helper
   */
  private logError(message: string, error?: unknown): void {
    const timestamp = new Date().toISOString();
    const errorStr = error instanceof Error ? error.message : String(error);
    console.error(`[WhisperService ${timestamp}] ERROR: ${message} - ${errorStr}`);
  }

  private getRequiredMemoryBytes(): number {
    const modelName = basename(this.config.modelPath);
    return MODEL_MEMORY_REQUIREMENTS_BYTES[modelName] ?? MODEL_MEMORY_REQUIREMENTS_BYTES['ggml-small.bin'];
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const whisperService = new WhisperService();
export default WhisperService;
