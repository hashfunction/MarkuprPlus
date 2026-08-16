import { app, BrowserWindow, desktopCapturer, screen } from 'electron';
import { join } from 'path';
import {
  IPC_CHANNELS,
  type AnnotationEvent,
  type AnnotationMode,
  type AnnotationStatePayload,
  type CapturableWindow,
  type CaptureBounds,
  type CaptureDisplay,
  type CaptureOverlayState,
  type CaptureSelectionOverlayState,
  type CaptureSelectionMode,
  type CaptureSource,
  type CaptureTarget,
  type MarkedIssuePayload,
  type NormalizedPoint,
} from '../../shared/types';
import {
  matchCaptureDisplays,
  validateAnnotationEvent,
  validateCaptureTarget,
} from '../../shared/captureGeometry';
import { windowGeometryProvider } from './WindowGeometryProvider';
import {
  createGlobalAnnotationInputMonitor,
  type GlobalAnnotationInputMonitor,
} from './GlobalAnnotationInputMonitor';
import {
  reduceAnnotationInput,
  type GlobalAnnotationInputSample,
} from './annotationInputModel';
import {
  MarkedIssueAccumulator,
  type MarkedIssueAccumulatorSnapshot,
} from './MarkedIssueAccumulator';

export interface CaptureOverlayWindow {
  webContents: {
    id: number;
    send(channel: string, payload: unknown): void;
    on(event: string, callback: () => void): void;
  };
  setContentProtection(enabled: boolean): void;
  setAlwaysOnTop(enabled: boolean, level?: string): void;
  setVisibleOnAllWorkspaces(enabled: boolean, options?: { visibleOnFullScreen?: boolean }): void;
  setFocusable(focusable: boolean): void;
  setIgnoreMouseEvents(ignore: boolean, options?: { forward?: boolean }): void;
  setBounds(bounds: CaptureBounds): void;
  showInactive(): void;
  show(): void;
  focus(): void;
  destroy(): void;
  isDestroyed(): boolean;
  on(event: string, callback: () => void): void;
}

interface CaptureOverlayHostWindow {
  hide(): void;
  show(): void;
  webContents: {
    send(channel: string, payload: unknown): void;
  };
}

interface PreparedSelection {
  displays: CaptureDisplay[];
  windows: CapturableWindow[];
  windowSources: CaptureSource[];
}

export interface CaptureOverlayManagerDependencies {
  prepareSelection: () => Promise<PreparedSelection>;
  createWindow: (kind: CaptureOverlayState['kind']) => CaptureOverlayWindow;
  loadRenderer: (
    window: CaptureOverlayWindow,
    kind: CaptureOverlayState['kind'],
    overlayId: string,
  ) => Promise<void>;
  getHostWindow: () => CaptureOverlayHostWindow | null;
  getCursorPoint: () => { x: number; y: number };
  refreshWindow: (target: CaptureTarget) => Promise<CapturableWindow | null>;
  setInterval: (callback: () => void, milliseconds: number) => unknown;
  clearInterval: (handle: unknown) => void;
  onDisplayChange?: (callback: () => void) => () => void;
  onAnnotationEvent?: (event: AnnotationEvent) => void;
  inputMonitor?: GlobalAnnotationInputMonitor;
  now?: () => number;
  isAnnotationEnabled?: () => boolean;
  onMarkedIssueCommitted?: (issue: MarkedIssuePayload) => void;
  onMarkedIssueAccumulatorChanged?: (snapshot: MarkedIssueAccumulatorSnapshot) => void;
}

interface ActiveOverlay {
  window: CaptureOverlayWindow;
  state: CaptureOverlayState;
}

interface PendingSelection {
  promise: Promise<CaptureTarget | null>;
  resolve: (target: CaptureTarget | null) => void;
}

function toDataUrl(image: Electron.NativeImage | null): string | undefined {
  if (!image || image.isEmpty()) return undefined;
  return image.toDataURL();
}

