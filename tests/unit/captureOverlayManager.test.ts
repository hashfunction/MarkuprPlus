import { describe, expect, it, vi } from 'vitest';
import type {
  AnnotationEvent,
  CaptureDisplay,
  CapturableWindow,
  CaptureTarget,
} from '../../src/shared/types';
import {
  CaptureOverlayManager,
  type CaptureOverlayWindow,
  type CaptureOverlayManagerDependencies,
} from '../../src/main/capture/CaptureOverlayManager';

const display: CaptureDisplay = {
  id: '1',
  label: 'Primary',
  sourceId: 'screen:0:0',
  sourceName: 'Entire Screen',
  bounds: { x: 0, y: 0, width: 1440, height: 900 },
  scaleFactor: 2,
  isPrimary: true,
};

const capturableWindow: CapturableWindow = {
  sourceId: 'window:220:0',
  sourceName: 'Documentation',
  nativeWindowId: '220',
  appName: 'Safari',
  bounds: { x: 100, y: 80, width: 900, height: 700 },
  ownerPid: 70,
};

const windowTarget: CaptureTarget = {
  kind: 'window',
  sourceId: capturableWindow.sourceId,
  sourceName: capturableWindow.sourceName,
  nativeWindowId: capturableWindow.nativeWindowId,
  appName: capturableWindow.appName,
  bounds: capturableWindow.bounds,
};

class FakeOverlayWindow implements CaptureOverlayWindow {
  static nextId = 10;
  readonly webContents = {
    id: FakeOverlayWindow.nextId++,
    send: vi.fn(),
  };
  readonly setContentProtection = vi.fn();
  readonly setAlwaysOnTop = vi.fn();
  readonly setVisibleOnAllWorkspaces = vi.fn();
  readonly setIgnoreMouseEvents = vi.fn();
  readonly setBounds = vi.fn();
  readonly showInactive = vi.fn();
  readonly show = vi.fn();
  readonly focus = vi.fn();
  readonly destroy = vi.fn(() => { this.destroyed = true; });
  destroyed = false;
  private handlers = new Map<string, Array<() => void>>();

  isDestroyed(): boolean {
    return this.destroyed;
  }

  on(event: string, callback: () => void): void {
    const handlers = this.handlers.get(event) || [];
    handlers.push(callback);
    this.handlers.set(event, handlers);
  }
}

function createHarness(selectionOverrides: Partial<{
  windows: CapturableWindow[];
  windowSources: Array<{ id: string; name: string; type: 'window' }>;
}> = {}) {
  const windows: FakeOverlayWindow[] = [];
  const host = { hide: vi.fn(), show: vi.fn(), webContents: { send: vi.fn() } };
  const intervals = new Map<number, () => void>();
  let nextInterval = 1;
  let displayChangeHandler: (() => void) | null = null;
  const dependencies: CaptureOverlayManagerDependencies = {
    prepareSelection: vi.fn().mockResolvedValue({
      displays: [display],
      windows: selectionOverrides.windows ?? [capturableWindow],
      windowSources: selectionOverrides.windowSources ?? [],
    }),
    createWindow: vi.fn(() => {
      const window = new FakeOverlayWindow();
      windows.push(window);
      return window;
    }),
    loadRenderer: vi.fn().mockResolvedValue(undefined),
    getHostWindow: () => host,
    getCursorPoint: () => ({ x: 200, y: 180 }),
    refreshWindow: vi.fn().mockResolvedValue(capturableWindow),
    setInterval: (callback) => {
      const id = nextInterval++;
      intervals.set(id, callback);
      return id;
    },
    clearInterval: (id) => { intervals.delete(id); },
    onDisplayChange: (callback) => {
      displayChangeHandler = callback;
      return () => { displayChangeHandler = null; };
    },
  };
  const manager = new CaptureOverlayManager(dependencies);
  return {
    manager,
    dependencies,
    windows,
    host,
    intervals,
    emitDisplayChange: () => displayChangeHandler?.(),
  };
}

