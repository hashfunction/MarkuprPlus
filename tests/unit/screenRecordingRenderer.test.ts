/**
 * ScreenRecordingRenderer Unit Tests
 *
 * Tests the renderer-side screen recording lifecycle:
 * - Start/stop recording
 * - Chunk streaming to main process via IPC
 * - Error handling and cleanup
 * - Guard against double-start, double-stop
 * - In-flight write draining on stop
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AnnotationEvent, CaptureTarget } from '../../src/shared/types';

// ---------------------------------------------------------------------------
// Mock MediaRecorder + MediaStream + navigator.mediaDevices
// ---------------------------------------------------------------------------

class MockMediaStream {
  private tracks: Array<{
    stop: ReturnType<typeof vi.fn>;
    kind: string;
    enabled: boolean;
    readyState: string;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  }> = [];
  private endedListeners = new Set<() => void>();

  constructor(readonly label = 'stream') {
    this.tracks = [{
      stop: vi.fn(() => { this.tracks[0].readyState = 'ended'; }),
      kind: 'video',
      enabled: true,
      readyState: 'live',
      addEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === 'ended') this.endedListeners.add(listener);
      }),
      removeEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === 'ended') this.endedListeners.delete(listener);
      }),
    }];
  }

  getTracks() {
    return this.tracks;
  }

  endVideoTrack() {
    this.tracks[0].readyState = 'ended';
    this.endedListeners.forEach((listener) => listener());
  }
}

let mockRecorderInstance: {
  state: string;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  requestData: ReturnType<typeof vi.fn>;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onerror: ((event: { error?: Error }) => void) | null;
  onstop: (() => void) | null;
  stream: MediaStream;
};

class MockMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  state = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: ((event: { error?: Error }) => void) | null = null;
  onstop: (() => void) | null = null;
  requestData = vi.fn();
  stream: MediaStream;
  start = vi.fn(() => {
    this.state = 'recording';
  });
  stop = vi.fn(() => {
    this.state = 'inactive';
    // Fire onstop async
    setTimeout(() => this.onstop?.(), 0);
  });

  constructor(stream: MediaStream) {
    this.stream = stream;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    mockRecorderInstance = this;
  }
}

vi.stubGlobal('MediaRecorder', MockMediaRecorder);

vi.stubGlobal('navigator', {
  mediaDevices: {
    getUserMedia: vi.fn(() => Promise.resolve(new MockMediaStream())),
  },
});

// ---------------------------------------------------------------------------
// Mock window.markupr.screenRecording IPC
// ---------------------------------------------------------------------------

const mockScreenRecordingIPC = {
  start: vi.fn(() => Promise.resolve({ success: true, path: '/tmp/rec.webm' })),
  appendChunk: vi.fn(() => Promise.resolve({ success: true })),
  stop: vi.fn(() =>
    Promise.resolve({ success: true, path: '/tmp/rec.webm', bytes: 1024, mimeType: 'video/webm' })
  ),
};
const mockSessionIPC = {
  stop: vi.fn(() => Promise.resolve({ success: true })),
};

const annotationListeners = new Set<(event: AnnotationEvent) => void>();
const mockCaptureIPC = {
  getSources: vi.fn(() => Promise.resolve([
    { id: 'screen:99:0', name: 'Unselected screen', type: 'screen' as const },
  ])),
  onAnnotationEvent: vi.fn((listener: (event: AnnotationEvent) => void) => {
    annotationListeners.add(listener);
    return () => annotationListeners.delete(listener);
  }),
  endAnnotation: vi.fn(() => Promise.resolve({ success: true })),
};

vi.stubGlobal('window', {
  markupr: {
    screenRecording: mockScreenRecordingIPC,
    capture: mockCaptureIPC,
    session: mockSessionIPC,
  },
});

// ---------------------------------------------------------------------------
// Import AFTER mocks are in place
// ---------------------------------------------------------------------------

import { ScreenRecordingRenderer } from '../../src/renderer/capture/ScreenRecordingRenderer';

const screenTarget: CaptureTarget = {
  kind: 'screen',
  sourceId: 'screen:0:0',
  sourceName: 'Primary Display',
  displayId: '1',
  displayBounds: { x: 0, y: 0, width: 1920, height: 1080 },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScreenRecordingRenderer', () => {
  let renderer: ScreenRecordingRenderer;
  let rawStream: MockMediaStream;
  let composedStream: MockMediaStream;
  let compositor: {
    start: ReturnType<typeof vi.fn>;
    applyAnnotationEvent: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    annotationListeners.clear();
    rawStream = new MockMediaStream('raw');
    composedStream = new MockMediaStream('composed');
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(
      rawStream as unknown as MediaStream
    );
    compositor = {
      start: vi.fn(() => Promise.resolve(composedStream as unknown as MediaStream)),
      applyAnnotationEvent: vi.fn(),
      stop: vi.fn(() => {
        rawStream.getTracks().forEach((track) => track.stop());
        composedStream.getTracks().forEach((track) => track.stop());
      }),
    };
    renderer = new ScreenRecordingRenderer(() => compositor);
  });

  afterEach(async () => {
    // Ensure cleanup
    if (renderer.isRecording()) {
      await renderer.stop();
    }
  });

  // ========================================================================
  // Initial state
  // ========================================================================

  describe('initial state', () => {
    it('should not be recording initially', () => {
      expect(renderer.isRecording()).toBe(false);
    });

    it('should have null sessionId initially', () => {
      expect(renderer.getSessionId()).toBeNull();
    });
  });

  // ========================================================================
  // Start recording
  // ========================================================================

  describe('start', () => {
    it('captures and composes only the explicitly selected target', async () => {
      await renderer.start({ sessionId: 'sess-1', target: screenTarget });

      expect(mockCaptureIPC.getSources).not.toHaveBeenCalled();
      expect(compositor.start).toHaveBeenCalledWith(rawStream, screenTarget);
      expect(mockRecorderInstance.stream).toBe(composedStream);
    });

    it('never falls through to another source when both exact-source attempts fail', async () => {
      vi.mocked(navigator.mediaDevices.getUserMedia)
        .mockRejectedValueOnce(new Error('high quality rejected'))
        .mockRejectedValueOnce(new Error('basic rejected'));

      await expect(renderer.start({ sessionId: 'sess-1', target: screenTarget }))
        .rejects.toThrow('basic rejected');

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
      for (const [constraints] of vi.mocked(navigator.mediaDevices.getUserMedia).mock.calls) {
        expect((constraints.video as { mandatory?: { chromeMediaSourceId?: string } })
          .mandatory?.chromeMediaSourceId)
          .toBe(screenTarget.sourceId);
      }
      expect(mockCaptureIPC.getSources).not.toHaveBeenCalled();
      expect(mockScreenRecordingIPC.start).not.toHaveBeenCalled();
    });

    it('forwards annotation events to the compositor and unsubscribes on stop', async () => {
      await renderer.start({ sessionId: 'sess-1', target: screenTarget });
      const annotationEvent: AnnotationEvent = {
        type: 'cursor',
        sessionId: 'sess-1',
        point: { x: 0.25, y: 0.75 },
      };

      annotationListeners.forEach((listener) => listener(annotationEvent));
      expect(compositor.applyAnnotationEvent).toHaveBeenCalledWith(annotationEvent);

      await renderer.stop();
      expect(annotationListeners.size).toBe(0);
    });

    it('releases the selected source when composition cannot initialize', async () => {
      compositor.start.mockRejectedValue(new Error('canvas unavailable'));

      await expect(renderer.start({ sessionId: 'sess-1', target: screenTarget }))
        .rejects.toThrow('canvas unavailable');

      expect(rawStream.getTracks()[0].stop).toHaveBeenCalled();
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
      expect(mockScreenRecordingIPC.start).not.toHaveBeenCalled();
    });

    it('retries basic exact-source capture when a constrained stream never becomes frame-ready', async () => {
      const constrainedStream = new MockMediaStream('constrained');
      const fallbackStream = new MockMediaStream('fallback');
      vi.mocked(navigator.mediaDevices.getUserMedia)
        .mockResolvedValueOnce(constrainedStream as unknown as MediaStream)
        .mockResolvedValueOnce(fallbackStream as unknown as MediaStream);
      compositor.start
        .mockRejectedValueOnce(new Error('Timed out waiting for the selected capture source.'))
        .mockResolvedValueOnce(composedStream as unknown as MediaStream);

      await renderer.start({ sessionId: 'sess-1', target: screenTarget });

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
      expect(constrainedStream.getTracks()[0].stop).toHaveBeenCalled();
      expect(compositor.start).toHaveBeenNthCalledWith(1, constrainedStream, screenTarget);
      expect(compositor.start).toHaveBeenNthCalledWith(2, fallbackStream, screenTarget);
      expect(mockRecorderInstance.stream).toBe(composedStream);
    });

    it('finalizes recording and the session when the selected source ends', async () => {
      await renderer.start({ sessionId: 'sess-1', target: screenTarget });

      rawStream.endVideoTrack();

      await vi.waitFor(() => expect(mockSessionIPC.stop).toHaveBeenCalledOnce());
      expect(compositor.stop).toHaveBeenCalled();
      expect(mockScreenRecordingIPC.stop).toHaveBeenCalledWith('sess-1');
    });

    it('finalizes and surfaces the selected source when MediaRecorder fails', async () => {
      const onFatalError = vi.fn();
      renderer.setFatalErrorHandler(onFatalError);
      await renderer.start({ sessionId: 'sess-1', target: screenTarget });

      mockRecorderInstance.onerror?.({ error: new Error('encoder crashed') });

      await vi.waitFor(() => expect(mockSessionIPC.stop).toHaveBeenCalledOnce());
      expect(mockScreenRecordingIPC.stop).toHaveBeenCalledWith('sess-1');
      expect(mockCaptureIPC.endAnnotation).toHaveBeenCalledOnce();
      expect(onFatalError).toHaveBeenCalledWith(expect.stringContaining('Primary Display'));
      expect(onFatalError).toHaveBeenCalledWith(expect.stringContaining('encoder crashed'));
    });

    it('should request getUserMedia with desktop source constraints', async () => {
      await renderer.start({ sessionId: 'sess-1', sourceId: 'screen:0:0' });

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: false,
          video: expect.objectContaining({
            cursor: 'never',
            mandatory: expect.objectContaining({
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: 'screen:0:0',
            }),
          }),
        })
      );
    });

    it('should call IPC start with sessionId and mimeType', async () => {
      await renderer.start({ sessionId: 'sess-1', sourceId: 'screen:0:0' });

      expect(mockScreenRecordingIPC.start).toHaveBeenCalledWith('sess-1', expect.any(String), expect.any(Number));
    });

    it('should set isRecording to true after start', async () => {
      await renderer.start({ sessionId: 'sess-1', sourceId: 'screen:0:0' });

      expect(renderer.isRecording()).toBe(true);
    });

    it('should set sessionId after start', async () => {
      await renderer.start({ sessionId: 'sess-1', sourceId: 'screen:0:0' });

      expect(renderer.getSessionId()).toBe('sess-1');
    });

    it('should set recordingStartTime after start', async () => {
      const before = Date.now();
      await renderer.start({ sessionId: 'sess-1', sourceId: 'screen:0:0' });
      const after = Date.now();

      const startTime = renderer.getRecordingStartTime();
      expect(startTime).toBeTypeOf('number');
      expect(startTime).toBeGreaterThanOrEqual(before);
      expect(startTime).toBeLessThanOrEqual(after);
    });

    it('should start MediaRecorder with 1000ms timeslice', async () => {
      await renderer.start({ sessionId: 'sess-1', sourceId: 'screen:0:0' });

      expect(mockRecorderInstance.start).toHaveBeenCalledWith(1000);
    });

    it('should no-op if already recording', async () => {
      await renderer.start({ sessionId: 'sess-1', sourceId: 'screen:0:0' });
      vi.clearAllMocks();

      await renderer.start({ sessionId: 'sess-2', sourceId: 'screen:0:0' });

      // Should NOT have called getUserMedia again
      expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
      // Session ID should still be the first one
      expect(renderer.getSessionId()).toBe('sess-1');
    });

    it('should throw if IPC start fails', async () => {
      mockScreenRecordingIPC.start.mockResolvedValueOnce({ success: false, error: 'disk full' });

      await expect(
        renderer.start({ sessionId: 'sess-1', sourceId: 'screen:0:0' })
      ).rejects.toThrow('disk full');
    });

    it('should stop tracks if IPC start fails', async () => {
      const mockStream = new MockMediaStream();
      vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce(
        mockStream as unknown as MediaStream
      );
      mockScreenRecordingIPC.start.mockResolvedValueOnce({ success: false, error: 'fail' });

      await expect(renderer.start({ sessionId: 'sess-1', sourceId: 'screen:0:0' })).rejects.toThrow();

      expect(mockStream.getTracks()[0].stop).toHaveBeenCalled();
    });

    it('should fall back to basic constraints if high-quality fails', async () => {
      let callCount = 0;
      vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('OverconstrainedError'));
        }
        return Promise.resolve(new MockMediaStream() as unknown as MediaStream);
      });

      await renderer.start({ sessionId: 'sess-1', sourceId: 'screen:0:0' });

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
      expect(renderer.isRecording()).toBe(true);
    });
  });

  // ========================================================================
  // Chunk streaming
  // ========================================================================

  describe('chunk streaming', () => {
    it('should send chunks to IPC when data is available', async () => {
      await renderer.start({ sessionId: 'sess-1', sourceId: 'screen:0:0' });

      // Simulate a data chunk from MediaRecorder
      const blob = new Blob(['test-data'], { type: 'video/webm' });
      mockRecorderInstance.ondataavailable?.({ data: blob });

      // Wait for async processing
      await new Promise((r) => setTimeout(r, 10));

      expect(mockScreenRecordingIPC.appendChunk).toHaveBeenCalledWith(
        'sess-1',
        expect.any(Uint8Array)
      );
    });

    it('should ignore empty chunks', async () => {
      await renderer.start({ sessionId: 'sess-1', sourceId: 'screen:0:0' });

      const emptyBlob = new Blob([], { type: 'video/webm' });
      mockRecorderInstance.ondataavailable?.({ data: emptyBlob });

      await new Promise((r) => setTimeout(r, 10));

      expect(mockScreenRecordingIPC.appendChunk).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Stop recording
  // ========================================================================

  describe('stop', () => {
    it('immediately releases the compositor and both capture streams', async () => {
      await renderer.start({ sessionId: 'sess-1', target: screenTarget });

      renderer.releaseCaptureTracks();

      expect(compositor.stop).toHaveBeenCalledOnce();
      expect(rawStream.getTracks()[0].stop).toHaveBeenCalled();
      expect(composedStream.getTracks()[0].stop).toHaveBeenCalled();
    });

    it('should return success immediately if not recording', async () => {
      const result = await renderer.stop();

      expect(result).toEqual({ success: true });
    });

    it('should call IPC stop with sessionId', async () => {
      await renderer.start({ sessionId: 'sess-1', sourceId: 'screen:0:0' });
      await renderer.stop();

      expect(mockScreenRecordingIPC.stop).toHaveBeenCalledWith('sess-1');
    });

    it('should reset state after stop', async () => {
      await renderer.start({ sessionId: 'sess-1', sourceId: 'screen:0:0' });
      await renderer.stop();

      expect(renderer.isRecording()).toBe(false);
      expect(renderer.getSessionId()).toBeNull();
    });

    it('should stop media stream tracks on stop', async () => {
      const mockStream = new MockMediaStream();
      vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce(
        mockStream as unknown as MediaStream
      );

      await renderer.start({ sessionId: 'sess-1', sourceId: 'screen:0:0' });
      await renderer.stop();

      expect(mockStream.getTracks()[0].stop).toHaveBeenCalled();
    });

    it('should return IPC stop result', async () => {
      const expected = { success: true, path: '/tmp/rec.webm', bytes: 2048, mimeType: 'video/webm' };
      mockScreenRecordingIPC.stop.mockResolvedValueOnce(expected);

      await renderer.start({ sessionId: 'sess-1', sourceId: 'screen:0:0' });
      const result = await renderer.stop();

      expect(result).toEqual(expected);
    });

    it('should request a final recorder data flush before stop', async () => {
      await renderer.start({ sessionId: 'sess-1', sourceId: 'screen:0:0' });
      await renderer.stop();

      expect(mockRecorderInstance.requestData).toHaveBeenCalled();
    });

    it('should still stop tracks if IPC finalize fails', async () => {
      const mockStream = new MockMediaStream();
      vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce(
        mockStream as unknown as MediaStream
      );
      mockScreenRecordingIPC.stop.mockRejectedValueOnce(new Error('ipc stop failed'));

      await renderer.start({ sessionId: 'sess-1', sourceId: 'screen:0:0' });
      const result = await renderer.stop();

      expect(result.success).toBe(false);
      expect(mockStream.getTracks()[0].stop).toHaveBeenCalled();
    });

    it('should no-op on double stop', async () => {
      await renderer.start({ sessionId: 'sess-1', sourceId: 'screen:0:0' });
      await renderer.stop();

      vi.clearAllMocks();

      const result = await renderer.stop();

      expect(result).toEqual({ success: true });
      expect(mockScreenRecordingIPC.stop).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // MIME type selection
  // ========================================================================

  describe('MIME type selection', () => {
    it('should use first supported MIME type', async () => {
      MockMediaRecorder.isTypeSupported.mockImplementation(
        (type: string) => type === 'video/webm;codecs=vp9'
      );

      await renderer.start({ sessionId: 'sess-1', sourceId: 'screen:0:0' });

      expect(mockScreenRecordingIPC.start).toHaveBeenCalledWith('sess-1', 'video/webm;codecs=vp9', expect.any(Number));
    });

    it('should fall back to video/webm when no codecs supported', async () => {
      MockMediaRecorder.isTypeSupported.mockReturnValue(false);

      await renderer.start({ sessionId: 'sess-1', sourceId: 'screen:0:0' });

      expect(mockScreenRecordingIPC.start).toHaveBeenCalledWith('sess-1', 'video/webm', expect.any(Number));
    });
  });
});