async function prepareSelectionFromElectron(): Promise<PreparedSelection> {
  const rawSources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  const captureSources: CaptureSource[] = rawSources.map((source) => ({
    id: source.id,
    name: source.name,
    type: source.id.startsWith('screen:') ? 'screen' : 'window',
    thumbnail: toDataUrl(source.thumbnail),
    appIcon: toDataUrl(source.appIcon),
  }));
  const rawScreenSources = rawSources.filter((source) => source.id.startsWith('screen:'));
  const displays = matchCaptureDisplays(
    screen.getAllDisplays(),
    rawScreenSources.map((source) => ({
      id: source.id,
      name: source.name,
      displayId: source.display_id || undefined,
    })),
    String(screen.getPrimaryDisplay().id),
  );

  return {
    displays,
    windows: await windowGeometryProvider.listWindows(captureSources),
    windowSources: captureSources.filter((source) => source.type === 'window' && !source.id.endsWith(':1')),
  };
}

function createElectronOverlayWindow(): CaptureOverlayWindow {
  const preloadPath = join(app.getAppPath(), 'dist', 'preload', 'index.cjs');
  return new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  }) as unknown as CaptureOverlayWindow;
}

async function loadElectronOverlay(
  overlayWindow: CaptureOverlayWindow,
  kind: CaptureOverlayState['kind'],
  overlayId: string,
): Promise<void> {
  const window = overlayWindow as unknown as BrowserWindow;
  const query = `overlay=${encodeURIComponent(kind)}&overlayId=${encodeURIComponent(overlayId)}`;
  if (process.env.NODE_ENV === 'development') {
    await window.loadURL(`http://localhost:5173?${query}`);
    return;
  }
  await window.loadFile(join(app.getAppPath(), 'dist', 'renderer', 'index.html'), {
    query: { overlay: kind, overlayId },
  });
}

async function refreshElectronWindow(target: CaptureTarget): Promise<CapturableWindow | null> {
  if (target.kind !== 'window') return null;
  const selection = await prepareSelectionFromElectron();
  return selection.windows.find((window) => window.sourceId === target.sourceId) || null;
}

function defaultDependencies(): CaptureOverlayManagerDependencies {
  return {
    prepareSelection: prepareSelectionFromElectron,
    createWindow: createElectronOverlayWindow,
    loadRenderer: loadElectronOverlay,
    getHostWindow: () => null,
    getCursorPoint: () => screen.getCursorScreenPoint(),
    refreshWindow: refreshElectronWindow,
    setInterval: (callback, milliseconds) => setInterval(callback, milliseconds),
    clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
    onDisplayChange: (callback) => {
      if (typeof screen.on !== 'function') return () => {};
      screen.on('display-added', callback);
      screen.on('display-removed', callback);
      screen.on('display-metrics-changed', callback);
      return () => {
        screen.removeListener('display-added', callback);
        screen.removeListener('display-removed', callback);
        screen.removeListener('display-metrics-changed', callback);
      };
    },
    inputMonitor: createGlobalAnnotationInputMonitor(),
    now: () => Date.now(),
    isAnnotationEnabled: () => true,
  };
}

function annotationBounds(target: CaptureTarget): CaptureBounds {
  if (target.kind === 'window') return { ...target.bounds };
  if (target.kind === 'screen') return { ...target.displayBounds };
  return {
    x: target.displayBounds.x + target.region.x,
    y: target.displayBounds.y + target.region.y,
    width: target.region.width,
    height: target.region.height,
  };
}

function sameBounds(left: CaptureBounds, right: CaptureBounds): boolean {
  return left.x === right.x && left.y === right.y
    && left.width === right.width && left.height === right.height;
}

