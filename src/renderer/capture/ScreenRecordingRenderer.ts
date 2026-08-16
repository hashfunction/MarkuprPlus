/**
 * ScreenRecordingRenderer - Renderer-side full session screen recorder.
 *
 * Captures the selected desktop source continuously with MediaRecorder and
 * streams chunks to the main process for durable file writing.
 */

import type { AnnotationEvent, CaptureTarget } from '../../shared/types';
import RecordingCompositor from './RecordingCompositor';

interface TargetStartOptions {
  sessionId: string;
  target: CaptureTarget;
  sourceId?: never;
}

interface LegacyStartOptions {
  sessionId: string;
  sourceId: string;
  target?: never;
}

type StartOptions = TargetStartOptions | LegacyStartOptions;

export interface RecordingCompositorLike {
  start(sourceStream: MediaStream, target: CaptureTarget): Promise<MediaStream>;
  applyAnnotationEvent(event: AnnotationEvent): void;
  capturePng(): Promise<Uint8Array>;
  stop(): void;
}

type RecordingCompositorFactory = () => RecordingCompositorLike;
type FatalErrorHandler = (message: string) => void;

interface StopResult {
  success: boolean;
  path?: string;
  bytes?: number;
  mimeType?: string;
  error?: string;
}

interface DesktopVideoConstraints extends MediaTrackConstraints {
  cursor?: 'never';
  mandatory?: {
    chromeMediaSource: 'desktop';
    chromeMediaSourceId: string;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    maxFrameRate?: number;
  };
}

const MIME_TYPE_CANDIDATES = [
  'video/webm;codecs=vp8',
  'video/webm;codecs=vp9',
  'video/webm',
] as const;

