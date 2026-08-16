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
import type {
  AnnotationInputHealth,
  GlobalAnnotationInputMonitor,
} from '../../src/main/capture/GlobalAnnotationInputMonitor';
import type { GlobalAnnotationInputSample } from '../../src/main/capture/annotationInputModel';

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
  geometryAvailable: true,
};

class FakeOverlayWindow implements CaptureOverlayWindow {
  static nextId = 10;
  readonly webContents = {
    id: FakeOverlayWindow.nextId++,
    send: vi.fn(),
    on: vi.fn((event: string, callback: () => void) => {
      const handlers = this.webContentsHandlers.get(event) || [];
      handlers.push(callback);
      this.webContentsHandlers.set(event, handlers);
    }),
  };
  readonly setContentProtection = vi.fn();
  readonly setAlwaysOnTop = vi.fn();
  readonly setVisibleOnAllWorkspaces = vi.fn();
  readonly setFocusable = vi.fn();
  readonly setIgnoreMouseEvents = vi.fn();
  readonly setBounds = vi.fn();
  readonly showInactive = vi.fn();
  readonly show = vi.fn();
  readonly focus = vi.fn();
  readonly destroy = vi.fn(() => {
    this.destroyed = true;
    this.handlers.get('closed')?.forEach((callback) => callback());
  });
  destroyed = false;
  private handlers = new Map<string, Array<() => void>>();
  private webContentsHandlers = new Map<string, Array<() => void>>();

  isDestroyed(): boolean {
    return this.destroyed;
  }

  on(event: string, callback: () => void): void {
    const handlers = this.handlers.get(event) || [];
    handlers.push(callback);
    this.handlers.set(event, handlers);
  }

  emitWebContents(event: string): void {
    this.webContentsHandlers.get(event)?.forEach((callback) => callback());
  }
}

class FakeInputMonitor implements GlobalAnnotationInputMonitor {
  readonly start = vi.fn(async (listener: (sample: GlobalAnnotationInputSample) => void) => {
    this.listener = listener;
  });
  readonly stop = vi.fn(async () => undefined);
  private listener: ((sample: GlobalAnnotationInputSample) => void) | null = null;
  private inputHealth: AnnotationInputHealth = {
    state: 'running', platform: 'darwin', restartCount: 0,
  };

  health(): AnnotationInputHealth {
    return { ...this.inputHealth };
  }

  emit(sample: GlobalAnnotationInputSample): void {
    this.listener?.(sample);
  }

  setHealth(inputHealth: AnnotationInputHealth): void {
    this.inputHealth = inputHealth;
  }
}

function inputSample(
  sequence: number,
  overrides: Partial<GlobalAnnotationInputSample> = {},
): GlobalAnnotationInputSample {
  return {
    sequence,
    modifierDown: false,
    primaryDown: false,
    cursor: { x: 200, y: 180 },
    capturedAt: 1_000 + sequence * 100,
    ...overrides,
  };
}

