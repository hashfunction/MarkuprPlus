import { describe, expect, it, vi } from 'vitest';
import type { CaptureTarget } from '../../src/shared/types';
import { RecordingCompositor } from '../../src/renderer/capture/RecordingCompositor';

function streamFixture() {
  const track = { stop: vi.fn(), readyState: 'live' };
  return {
    stream: { getTracks: () => [track] } as unknown as MediaStream,
    track,
  };
}

function createHarness(options: {
  context?: CanvasRenderingContext2D | null;
  metadataInitiallyReady?: boolean;
  encodedPng?: Blob | null;
} = {}) {
  const operations: unknown[][] = [];
  const context = options.context === undefined ? {
    clearRect: (...args: unknown[]) => operations.push(['clearRect', ...args]),
    fillRect: (...args: unknown[]) => operations.push(['fillRect', ...args]),
    drawImage: (...args: unknown[]) => operations.push(['drawImage', ...args]),
    save: () => operations.push(['save']),
    restore: () => operations.push(['restore']),
    beginPath: () => operations.push(['beginPath']),
    moveTo: (...args: unknown[]) => operations.push(['moveTo', ...args]),
    lineTo: (...args: unknown[]) => operations.push(['lineTo', ...args]),
    translate: (...args: unknown[]) => operations.push(['translate', ...args]),
    stroke: () => operations.push(['stroke']),
    arc: (...args: unknown[]) => operations.push(['arc', ...args]),
    ellipse: (...args: unknown[]) => operations.push(['ellipse', ...args]),
    fill: () => operations.push(['fill']),
    set fillStyle(value: string) { operations.push(['fillStyle', value]); },
    set strokeStyle(value: string) { operations.push(['strokeStyle', value]); },
    set lineWidth(value: number) { operations.push(['lineWidth', value]); },
    set lineCap(value: string) { operations.push(['lineCap', value]); },
    set lineJoin(value: string) { operations.push(['lineJoin', value]); },
    set globalAlpha(value: number) { operations.push(['globalAlpha', value]); },
  } as unknown as CanvasRenderingContext2D : options.context;
  const output = streamFixture();
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    captureStream: vi.fn(() => output.stream),
    toBlob: vi.fn((callback: BlobCallback) => {
      callback(options.encodedPng === undefined
        ? new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' })
        : options.encodedPng);
    }),
  } as unknown as HTMLCanvasElement;
  const metadataInitiallyReady = options.metadataInitiallyReady !== false;
  let video: HTMLVideoElement;
  video = {
    videoWidth: metadataInitiallyReady ? 200 : 0,
    videoHeight: metadataInitiallyReady ? 200 : 0,
    readyState: metadataInitiallyReady ? 1 : 0,
    muted: false,
    autoplay: false,
    playsInline: false,
    srcObject: null,
    play: vi.fn(() => {
      operations.push(['play']);
      if (!metadataInitiallyReady) {
        Object.assign(video, { videoWidth: 200, videoHeight: 200, readyState: 1 });
      }
      return Promise.resolve();
    }),
    pause: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLVideoElement;
  const scheduled = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;
  const compositor = new RecordingCompositor({
    createVideo: () => video,
    createCanvas: () => canvas,
    requestAnimationFrame: (callback) => {
      const id = nextFrame++;
      scheduled.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id) => { scheduled.delete(id); },
    setTimeout: (callback) => { callback(); return 1; },
    clearTimeout: vi.fn(),
  });
  return { compositor, canvas, video, context, output, operations, scheduled };
}

const regionTarget: CaptureTarget = {
  kind: 'region',
  sourceId: 'screen:0:0',
  sourceName: 'Selected Region',
  displayId: '1',
  displayBounds: { x: 0, y: 0, width: 100, height: 100 },
  scaleFactor: 2,
  region: { x: 10, y: 20, width: 30, height: 40 },
};

