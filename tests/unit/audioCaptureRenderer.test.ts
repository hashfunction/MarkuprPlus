import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioCaptureRenderer } from '../../src/renderer/audio/AudioCaptureRenderer';

class MockMediaStream {
  private readonly tracks = [{ stop: vi.fn() }];

  getTracks() {
    return this.tracks;
  }
}

class MockMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  state = 'inactive';
  mimeType = 'audio/webm;codecs=opus';
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: (() => void) | null = null;

  start = vi.fn(() => {
    this.state = 'recording';
  });

  requestData = vi.fn();

  stop = vi.fn(() => {
    this.state = 'inactive';
    queueMicrotask(() => this.onstop?.());
  });
}

type AudioProcessHandler = ((event: AudioProcessingEvent) => void) | null;

const processorNode = {
  onaudioprocess: null as AudioProcessHandler,
  connect: vi.fn(),
  disconnect: vi.fn(),
};

const silentGainNode = {
  gain: { value: 1 },
  connect: vi.fn(),
  disconnect: vi.fn(),
};

const sourceNode = {
  connect: vi.fn(),
  disconnect: vi.fn(),
};

const analyserNode = {
  fftSize: 1024,
  smoothingTimeConstant: 0,
  getFloatTimeDomainData: vi.fn(),
  disconnect: vi.fn(),
};

class MockAudioContext {
  readonly state = 'running';
  readonly sampleRate = 16_000;
  readonly destination = {};
  readonly createMediaStreamSource = vi.fn(() => sourceNode);
  readonly createAnalyser = vi.fn(() => analyserNode);
  readonly createScriptProcessor = vi.fn(() => processorNode);
  readonly createGain = vi.fn(() => silentGainNode);
  readonly resume = vi.fn(() => Promise.resolve());
  readonly close = vi.fn(() => Promise.resolve());
}

const audioApi = {
  onRequestDevices: vi.fn(() => vi.fn()),
  onStartCapture: vi.fn(() => vi.fn()),
  onStopCapture: vi.fn(() => vi.fn()),
  onSetDevice: vi.fn(() => vi.fn()),
  sendDevices: vi.fn(),
  sendCaptureError: vi.fn(),
  sendAudioChunk: vi.fn(),
  notifyCaptureStarted: vi.fn(),
  notifyCaptureStopped: vi.fn(),
};

describe('AudioCaptureRenderer', () => {
  let renderer: AudioCaptureRenderer;

  beforeEach(() => {
    vi.clearAllMocks();
    processorNode.onaudioprocess = null;
    silentGainNode.gain.value = 1;

    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(new MockMediaStream())),
        enumerateDevices: vi.fn(() => Promise.resolve([])),
      },
    });
    vi.stubGlobal('window', {
      AudioContext: MockAudioContext,
      markupr: { audio: audioApi },
    });

    renderer = new AudioCaptureRenderer();
  });

  afterEach(async () => {
    await renderer.stopCapture();
    vi.unstubAllGlobals();
  });

  it('streams microphone PCM samples for local Whisper while MediaRecorder is active', async () => {
    await renderer.startCapture();

    expect(processorNode.onaudioprocess).toBeTypeOf('function');

    const samples = new Float32Array([0.25, -0.5, 0.75, -1]);
    processorNode.onaudioprocess?.({
      inputBuffer: {
        getChannelData: () => samples,
      },
    } as AudioProcessingEvent);

    expect(audioApi.sendAudioChunk).toHaveBeenCalledWith({
      samples: [0.25, -0.5, 0.75, -1],
      timestamp: expect.any(Number),
      duration: 0.25,
    });
  });
});