export class CaptureOverlayManager {
  private dependencies: CaptureOverlayManagerDependencies;
  private overlays = new Map<number, ActiveOverlay>();
  private pendingSelection: PendingSelection | null = null;
  private selectionMode: CaptureSelectionMode = 'window';
  private annotation: ActiveOverlay | null = null;
  private annotationMode: AnnotationMode = 'interact';
  private intervalHandles = new Set<unknown>();
  private windowRefreshInFlight = false;
  private unsubscribeDisplayChange: (() => void) | null = null;
  private inputSample: GlobalAnnotationInputSample | null = null;
  private issueAccumulator: MarkedIssueAccumulator | null = null;
  private activeStroke: { id: string; lastPoint: NormalizedPoint } | null = null;
  private annotationVideoStartTime = 0;
  private inputMode: 'modifier' | 'fallback' = 'fallback';
  private inputError: string | undefined;

  constructor(dependencies?: CaptureOverlayManagerDependencies) {
    this.dependencies = dependencies || defaultDependencies();
    // The Electron screen module is unavailable before app.whenReady(). The
    // singleton receives configure() during ready initialization; injected
    // test/alternate dependencies are safe to subscribe immediately.
    if (dependencies) this.subscribeToDisplayChanges();
  }

  configure(dependencies: Partial<CaptureOverlayManagerDependencies>): void {
    this.unsubscribeDisplayChange?.();
    this.dependencies = { ...this.dependencies, ...dependencies };
    this.subscribeToDisplayChanges();
  }

  async selectTarget(): Promise<CaptureTarget | null> {
    if (this.pendingSelection) return this.pendingSelection.promise;

    let resolveSelection!: (target: CaptureTarget | null) => void;
    const promise = new Promise<CaptureTarget | null>((resolve) => {
      resolveSelection = resolve;
    });
    const request: PendingSelection = { promise, resolve: resolveSelection };
    this.pendingSelection = request;
    this.selectionMode = 'window';

    try {
      const prepared = await this.dependencies.prepareSelection();
      if (this.pendingSelection !== request) return promise;
      if (prepared.displays.length === 0) {
        this.finishSelection(null, true);
        return promise;
      }
      this.dependencies.getHostWindow()?.hide();

      await Promise.all(prepared.displays.map(async (display, index) => {
        if (this.pendingSelection !== request) return;
        const overlayId = `selection-${display.id}-${index}`;
        const state: CaptureSelectionOverlayState = {
          kind: 'selection',
          overlayId,
          mode: this.selectionMode,
          display,
          displays: prepared.displays,
          windows: prepared.windows,
          windowSources: prepared.windowSources,
        };
        const window = this.createProtectedWindow('selection');
        const senderId = window.webContents.id;
        window.setBounds(display.bounds);
        this.overlays.set(senderId, { window, state });
        window.on('closed', () => {
          if (this.overlays.has(senderId)) this.cancelSelection();
        });
        await this.dependencies.loadRenderer(window, 'selection', overlayId);
        if (!window.isDestroyed()) {
          const shouldFocus = display.isPrimary
            || (!prepared.displays.some((candidate) => candidate.isPrimary) && index === 0);
          if (shouldFocus) {
            window.show();
            window.focus();
          } else {
            window.showInactive();
          }
        }
      }));
    } catch (error) {
      if (this.pendingSelection !== request) return promise;
      console.error('[CaptureOverlayManager] Failed to open selector:', error);
      this.finishSelection(null, true);
    }

    return promise;
  }

  getOverlayState(senderId: number): CaptureOverlayState | null {
    return this.overlays.get(senderId)?.state || null;
  }

