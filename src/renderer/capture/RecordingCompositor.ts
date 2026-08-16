import {
  MAX_MARKED_SCREENSHOT_BYTES,
  type AnnotationEvent,
  type CaptureBounds,
  type CaptureTarget,
} from '../../shared/types';
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

function cloneScene(scene: AnnotationScene): AnnotationScene {
  const cloneStroke = (stroke: NonNullable<AnnotationScene['activeStroke']>) => ({
    ...stroke,
    points: stroke.points.map((point) => ({ ...point })),
  });
  return {
    completedStrokes: scene.completedStrokes.map(cloneStroke),
    activeStroke: scene.activeStroke ? cloneStroke(scene.activeStroke) : null,
    cursor: scene.cursor ? { ...scene.cursor } : null,
  };
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
  private frameWaiters = new Set<{
    resolve: () => void;
    reject: (error: Error) => void;
  }>();

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

  async capturePng(): Promise<Uint8Array> {
    const canvas = this.canvas;
    if (!this.running || !canvas) {
      throw new Error('Recording compositor is not active.');
    }

    const requestedScene = cloneScene(this.scene);
    await this.afterNextRenderedFrame();
    if (!this.running || this.canvas !== canvas) {
      throw new Error('Recording compositor stopped before marked screenshot capture.');
    }
    if (typeof canvas.toBlob !== 'function') {
      throw new Error('Canvas PNG encoding is unavailable.');
    }
    if (!this.renderScene(requestedScene)) {
      throw new Error('Recording compositor could not render the marked screenshot.');
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      try {
        canvas.toBlob((encoded) => {
          if (encoded) resolve(encoded);
          else reject(new Error('Failed to encode the marked screenshot as PNG.'));
        }, 'image/png');
      } catch (error) {
        reject(error instanceof Error
          ? error
          : new Error('Failed to encode the marked screenshot as PNG.'));
      }
    });
    if (blob.size > MAX_MARKED_SCREENSHOT_BYTES) {
      throw new Error('Marked screenshot exceeds the size limit.');
    }
    return new Uint8Array(await blob.arrayBuffer());
  }

  renderFrame(): void {
    if (this.renderScene(this.scene)) this.resolveFrameWaiters();
  }

  private renderScene(scene: AnnotationScene): boolean {
    const { video, canvas, context, target } = this;
    if (!video || !canvas || !context || !target || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return false;
    }
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
    drawAnnotationScene(context, scene, {
      width: destination.width,
      height: destination.height,
    });
    context.restore();
    return true;
  }

  stop(): void {
    this.running = false;
    this.rejectFrameWaiters(new Error('Recording compositor stopped before marked screenshot capture.'));
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

  private afterNextRenderedFrame(): Promise<void> {
    if (!this.running) {
      return Promise.reject(new Error('Recording compositor is not active.'));
    }
    return new Promise((resolve, reject) => {
      this.frameWaiters.add({ resolve, reject });
      this.scheduleNextFrame();
    });
  }

  private resolveFrameWaiters(): void {
    const waiters = [...this.frameWaiters];
    this.frameWaiters.clear();
    waiters.forEach(({ resolve }) => resolve());
  }

  private rejectFrameWaiters(error: Error): void {
    const waiters = [...this.frameWaiters];
    this.frameWaiters.clear();
    waiters.forEach(({ reject }) => reject(error));
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
