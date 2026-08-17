/**
 * AudioCaptureRenderer.ts - Browser-side Audio Capture for MarkuprX
 *
 * Uses getUserMedia + MediaRecorder to avoid fragile WebAudio graphs in
 * packaged macOS builds. Chunks are streamed to main process for persistence
 * and post-session transcription.
 */

import pcmCaptureProcessorUrl from './PcmCaptureProcessor.worklet.js?url';
import { PUBLIC_BRAND_NAME } from '../../shared/publicBrand';

class CaptureStartCancelledError extends Error {}

interface CaptureConfig {
  deviceId: string | null;
  sampleRate: number;
  channels: number;
  chunkDurationMs: number;
}

interface AudioDeviceInfo {
  id: string;
  name: string;
  isDefault: boolean;
}

class AudioCaptureRenderer {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recorderMimeType = 'audio/webm';
  private capturing = false;
  private stopping = false;
  private inFlightChunkReads: Set<Promise<void>> = new Set();
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private pcmProcessorNode: AudioWorkletNode | null = null;
  private silentGainNode: GainNode | null = null;
  private analyserData: Float32Array | null = null;
  private levelMonitorFrame: number | null = null;
  private latestRms = 0;
  private latestLevel = 0;
  private electronTestAudioInterval: number | null = null;
  private electronTestAudioPhase = 0;
  private captureGeneration = 0;
  private config: CaptureConfig = {
    deviceId: null,
    sampleRate: 16000,
    channels: 1,
    chunkDurationMs: 250,
  };
  private cleanupFunctions: Array<() => void> = [];

  constructor() {
    this.setupIPCListeners();
  }

  private setupIPCListeners(): void {
    const api = window.markuprx;
    if (!api?.audio) {
      console.error(`[AudioCaptureRenderer] ${PUBLIC_BRAND_NAME} audio API not available`);
      return;
    }

    const cleanupDevices = api.audio.onRequestDevices(async () => {
      try {
        const devices = await this.getDevices();
        api.audio.sendDevices(devices);
      } catch (error) {
        api.audio.sendCaptureError((error as Error).message);
      }
    });
    this.cleanupFunctions.push(cleanupDevices);

    const cleanupStart = api.audio.onStartCapture(async (config) => {
      try {
        this.config = { ...this.config, ...config };
        await this.startCapture();
        if (this.capturing) api.audio.notifyCaptureStarted();
      } catch (error) {
        if (error instanceof CaptureStartCancelledError) return;
        api.audio.sendCaptureError((error as Error).message);
      }
    });
    this.cleanupFunctions.push(cleanupStart);

    const cleanupStop = api.audio.onStopCapture(async () => {
      await this.stopCapture();
      api.audio.notifyCaptureStopped();
    });
    this.cleanupFunctions.push(cleanupStop);

    const cleanupDevice = api.audio.onSetDevice(async (deviceId) => {
      this.config.deviceId = deviceId;
      if (this.capturing) {
        await this.stopCapture();
        try {
          await this.startCapture();
          if (this.capturing) api.audio.notifyCaptureStarted();
        } catch (error) {
          if (error instanceof CaptureStartCancelledError) return;
          api.audio.sendCaptureError((error as Error).message);
        }
      }
    });
    this.cleanupFunctions.push(cleanupDevice);

    console.log('[AudioCaptureRenderer] IPC listeners initialized');
  }

  destroy(): void {
    void this.stopCapture();
    void this.stopLevelMonitor();
    this.cleanupFunctions.forEach((fn) => fn());
    this.cleanupFunctions = [];
  }

  async getDevices(): Promise<AudioDeviceInfo[]> {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach((track) => track.stop());
    } catch {
      console.warn('[AudioCaptureRenderer] Could not get permission to enumerate devices');
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((d) => d.kind === 'audioinput');

    return audioInputs.map((device, index) => ({
      id: device.deviceId,
      name: device.label || `Microphone ${index + 1}`,
      isDefault: device.deviceId === 'default',
    }));
  }