  async confirmTarget(senderId: number, target: CaptureTarget): Promise<{ success: boolean; error?: string }> {
    const overlay = this.overlays.get(senderId);
    if (!overlay || overlay.state.kind !== 'selection' || !this.pendingSelection) {
      return { success: false, error: 'Unknown capture overlay.' };
    }

    let resolvedTarget = target;
    if (target.kind === 'window') {
      const issued = overlay.state.windows.find((window) =>
        window.sourceId === target.sourceId
        && window.nativeWindowId === target.nativeWindowId
        && sameBounds(window.bounds, target.bounds)
      );
      const issuedGallerySource = target.geometryAvailable === false
        && sameBounds(target.bounds, overlay.state.display.bounds)
        && overlay.state.windowSources.some((source) => {
          const nativeId = /^window:([^:]+):[01]$/.exec(source.id)?.[1];
          return source.id === target.sourceId
            && source.name === target.sourceName
            && nativeId === target.nativeWindowId;
        });
      if (!issued && !issuedGallerySource) {
        return { success: false, error: 'The selected window is no longer available.' };
      }
      if (issued) {
        const refreshed = await this.dependencies.refreshWindow(target);
        if (!refreshed
          || refreshed.sourceId !== target.sourceId
          || refreshed.nativeWindowId !== target.nativeWindowId) {
          return { success: false, error: 'The selected window is no longer available.' };
        }
        if (!this.pendingSelection || this.overlays.get(senderId) !== overlay) {
          return { success: false, error: 'Unknown capture overlay.' };
        }
        resolvedTarget = {
          ...target,
          sourceName: refreshed.sourceName,
          appName: refreshed.appName,
          bounds: refreshed.bounds,
          geometryAvailable: true,
        };
      }
    } else if (!validateCaptureTarget(target, overlay.state.displays)) {
      return { success: false, error: 'The selected capture area is invalid.' };
    }

    this.finishSelection(resolvedTarget, false);
    return { success: true };
  }

  setSelectionMode(senderId: number, mode: CaptureSelectionMode): { success: boolean; error?: string } {
    const sender = this.overlays.get(senderId);
    if (!this.pendingSelection || !sender || sender.state.kind !== 'selection') {
      return { success: false, error: 'Unknown capture overlay.' };
    }
    if (mode !== 'window' && mode !== 'region' && mode !== 'screen') {
      return { success: false, error: 'Invalid selection mode.' };
    }

    this.selectionMode = mode;
    for (const [webContentsId, overlay] of this.overlays) {
      if (overlay.state.kind !== 'selection' || overlay.window.isDestroyed()) continue;
      overlay.state = { ...overlay.state, mode };
      this.overlays.set(webContentsId, overlay);
      overlay.window.webContents.send(IPC_CHANNELS.CAPTURE_OVERLAY_STATE_CHANGED, overlay.state);
    }
    return { success: true };
  }

  cancelSelection(): void {
    this.finishSelection(null, true);
  }

  async beginAnnotation(
    sessionId: string,
    target: CaptureTarget,
    videoStartTime = this.now(),
  ): Promise<void> {
    this.endAnnotation();
    if (target.kind === 'window' && target.geometryAvailable === false) {
      throw new Error('Live annotation is unavailable because this window system did not provide trustworthy window geometry.');
    }
    this.annotationMode = 'interact';
    this.annotationVideoStartTime = Number.isFinite(videoStartTime) && videoStartTime >= 0
      ? videoStartTime
      : this.now();
    this.issueAccumulator = new MarkedIssueAccumulator(sessionId);
    this.emitAccumulatorSnapshot();
    this.activeStroke = null;
    this.inputSample = null;
    const overlayId = `annotation-${sessionId}`;
    const state: CaptureOverlayState = {
      kind: 'annotation',
      overlayId,
      sessionId,
      target,
      mode: this.annotationMode,
    };
    const window = this.createProtectedWindow('annotation');
    const senderId = window.webContents.id;
    window.setBounds(annotationBounds(target));
    window.setIgnoreMouseEvents(true, { forward: true });
    this.annotation = { window, state };
    this.overlays.set(senderId, this.annotation);
    window.on('closed', () => this.endAnnotation());
    try {
      await this.dependencies.inputMonitor?.start((sample) => this.handleInputSample(sample));
      this.updateInputHealth();
      if (this.annotation?.state.kind === 'annotation') {
        this.annotation.state = {
          ...this.annotation.state,
          modifierKey: this.modifierKey(),
          modifierInputAvailable: this.inputMode === 'modifier',
          ...(this.inputError ? { modifierInputError: this.inputError } : {}),
        };
        this.overlays.set(senderId, this.annotation);
      }
      await this.dependencies.loadRenderer(window, 'annotation', overlayId);
    } catch (error) {
      this.endAnnotation();
      throw error;
    }
    if (!window.isDestroyed()) window.showInactive();
    this.emitAnnotationState();
    this.startAnnotationPolling();
  }