function createHarness(selectionOverrides: Partial<{
  displays: CaptureDisplay[];
  windows: CapturableWindow[];
  windowSources: Array<{ id: string; name: string; type: 'window' }>;
}> = {}) {
  const windows: FakeOverlayWindow[] = [];
  const host = { hide: vi.fn(), show: vi.fn(), webContents: { send: vi.fn() } };
  const intervals = new Map<number, () => void>();
  let nextInterval = 1;
  let displayChangeHandler: (() => void) | null = null;
  const inputMonitor = new FakeInputMonitor();
  const committedIssues: unknown[] = [];
  let now = 1_000;
  const dependencies: CaptureOverlayManagerDependencies = {
    prepareSelection: vi.fn().mockResolvedValue({
      displays: selectionOverrides.displays ?? [display],
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
    inputMonitor,
    now: () => {
      now += 10;
      return now;
    },
    isAnnotationEnabled: vi.fn(() => true),
    onMarkedIssueCommitted: (issue) => committedIssues.push(issue),
  };
  const manager = new CaptureOverlayManager(dependencies);
  return {
    manager,
    dependencies,
    windows,
    host,
    intervals,
    inputMonitor,
    committedIssues,
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
    expect(windows[0].show).toHaveBeenCalledOnce();
    expect(windows[0].focus).toHaveBeenCalledOnce();

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

    await expect(manager.confirmTarget(9999, windowTarget)).resolves.toEqual({ success: false, error: 'Unknown capture overlay.' });
    await expect(manager.confirmTarget(windows[0].webContents.id, windowTarget)).resolves.toEqual({ success: true });

    await expect(selection).resolves.toEqual(windowTarget);
    expect(host.show).not.toHaveBeenCalled();
  });

  it('rejects a stale window source instead of widening capture scope', async () => {
    const { manager, windows } = createHarness();
    const selection = manager.selectTarget();
    await vi.waitFor(() => expect(windows).toHaveLength(1));
    const stale = { ...windowTarget, sourceId: 'window:999:0' } as CaptureTarget;

    await expect(manager.confirmTarget(windows[0].webContents.id, stale)).resolves.toEqual({
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

    await expect(manager.confirmTarget(windows[0].webContents.id, galleryTarget)).resolves.toEqual({ success: true });
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

  it('does not let a cancelled selector load failure cancel the next request', async () => {
    const { manager, windows, dependencies } = createHarness();
    let rejectFirstLoad!: (error: Error) => void;
    vi.mocked(dependencies.loadRenderer)
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirstLoad = reject; }))
      .mockResolvedValueOnce(undefined);

    const firstSelection = manager.selectTarget();
    await vi.waitFor(() => expect(windows).toHaveLength(1));
    manager.cancelSelection();
    const secondSelection = manager.selectTarget();
    rejectFirstLoad(new Error('cancelled navigation'));
    await expect(firstSelection).resolves.toBeNull();
    await vi.waitFor(() => expect(windows).toHaveLength(2));
    expect(windows[1].destroy).not.toHaveBeenCalled();

    manager.cancelSelection();
    await expect(secondSelection).resolves.toBeNull();
  });

  it('does not create orphan overlays if cancellation wins while sources are loading', async () => {
    const { manager, windows, dependencies } = createHarness();
    let resolvePreparation!: (value: {
      displays: CaptureDisplay[];
      windows: CapturableWindow[];
      windowSources: [];
    }) => void;
    vi.mocked(dependencies.prepareSelection).mockImplementationOnce(() => new Promise((resolve) => {
      resolvePreparation = resolve;
    }));

    const selection = manager.selectTarget();
    manager.cancelSelection();
    resolvePreparation({ displays: [display], windows: [capturableWindow], windowSources: [] });

    await expect(selection).resolves.toBeNull();
    await Promise.resolve();
    expect(windows).toHaveLength(0);
  });

  it('broadcasts selection mode changes to every display overlay', async () => {
    const secondary: CaptureDisplay = {
      ...display,
      id: '2',
      label: 'Secondary',
      sourceId: 'screen:1:0',
      bounds: { x: 1440, y: 0, width: 1920, height: 1080 },
      isPrimary: false,
    };
    const { manager, windows } = createHarness({ displays: [display, secondary] });
    const selection = manager.selectTarget();
    await vi.waitFor(() => expect(windows).toHaveLength(2));

    expect(manager.setSelectionMode(windows[1].webContents.id, 'region')).toEqual({ success: true });
    for (const window of windows) {
      expect(window.webContents.send).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ kind: 'selection', mode: 'region' }),
      );
    }

    manager.cancelSelection();
    await selection;
  });

  it('refreshes exact window geometry once before confirmation', async () => {
    const { manager, windows, dependencies } = createHarness();
    const selection = manager.selectTarget();
    await vi.waitFor(() => expect(windows).toHaveLength(1));
    vi.mocked(dependencies.refreshWindow).mockResolvedValueOnce({
      ...capturableWindow,
      bounds: { x: 120, y: 90, width: 920, height: 710 },
    });

    await expect(manager.confirmTarget(windows[0].webContents.id, windowTarget))
      .resolves.toEqual({ success: true });
    await expect(selection).resolves.toEqual({
      ...windowTarget,
      bounds: { x: 120, y: 90, width: 920, height: 710 },
    });
  });

  it('keeps selection open when the exact window disappears during confirmation', async () => {
    const { manager, windows, dependencies } = createHarness();
    const selection = manager.selectTarget();
    await vi.waitFor(() => expect(windows).toHaveLength(1));
    vi.mocked(dependencies.refreshWindow).mockResolvedValueOnce(null);

    await expect(manager.confirmTarget(windows[0].webContents.id, windowTarget)).resolves.toEqual({
      success: false,
      error: 'The selected window is no longer available.',
    });
    expect(windows[0].destroy).not.toHaveBeenCalled();

    manager.cancelSelection();
    await selection;
  });
});