  async startCapture(): Promise<void> {
    if (this.capturing) {
      console.log('[AudioCaptureRenderer] Already capturing');
      return;
    }
    const generation = ++this.captureGeneration;
    const assertCurrentStart = () => {
      if (generation !== this.captureGeneration) throw new CaptureStartCancelledError();
    };

    const testConfig = await window.markuprx.e2e?.getConfig().catch(() => null);
    assertCurrentStart();
    if (testConfig?.enabled) {
      this.capturing = true;
      this.stopping = false;
      this.electronTestAudioPhase = 0;
      const emitSamples = () => {
        if (!this.capturing) return;
        const sampleCount = Math.round(
          (this.config.sampleRate * this.config.chunkDurationMs) / 1000,
        );
        const samples = new Float32Array(sampleCount);
        const amplitude = 0.08;
        const radiansPerSample = (2 * Math.PI * 220) / this.config.sampleRate;
        for (let index = 0; index < samples.length; index += 1) {
          samples[index] = Math.sin(this.electronTestAudioPhase) * amplitude;
          this.electronTestAudioPhase += radiansPerSample;
        }
        this.latestRms = amplitude / Math.sqrt(2);
        this.latestLevel = 0.72;
        this.sendPcmChunkToMain(samples, performance.now());
        if (testConfig.localTranscriptionRecovery) {
          // A deterministic encoded companion proves the cloud fallback was
          // eligible while the unpackaged Electron harness exercises local-first.
          this.sendEncodedChunkToMain(
            new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
            performance.now(),
            this.config.chunkDurationMs,
            'audio/webm',
          );
        }
      };
      emitSamples();
      this.electronTestAudioInterval = window.setInterval(
        emitSamples,
        this.config.chunkDurationMs,
      );
      console.log('[AudioCaptureRenderer] Deterministic Electron test audio started');
      return;
    }

    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: this.config.deviceId ? { exact: this.config.deviceId } : undefined,
        sampleRate: { ideal: this.config.sampleRate },
        channelCount: { ideal: 1 },
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
        autoGainControl: { ideal: true },
      },
      video: false,
    };

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (generation !== this.captureGeneration) {
        mediaStream.getTracks().forEach((track) => track.stop());
        throw new CaptureStartCancelledError();
      }
      this.mediaStream = mediaStream;
    } catch (error) {
      throw new Error(`Failed to access microphone: ${(error as Error).message}`);
    }

    this.recorderMimeType = this.resolveRecorderMimeType();

    try {
      const options: MediaRecorderOptions = this.recorderMimeType
        ? { mimeType: this.recorderMimeType, audioBitsPerSecond: 128_000 }
        : { audioBitsPerSecond: 128_000 };
      this.mediaRecorder = new MediaRecorder(this.mediaStream, options);
    } catch (error) {
      await this.stopCapture();
      throw new Error(`Failed to initialize media recorder: ${(error as Error).message}`);
    }

    await this.startLevelMonitor().catch((error) => {
      console.warn('[AudioCaptureRenderer] Mic level monitor unavailable:', error);
      this.latestRms = 0;
      this.latestLevel = 0;
    });
    if (generation !== this.captureGeneration) {
      await this.stopCapture();
      throw new CaptureStartCancelledError();
    }

    this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if ((!this.capturing && !this.stopping) || !event.data || event.data.size === 0) {
        return;
      }

      const timestamp = performance.now();
      const duration = this.config.chunkDurationMs;
      const mimeType = event.data.type || this.mediaRecorder?.mimeType || this.recorderMimeType;
      const chunkPromise = event.data
        .arrayBuffer()
        .then((buffer) => {
          this.sendEncodedChunkToMain(new Uint8Array(buffer), timestamp, duration, mimeType);
        })
        .catch((error) => {
          const api = window.markuprx;
          api?.audio?.sendCaptureError(`Failed to process audio chunk: ${(error as Error).message}`);
        })
        .finally(() => {
          this.inFlightChunkReads.delete(chunkPromise);
        });
      this.inFlightChunkReads.add(chunkPromise);
    };

    this.mediaRecorder.onerror = (event: Event) => {
      const recorderError = (event as ErrorEvent).error;
      const message = recorderError instanceof Error ? recorderError.message : 'Unknown recorder error';
      const api = window.markuprx;
      api?.audio?.sendCaptureError(`Audio recorder error: ${message}`);
    };

    try {
      this.mediaRecorder.start(this.config.chunkDurationMs);
      this.capturing = true;
      this.stopping = false;
      console.log(
        `[AudioCaptureRenderer] Capture started with MediaRecorder (${this.mediaRecorder.mimeType || this.recorderMimeType})`
      );
    } catch (error) {
      await this.stopCapture();
      throw new Error(`Failed to start media recorder: ${(error as Error).message}`);
    }
  }

  private resolveRecorderMimeType(): string {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      '',
    ];

    for (const candidate of candidates) {
      if (!candidate) {
        return '';
      }
      if (MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    }

    return '';
  }

  private sendEncodedChunkToMain(
    encodedChunk: Uint8Array,
    timestamp: number,
    duration: number,
    mimeType: string
  ): void {
    if (!this.capturing) {
      return;
    }

    const api = window.markuprx;
    if (!api?.audio) {
      console.error(`[AudioCaptureRenderer] ${PUBLIC_BRAND_NAME} audio API not available`);
      return;
    }

    api.audio.sendAudioChunk({
      encodedChunk,
      timestamp,
      duration,
      mimeType,
      audioLevel: this.latestLevel,
      rms: this.latestRms,
    });
  }

  private sendPcmChunkToMain(samples: Float32Array, timestamp: number): void {
    if (!this.capturing || samples.length === 0) {
      return;
    }

    const api = window.markuprx;
    if (!api?.audio) {
      console.error(`[AudioCaptureRenderer] ${PUBLIC_BRAND_NAME} audio API not available`);
      return;
    }

    api.audio.sendAudioChunk({
      samples,
      timestamp,
      duration: (samples.length / this.config.sampleRate) * 1000,
    });
  }

  private resamplePcmChunk(samples: Float32Array, sourceSampleRate: number): Float32Array {
    const targetSampleRate = this.config.sampleRate;
    if (sourceSampleRate === targetSampleRate) {
      return samples.slice();
    }

    const outputLength = Math.max(
      1,
      Math.floor((samples.length * targetSampleRate) / sourceSampleRate)
    );
    const output = new Float32Array(outputLength);
    const sourceStep = sourceSampleRate / targetSampleRate;

    for (let index = 0; index < outputLength; index += 1) {
      const sourceIndex = index * sourceStep;
      const lowerIndex = Math.floor(sourceIndex);
      const upperIndex = Math.min(lowerIndex + 1, samples.length - 1);
      const fraction = sourceIndex - lowerIndex;
      output[index] =
        samples[lowerIndex] * (1 - fraction) + samples[upperIndex] * fraction;
    }

    return output;
  }

  private async startLevelMonitor(): Promise<void> {
    if (!this.mediaStream) {
      return;
    }

    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    await this.stopLevelMonitor();

    const context = new AudioContextCtor();
    if (context.state === 'suspended') {
      await context.resume().catch(() => {
        // Best effort.
      });
    }

    const source = context.createMediaStreamSource(this.mediaStream);
    const analyser = context.createAnalyser();
    const chunkSamples = Math.max(
      128,
      Math.round((context.sampleRate * this.config.chunkDurationMs) / 1000)
    );
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.15;

    source.connect(analyser);

    this.audioContext = context;
    this.sourceNode = source;
    this.analyserNode = analyser;
    this.analyserData = new Float32Array(analyser.fftSize);
    this.latestRms = 0;
    this.latestLevel = 0;

    try {
      await context.audioWorklet.addModule(pcmCaptureProcessorUrl);
      const pcmProcessor = new AudioWorkletNode(context, 'markuprx-pcm-capture', {
        processorOptions: { chunkSamples },
      });
      const silentGain = context.createGain();
      silentGain.gain.value = 0;

      pcmProcessor.port.onmessage = (event: MessageEvent) => {
        const data = event.data as {
          samples?: Float32Array;
          sampleRate?: number;
          timestamp?: number;
        };
        if (!(data.samples instanceof Float32Array) || !Number.isFinite(data.sampleRate)) {
          return;
        }

        const resampled = this.resamplePcmChunk(data.samples, Number(data.sampleRate));
        const timestamp = Number.isFinite(data.timestamp)
          ? Number(data.timestamp)
          : performance.now();
        this.sendPcmChunkToMain(resampled, timestamp);
      };

      source.connect(pcmProcessor);
      pcmProcessor.connect(silentGain);
      silentGain.connect(context.destination);
      this.pcmProcessorNode = pcmProcessor;
      this.silentGainNode = silentGain;
    } catch (error) {
      console.warn('[AudioCaptureRenderer] PCM capture worklet unavailable:', error);
    }

    const tick = () => {
      if (!this.analyserNode || !this.analyserData) {
        return;
      }

      this.analyserNode.getFloatTimeDomainData(
        this.analyserData as unknown as Float32Array<ArrayBuffer>
      );
      let sumSquares = 0;
      for (let i = 0; i < this.analyserData.length; i += 1) {
        const sample = this.analyserData[i];
        sumSquares += sample * sample;
      }
      const rms = Math.sqrt(sumSquares / this.analyserData.length);

      // Normalize voice energy while suppressing idle noise.
      const noiseFloor = 0.004;
      const normalized = Math.max(0, Math.min(1, (rms - noiseFloor) / 0.045));
      const attack = 0.45;
      const release = 0.18;
      const smoothing = normalized > this.latestLevel ? attack : release;

      this.latestRms = rms;
      this.latestLevel += (normalized - this.latestLevel) * smoothing;
      this.levelMonitorFrame = requestAnimationFrame(tick);
    };

    this.levelMonitorFrame = requestAnimationFrame(tick);
  }

  private async stopLevelMonitor(): Promise<void> {
    if (this.levelMonitorFrame !== null) {
      cancelAnimationFrame(this.levelMonitorFrame);
      this.levelMonitorFrame = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // Best effort.
      }
      this.sourceNode = null;
    }

    if (this.analyserNode) {
      try {
        this.analyserNode.disconnect();
      } catch {
        // Best effort.
      }
      this.analyserNode = null;
    }

    if (this.pcmProcessorNode) {
      this.pcmProcessorNode.port.onmessage = null;
      try {
        this.pcmProcessorNode.disconnect();
      } catch {
        // Best effort.
      }
      this.pcmProcessorNode = null;
    }

    if (this.silentGainNode) {
      try {
        this.silentGainNode.disconnect();
      } catch {
        // Best effort.
      }
      this.silentGainNode = null;
    }

    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch {
        // Best effort.
      }
      this.audioContext = null;
    }

    this.analyserData = null;
    this.latestRms = 0;
    this.latestLevel = 0;
  }

  async stopCapture(): Promise<void> {
    this.captureGeneration += 1;
    if (!this.capturing && !this.mediaStream && !this.mediaRecorder) {
      return;
    }

    const wasCapturing = this.capturing;
    this.stopping = wasCapturing || this.stopping;

    if (this.electronTestAudioInterval !== null) {
      window.clearInterval(this.electronTestAudioInterval);
      this.electronTestAudioInterval = null;
    }

    if (this.mediaRecorder) {
      const recorder = this.mediaRecorder;
      this.mediaRecorder = null;

      if (recorder.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 1000);
          recorder.onstop = () => {
            clearTimeout(timeout);
            resolve();
          };

          try {
            if (recorder.state === 'recording') {
              try {
                recorder.requestData();
              } catch {
                // Best effort; some runtimes may throw while stopping.
              }
            }
            recorder.stop();
          } catch {
            clearTimeout(timeout);
            resolve();
          }
        });
      }

      // Drain any in-flight chunk reads from the final MediaRecorder events.
      if (this.inFlightChunkReads.size > 0) {
        await Promise.allSettled(Array.from(this.inFlightChunkReads));
      }
      this.inFlightChunkReads.clear();

      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
    }

    this.capturing = false;
    this.stopping = false;
    await this.stopLevelMonitor();

    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      } catch {
        // Best effort
      }
      this.mediaStream = null;
    }

    if (wasCapturing) {
      console.log('[AudioCaptureRenderer] Capture stopped');
    }
  }

  isCapturing(): boolean {
    return this.capturing;
  }
}

// ============================================================================
// Module Initialization
// ============================================================================

let audioCaptureRenderer: AudioCaptureRenderer | null = null;

export function initAudioCapture(): AudioCaptureRenderer {
  if (!audioCaptureRenderer) {
    audioCaptureRenderer = new AudioCaptureRenderer();
  }
  return audioCaptureRenderer;
}

export function getAudioCapture(): AudioCaptureRenderer | null {
  return audioCaptureRenderer;
}

export function destroyAudioCapture(): void {
  if (audioCaptureRenderer) {
    audioCaptureRenderer.destroy();
    audioCaptureRenderer = null;
  }
}

export { AudioCaptureRenderer };
export default initAudioCapture;