  endAnnotation(error?: string): void {
    for (const handle of this.intervalHandles) this.dependencies.clearInterval(handle);
    this.intervalHandles.clear();
    this.windowRefreshInFlight = false;
    void this.dependencies.inputMonitor?.stop();
    this.inputSample = null;
    this.activeStroke = null;
    this.issueAccumulator = null;
    const active = this.annotation;
    this.annotation = null;
    this.annotationMode = 'interact';
    if (active) {
      if (!active.window.isDestroyed()) {
        active.window.setIgnoreMouseEvents(true, { forward: true });
      }
      this.overlays.delete(active.window.webContents.id);
      if (!active.window.isDestroyed()) active.window.destroy();
    }
    this.emitAnnotationState(error);
  }

  setAnnotationMode(mode: AnnotationMode): { success: boolean; error?: string } {
    const active = this.annotation;
    if (!active || active.state.kind !== 'annotation') {
      return { success: false, error: 'No annotation overlay is active.' };
    }
    if (mode === 'draw') {
      if (this.dependencies.isAnnotationEnabled?.() === false) {
        return { success: false, error: 'Drawing is unavailable while recording is paused.' };
      }
    } else {
      if (this.inputMode === 'fallback') {
        const finalized = this.finalizePendingIssue(this.now());
        if (!finalized) this.applyAnnotationMode('interact');
        return { success: true };
      }
      const recordedAt = this.now();
      this.finishActiveStroke(null, recordedAt);
      this.applyAnnotationMode('interact');
      this.requestIssueSnapshot(recordedAt);
      return { success: true };
    }
    this.applyAnnotationMode('draw');
    return { success: true };
  }

  finalizePendingIssue(completedAt = this.now()): MarkedIssuePayload | null {
    const active = this.annotation;
    const accumulator = this.issueAccumulator;
    if (!active || active.state.kind !== 'annotation' || !accumulator?.snapshot().active) {
      return null;
    }

    this.finishActiveStroke(null, completedAt);
    this.applyAnnotationMode('interact');
    this.requestIssueSnapshot(completedAt);
    const issue = accumulator.finalize(completedAt);
    if (!issue) return null;
    this.dependencies.onMarkedIssueCommitted?.(issue);
    this.sendAnnotationToHost({ type: 'clear', sessionId: active.state.sessionId });
    this.emitAccumulatorSnapshot();
    return issue;
  }

  submitAnnotationEvent(senderId: number, event: AnnotationEvent): { success: boolean; error?: string } {
    const overlay = this.overlays.get(senderId);
    if (!overlay || overlay !== this.annotation || overlay.state.kind !== 'annotation') {
      return { success: false, error: 'Unknown annotation overlay.' };
    }
    if (event.sessionId !== overlay.state.sessionId) {
      return { success: false, error: 'Annotation session does not match the active recording.' };
    }
    if (!validateAnnotationEvent(event)) {
      return { success: false, error: 'Invalid annotation event.' };
    }
    if (event.type === 'snapshot-request') {
      return { success: false, error: 'Snapshot requests are owned by the main process.' };
    }
    const requiresDrawMode = event.type === 'stroke-start'
      || event.type === 'stroke-points'
      || event.type === 'stroke-end'
      || event.type === 'undo'
      || event.type === 'clear';
    if (requiresDrawMode && this.annotationMode !== 'draw') {
      return { success: false, error: 'Drawing is not active.' };
    }
    const recordedAt = this.now();
    const consumed = this.issueAccumulator?.consume(event, recordedAt);
    if (consumed && !consumed.accepted) {
      const suffix = consumed.limitReached
        ? ` The ${consumed.limitReached} limit was reached.`
        : '';
      return { success: false, error: `Annotation event is out of order.${suffix}` };
    }
    if (event.type === 'stroke-start') {
      this.activeStroke = {
        id: event.stroke.id,
        lastPoint: event.stroke.points[event.stroke.points.length - 1],
      };
    } else if (event.type === 'stroke-points'
      && this.activeStroke?.id === event.strokeId) {
      this.activeStroke.lastPoint = event.points[event.points.length - 1];
    } else if (event.type === 'stroke-end' && this.activeStroke?.id === event.strokeId) {
      this.activeStroke = null;
    } else if (event.type === 'clear' || event.type === 'undo') {
      this.activeStroke = null;
    }
    this.sendAnnotationToHost(event, false);
    this.emitAccumulatorSnapshot();
    return { success: true };
  }

