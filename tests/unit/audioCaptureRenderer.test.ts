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

let workletNodeInstance: MockAudioWorkletNode | null = null;

class MockAudioWorkletNode {
  readonly port = {
    onmessage: null as ((event: MessageEvent) => void) | null,
  };
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();

  constructor() {
    workletNodeInstance = this;
  }
}

const addWorkletModule = vi.fn(() => Promise.resolve());
const createScriptProcessor = vi.fn(() => processorNode);

class MockAudioContext {
  readonly state = 'running';
  readonly sampleRate = 48_000;
  readonly destination = {};
  readonly audioWorklet = { addModule: addWorkletModule };
  readonly createMediaStreamSource = vi.fn(() => sourceNode);
  readonly createAnalyser = vi.fn(() => analyserNode);
  readonly createScriptProcessor = createScriptProcessor;
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
    workletNodeInstance = null;

    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('AudioWorkletNode', MockAudioWorkletNode);
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

    expect(workletNodeInstance).not.toBeNull();
    workletNodeInstance?.port.onmessage?.({
      data: {
        samples: new Float32Array([0, 0.25, 0.5, 0.75, 1, -0.5]),
        sampleRate: 48_000,
        timestamp: 42,
      },
    } as MessageEvent);

    expect(audioApi.sendAudioChunk).toHaveBeenCalledWith({
      samples: expect.any(Float32Array),
      timestamp: 42,
      duration: 0.125,
    });
    const payload = audioApi.sendAudioChunk.mock.calls[0][0];
    expect(Array.from(payload.samples)).toEqual([0, 0.75]);
  });

  it('does not use ScriptProcessorNode because it crashes the packaged Electron renderer', async () => {
    await renderer.startCapture();

    expect(createScriptProcessor).not.toHaveBeenCalled();
  });
});
