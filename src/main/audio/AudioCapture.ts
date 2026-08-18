/**
 * AudioCapture.ts - Production Audio Capture Service for markuprx
 *
 * Architecture:
 * - Renderer process captures audio via getUserMedia (browser API)
 * - Audio data streams to main process via IPC
 * - Main process handles buffering, VAD, and recovery
 *
 * Why this approach:
 * - getUserMedia is only available in renderer (browser context)
 * - Main process provides reliability, buffering, and transcription coordination
 * - IPC overhead is minimal for 100ms chunks at 16kHz mono
 */

import { ipcMain, systemPreferences, BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import { mkdir, readdir, stat, unlink, writeFile } from 'fs/promises';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'path';
import { app } from 'electron';
import { errorHandler } from '../ErrorHandler';
import { IPC_CHANNELS } from '../../shared/types';
import { extensionFromMimeType, encodeFloat32Wav } from './audioUtils';
import { isElectronTestHarnessAllowed } from '../e2e/ElectronTestHarness';
import {
  clearPrivateCaptureFiles,
  ensurePrivateCaptureArea,
  privateCaptureAreaPath,
} from '../security/PrivateCaptureStorage';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface AudioDevice {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface AudioChunk {
  buffer: Buffer;
  timestamp: number;
  duration: number;
  sampleRate: number;
}

export interface CapturedAudioAsset {
  buffer: Buffer;
  mimeType: string;
  durationMs: number;
}

export interface AudioCaptureConfig {
  sampleRate: number;
  channels: number;
  chunkDurationMs: number;
  vadThreshold: number;
  vadSilenceMs: number;
  recoveryBufferMinutes: number;
}

export interface AudioCaptureService {
  checkPermission(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  getDevices(): Promise<AudioDevice[]>;
  setDevice(deviceId: string | null): void;
  setPaused(paused: boolean): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  getAudioLevel(): number;
  isCapturing(): boolean;
  getCapturedAudioBuffer(): Buffer | null;
  getCapturedAudioAsset(): CapturedAudioAsset | null;
  exportCapturedAudio(
    filePathBase: string
  ): Promise<{ path: string; bytesWritten: number; durationMs: number; mimeType: string } | null>;
  exportCapturedAudioWav(filePath: string): Promise<{ bytesWritten: number; durationMs: number } | null>;
  clearCapturedAudio(): void;

  // Event handlers
  onAudioChunk: (callback: (chunk: AudioChunk) => void) => () => void;
  onVoiceActivity: (callback: (active: boolean) => void) => () => void;
  onError: (callback: (error: Error) => void) => () => void;
  onAudioLevel: (callback: (level: number) => void) => () => void;
}

// ============================================================================
// IPC Channel Constants
// ============================================================================

export const AUDIO_IPC_CHANNELS = {
  // Main -> Renderer requests
  REQUEST_DEVICES: IPC_CHANNELS.AUDIO_REQUEST_DEVICES,
  START_CAPTURE: IPC_CHANNELS.AUDIO_START_CAPTURE,
  STOP_CAPTURE: IPC_CHANNELS.AUDIO_STOP_CAPTURE,
  SET_DEVICE: IPC_CHANNELS.AUDIO_SET_DEVICE,

  // Renderer -> Main data
  AUDIO_CHUNK: IPC_CHANNELS.AUDIO_CHUNK,
  DEVICES_RESPONSE: IPC_CHANNELS.AUDIO_DEVICES_RESPONSE,
  CAPTURE_ERROR: IPC_CHANNELS.AUDIO_CAPTURE_ERROR,
  CAPTURE_STARTED: IPC_CHANNELS.AUDIO_CAPTURE_STARTED,
  CAPTURE_STOPPED: IPC_CHANNELS.AUDIO_CAPTURE_STOPPED,
} as const;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: AudioCaptureConfig = {
  sampleRate: 16000,
  channels: 1, // Mono
  chunkDurationMs: 250,
  vadThreshold: 0.01, // RMS threshold for voice detection
  vadSilenceMs: 600, // Consecutive silence before marking inactive
  recoveryBufferMinutes: 5, // Rotate buffer files every 5 minutes
};

// ============================================================================
// AudioCaptureService Implementation
// ============================================================================

class AudioCaptureServiceImpl extends EventEmitter implements AudioCaptureService {
  private config: AudioCaptureConfig;
  private capturing: boolean = false;
  private stopRequested: boolean = false;
  private stopFinalizeTimer: NodeJS.Timeout | null = null;
  private stopPromise: Promise<void> | null = null;
  private resolveStopPromise: (() => void) | null = null;
  private pendingStartCancel: (() => void) | null = null;
  private currentDeviceId: string | null = null;
  private currentAudioLevel: number = 0;
  private voiceActive: boolean = false;
  private paused: boolean = false;
  private silenceStartTime: number = 0;
  private mainWindow: BrowserWindow | null = null;

  // Recovery buffer management
  private recoveryBufferPath: string;
  private currentBufferFile: string | null = null;
  private bufferStartTime: number = 0;
  private recoveryChunks: Buffer[] = [];
  private recoveryInterval: NodeJS.Timeout | null = null;
  private recoveryWriteChain: Promise<void> = Promise.resolve();

  // Full-session audio capture (used for post-session transcription + retry workflows)
  // Memory cap prevents unbounded growth during long sessions. At 16kHz mono
  // with 4 bytes/sample, a 30-minute session produces ~115MB of PCM data plus
  // encoded chunks in parallel. The cap ensures total audio memory stays under
  // control, especially on machines with limited RAM.
  private static readonly MAX_SESSION_AUDIO_BYTES = 200 * 1024 * 1024; // 200MB
  private sessionAudioChunks: Buffer[] = [];
  private sessionAudioBytes: number = 0;
  private sessionAudioDurationMs: number = 0;
  private sessionAudioMimeType: string = 'audio/wav';
  private encodedAudioChunks: Buffer[] = [];
  private encodedAudioBytes: number = 0;
  private encodedAudioDurationMs: number = 0;
  private encodedAudioMimeType: string | null = null;
  private sessionAudioCapWarningLogged: boolean = false;

  constructor(config: Partial<AudioCaptureConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.recoveryBufferPath = privateCaptureAreaPath('audio');
    this.setupIPCHandlers();
  }

  /**
   * Set the main window reference for IPC communication
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  // ==========================================================================
  // Permission Management
  // ==========================================================================

  /**
   * Check if microphone permission is granted (macOS only)
   */
  async checkPermission(): Promise<boolean> {
    if (isElectronTestHarnessAllowed({
      requested: process.env.MARKUPRX_E2E === '1',
      isPackaged: app.isPackaged,
    })) {
      const requestedDelay = Number(process.env.MARKUPRX_E2E_AUDIO_PERMISSION_DELAY_MS);
      const delay = Number.isFinite(requestedDelay)
        ? Math.min(2_000, Math.max(0, Math.floor(requestedDelay)))
        : 0;
      if (delay > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
      return true;
    }
    if (process.platform !== 'darwin') {
      // Non-macOS platforms don't have system-level permission checks
      return true;
    }

    const status = systemPreferences.getMediaAccessStatus('microphone');
    const granted = status === 'granted';

    if (!granted) {
      errorHandler.log('info', 'Microphone permission not granted', {
        component: 'AudioCapture',
        operation: 'checkPermission',
        data: { status },
      });
    }

    return granted;
  }

  /**
   * Request microphone permission (macOS only)
   * Returns true if granted, false if denied
   */
  async requestPermission(): Promise<boolean> {
    if (isElectronTestHarnessAllowed({
      requested: process.env.MARKUPRX_E2E === '1',
      isPackaged: app.isPackaged,
    })) return true;
    if (process.platform !== 'darwin') {
      return true;
    }

    const status = systemPreferences.getMediaAccessStatus('microphone');

    if (status === 'granted') {
      return true;
    }

    if (status === 'denied') {
      // User previously denied, they need to enable in System Preferences
      return false;
    }

    // Status is 'not-determined' or 'restricted', request permission
    try {
      const granted = await systemPreferences.askForMediaAccess('microphone');

      if (!granted) {
        errorHandler.log('warn', 'Microphone permission denied by user', {
          component: 'AudioCapture',
          operation: 'requestPermission',
        });
      }

      return granted;
    } catch (error) {
      errorHandler.log('error', 'Permission request failed', {
        component: 'AudioCapture',
        operation: 'requestPermission',
        error: (error as Error).message,
      });
      return false;
    }
  }

  // ==========================================================================
  // Device Management
  // ==========================================================================

  /**
   * Get list of available audio input devices
   * This requests device list from renderer via IPC
   */
  async getDevices(): Promise<AudioDevice[]> {
    return new Promise((resolve, reject) => {
      if (!this.mainWindow) {
        reject(new Error('Main window not set'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Device enumeration timeout'));
      }, 5000);

      const handler = (_event: Electron.IpcMainEvent, devices: AudioDevice[]) => {
        clearTimeout(timeout);
        ipcMain.removeListener(AUDIO_IPC_CHANNELS.DEVICES_RESPONSE, handler);
        resolve(devices);
      };

      ipcMain.on(AUDIO_IPC_CHANNELS.DEVICES_RESPONSE, handler);
      this.mainWindow.webContents.send(AUDIO_IPC_CHANNELS.REQUEST_DEVICES);
    });
  }

  /**
   * Set the audio input device to use
   */
  setDevice(deviceId: string | null): void {
    this.currentDeviceId = deviceId;
    if (this.capturing && this.mainWindow) {
      // If already capturing, notify renderer to switch device
      this.mainWindow.webContents.send(AUDIO_IPC_CHANNELS.SET_DEVICE, deviceId);
    }
  }

  // ==========================================================================
  // Capture Control
  // ==========================================================================

  /**
   * Start audio capture
   */
  async start(): Promise<void> {
    if (this.capturing) {
      errorHandler.log('info', 'Audio capture already in progress', {
        component: 'AudioCapture',
        operation: 'start',
      });
      return;
    }
    if (this.pendingStartCancel) {
      throw new Error('Audio capture start is already in progress');
    }

    let cancelled = false;
    let rejectPendingStart: ((error: Error) => void) | null = null;
    const cancellationError = () => new Error('Audio capture start cancelled');
    const cancel = () => {
      if (cancelled) return;
      cancelled = true;
      rejectPendingStart?.(cancellationError());
    };
    const assertNotCancelled = () => {
      if (cancelled) throw cancellationError();
    };

    // Cancellation must be observable before any permission or filesystem
    // await. Otherwise quit can overtake start and the resumed continuation
    // can still tell the renderer to begin capturing.
    this.pendingStartCancel = cancel;

    try {
      const hasPermission = await this.checkPermission();
      assertNotCancelled();
      if (!hasPermission) {
        const granted = await this.requestPermission();
        assertNotCancelled();
        if (!granted) {
          const permError = new Error('Microphone permission denied');
          errorHandler.handleAudioError(permError, {
            component: 'AudioCapture',
            operation: 'start',
          });
          throw permError;
        }
      }

      if (!this.mainWindow) {
        const windowError = new Error('Main window not set');
        errorHandler.log('error', 'Cannot start audio - no main window', {
          component: 'AudioCapture',
          operation: 'start',
        });
        throw windowError;
      }

      // Claim the private recovery root before the renderer begins capture. A
      // preplanted alias or non-directory must fail the whole start operation,
      // not become an unhandled background rejection after recording begins.
      this.recoveryBufferPath = await ensurePrivateCaptureArea('audio');
      assertNotCancelled();

      await new Promise<void>((resolve, reject) => {
        let completionTimer: NodeJS.Timeout | null = null;
        let timeout: NodeJS.Timeout | null = null;
        const cleanup = () => {
          if (timeout) clearTimeout(timeout);
          if (completionTimer) clearTimeout(completionTimer);
          ipcMain.removeListener(AUDIO_IPC_CHANNELS.CAPTURE_STARTED, successHandler);
          ipcMain.removeListener(AUDIO_IPC_CHANNELS.CAPTURE_ERROR, captureErrorHandler);
          rejectPendingStart = null;
          if (this.pendingStartCancel === cancel) this.pendingStartCancel = null;
        };
        const rejectStart = (error: Error) => {
          cleanup();
          reject(error);
        };
        rejectPendingStart = rejectStart;

        const successHandler = () => {
          if (this.pendingStartCancel !== cancel) return;
          if (timeout) clearTimeout(timeout);
          ipcMain.removeListener(AUDIO_IPC_CHANNELS.CAPTURE_STARTED, successHandler);
          ipcMain.removeListener(AUDIO_IPC_CHANNELS.CAPTURE_ERROR, captureErrorHandler);
          const complete = () => {
            if (this.pendingStartCancel !== cancel) return;
            cleanup();
            this.capturing = true;
            this.stopRequested = false;
            this.settleStopPromise();
            if (this.stopFinalizeTimer) {
              clearTimeout(this.stopFinalizeTimer);
              this.stopFinalizeTimer = null;
            }
            this.paused = false;
            this.sessionAudioChunks = [];
            this.sessionAudioBytes = 0;
            this.sessionAudioDurationMs = 0;
            this.sessionAudioMimeType = 'audio/wav';
            this.encodedAudioChunks = [];
            this.encodedAudioBytes = 0;
            this.encodedAudioDurationMs = 0;
            this.encodedAudioMimeType = null;
            this.sessionAudioCapWarningLogged = false;
            this.startRecoveryBuffer();
            console.log('[AudioCapture] Capture started');
            resolve();
          };
          const requestedDelay = isElectronTestHarnessAllowed({
            requested: process.env.MARKUPRX_E2E === '1',
            isPackaged: app.isPackaged,
          }) ? Number(process.env.MARKUPRX_E2E_AUDIO_START_DELAY_MS) : 0;
          const delay = Number.isFinite(requestedDelay)
            ? Math.min(2_000, Math.max(0, Math.floor(requestedDelay)))
            : 0;
          if (delay > 0) completionTimer = setTimeout(complete, delay);
          else complete();
        };

        const captureErrorHandler = (_event: Electron.IpcMainEvent, error: string) => {
          if (this.pendingStartCancel === cancel) rejectStart(new Error(error));
        };

        if (cancelled) {
          rejectStart(cancellationError());
          return;
        }
        timeout = setTimeout(() => {
          rejectStart(new Error('Audio capture start timeout'));
        }, 10000);
        ipcMain.once(AUDIO_IPC_CHANNELS.CAPTURE_STARTED, successHandler);
        ipcMain.once(AUDIO_IPC_CHANNELS.CAPTURE_ERROR, captureErrorHandler);

        // Send start command to renderer with config.
        this.mainWindow!.webContents.send(AUDIO_IPC_CHANNELS.START_CAPTURE, {
          deviceId: this.currentDeviceId,
          sampleRate: this.config.sampleRate,
          channels: this.config.channels,
          chunkDurationMs: this.config.chunkDurationMs,
        });
      });
    } finally {
      rejectPendingStart = null;
      if (this.pendingStartCancel === cancel) this.pendingStartCancel = null;
    }
  }

  /**
   * Stop audio capture
   */
  async stop(): Promise<void> {
    if (this.stopRequested && this.stopPromise) {
      return this.stopPromise;
    }

    const cancelPendingStart = this.pendingStartCancel;
    if (!this.capturing && !cancelPendingStart) {
      this.stopRequested = false;
      this.settleStopPromise();
      return;
    }

    const stopPromise = this.ensureStopPromise();
    this.stopRequested = true;
    this.paused = false;
    cancelPendingStart?.();

    if (this.mainWindow) {
      this.mainWindow.webContents.send(AUDIO_IPC_CHANNELS.STOP_CAPTURE);
    } else {
      this.finalizeCaptureStop('timeout');
      return stopPromise;
    }

    if (this.stopFinalizeTimer) {
      clearTimeout(this.stopFinalizeTimer);
    }
    this.stopFinalizeTimer = setTimeout(() => {
      this.finalizeCaptureStop('timeout');
    }, 1500);

    console.log('[AudioCapture] Stop requested; awaiting renderer flush');
    return stopPromise;
  }

  /**
   * Check if currently capturing
   */
  isCapturing(): boolean {
    return this.capturing;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.voiceActive = false;
      this.currentAudioLevel = 0;
      this.emit('audioLevel', 0);
      this.emit('voiceActivity', false);
    }
  }

  /**
   * Get current audio level (0-1 normalized)
   */
  getAudioLevel(): number {
    return this.currentAudioLevel;
  }

  /**
   * Export captured audio with the most accurate available source format.
   * Encoded MediaRecorder audio is preserved as-is; PCM falls back to WAV.
   */
  async exportCapturedAudio(
    filePathBase: string
  ): Promise<{ path: string; bytesWritten: number; durationMs: number; mimeType: string } | null> {
    const encodedAsset = this.getCapturedEncodedAudioAsset();
    if (encodedAsset) {
      const extension = extensionFromMimeType(encodedAsset.mimeType);
      const outputPath = `${filePathBase}${extension}`;
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, encodedAsset.buffer);
      return {
        path: outputPath,
        bytesWritten: encodedAsset.buffer.byteLength,
        durationMs: encodedAsset.durationMs,
        mimeType: encodedAsset.mimeType,
      };
    }

    const pcmAsset = this.getCapturedPcmAudioAsset();
    if (!pcmAsset) {
      return null;
    }

    const outputPath = `${filePathBase}.wav`;
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, pcmAsset.buffer);
    return {
      path: outputPath,
      bytesWritten: pcmAsset.buffer.byteLength,
      durationMs: pcmAsset.durationMs,
      mimeType: 'audio/wav',
    };
  }

  /**
   * Backward-compatible WAV export wrapper.
   */
  async exportCapturedAudioWav(
    filePath: string
  ): Promise<{ bytesWritten: number; durationMs: number } | null> {
    const rawAudio = this.getCapturedAudioBuffer();
    if (!rawAudio) {
      return null;
    }

    const wavBuffer = encodeFloat32Wav(rawAudio, this.config.sampleRate, this.config.channels);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, wavBuffer);

    const durationMs =
      (rawAudio.byteLength / (this.config.channels * this.config.sampleRate * 4)) * 1000;
    return {
      bytesWritten: wavBuffer.byteLength,
      durationMs,
    };
  }

  /**
   * Clear in-memory session audio data.
   */
  clearCapturedAudio(): void {
    this.sessionAudioChunks = [];
    this.sessionAudioBytes = 0;
    this.sessionAudioDurationMs = 0;
    this.sessionAudioMimeType = 'audio/wav';
    this.encodedAudioChunks = [];
    this.encodedAudioBytes = 0;
    this.encodedAudioDurationMs = 0;
    this.encodedAudioMimeType = null;
  }

  // ==========================================================================
  // Event Subscription
  // ==========================================================================

  onAudioChunk(callback: (chunk: AudioChunk) => void): () => void {
    this.on('audioChunk', callback);
    return () => this.off('audioChunk', callback);
  }

  onVoiceActivity(callback: (active: boolean) => void): () => void {
    this.on('voiceActivity', callback);
    return () => this.off('voiceActivity', callback);
  }

  onError(callback: (error: Error) => void): () => void {
    this.on('error', callback);
    return () => this.off('error', callback);
  }

  onAudioLevel(callback: (level: number) => void): () => void {
    this.on('audioLevel', callback);
    return () => this.off('audioLevel', callback);
  }

  // ==========================================================================
  // IPC Handlers
  // ==========================================================================

  private setupIPCHandlers(): void {
    // Handle incoming audio chunks from renderer
    ipcMain.on(AUDIO_IPC_CHANNELS.AUDIO_CHUNK, this.handleAudioChunk.bind(this));

    // Handle capture errors from renderer
    ipcMain.on(AUDIO_IPC_CHANNELS.CAPTURE_ERROR, (_event, error: string) => {
      const captureError = new Error(error);
      errorHandler.handleAudioError(captureError, {
        component: 'AudioCapture',
        operation: 'rendererCapture',
      });
      this.emit('error', captureError);
    });

    // Handle capture stopped (e.g., device disconnected)
    ipcMain.on(AUDIO_IPC_CHANNELS.CAPTURE_STOPPED, () => {
      if (this.stopRequested) {
        this.finalizeCaptureStop('normal');
        return;
      }

      if (this.capturing) {
        this.capturing = false;
        this.stopRecoveryBuffer();
        const stopError = new Error('Audio capture stopped unexpectedly');
        errorHandler.handleAudioError(stopError, {
          component: 'AudioCapture',
          operation: 'captureStop',
          data: { unexpected: true },
        });
        this.emit('error', stopError);
      }
    });
  }

  private finalizeCaptureStop(reason: 'normal' | 'timeout'): void {
    if (!this.capturing && !this.stopRequested) {
      this.settleStopPromise();
      return;
    }

    if (this.stopFinalizeTimer) {
      clearTimeout(this.stopFinalizeTimer);
      this.stopFinalizeTimer = null;
    }

    this.stopRequested = false;
    this.capturing = false;
    this.stopRecoveryBuffer();

    this.voiceActive = false;
    this.currentAudioLevel = 0;
    this.emit('audioLevel', 0);
    this.emit('voiceActivity', false);

    console.log(`[AudioCapture] Capture stopped (${reason})`);
    this.settleStopPromise();
  }

  private ensureStopPromise(): Promise<void> {
    if (this.stopPromise) {
      return this.stopPromise;
    }

    this.stopPromise = new Promise<void>((resolve) => {
      this.resolveStopPromise = resolve;
    });
    return this.stopPromise;
  }

  private settleStopPromise(): void {
    if (this.resolveStopPromise) {
      this.resolveStopPromise();
      this.resolveStopPromise = null;
    }
    this.stopPromise = null;
  }

  /**
   * Process incoming audio chunk from renderer
   */
  private handleAudioChunk(
    _event: Electron.IpcMainEvent,
    data: {
      samples?: number[] | Float32Array | ArrayBuffer;
      encodedChunk?: Buffer | Uint8Array | ArrayBuffer;
      mimeType?: string;
      audioLevel?: number;
      rms?: number;
      timestamp: number;
      duration: number;
    }
  ): void {
    if (!this.capturing) return;

    if (this.paused) {
      return;
    }

    const float32 = this.toFloat32Samples(data.samples);
    if (float32 && float32.length > 0) {
      const buffer = Buffer.from(float32.buffer, float32.byteOffset, float32.byteLength);

      // Calculate RMS for VAD and level visualization
      const rms = this.calculateRMS(float32);
      this.currentAudioLevel = Math.min(1, rms * 10);
      this.emit('audioLevel', this.currentAudioLevel);

      // Voice Activity Detection
      this.updateVAD(rms, data.timestamp);

      // Create chunk object
      const chunk: AudioChunk = {
        buffer,
        timestamp: data.timestamp,
        duration: data.duration,
        sampleRate: this.config.sampleRate,
      };

      // Add to recovery/session buffers
      this.recoveryChunks.push(buffer);
      this.sessionAudioChunks.push(buffer);
      this.sessionAudioBytes += buffer.byteLength;
      this.sessionAudioDurationMs += Math.max(0, data.duration || this.config.chunkDurationMs);
      this.sessionAudioMimeType = 'audio/wav';

      // Enforce memory cap: drop oldest PCM chunks when exceeding limit
      this.enforceSessionAudioCap();

      this.emit('audioChunk', chunk);
      return;
    }

    const encodedBuffer = this.toBuffer(data.encodedChunk);
    if (!encodedBuffer || encodedBuffer.byteLength === 0) {
      return;
    }

    this.encodedAudioChunks.push(encodedBuffer);
    this.encodedAudioBytes += encodedBuffer.byteLength;
    this.encodedAudioDurationMs += Math.max(0, data.duration || this.config.chunkDurationMs);
    this.encodedAudioMimeType = data.mimeType || this.encodedAudioMimeType || 'audio/webm';
    this.recoveryChunks.push(encodedBuffer);

    // Enforce memory cap on encoded chunks as well
    this.enforceSessionAudioCap();

    // Prefer renderer-provided live RMS/level from real audio analysis.
    const level =
      Number.isFinite(data.audioLevel)
        ? Math.max(0, Math.min(1, Number(data.audioLevel)))
        : Math.max(0, Math.min(1, encodedBuffer.byteLength / 6000));
    this.currentAudioLevel = level;
    this.emit('audioLevel', level);

    const rms =
      Number.isFinite(data.rms)
        ? Math.max(0, Math.min(1, Number(data.rms)))
        : Math.max(0, (level - 0.08) * 0.06);
    this.updateVAD(rms, data.timestamp);
  }

  // ==========================================================================
  // Voice Activity Detection
  // ==========================================================================

  /**
   * Calculate Root Mean Square of audio samples
   */
  private calculateRMS(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  /**
   * Update voice activity state based on RMS
   */
  private updateVAD(rms: number, timestamp: number): void {
    const isVoice = rms > this.config.vadThreshold;

    if (isVoice) {
      // Voice detected
      if (!this.voiceActive) {
        this.voiceActive = true;
        this.emit('voiceActivity', true);
        console.log('[AudioCapture] Voice activity started');
      }
      this.silenceStartTime = 0;
    } else {
      // Silence detected
      if (this.voiceActive) {
        if (this.silenceStartTime === 0) {
          this.silenceStartTime = timestamp;
        } else if (timestamp - this.silenceStartTime > this.config.vadSilenceMs) {
          // Enough silence, mark as inactive
          this.voiceActive = false;
          this.emit('voiceActivity', false);
          this.silenceStartTime = 0;
          console.log('[AudioCapture] Voice activity ended');
        }
      }
    }
  }

  // ==========================================================================
  // Memory Management
  // ==========================================================================

  /**
   * Enforce the session audio memory cap across both PCM and encoded buffers.
   * Drops oldest chunks from whichever buffer is larger until total is under
   * 80% of the cap, preserving the most recent audio for transcription quality.
   */
  private enforceSessionAudioCap(): void {
    const totalBytes = this.sessionAudioBytes + this.encodedAudioBytes;
    if (totalBytes <= AudioCaptureServiceImpl.MAX_SESSION_AUDIO_BYTES) {
      return;
    }

    if (!this.sessionAudioCapWarningLogged) {
      console.warn(
        `[AudioCapture] Session audio memory cap reached (${Math.round(totalBytes / 1024 / 1024)}MB). ` +
        `Dropping oldest chunks to stay under ${Math.round(AudioCaptureServiceImpl.MAX_SESSION_AUDIO_BYTES / 1024 / 1024)}MB.`
      );
      this.sessionAudioCapWarningLogged = true;
    }

    const targetBytes = Math.floor(AudioCaptureServiceImpl.MAX_SESSION_AUDIO_BYTES * 0.8);

    // Drop from whichever buffer is larger first
    while (
      this.sessionAudioBytes + this.encodedAudioBytes > targetBytes &&
      (this.sessionAudioChunks.length > 1 || this.encodedAudioChunks.length > 1)
    ) {
      if (this.sessionAudioBytes >= this.encodedAudioBytes && this.sessionAudioChunks.length > 1) {
        const removed = this.sessionAudioChunks.shift()!;
        this.sessionAudioBytes -= removed.byteLength;
      } else if (this.encodedAudioChunks.length > 1) {
        const removed = this.encodedAudioChunks.shift()!;
        this.encodedAudioBytes -= removed.byteLength;
      } else {
        break;
      }
    }
  }

  // ==========================================================================
  // Recovery Buffer Management
  // ==========================================================================

  /**
   * Start the recovery buffer system
   * Writes audio to temp files for network failure recovery
   */
  private startRecoveryBuffer(): void {
    this.bufferStartTime = Date.now();
    this.recoveryChunks = [];
    this.currentBufferFile = this.generateBufferFilename();

    // Rotate buffer every recoveryBufferMinutes
    this.recoveryInterval = setInterval(
      () => {
        void this.rotateRecoveryBuffer().catch((error) => {
          console.error('[AudioCapture] Failed to rotate recovery buffer:', error);
        });
      },
      this.config.recoveryBufferMinutes * 60 * 1000
    );

    console.log('[AudioCapture] Recovery buffer started');
  }

  /**
   * Stop the recovery buffer system
   */
  private stopRecoveryBuffer(): void {
    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
      this.recoveryInterval = null;
    }

    // Write remaining chunks
    if (this.recoveryChunks.length > 0) {
      this.queueRecoveryBufferWrite().catch((err) => {
        console.error('[AudioCapture] Failed to write final recovery buffer:', err);
      });
    }

    this.recoveryChunks = [];
    console.log('[AudioCapture] Recovery buffer stopped');
  }

  /**
   * Rotate the recovery buffer - write current and start new
   */
  private async rotateRecoveryBuffer(): Promise<void> {
    await this.queueRecoveryBufferWrite();

    // Clean up old buffer files (keep last 2)
    await this.cleanOldBuffers();

    // Start new buffer
    this.bufferStartTime = Date.now();
    this.recoveryChunks = [];
    this.currentBufferFile = this.generateBufferFilename();
  }

  /**
   * Write current recovery buffer to disk
   */
  private queueRecoveryBufferWrite(): Promise<void> {
    if (this.recoveryChunks.length === 0 || !this.currentBufferFile) {
      return this.recoveryWriteChain;
    }

    const combined = Buffer.concat(this.recoveryChunks);
    const destination = this.currentBufferFile;
    const operation = this.recoveryWriteChain.then(async () => {
      await ensurePrivateCaptureArea('audio');
      await writeFile(destination, combined, { flag: 'wx', mode: 0o600 });
      console.log(
        `[AudioCapture] Recovery buffer written: ${destination} (${combined.length} bytes)`
      );
    });
    this.recoveryWriteChain = operation.catch(() => undefined);
    return operation;
  }

  /**
   * Generate a unique buffer filename
   */
  private generateBufferFilename(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return join(this.recoveryBufferPath, `audio-${timestamp}-${randomUUID()}.raw`);
  }

  /**
   * Clean up old recovery buffer files
   */
  private async cleanOldBuffers(): Promise<void> {
    try {
      const root = await ensurePrivateCaptureArea('audio');
      const files = await readdir(root, { withFileTypes: true });

      const bufferFiles = await Promise.all(
        files
          .filter((entry) => entry.name.startsWith('audio-') && entry.name.endsWith('.raw'))
          .map(async (entry) => {
            if (entry.isSymbolicLink() || !entry.isFile()) {
              throw new Error('Audio recovery entry is not a regular file.');
            }
            const path = join(root, entry.name);
            const stats = await stat(path);
            return { path, mtime: stats.mtime.getTime() };
          })
      );

      // Sort by modification time, newest first
      bufferFiles.sort((a, b) => b.mtime - a.mtime);

      // Delete all but the 2 most recent
      for (let i = 2; i < bufferFiles.length; i++) {
        await unlink(bufferFiles[i].path);
        console.log(`[AudioCapture] Deleted old buffer: ${bufferFiles[i].path}`);
      }
    } catch (error) {
      console.error('[AudioCapture] Failed to clean old buffers:', error);
    }
  }

  /**
   * Get recovery buffers for replay after network failure
   * Returns buffers from the last N minutes
   */
  async getRecoveryBuffers(lastMinutes: number = 5): Promise<Buffer[]> {
    const buffers: Buffer[] = [];
    const cutoff = Date.now() - lastMinutes * 60 * 1000;

    try {
      const { readFile } = await import('fs/promises');
      const root = await ensurePrivateCaptureArea('audio');
      const files = await readdir(root, { withFileTypes: true });

      for (const entry of files) {
        const file = entry.name;
        if (!file.startsWith('audio-') || !file.endsWith('.raw')) continue;
        if (entry.isSymbolicLink() || !entry.isFile()) {
          throw new Error('Audio recovery entry is not a regular file.');
        }

        const path = join(root, file);
        const stats = await stat(path);

        if (stats.mtime.getTime() > cutoff) {
          const data = await readFile(path);
          buffers.push(data);
        }
      }

      // Include current in-memory chunks
      if (this.recoveryChunks.length > 0) {
        buffers.push(Buffer.concat(this.recoveryChunks));
      }

      console.log(`[AudioCapture] Retrieved ${buffers.length} recovery buffers`);
    } catch (error) {
      console.error('[AudioCapture] Failed to get recovery buffers:', error);
    }

    return buffers;
  }

  /**
   * Clear all recovery buffers
   */
  async clearRecoveryBuffers(): Promise<void> {
    await this.recoveryWriteChain;
    await clearPrivateCaptureFiles('audio', 'Audio recovery root');
    this.recoveryChunks = [];
    this.currentBufferFile = null;
    console.log('[AudioCapture] Recovery buffers cleared');
  }

  /**
   * Build a single buffer from all captured session chunks.
   */
  getCapturedAudioBuffer(): Buffer | null {
    if (this.sessionAudioChunks.length === 0 || this.sessionAudioBytes === 0) {
      return null;
    }
    return Buffer.concat(this.sessionAudioChunks, this.sessionAudioBytes);
  }

  getCapturedAudioAsset(): CapturedAudioAsset | null {
    const encoded = this.getCapturedEncodedAudioAsset();
    if (encoded) {
      return encoded;
    }

    return this.getCapturedPcmAudioAsset();
  }

  private getCapturedPcmAudioAsset(): CapturedAudioAsset | null {
    const rawAudio = this.getCapturedAudioBuffer();
    if (!rawAudio) {
      return null;
    }

    const wavBuffer = encodeFloat32Wav(rawAudio, this.config.sampleRate, this.config.channels);
    const durationMs =
      this.sessionAudioDurationMs > 0
        ? this.sessionAudioDurationMs
        : (rawAudio.byteLength / (this.config.channels * this.config.sampleRate * 4)) * 1000;

    return {
      buffer: wavBuffer,
      mimeType: 'audio/wav',
      durationMs,
    };
  }

  private getCapturedEncodedAudioAsset(): CapturedAudioAsset | null {
    if (this.encodedAudioChunks.length === 0 || this.encodedAudioBytes === 0) {
      return null;
    }

    return {
      buffer: Buffer.concat(this.encodedAudioChunks, this.encodedAudioBytes),
      mimeType: this.encodedAudioMimeType || 'audio/webm',
      durationMs: this.encodedAudioDurationMs,
    };
  }

  private toBuffer(chunk: Buffer | Uint8Array | ArrayBuffer | undefined): Buffer | null {
    if (!chunk) {
      return null;
    }
    if (Buffer.isBuffer(chunk)) {
      return chunk;
    }
    if (chunk instanceof ArrayBuffer) {
      return Buffer.from(chunk);
    }
    if (ArrayBuffer.isView(chunk)) {
      return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    }
    return null;
  }

  private toFloat32Samples(
    samples: number[] | Float32Array | ArrayBuffer | undefined
  ): Float32Array | null {
    if (!samples) {
      return null;
    }
    if (Array.isArray(samples)) {
      return samples.length > 0 ? new Float32Array(samples) : null;
    }
    if (samples instanceof Float32Array) {
      return samples.length > 0 ? samples : null;
    }
    if (samples instanceof ArrayBuffer && samples.byteLength % Float32Array.BYTES_PER_ELEMENT === 0) {
      return samples.byteLength > 0 ? new Float32Array(samples) : null;
    }
    return null;
  }

}

// ============================================================================
// Singleton Export
// ============================================================================

export const audioCapture = new AudioCaptureServiceImpl();
export { AudioCaptureServiceImpl };
export default audioCapture;