  destroy(): void {
    this.finishSelection(null, false);
    this.endAnnotation();
    this.unsubscribeDisplayChange?.();
    this.unsubscribeDisplayChange = null;
  }

  private createProtectedWindow(kind: CaptureOverlayState['kind']): CaptureOverlayWindow {
    const window = this.dependencies.createWindow(kind);
    const senderId = window.webContents.id;
    window.setContentProtection(true);
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (kind === 'annotation') window.setFocusable(false);
    window.webContents.on('render-process-gone', () => {
      this.handleOverlayRendererFailure(senderId);
    });
    window.on('unresponsive', () => {
      this.handleOverlayRendererFailure(senderId);
    });
    return window;
  }

  private handleOverlayRendererFailure(senderId: number): void {
    const overlay = this.overlays.get(senderId);
    if (!overlay) return;
    if (overlay.state.kind === 'selection') {
      this.cancelSelection();
      return;
    }
    if (overlay === this.annotation) {
      this.endAnnotation('The drawing overlay stopped unexpectedly. Recording continues without live drawing.');
    }
  }

  private finishSelection(target: CaptureTarget | null, restoreHost: boolean): void {
    const pending = this.pendingSelection;
    this.pendingSelection = null;
    const selectionWindows = Array.from(this.overlays.values())
      .filter((overlay) => overlay.state.kind === 'selection');
    for (const overlay of selectionWindows) {
      this.overlays.delete(overlay.window.webContents.id);
      if (!overlay.window.isDestroyed()) overlay.window.destroy();
    }
    if (restoreHost) this.dependencies.getHostWindow()?.show();
    pending?.resolve(target);
  }

  private emitAnnotationState(error?: string): void {
    const issueSnapshot = this.annotation ? this.issueAccumulator?.snapshot() : undefined;
    const payload: AnnotationStatePayload = {
      active: Boolean(this.annotation),
      mode: this.annotation ? this.annotationMode : 'interact',
      ...(this.annotation ? {
        inputMode: this.inputMode,
        modifierKey: this.modifierKey(),
        pendingMarkedIssue: Boolean(issueSnapshot?.active),
        markedIssueCount: issueSnapshot?.issues.length ?? 0,
      } : {}),
      ...(error ? { error } : {}),
    };
    this.sendToHost(IPC_CHANNELS.CAPTURE_ANNOTATION_STATE, payload);
  }

  private sendAnnotationToHost(event: AnnotationEvent, echoToOverlay = true): void {
    this.sendToHost(IPC_CHANNELS.CAPTURE_ANNOTATION_EVENT, event);
    const active = this.annotation;
    if (echoToOverlay && active && active.state.kind === 'annotation' && !active.window.isDestroyed()) {
      active.window.webContents.send(IPC_CHANNELS.CAPTURE_ANNOTATION_EVENT, event);
    }
    this.dependencies.onAnnotationEvent?.(event);
  }