describe('CaptureOverlayManager annotation lifecycle', () => {
  it('does not throw when the host renderer is already destroyed during app teardown', () => {
    const { manager, host } = createHarness();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    host.webContents.send.mockImplementation(() => {
      throw new Error('Object has been destroyed');
    });

    expect(() => manager.destroy()).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('fails closed when gallery fallback has no trustworthy annotation geometry', async () => {
    const { manager, windows } = createHarness();
    const fallbackTarget: CaptureTarget = {
      ...windowTarget,
      geometryAvailable: false,
    };

    await expect(manager.beginAnnotation('session-1', fallbackTarget))
      .rejects.toThrow(/geometry/i);
    expect(windows).toHaveLength(0);
  });

  it('cleans up a protected annotation overlay when its renderer fails to load', async () => {
    const { manager, windows, dependencies } = createHarness();
    vi.mocked(dependencies.loadRenderer).mockRejectedValueOnce(new Error('renderer failed'));

    await expect(manager.beginAnnotation('session-1', windowTarget)).rejects.toThrow('renderer failed');

    expect(windows[0].setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
    expect(windows[0].destroy).toHaveBeenCalledOnce();
  });

  it('tears down a click-blocking annotation overlay when its renderer crashes', async () => {
    const { manager, windows, host } = createHarness();
    await manager.beginAnnotation('session-1', windowTarget);

    windows[0].emitWebContents('render-process-gone');

    expect(windows[0].destroy).toHaveBeenCalledOnce();
    expect(host.webContents.send).toHaveBeenCalledWith(
      expect.any(String),
      {
        active: false,
        mode: 'interact',
        error: 'The drawing overlay stopped unexpectedly. Recording continues without live drawing.',
      },
    );
  });

  it('uses modifier transitions to draw without focusing the protected overlay', async () => {
    const { manager, windows, host, inputMonitor } = createHarness();

    await manager.beginAnnotation('session-1', windowTarget, 500);

    expect(windows[0].setBounds).toHaveBeenCalledWith(windowTarget.bounds);
    expect(windows[0].setFocusable).toHaveBeenCalledWith(false);
    expect(windows[0].setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
    inputMonitor.emit(inputSample(1));
    inputMonitor.emit(inputSample(2, { modifierDown: true }));
    expect(windows[0].setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
    expect(windows[0].showInactive).toHaveBeenCalled();
    expect(windows[0].focus).not.toHaveBeenCalled();
    expect(host.webContents.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ active: true, mode: 'draw', inputMode: 'modifier' }),
    );
    expect(windows[0].webContents.send).toHaveBeenCalledWith(
      expect.any(String),
      { type: 'mode', sessionId: 'session-1', mode: 'draw' },
    );

    inputMonitor.emit(inputSample(3, { modifierDown: false }));
    expect(windows[0].setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
    expect(windows[0].focus).not.toHaveBeenCalled();
  });

  it('finishes an active stroke before requesting the marked snapshot on modifier release', async () => {
    const { manager, windows, host, inputMonitor } = createHarness();
    await manager.beginAnnotation('session-1', windowTarget, 500);
    inputMonitor.emit(inputSample(1));
    inputMonitor.emit(inputSample(2, { modifierDown: true }));
    expect(manager.submitAnnotationEvent(windows[0].webContents.id, {
      type: 'stroke-start',
      sessionId: 'session-1',
      stroke: {
        id: 'stroke-1', tool: 'freehand', color: '#ff3b30', width: 0.008,
        points: [{ x: 0.1, y: 0.1 }],
      },
    }).success).toBe(true);
    host.webContents.send.mockClear();

    inputMonitor.emit(inputSample(3, {
      modifierDown: false,
      cursor: { x: 550, y: 430 },
    }));

    const annotationEvents = host.webContents.send.mock.calls
      .filter((call) => call[0].includes('annotation-event'))
      .map((call) => call[1] as AnnotationEvent);
    expect(annotationEvents.map((event) => event.type)).toEqual([
      'stroke-points', 'stroke-end', 'mode', 'snapshot-request',
    ]);
    expect(annotationEvents[0]).toMatchObject({
      strokeId: 'stroke-1', points: [{ x: 0.5, y: 0.5 }],
    });
    expect(annotationEvents[3]).toMatchObject({ revision: 1, requestedAt: 1_300 });
  });

  it('lets an ordinary click anywhere commit one issue and clears without replaying input', async () => {
    const { manager, windows, host, inputMonitor, committedIssues } = createHarness();
    await manager.beginAnnotation('session-1', windowTarget, 500);
    inputMonitor.emit(inputSample(1));
    inputMonitor.emit(inputSample(2, { modifierDown: true }));
    const senderId = windows[0].webContents.id;
    manager.submitAnnotationEvent(senderId, {
      type: 'stroke-start', sessionId: 'session-1',
      stroke: {
        id: 'stroke-1', tool: 'circle', color: '#ffcc00', width: 0.007,
        points: [{ x: 0.2, y: 0.2 }],
      },
    });
    manager.submitAnnotationEvent(senderId, {
      type: 'stroke-end', sessionId: 'session-1', strokeId: 'stroke-1',
    });
    inputMonitor.emit(inputSample(3, { modifierDown: false }));
    expect(host.webContents.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ pendingMarkedIssue: true, markedIssueCount: 0 }),
    );
    windows[0].webContents.send.mockClear();

    inputMonitor.emit(inputSample(4, {
      primaryDown: true,
      cursor: { x: 4_000, y: 3_000 },
    }));
    inputMonitor.emit(inputSample(5, {
      primaryDown: false,
      cursor: { x: 4_000, y: 3_000 },
    }));

    expect(committedIssues).toHaveLength(1);
    expect(committedIssues[0]).toMatchObject({
      id: 'marked-issue-001', strokeIds: ['stroke-1'], snapshotRevision: 1,
    });
    expect(windows[0].webContents.send).toHaveBeenCalledWith(
      expect.any(String),
      { type: 'clear', sessionId: 'session-1' },
    );
    expect(windows[0].setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
    expect(windows[0].focus).not.toHaveBeenCalled();
    expect(host.webContents.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ pendingMarkedIssue: false, markedIssueCount: 1 }),
    );
  });

  it('keeps manual Draw as a non-focusing fallback when the monitor is unavailable', async () => {
    const { manager, windows, host, inputMonitor } = createHarness();
    inputMonitor.setHealth({
      state: 'unsupported', platform: 'linux', restartCount: 0,
      error: 'Global modifier observation is unavailable on this platform.',
    });

    await manager.beginAnnotation('session-1', windowTarget);

    expect(host.webContents.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ active: true, inputMode: 'fallback' }),
    );
    expect(manager.setAnnotationMode('draw')).toEqual({ success: true });
    expect(windows[0].setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
    expect(windows[0].focus).not.toHaveBeenCalled();
  });

  it('commits and clears one fallback issue when the user chooses Done', async () => {
    const { manager, windows, inputMonitor, committedIssues } = createHarness();
    inputMonitor.setHealth({
      state: 'unsupported', platform: 'linux', restartCount: 0,
      error: 'Global modifier observation is unavailable on this platform.',
    });
    await manager.beginAnnotation('session-1', windowTarget, 500);
    expect(manager.setAnnotationMode('draw')).toEqual({ success: true });

    const senderId = windows[0].webContents.id;
    expect(manager.submitAnnotationEvent(senderId, {
      type: 'stroke-start', sessionId: 'session-1',
      stroke: {
        id: 'fallback-stroke', tool: 'freehand', color: '#ff3b30', width: 0.008,
        points: [{ x: 0.25, y: 0.4 }],
      },
    })).toEqual({ success: true });
    expect(manager.submitAnnotationEvent(senderId, {
      type: 'stroke-end', sessionId: 'session-1', strokeId: 'fallback-stroke',
    })).toEqual({ success: true });

    expect(manager.setAnnotationMode('interact')).toEqual({ success: true });

    expect(committedIssues).toHaveLength(1);
    expect(committedIssues[0]).toMatchObject({
      id: 'marked-issue-001',
      strokeIds: ['fallback-stroke'],
      snapshotRevision: 1,
    });
    expect(windows[0].webContents.send).toHaveBeenCalledWith(
      expect.any(String),
      { type: 'clear', sessionId: 'session-1' },
    );
  });

  it('forces click-through when annotation becomes paused or the monitor fails', async () => {
    const { manager, windows, inputMonitor, intervals, dependencies } = createHarness();
    await manager.beginAnnotation('session-1', windowTarget);
    inputMonitor.emit(inputSample(1));
    inputMonitor.emit(inputSample(2, { modifierDown: true }));
    vi.mocked(dependencies.isAnnotationEnabled).mockReturnValue(false);
    inputMonitor.emit(inputSample(3, { modifierDown: false }));
    inputMonitor.emit(inputSample(4, { modifierDown: true }));
    expect(windows[0].setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });

    vi.mocked(dependencies.isAnnotationEnabled).mockReturnValue(true);
    inputMonitor.setHealth({
      state: 'failed', platform: 'darwin', restartCount: 1, error: 'observer failed',
    });
    for (const callback of intervals.values()) callback();
    expect(windows[0].setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
  });

  it('finishes and snapshots a stroke on pause while preserving it for the next commit', async () => {
    const { manager, windows, host, inputMonitor, committedIssues } = createHarness();
    await manager.beginAnnotation('session-1', windowTarget, 500);
    inputMonitor.emit(inputSample(1));
    inputMonitor.emit(inputSample(2, { modifierDown: true }));
    const senderId = windows[0].webContents.id;
    manager.submitAnnotationEvent(senderId, {
      type: 'stroke-start', sessionId: 'session-1',
      stroke: {
        id: 'before-pause', tool: 'highlight', color: '#34c759', width: 0.025,
        points: [{ x: 0.2, y: 0.3 }],
      },
    });
    host.webContents.send.mockClear();

    expect(manager.setAnnotationMode('interact')).toEqual({ success: true });

    const sentTypes = host.webContents.send.mock.calls
      .filter((call) => call[0].includes('annotation-event'))
      .map((call) => (call[1] as AnnotationEvent).type);
    expect(sentTypes).toEqual(['stroke-end', 'mode', 'snapshot-request']);
    expect(windows[0].webContents.send).not.toHaveBeenCalledWith(
      expect.any(String),
      { type: 'clear', sessionId: 'session-1' },
    );

    inputMonitor.emit(inputSample(3, { modifierDown: false }));
    inputMonitor.emit(inputSample(4, { primaryDown: true }));
    expect(committedIssues).toHaveLength(1);
    expect(committedIssues[0]).toMatchObject({ strokeIds: ['before-pause'] });
  });

  it('snapshots and commits one final pending issue when recording stops', async () => {
    const { manager, windows, host, inputMonitor, committedIssues } = createHarness();
    await manager.beginAnnotation('session-1', windowTarget, 500);
    inputMonitor.emit(inputSample(1));
    inputMonitor.emit(inputSample(2, { modifierDown: true }));
    manager.submitAnnotationEvent(windows[0].webContents.id, {
      type: 'stroke-start', sessionId: 'session-1',
      stroke: {
        id: 'at-stop', tool: 'circle', color: '#0a84ff', width: 0.007,
        points: [{ x: 0.3, y: 0.4 }],
      },
    });
    host.webContents.send.mockClear();

    expect(manager.finalizePendingIssue(1_500)).toMatchObject({
      id: 'marked-issue-001', strokeIds: ['at-stop'], snapshotRevision: 1,
    });
    expect(manager.finalizePendingIssue(1_600)).toBeNull();

    const sentTypes = host.webContents.send.mock.calls
      .filter((call) => call[0].includes('annotation-event'))
      .map((call) => (call[1] as AnnotationEvent).type);
    expect(sentTypes).toEqual(['stroke-end', 'mode', 'snapshot-request', 'clear']);
    expect(committedIssues).toHaveLength(1);
  });

  it('routes only active-session annotation events from its annotation window', async () => {
    const { manager, windows, host } = createHarness();
    await manager.beginAnnotation('session-1', windowTarget);
    manager.setAnnotationMode('draw');
    const valid: AnnotationEvent = {
      type: 'clear',
      sessionId: 'session-1',
    };

    expect(manager.submitAnnotationEvent(9999, valid).success).toBe(false);
    expect(manager.submitAnnotationEvent(windows[0].webContents.id, { ...valid, sessionId: 'session-2' }).success).toBe(false);
    expect(manager.submitAnnotationEvent(windows[0].webContents.id, valid)).toEqual({ success: true });
    expect(host.webContents.send).toHaveBeenCalledWith(expect.any(String), valid);
    expect(windows[0].webContents.send).not.toHaveBeenCalledWith(expect.any(String), valid);
  });

  it('rejects malformed or oversized annotation payloads at the main-process boundary', async () => {
    const { manager, windows, host } = createHarness();
    await manager.beginAnnotation('session-1', windowTarget);
    manager.setAnnotationMode('draw');
    const invalidColor = {
      type: 'stroke-start',
      sessionId: 'session-1',
      stroke: {
        id: 'bad', tool: 'freehand', color: '#000000', width: 0.01,
        points: [{ x: 0.2, y: 0.2 }],
      },
    } as unknown as AnnotationEvent;
    const oversized = {
      type: 'stroke-points',
      sessionId: 'session-1',
      strokeId: 'bad',
      points: Array.from({ length: 257 }, () => ({ x: 0.2, y: 0.2 })),
    } as AnnotationEvent;

    expect(manager.submitAnnotationEvent(windows[0].webContents.id, invalidColor).success).toBe(false);
    expect(manager.submitAnnotationEvent(windows[0].webContents.id, oversized).success).toBe(false);
    expect(host.webContents.send).not.toHaveBeenCalledWith(expect.any(String), invalidColor);
    expect(host.webContents.send).not.toHaveBeenCalledWith(expect.any(String), oversized);
  });

  it('rejects drawing events while the annotation overlay is click-through', async () => {
    const { manager, windows, host } = createHarness();
    await manager.beginAnnotation('session-1', windowTarget);
    const drawEvent: AnnotationEvent = {
      type: 'stroke-start',
      sessionId: 'session-1',
      stroke: {
        id: 'stroke-1', tool: 'freehand', color: '#ff3b30', width: 0.008,
        points: [{ x: 0.2, y: 0.2 }],
      },
    };

    expect(manager.submitAnnotationEvent(windows[0].webContents.id, drawEvent).success).toBe(false);
    expect(host.webContents.send).not.toHaveBeenCalledWith(expect.any(String), drawEvent);
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
