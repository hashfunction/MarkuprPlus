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
  type CaptureSource,
  type CaptureTarget,
} from '../../shared/types';
import { validateCaptureTarget } from '../../shared/captureGeometry';
import { windowGeometryProvider } from './WindowGeometryProvider';

export interface CaptureOverlayWindow {
  webContents: {
    id: number;
    send(channel: string, payload: unknown): void;
  };
  setContentProtection(enabled: boolean): void;
  setAlwaysOnTop(enabled: boolean, level?: string): void;
  setVisibleOnAllWorkspaces(enabled: boolean, options?: { visibleOnFullScreen?: boolean }): void;
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
  const electronDisplays = screen.getAllDisplays();
  const primaryId = String(screen.getPrimaryDisplay().id);
  const displays = electronDisplays.flatMap((display, index): CaptureDisplay[] => {
    const rawSource = rawScreenSources.find((source) => source.display_id === String(display.id))
      || rawScreenSources[index];
    if (!rawSource) return [];
    return [{
      id: String(display.id),
      label: display.label || rawSource.name || `Display ${index + 1}`,
      sourceId: rawSource.id,
      sourceName: rawSource.name,
      bounds: { ...display.bounds },
      scaleFactor: display.scaleFactor,
      isPrimary: String(display.id) === primaryId,
    }];
  });

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
  private annotation: ActiveOverlay | null = null;
  private annotationMode: AnnotationMode = 'interact';
  private intervalHandles = new Set<unknown>();
  private windowRefreshInFlight = false;
  private unsubscribeDisplayChange: (() => void) | null = null;

  constructor(dependencies?: CaptureOverlayManagerDependencies) {
    this.dependencies = dependencies || defaultDependencies();
    this.subscribeToDisplayChanges();
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
    this.pendingSelection = { promise, resolve: resolveSelection };

    try {
      const prepared = await this.dependencies.prepareSelection();
      if (prepared.displays.length === 0) {
        this.finishSelection(null, true);
        return promise;
      }
      this.dependencies.getHostWindow()?.hide();

      await Promise.all(prepared.displays.map(async (display, index) => {
        const overlayId = `selection-${display.id}-${index}`;
        const state: CaptureSelectionOverlayState = {
          kind: 'selection',
          overlayId,
          display,
          displays: prepared.displays,
          windows: prepared.windows,
          windowSources: prepared.windowSources,
        };
        const window = this.createProtectedWindow('selection');
        window.setBounds(display.bounds);
        this.overlays.set(window.webContents.id, { window, state });
        window.on('closed', () => {
          if (this.overlays.has(window.webContents.id)) this.cancelSelection();
        });
        await this.dependencies.loadRenderer(window, 'selection', overlayId);
        if (!window.isDestroyed()) window.showInactive();
      }));
    } catch (error) {
      console.error('[CaptureOverlayManager] Failed to open selector:', error);
      this.finishSelection(null, true);
    }

    return promise;
  }

  getOverlayState(senderId: number): CaptureOverlayState | null {
    return this.overlays.get(senderId)?.state || null;
  }

  confirmTarget(senderId: number, target: CaptureTarget): { success: boolean; error?: string } {
    const overlay = this.overlays.get(senderId);
    if (!overlay || overlay.state.kind !== 'selection' || !this.pendingSelection) {
      return { success: false, error: 'Unknown capture overlay.' };
    }

    if (target.kind === 'window') {
      const issued = overlay.state.windows.find((window) =>
        window.sourceId === target.sourceId
        && window.nativeWindowId === target.nativeWindowId
        && sameBounds(window.bounds, target.bounds)
      );
      if (!issued) return { success: false, error: 'The selected window is no longer available.' };
    } else if (!validateCaptureTarget(target, overlay.state.displays)) {
      return { success: false, error: 'The selected capture area is invalid.' };
    }

    this.finishSelection(target, false);
    return { success: true };
  }

  cancelSelection(): void {
    this.finishSelection(null, true);
  }

  async beginAnnotation(sessionId: string, target: CaptureTarget): Promise<void> {
    this.endAnnotation();
    this.annotationMode = 'interact';
    const overlayId = `annotation-${sessionId}`;
    const state: CaptureOverlayState = {
      kind: 'annotation',
      overlayId,
      sessionId,
      target,
      mode: this.annotationMode,
    };
    const window = this.createProtectedWindow('annotation');
    window.setBounds(annotationBounds(target));
    window.setIgnoreMouseEvents(true, { forward: true });
    this.annotation = { window, state };
    this.overlays.set(window.webContents.id, this.annotation);
    window.on('closed', () => this.endAnnotation());
    await this.dependencies.loadRenderer(window, 'annotation', overlayId);
    if (!window.isDestroyed()) window.showInactive();
    this.emitAnnotationState();
    this.startAnnotationPolling();
  }

  endAnnotation(): void {
    for (const handle of this.intervalHandles) this.dependencies.clearInterval(handle);
    this.intervalHandles.clear();
    this.windowRefreshInFlight = false;
    const active = this.annotation;
    this.annotation = null;
    this.annotationMode = 'interact';
    if (active) {
      this.overlays.delete(active.window.webContents.id);
      if (!active.window.isDestroyed()) active.window.destroy();
    }
    this.emitAnnotationState();
  }

  setAnnotationMode(mode: AnnotationMode): { success: boolean; error?: string } {
    const active = this.annotation;
    if (!active || active.state.kind !== 'annotation') {
      return { success: false, error: 'No annotation overlay is active.' };
    }
    this.annotationMode = mode;
    active.state = { ...active.state, mode };
    this.overlays.set(active.window.webContents.id, active);
    if (mode === 'draw') {
      active.window.setIgnoreMouseEvents(false);
      active.window.show();
      active.window.focus();
    } else {
      active.window.setIgnoreMouseEvents(true, { forward: true });
      active.window.showInactive();
    }
    active.window.webContents.send(IPC_CHANNELS.CAPTURE_OVERLAY_STATE_CHANGED, active.state);
    this.emitAnnotationState();
    return { success: true };
  }

  submitAnnotationEvent(senderId: number, event: AnnotationEvent): { success: boolean; error?: string } {
    const overlay = this.overlays.get(senderId);
    if (!overlay || overlay !== this.annotation || overlay.state.kind !== 'annotation') {
      return { success: false, error: 'Unknown annotation overlay.' };
    }
    if (event.sessionId !== overlay.state.sessionId) {
      return { success: false, error: 'Annotation session does not match the active recording.' };
    }
    this.sendAnnotationToHost(event);
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
    window.setContentProtection(true);
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    return window;
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

  private emitAnnotationState(): void {
    const payload: AnnotationStatePayload = {
      active: Boolean(this.annotation),
      mode: this.annotation ? this.annotationMode : 'interact',
    };
    this.dependencies.getHostWindow()?.webContents.send(IPC_CHANNELS.CAPTURE_ANNOTATION_STATE, payload);
  }

  private sendAnnotationToHost(event: AnnotationEvent): void {
    this.dependencies.getHostWindow()?.webContents.send(IPC_CHANNELS.CAPTURE_ANNOTATION_EVENT, event);
    this.dependencies.onAnnotationEvent?.(event);
  }

  private startAnnotationPolling(): void {
    const cursorHandle = this.dependencies.setInterval(() => {
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
}

export const captureOverlayManager = new CaptureOverlayManager();