  private sendToHost(channel: string, payload: unknown): void {
    try {
      this.dependencies.getHostWindow()?.webContents.send(channel, payload);
    } catch (error) {
      // The host renderer may already be gone during app shutdown. Overlay
      // cleanup must remain synchronous and idempotent in that ordering.
      console.warn('[CaptureOverlayManager] Host renderer unavailable during overlay teardown:', error);
    }
  }

  private startAnnotationPolling(): void {
    const cursorHandle = this.dependencies.setInterval(() => {
      this.updateInputHealth();
      const active = this.annotation;
      if (!active || active.state.kind !== 'annotation') return;
      const bounds = annotationBounds(active.state.target);
      const cursor = this.dependencies.getCursorPoint();
      const inside = cursor.x >= bounds.x && cursor.y >= bounds.y
        && cursor.x < bounds.x + bounds.width && cursor.y < bounds.y + bounds.height;
      this.sendAnnotationToHost({
        type: 'cursor',
        sessionId: active.state.sessionId,
        point: inside ? {
          x: (cursor.x - bounds.x) / bounds.width,
          y: (cursor.y - bounds.y) / bounds.height,
        } : null,
      });
    }, 50);
    this.intervalHandles.add(cursorHandle);

    if (this.annotation?.state.kind !== 'annotation' || this.annotation.state.target.kind !== 'window') return;
    const refreshHandle = this.dependencies.setInterval(() => {
      const active = this.annotation;
      if (this.windowRefreshInFlight || !active || active.state.kind !== 'annotation'
        || active.state.target.kind !== 'window') return;
      this.windowRefreshInFlight = true;
      void this.dependencies.refreshWindow(active.state.target)
        .then((refreshed) => {
          if (!refreshed || !this.annotation || this.annotation !== active
            || active.state.kind !== 'annotation' || active.state.target.kind !== 'window') return;
          if (sameBounds(active.state.target.bounds, refreshed.bounds)) return;
          const target: CaptureTarget = { ...active.state.target, bounds: refreshed.bounds };
          active.state = { ...active.state, target };
          active.window.setBounds(refreshed.bounds);
          this.overlays.set(active.window.webContents.id, active);
          const event: AnnotationEvent = {
            type: 'bounds',
            sessionId: active.state.sessionId,
            bounds: refreshed.bounds,
          };
          this.sendAnnotationToHost(event);
        })
        .catch((error) => console.warn('[CaptureOverlayManager] Window refresh failed:', error))
        .finally(() => { this.windowRefreshInFlight = false; });
    }, 750);
    this.intervalHandles.add(refreshHandle);
  }

  private subscribeToDisplayChanges(): void {
    this.unsubscribeDisplayChange = this.dependencies.onDisplayChange?.(() => {
      if (this.pendingSelection) this.finishSelection(null, true);
      if (this.annotation) this.endAnnotation();
    }) || null;
  }

  private now(): number {
    return this.dependencies.now?.() ?? Date.now();
  }

  private modifierKey(): 'Command' | 'Control' {
    return this.dependencies.inputMonitor?.health().platform === 'darwin'
      ? 'Command'
      : 'Control';
  }

  private updateInputHealth(): void {
    const health = this.dependencies.inputMonitor?.health();
    const nextMode = health?.state === 'running' ? 'modifier' : 'fallback';
    const nextError = health?.error;
    if (nextMode === this.inputMode && nextError === this.inputError) return;

    this.inputMode = nextMode;
    this.inputError = nextError;
    if (nextMode === 'fallback' && this.annotationMode === 'draw') {
      const recordedAt = this.now();
      this.finishActiveStroke(null, recordedAt);
      this.applyAnnotationMode('interact');
      this.requestIssueSnapshot(recordedAt);
    }
    const active = this.annotation;
    if (active?.state.kind === 'annotation') {
      active.state = {
        ...active.state,
        modifierKey: this.modifierKey(),
        modifierInputAvailable: nextMode === 'modifier',
        ...(nextError ? { modifierInputError: nextError } : {}),
      };
      this.overlays.set(active.window.webContents.id, active);
      active.window.webContents.send(IPC_CHANNELS.CAPTURE_OVERLAY_STATE_CHANGED, active.state);
    }
    this.emitAnnotationState();
  }