describe('CaptureOverlayManager selection lifecycle', () => {
  it('creates one protected full-display selector and hides the host', async () => {
    const { manager, windows, host } = createHarness();
    const selection = manager.selectTarget();
    await vi.waitFor(() => expect(windows).toHaveLength(1));

    expect(host.hide).toHaveBeenCalledOnce();
    expect(windows[0].setContentProtection).toHaveBeenCalledWith(true);
    expect(windows[0].setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
    expect(windows[0].setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, { visibleOnFullScreen: true });
    expect(windows[0].setBounds).toHaveBeenCalledWith(display.bounds);

    manager.cancelSelection();
    await expect(selection).resolves.toBeNull();
  });

  it('restores the host and destroys every selector on cancellation', async () => {
    const { manager, windows, host } = createHarness();
    const selection = manager.selectTarget();
    await vi.waitFor(() => expect(windows).toHaveLength(1));

    manager.cancelSelection();

    await expect(selection).resolves.toBeNull();
    expect(windows[0].destroy).toHaveBeenCalledOnce();
    expect(host.show).toHaveBeenCalledOnce();
  });

  it('accepts only a target issued to the confirming overlay sender', async () => {
    const { manager, windows, host } = createHarness();
    const selection = manager.selectTarget();
    await vi.waitFor(() => expect(windows).toHaveLength(1));

    expect(manager.confirmTarget(9999, windowTarget)).toEqual({ success: false, error: 'Unknown capture overlay.' });
    expect(manager.confirmTarget(windows[0].webContents.id, windowTarget)).toEqual({ success: true });

    await expect(selection).resolves.toEqual(windowTarget);
    expect(host.show).not.toHaveBeenCalled();
  });

  it('rejects a stale window source instead of widening capture scope', async () => {
    const { manager, windows } = createHarness();
    const selection = manager.selectTarget();
    await vi.waitFor(() => expect(windows).toHaveLength(1));
    const stale = { ...windowTarget, sourceId: 'window:999:0' } as CaptureTarget;

    expect(manager.confirmTarget(windows[0].webContents.id, stale)).toEqual({
      success: false,
      error: 'The selected window is no longer available.',
    });

    manager.cancelSelection();
    await selection;
  });

  it('accepts an exact gallery window source when native geometry is unavailable', async () => {
    const source = { id: 'window:300:0', name: 'Mail', type: 'window' as const };
    const { manager, windows } = createHarness({ windows: [], windowSources: [source] });
    const selection = manager.selectTarget();
    await vi.waitFor(() => expect(windows).toHaveLength(1));
    const galleryTarget: CaptureTarget = {
      kind: 'window',
      sourceId: source.id,
      sourceName: source.name,
      nativeWindowId: '300',
      appName: 'Mail',
      bounds: display.bounds,
      geometryAvailable: false,
    };

    expect(manager.confirmTarget(windows[0].webContents.id, galleryTarget)).toEqual({ success: true });
    await expect(selection).resolves.toEqual(galleryTarget);
  });

  it('cancels selection when the display topology changes', async () => {
    const { manager, windows, host, emitDisplayChange } = createHarness();
    const selection = manager.selectTarget();
    await vi.waitFor(() => expect(windows).toHaveLength(1));

    emitDisplayChange();

    await expect(selection).resolves.toBeNull();
    expect(windows[0].destroy).toHaveBeenCalledOnce();
    expect(host.show).toHaveBeenCalledOnce();
  });
});

describe('CaptureOverlayManager annotation lifecycle', () => {
  it('starts click-through and switches atomically into draw mode', async () => {
    const { manager, windows, host } = createHarness();

    await manager.beginAnnotation('session-1', windowTarget);

    expect(windows[0].setBounds).toHaveBeenCalledWith(windowTarget.bounds);
    expect(windows[0].setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
    expect(manager.setAnnotationMode('draw')).toEqual({ success: true });
    expect(windows[0].setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
    expect(windows[0].show).toHaveBeenCalled();
    expect(windows[0].focus).toHaveBeenCalled();
    expect(host.webContents.send).toHaveBeenCalledWith(
      expect.any(String),
      { active: true, mode: 'draw' },
    );
    expect(windows[0].webContents.send).toHaveBeenCalledWith(
      expect.any(String),
      { type: 'mode', sessionId: 'session-1', mode: 'draw' },
    );
  });

  it('routes only active-session annotation events from its annotation window', async () => {
    const { manager, windows, host } = createHarness();
    await manager.beginAnnotation('session-1', windowTarget);
    const valid: AnnotationEvent = {
      type: 'clear',
      sessionId: 'session-1',
    };

    expect(manager.submitAnnotationEvent(9999, valid).success).toBe(false);
    expect(manager.submitAnnotationEvent(windows[0].webContents.id, { ...valid, sessionId: 'session-2' }).success).toBe(false);
    expect(manager.submitAnnotationEvent(windows[0].webContents.id, valid)).toEqual({ success: true });
    expect(host.webContents.send).toHaveBeenCalledWith(expect.any(String), valid);
    expect(windows[0].webContents.send).toHaveBeenCalledWith(expect.any(String), valid);
  });

  it('refreshes selected-window bounds and tears all timers down on end', async () => {
    const { manager, dependencies, windows, intervals } = createHarness();
    await manager.beginAnnotation('session-1', windowTarget);
    vi.mocked(dependencies.refreshWindow).mockResolvedValueOnce({
      ...capturableWindow,
      bounds: { x: 200, y: 150, width: 800, height: 600 },
    });

    for (const callback of intervals.values()) callback();
    await vi.waitFor(() => expect(windows[0].setBounds).toHaveBeenCalledWith({ x: 200, y: 150, width: 800, height: 600 }));

    manager.endAnnotation();
    expect(intervals.size).toBe(0);
    expect(windows[0].destroy).toHaveBeenCalledOnce();
  });
});