function chooseMimeType(): string {
  for (const candidate of MIME_TYPE_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return 'video/webm';
}

export class ScreenRecordingRenderer {
  private readonly createCompositor: RecordingCompositorFactory;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private compositor: RecordingCompositorLike | null = null;
  private annotationUnsubscribe: (() => void) | null = null;
  private selectedSourceTrack: MediaStreamTrack | null = null;
  private activeSessionId: string | null = null;
  private inFlightWrites: Set<Promise<void>> = new Set();
  private snapshotWrites: Set<Promise<void>> = new Set();
  private snapshotWritesByRevision = new Map<number, Promise<void>>();
  private snapshotRevisions = new Set<number>();
  private startPromise: Promise<void> | null = null;
  private stopping = false;
  private stopPromise: Promise<StopResult> | null = null;
  private recordingStartTime: number | null = null;
  private activeSourceName: string | null = null;
  private fatalErrorHandler: FatalErrorHandler | null = null;
  private fatalStopInProgress = false;

  constructor(createCompositor: RecordingCompositorFactory = () => new RecordingCompositor()) {
    this.createCompositor = createCompositor;
  }

  private stopTracks(stream: MediaStream | null | undefined): void {
    if (!stream) {
      return;
    }
    try {
      stream.getTracks().forEach((track) => {
        try {
          track.enabled = false;
          track.stop();
        } catch {
          // Best effort.
        }
      });
    } catch {
      // Best effort.
    }
  }

  private hasLiveTrack(stream: MediaStream | null | undefined): boolean {
    if (!stream) {
      return false;
    }
    return stream.getTracks().some((track) => track.readyState === 'live');
  }

  private getDesktopConstraints(
    sourceId: string,
    highQuality: boolean
  ): MediaStreamConstraints {
    if (highQuality) {
      return {
        audio: false,
        video: {
          cursor: 'never',
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            minWidth: 1280,
            minHeight: 720,
            maxWidth: 3840,
            maxHeight: 2160,
            maxFrameRate: 30,
          },
        } as DesktopVideoConstraints,
      };
    }

    return {
      audio: false,
      video: {
        cursor: 'never',
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
        },
      } as DesktopVideoConstraints,
    };
  }

  private async acquireAndComposeExactSource(
    sourceId: string,
    target: CaptureTarget,
  ): Promise<MediaStream> {
    for (const highQuality of [true, false]) {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(
          this.getDesktopConstraints(sourceId, highQuality)
        );
      } catch (error) {
        if (highQuality) {
          console.warn(
            `[ScreenRecordingRenderer] High-quality capture failed for ${sourceId}, retrying exact-source fallback:`,
            error
          );
          continue;
        }
        console.warn(`[ScreenRecordingRenderer] Exact-source fallback failed for ${sourceId}:`, error);
        const message = error instanceof Error
          ? error.message
          : 'Unable to acquire the selected desktop capture stream.';
        throw new Error(message);
      }

      this.mediaStream = stream;
      const compositor = this.createCompositor();
      this.compositor = compositor;
      try {
        const composedStream = await compositor.start(stream, target);
        this.watchSelectedSource(stream);
        return composedStream;
      } catch (error) {
        this.cleanupStream();
        if (highQuality) {
          console.warn(
            `[ScreenRecordingRenderer] High-quality stream for ${sourceId} did not become frame-ready, retrying exact-source fallback:`,
            error
          );
          continue;
        }
        throw error;
      }
    }

    throw new Error('Unable to acquire the selected desktop capture stream.');
  }

  private resolveTarget(options: StartOptions): CaptureTarget {
    if ('target' in options && options.target) return options.target;
    const sourceId = options.sourceId;
    if (sourceId.startsWith('screen:')) {
      return {
        kind: 'screen',
        sourceId,
        sourceName: 'Selected display',
        displayId: sourceId.split(':')[1] || '0',
        displayBounds: { x: 0, y: 0, width: 1, height: 1 },
        scaleFactor: 1,
      };
    }
    return {
      kind: 'window',
      sourceId,
      sourceName: 'Selected window',
      nativeWindowId: sourceId.split(':')[1] || sourceId,
      appName: 'Selected application',
      bounds: { x: 0, y: 0, width: 1, height: 1 },
      geometryAvailable: false,
    };
  }

  isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state !== 'inactive';
  }

  isPaused(): boolean {
    return this.mediaRecorder?.state === 'paused';
  }

  getSessionId(): string | null {
    return this.activeSessionId;
  }

  getRecordingStartTime(): number | null {
    return this.recordingStartTime;
  }

  async waitForMarkedSnapshot(revision: number, timeoutMs = 2_500): Promise<boolean> {
    if (!Number.isSafeInteger(revision) || revision <= 0) return false;
    const deadline = Date.now() + Math.max(0, Math.min(timeoutMs, 5_000));
    while (Date.now() <= deadline) {
      const write = this.snapshotWritesByRevision.get(revision);
      if (write) {
        await write;
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return false;
  }

  setFatalErrorHandler(handler: FatalErrorHandler | null): void {
    this.fatalErrorHandler = handler;
  }

  async start(options: StartOptions): Promise<void> {
    if (this.startPromise) {
      return this.startPromise;
    }

    const startTask = (async () => {
      if (this.stopPromise) {
        await this.stopPromise.catch(() => {
          // Best effort; continuing to start allows a clean retry path.
        });
      }

      if (this.isRecording()) {
        return;
      }
      this.forceReleaseOrphanedCapture();

      const target = this.resolveTarget(options);
      const mimeType = chooseMimeType();
      const composedStream = await this.acquireAndComposeExactSource(target.sourceId, target);

      const recordingStartTime = Date.now();
      const startResult = await window.markuprx.screenRecording.start(
        options.sessionId,
        mimeType,
        recordingStartTime
      );
      if (!startResult.success) {
        this.cleanupStream();
        throw new Error(startResult.error || 'Unable to start screen recording persistence.');
      }

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(composedStream, { mimeType, videoBitsPerSecond: 5_000_000 });
      } catch (error) {
        // MediaRecorder construction failed — clean up the main-process artifact and stream.
        this.cleanupStream();
        await window.markuprx.screenRecording.stop(options.sessionId).catch(() => {});
        throw error;
      }

      recorder.ondataavailable = (event: BlobEvent) => {
        if (!event.data || event.data.size === 0 || !this.activeSessionId) {
          return;
        }

        const sessionId = this.activeSessionId;
        const writePromise = event.data
          .arrayBuffer()
          .then((buffer) =>
            window.markuprx.screenRecording.appendChunk(sessionId, new Uint8Array(buffer))
          )
          .then((result) => {
            if (!result.success) {
              throw new Error(result.error || 'Failed to append recording chunk.');
            }
          })
          .catch((error) => {
            console.error('[ScreenRecordingRenderer] Chunk write failed:', error);
          })
          .finally(() => {
            this.inFlightWrites.delete(writePromise);
          });

        this.inFlightWrites.add(writePromise);
      };
      recorder.onerror = (event) => {
        const recorderError = (event as Event & { error?: Error }).error;
        const reason = recorderError?.message || 'The video encoder stopped unexpectedly.';
        this.handleFatalCaptureEnd(reason);
      };

      this.mediaRecorder = recorder;
      this.activeSessionId = options.sessionId;
      this.activeSourceName = target.sourceName;
      this.stopping = false;
      this.recordingStartTime = recordingStartTime;
      this.snapshotRevisions.clear();
      this.snapshotWritesByRevision.clear();
      this.fatalStopInProgress = false;
      this.annotationUnsubscribe = window.markuprx.capture?.onAnnotationEvent?.((event) => {
        if (event.sessionId !== this.activeSessionId) return;
        if (event.type === 'snapshot-request') {
          this.captureMarkedSnapshot(event);
          return;
        }
        this.compositor?.applyAnnotationEvent(event);
      }) || null;

      // Emit chunks every second for near-real-time persistence.
      try {
        recorder.start(1000);
      } catch (error) {
        // recorder.start() failed — clean up everything.
        this.cleanupStream();
        this.mediaRecorder = null;
        this.activeSessionId = null;
        this.activeSourceName = null;
        this.recordingStartTime = null;
        await window.markuprx.screenRecording.stop(options.sessionId).catch(() => {});
        throw error;
      }
    })();

    this.startPromise = startTask.finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  async stop(): Promise<StopResult> {
    if (this.stopPromise) {
      return this.stopPromise;
    }

    if (this.startPromise) {
      await this.startPromise.catch(() => {
        // If start failed, stop should still continue to clean up any residual state.
      });
    }

    if (this.stopping) {
      return { success: true };
    }

    if (!this.mediaRecorder || !this.activeSessionId) {
      // Defensive cleanup for partially-initialized recorder state.
      this.cleanupStream();
      this.mediaRecorder = null;
      this.activeSessionId = null;
      this.activeSourceName = null;
      this.stopping = false;
      this.recordingStartTime = null;
      this.snapshotWritesByRevision.clear();
      return { success: true };
    }

    const stopTask = (async (): Promise<StopResult> => {
      this.stopping = true;
      const sessionId = this.activeSessionId;
      const recorder = this.mediaRecorder;
      let result: StopResult = { success: true };

      if (!recorder || !sessionId) {
        this.cleanupStream();
        this.mediaRecorder = null;
        this.activeSessionId = null;
        this.activeSourceName = null;
        this.recordingStartTime = null;
        this.stopping = false;
        return result;
      }

      try {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 4000);
          recorder.onstop = () => {
            clearTimeout(timeout);
            resolve();
          };
          try {
            if (recorder.state === 'recording') {
              try {
                recorder.requestData();
              } catch {
                // Best effort.
              }
            }
            recorder.stop();
          } catch {
            clearTimeout(timeout);
            resolve();
          }
        });

        recorder.ondataavailable = null;
        recorder.onerror = null;
        recorder.onstop = null;
        this.stopTracks(recorder.stream);

        await Promise.allSettled(Array.from(this.snapshotWrites));
        this.snapshotWrites.clear();

        // Release screen-capture tracks immediately so macOS indicator turns off
        // even if persistence finalization takes longer than expected.
        this.cleanupStream();
        this.mediaRecorder = null;
        this.activeSessionId = null;
        this.activeSourceName = null;
        this.recordingStartTime = null;

        await Promise.allSettled(Array.from(this.inFlightWrites));
        this.inFlightWrites.clear();

        try {
          const finalized = await Promise.race([
            window.markuprx.screenRecording.stop(sessionId),
            new Promise<StopResult>((resolve) => {
              setTimeout(
                () =>
                  resolve({
                    success: false,
                    error: 'Timed out while finalizing screen recording persistence.',
                  }),
                7000
              );
            }),
          ]);
          result = finalized;
        } catch (error) {
          result = {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to finalize screen recording.',
          };
        }
      } finally {
        // Defensive cleanup for any partial/failed stop paths.
        this.cleanupStream();
        this.mediaRecorder = null;
        this.activeSessionId = null;
        this.activeSourceName = null;
        this.stopping = false;
        this.recordingStartTime = null;
        this.snapshotRevisions.clear();
        this.snapshotWritesByRevision.clear();
      }

      return result;
    })();

    this.stopPromise = stopTask.finally(() => {
      this.stopPromise = null;
    });
    return this.stopPromise;
  }

  async pause(): Promise<void> {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
      return;
    }

    try {
      this.mediaRecorder.pause();
    } catch (error) {
      console.warn('[ScreenRecordingRenderer] Failed to pause recording:', error);
    }
  }

  async resume(): Promise<void> {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'paused') {
      return;
    }

    try {
      this.mediaRecorder.resume();
    } catch (error) {
      console.warn('[ScreenRecordingRenderer] Failed to resume recording:', error);
    }
  }

  /**
   * Immediately release all capture tracks to clear the macOS recording indicator.
   * This is a fast operation that does not wait for MediaRecorder finalization,
   * in-flight chunk writes, or the main-process persistence layer. Call this
   * before the full stop() for immediate user feedback when the user clicks stop.
   *
   * Idempotent: safe to call multiple times or when no tracks are active.
   */
  releaseCaptureTracks(): void {
    this.cleanupStream();
    // Also stop tracks on the recorder's internal stream reference if it differs
    // from the stored mediaStream (e.g. after partial cleanup).
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        const recorderStream = this.mediaRecorder.stream;
        if (recorderStream) {
          this.stopTracks(recorderStream);
        }
      } catch {
        // Best effort.
      }
    }
  }

  forceReleaseOrphanedCapture(): void {
    const hasStreamLeak = this.hasLiveTrack(this.mediaStream);
    const hasRecorderLeak = this.hasLiveTrack(this.mediaRecorder?.stream);
    if (!hasStreamLeak && !hasRecorderLeak) {
      return;
    }

    try {
      if (this.mediaRecorder) {
        this.mediaRecorder.ondataavailable = null;
        this.mediaRecorder.onerror = null;
        this.mediaRecorder.onstop = null;
      }
    } catch {
      // Best effort.
    }

    this.stopTracks(this.mediaRecorder?.stream);
    this.cleanupStream();
    this.mediaRecorder = null;
    this.activeSessionId = null;
    this.activeSourceName = null;
    this.stopping = false;
    this.recordingStartTime = null;
    this.snapshotWritesByRevision.clear();
  }

  private cleanupStream(): void {
    if (this.selectedSourceTrack) {
      this.selectedSourceTrack.removeEventListener('ended', this.handleSelectedSourceEnded);
      this.selectedSourceTrack = null;
    }
    this.annotationUnsubscribe?.();
    this.annotationUnsubscribe = null;
    try { this.compositor?.stop(); } catch { /* best effort */ }
    this.compositor = null;
    this.stopTracks(this.mediaStream);
    this.mediaStream = null;
  }

  private captureMarkedSnapshot(
    event: Extract<AnnotationEvent, { type: 'snapshot-request' }>,
  ): void {
    const compositor = this.compositor;
    const sessionId = this.activeSessionId;
    if (!compositor || !sessionId || this.snapshotRevisions.has(event.revision)) return;
    this.snapshotRevisions.add(event.revision);

    const snapshotWrite = compositor.capturePng()
      .then((bytes) => window.markuprx.capture.stageMarkedIssueCandidate({
        sessionId,
        revision: event.revision,
        bytes,
      }))
      .then((result) => {
        if (!result.success) {
          throw new Error(result.error || 'Failed to stage marked screenshot.');
        }
      })
      .catch((error) => {
        console.warn('[ScreenRecordingRenderer] Marked screenshot staging failed:', error);
      })
      .finally(() => {
        this.snapshotWrites.delete(snapshotWrite);
      });
    this.snapshotWrites.add(snapshotWrite);
    this.snapshotWritesByRevision.set(event.revision, snapshotWrite);
  }

  private watchSelectedSource(stream: MediaStream): void {
    const tracks = typeof stream.getVideoTracks === 'function'
      ? stream.getVideoTracks()
      : stream.getTracks().filter((track) => track.kind === 'video');
    const selectedTrack = tracks[0] || null;
    if (!selectedTrack || typeof selectedTrack.addEventListener !== 'function') return;
    this.selectedSourceTrack = selectedTrack;
    selectedTrack.addEventListener('ended', this.handleSelectedSourceEnded, { once: true });
  }

  private readonly handleSelectedSourceEnded = (): void => {
    this.handleFatalCaptureEnd('The selected capture source closed or became unavailable.');
  };

  private handleFatalCaptureEnd(reason: string): void {
    if (!this.activeSessionId || this.stopping || this.fatalStopInProgress) return;
    this.fatalStopInProgress = true;
    const endedSessionId = this.activeSessionId;
    const sourceName = this.activeSourceName || 'selected source';
    const message = `Recording of “${sourceName}” ended: ${reason}`;
    console.error(`[ScreenRecordingRenderer] ${message} (${endedSessionId}).`);
    this.fatalErrorHandler?.(message);
    void (async () => {
      const finalization = await window.markuprx.capture?.endAnnotation?.(true)
        .catch(() => ({ success: false, snapshotRevision: undefined }));
      if (finalization?.snapshotRevision) {
        await this.waitForMarkedSnapshot(finalization.snapshotRevision).catch(() => false);
      }
      await this.stop();
      await window.markuprx.session?.stop().catch((error) => {
        console.error('[ScreenRecordingRenderer] Failed to stop session after capture failure:', error);
      });
    })().finally(() => {
      this.fatalStopInProgress = false;
    });
  }
}

let screenRecordingRendererInstance: ScreenRecordingRenderer | null = null;

export function getScreenRecordingRenderer(): ScreenRecordingRenderer {
  if (!screenRecordingRendererInstance) {
    screenRecordingRendererInstance = new ScreenRecordingRenderer();
  }
  return screenRecordingRendererInstance;
}

export default getScreenRecordingRenderer;