  private handleInputSample(sample: GlobalAnnotationInputSample): void {
    const active = this.annotation;
    if (!active || active.state.kind !== 'annotation') return;
    const previous = this.inputSample;
    this.inputSample = sample;
    const actions = reduceAnnotationInput(previous, sample, annotationBounds(active.state.target));
    for (const action of actions) {
      if (action.type === 'modifier-down') {
        if (this.dependencies.isAnnotationEnabled?.() !== false && this.inputMode === 'modifier') {
          this.applyAnnotationMode('draw');
        } else {
          this.applyAnnotationMode('interact');
        }
        continue;
      }
      if (action.type === 'modifier-up') {
        this.finishActiveStroke(action.point, sample.capturedAt);
        this.applyAnnotationMode('interact');
        this.requestIssueSnapshot(sample.capturedAt);
        continue;
      }

      const issue = this.issueAccumulator?.commit(sample.capturedAt);
      if (!issue) continue;
      this.dependencies.onMarkedIssueCommitted?.(issue);
      this.sendAnnotationToHost({ type: 'clear', sessionId: active.state.sessionId });
      this.emitAccumulatorSnapshot();
    }
  }

  private finishActiveStroke(point: NormalizedPoint | null, recordedAt: number): void {
    const active = this.annotation;
    const stroke = this.activeStroke;
    if (!active || active.state.kind !== 'annotation' || !stroke) return;

    if (point && (point.x !== stroke.lastPoint.x || point.y !== stroke.lastPoint.y)) {
      const pointEvent: AnnotationEvent = {
        type: 'stroke-points',
        sessionId: active.state.sessionId,
        strokeId: stroke.id,
        points: [point],
      };
      this.issueAccumulator?.consume(pointEvent, recordedAt);
      this.sendAnnotationToHost(pointEvent);
      stroke.lastPoint = point;
    }
    const endEvent: AnnotationEvent = {
      type: 'stroke-end',
      sessionId: active.state.sessionId,
      strokeId: stroke.id,
    };
    this.issueAccumulator?.consume(endEvent, recordedAt);
    this.activeStroke = null;
    this.sendAnnotationToHost(endEvent);
  }

  private applyAnnotationMode(mode: AnnotationMode): void {
    const active = this.annotation;
    if (!active || active.state.kind !== 'annotation') return;
    this.annotationMode = mode;
    active.state = { ...active.state, mode };
    this.overlays.set(active.window.webContents.id, active);
    if (mode === 'draw') {
      active.window.setIgnoreMouseEvents(false);
    } else {
      active.window.setIgnoreMouseEvents(true, { forward: true });
    }
    active.window.showInactive();
    active.window.webContents.send(IPC_CHANNELS.CAPTURE_OVERLAY_STATE_CHANGED, active.state);
    this.sendAnnotationToHost({
      type: 'mode',
      sessionId: active.state.sessionId,
      mode,
    });
    this.emitAnnotationState();
  }

  private requestIssueSnapshot(requestedAt: number): void {
    const request = this.issueAccumulator?.releaseModifier(
      requestedAt,
      this.annotationVideoStartTime,
    );
    if (request) {
      this.sendAnnotationToHost({ type: 'snapshot-request', ...request });
      this.emitAccumulatorSnapshot();
    }
  }

  private emitAccumulatorSnapshot(): void {
    if (!this.issueAccumulator) return;
    this.dependencies.onMarkedIssueAccumulatorChanged?.(this.issueAccumulator.snapshot());
    this.emitAnnotationState();
  }
}

export const captureOverlayManager = new CaptureOverlayManager();
