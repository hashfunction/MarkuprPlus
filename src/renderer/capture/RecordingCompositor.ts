import type { AnnotationEvent, CaptureBounds, CaptureTarget } from '../../shared/types';
import { containRect, regionToSourceCrop } from '../../shared/captureGeometry';
import {
  createAnnotationScene,
  drawAnnotationScene,
  reduceAnnotationEvent,
  type AnnotationScene,
} from './annotationScene';

interface RecordingCompositorDependencies {
  createVideo: () => HTMLVideoElement;
  createCanvas: () => HTMLCanvasElement;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (id: number) => void;
  setTimeout: (callback: () => void, milliseconds: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

function defaultDependencies(): RecordingCompositorDependencies {
  return {
    createVideo: () => document.createElement('video'),
    createCanvas: () => document.createElement('canvas'),
    requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
    cancelAnimationFrame: (id) => window.cancelAnimationFrame(id),
    setTimeout: (callback, milliseconds) => window.setTimeout(callback, milliseconds),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
  };
}

function stopTracks(stream: MediaStream | null): void {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      try { track.stop(); } catch { /* best effort */ }
    });
  } catch {
    // Best effort during partial initialization.
  }
}

export class RecordingCompositor {
  private readonly dependencies: RecordingCompositorDependencies;
  private sourceStream: MediaStream | null = null;
  private outputStream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private target: CaptureTarget | null = null;
  private scene: AnnotationScene = createAnnotationScene();
  private animationFrame: number | null = null;
  private running = false;

  constructor(dependencies: RecordingCompositorDependencies = defaultDependencies()) {
    this.dependencies = dependencies;
  }

  async start(sourceStream: MediaStream, target: CaptureTarget): Promise<MediaStream> {
    this.stop();
    this.sourceStream = sourceStream;
    this.target = target;
    this.scene = createAnnotationScene();
    const video = this.dependencies.createVideo();
    const canvas = this.dependencies.createCanvas();
    this.video = video;
    this.canvas = canvas;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = sourceStream;

    try {
      // Detached capture videos do not reliably honor `autoplay` on every
      // Electron/macOS combination. Explicitly starting playback first lets
      // the desktop track begin producing metadata and frames.
      await Promise.all([video.play(), this.waitForMetadata(video)]);
      const initialCrop = regionToSourceCrop(target, {
        width: video.videoWidth,
        height: video.videoHeight,
      });
      canvas.width = Math.max(1, Math.round(initialCrop.width));
      canvas.height = Math.max(1, Math.round(initialCrop.height));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Canvas 2D is unavailable for recording composition.');
      if (typeof canvas.captureStream !== 'function') {
        throw new Error('Canvas captureStream is unavailable for recording composition.');
      }
      this.context = context;
      this.outputStream = canvas.captureStream(30);
      this.running = true;
      this.renderFrame();
      this.scheduleNextFrame();
      return this.outputStream;
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  getOutputStream(): MediaStream | null {
    return this.outputStream;
  }

  applyAnnotationEvent(event: AnnotationEvent): void {
    this.scene = reduceAnnotationEvent(this.scene, event);
  }

  renderFrame(): void {
    const { video, canvas, context, target } = this;
    if (!video || !canvas || !context || !target || video.videoWidth <= 0 || video.videoHeight <= 0) return;
    const crop: CaptureBounds = regionToSourceCrop(target, {
      width: video.videoWidth,
      height: video.videoHeight,
    });
    const destination = containRect(
      { width: crop.width, height: crop.height },
      { width: canvas.width, height: canvas.height },
    );
    context.save();
    context.fillStyle = '#000000';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
    context.drawImage(
      video,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      destination.x,
      destination.y,
      destination.width,
      destination.height,
    );
    context.save();
    context.translate(destination.x, destination.y);
    drawAnnotationScene(context, this.scene, {
      width: destination.width,
      height: destination.height,
    });
    context.restore();
  }

  stop(): void {
    this.running = false;
    if (this.animationFrame !== null) {
      this.dependencies.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    try { this.video?.pause(); } catch { /* best effort */ }
    if (this.video) this.video.srcObject = null;
    stopTracks(this.outputStream);
    stopTracks(this.sourceStream);
    this.outputStream = null;
    this.sourceStream = null;
    this.video = null;
    this.canvas = null;
    this.context = null;
    this.target = null;
    this.scene = createAnnotationScene();
  }

  private scheduleNextFrame(): void {
    if (!this.running || this.animationFrame !== null) return;
    this.animationFrame = this.dependencies.requestAnimationFrame(() => {
      this.animationFrame = null;
      if (!this.running) return;
      this.renderFrame();
      this.scheduleNextFrame();
    });
  }

  private waitForMetadata(video: HTMLVideoElement): Promise<void> {
    if (video.readyState >= 1 && video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeoutRef: { current?: unknown } = {};
      const cleanup = () => {
        this.dependencies.clearTimeout(timeoutRef.current);
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('error', onError);
      };
      const onLoaded = () => {
        cleanup();
        if (video.videoWidth <= 0 || video.videoHeight <= 0) {
          reject(new Error('The selected capture source has no video dimensions.'));
          return;
        }
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('The selected capture source could not be loaded.'));
      };
      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('error', onError);
      timeoutRef.current = this.dependencies.setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for the selected capture source.'));
      }, 4_000);
    });
  }
}

export default RecordingCompositor;