describe('RecordingCompositor', () => {
  it('captures PNG bytes only after the next frame contains final annotation events', async () => {
    const source = streamFixture();
    const { compositor, canvas, operations, scheduled } = createHarness();
    await compositor.start(source.stream, regionTarget);
    compositor.applyAnnotationEvent({
      type: 'stroke-start', sessionId: 'session-1',
      stroke: {
        id: 'marked', tool: 'circle', color: '#ffcc00', width: 0.007,
        points: [{ x: 0.1, y: 0.1 }],
      },
    });
    compositor.applyAnnotationEvent({
      type: 'stroke-points', sessionId: 'session-1', strokeId: 'marked',
      points: [{ x: 0.8, y: 0.8 }],
    });
    compositor.applyAnnotationEvent({
      type: 'stroke-end', sessionId: 'session-1', strokeId: 'marked',
    });

    const capture = compositor.capturePng();
    expect(canvas.toBlob).not.toHaveBeenCalled();
    const [frameId, frame] = [...scheduled.entries()][0];
    scheduled.delete(frameId);
    frame(16);

    await expect(capture).resolves.toEqual(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    const yellowStroke = operations.findIndex((operation) =>
      operation[0] === 'strokeStyle' && operation[1] === '#ffcc00');
    expect(yellowStroke).toBeGreaterThan(-1);
  });

  it('freezes the requested annotation scene even if a rapid navigation click clears live marks', async () => {
    const source = streamFixture();
    const { compositor, operations, scheduled } = createHarness();
    await compositor.start(source.stream, regionTarget);
    operations.splice(0);
    compositor.applyAnnotationEvent({
      type: 'stroke-start', sessionId: 'session-1',
      stroke: {
        id: 'frozen', tool: 'freehand', color: '#34c759', width: 0.008,
        points: [{ x: 0.1, y: 0.1 }],
      },
    });
    compositor.applyAnnotationEvent({
      type: 'stroke-points', sessionId: 'session-1', strokeId: 'frozen',
      points: [{ x: 0.9, y: 0.9 }],
    });
    compositor.applyAnnotationEvent({
      type: 'stroke-end', sessionId: 'session-1', strokeId: 'frozen',
    });

    const capture = compositor.capturePng();
    compositor.applyAnnotationEvent({ type: 'clear', sessionId: 'session-1' });
    const [frameId, frame] = [...scheduled.entries()][0];
    scheduled.delete(frameId);
    frame(16);
    await capture;

    expect(operations).toContainEqual(['strokeStyle', '#34c759']);
  });

  it('rejects capture when PNG encoding fails or exceeds the bounded size', async () => {
    const failed = createHarness({ encodedPng: null });
    const failedSource = streamFixture();
    await failed.compositor.start(failedSource.stream, regionTarget);
    const failedCapture = failed.compositor.capturePng();
    const [failedId, failedFrame] = [...failed.scheduled.entries()][0];
    failed.scheduled.delete(failedId);
    failedFrame(16);
    await expect(failedCapture).rejects.toThrow('encode');

    const oversized = createHarness({
      encodedPng: new Blob([new Uint8Array(15 * 1024 * 1024 + 1)], { type: 'image/png' }),
    });
    const oversizedSource = streamFixture();
    await oversized.compositor.start(oversizedSource.stream, regionTarget);
    const oversizedCapture = oversized.compositor.capturePng();
    const [oversizedId, oversizedFrame] = [...oversized.scheduled.entries()][0];
    oversized.scheduled.delete(oversizedId);
    oversizedFrame(16);
    await expect(oversizedCapture).rejects.toThrow('size limit');
  });

  it('rejects capture before start and if stop wins during the render barrier', async () => {
    const source = streamFixture();
    const { compositor } = createHarness();
    await expect(compositor.capturePng()).rejects.toThrow('not active');

    await compositor.start(source.stream, regionTarget);
    const capture = compositor.capturePng();
    compositor.stop();

    await expect(capture).rejects.toThrow('stopped');
  });

  it('starts detached video playback before waiting for capture metadata', async () => {
    const source = streamFixture();
    const { compositor, video } = createHarness({ metadataInitiallyReady: false });

    await expect(compositor.start(source.stream, regionTarget)).resolves.toBeDefined();
    expect(video.play).toHaveBeenCalledOnce();
  });

  it('crops a display region in source pixels and captures a stable 30 fps canvas stream', async () => {
    const source = streamFixture();
    const { compositor, canvas, video, operations } = createHarness();

    const output = await compositor.start(source.stream, regionTarget);

    expect(canvas.width).toBe(60);
    expect(canvas.height).toBe(80);
    expect(canvas.captureStream).toHaveBeenCalledWith(30);
    expect(output).toBe(compositor.getOutputStream());
    expect(operations.find((operation) => operation[0] === 'drawImage')).toEqual([
      'drawImage', video, 20, 40, 60, 80, 0, 0, 60, 80,
    ]);
  });

  it('draws source video before annotations and the marker halo', async () => {
    const source = streamFixture();
    const { compositor, operations } = createHarness();
    await compositor.start(source.stream, regionTarget);
    compositor.applyAnnotationEvent({
      type: 'stroke-start', sessionId: 'session-1',
      stroke: { id: 'one', tool: 'freehand', color: '#34c759', width: 0.01, points: [{ x: 0.1, y: 0.1 }] },
    });
    compositor.applyAnnotationEvent({
      type: 'stroke-points', sessionId: 'session-1', strokeId: 'one', points: [{ x: 0.9, y: 0.9 }],
    });
    compositor.applyAnnotationEvent({ type: 'stroke-end', sessionId: 'session-1', strokeId: 'one' });
    compositor.applyAnnotationEvent({ type: 'cursor', sessionId: 'session-1', point: { x: 0.5, y: 0.5 } });

    compositor.renderFrame();

    const lastDrawImage = operations.map((operation) => operation[0]).lastIndexOf('drawImage');
    const greenStroke = operations.findIndex((operation) => operation[0] === 'strokeStyle' && operation[1] === '#34c759');
    const markerStroke = operations.findIndex((operation) => operation[0] === 'strokeStyle' && operation[1] === '#ff3b30');
    expect(lastDrawImage).toBeLessThan(greenStroke);
    expect(greenStroke).toBeLessThan(markerStroke);
  });

  it('contains a resized window source without cropping and keeps initial output dimensions', async () => {
    const source = streamFixture();
    const { compositor, canvas, video, operations } = createHarness();
    const target: CaptureTarget = {
      kind: 'window', sourceId: 'window:20:0', sourceName: 'Editor', nativeWindowId: '20', appName: 'Editor',
      bounds: { x: 10, y: 10, width: 200, height: 200 },
    };
    await compositor.start(source.stream, target);
    video.videoWidth = 200;
    video.videoHeight = 100;

    compositor.renderFrame();

    expect({ width: canvas.width, height: canvas.height }).toEqual({ width: 200, height: 200 });
    expect(operations.map((operation) => operation.slice(0, 2))).toContainEqual(['drawImage', video]);
    const draw = operations.filter((operation) => operation[0] === 'drawImage').at(-1);
    expect(draw?.slice(-4)).toEqual([0, 50, 200, 100]);
  });

  it('maps annotations into the contained video rectangle after a window aspect-ratio change', async () => {
    const source = streamFixture();
    const { compositor, video, operations } = createHarness();
    const target: CaptureTarget = {
      kind: 'window', sourceId: 'window:20:0', sourceName: 'Editor', nativeWindowId: '20', appName: 'Editor',
      bounds: { x: 10, y: 10, width: 200, height: 200 },
    };
    await compositor.start(source.stream, target);
    video.videoWidth = 200;
    video.videoHeight = 100;
    compositor.applyAnnotationEvent({
      type: 'cursor', sessionId: 'session-1', point: { x: 0.5, y: 0.5 },
    });

    compositor.renderFrame();

    const lastTranslate = operations.filter((operation) => operation[0] === 'translate').at(-1);
    expect(lastTranslate).toEqual(['translate', 0, 50]);
    const lastMarker = operations.filter((operation) => operation[0] === 'arc').at(-2);
    expect(lastMarker?.slice(1, 3)).toEqual([100, 50]);
  });

  it('releases both source and composed tracks on stop', async () => {
    const source = streamFixture();
    const { compositor, output, scheduled } = createHarness();
    await compositor.start(source.stream, regionTarget);

    compositor.stop();

    expect(source.track.stop).toHaveBeenCalledOnce();
    expect(output.track.stop).toHaveBeenCalledOnce();
    expect(scheduled.size).toBe(0);
  });

  it('fails closed and releases the source when Canvas 2D is unavailable', async () => {
    const source = streamFixture();
    const { compositor } = createHarness({ context: null });

    await expect(compositor.start(source.stream, regionTarget)).rejects.toThrow('Canvas 2D');
    expect(source.track.stop).toHaveBeenCalledOnce();
  });
});
