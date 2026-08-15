import { describe, expect, it, vi } from 'vitest';
import type {
  AnnotationEvent,
  CapturableWindow,
  CaptureDisplay,
  CaptureTarget,
} from '../../src/shared/types';
import {
  CaptureOverlayManager,
  type CaptureOverlayManagerDependencies,
  type CaptureOverlayWindow,
} from '../../src/main/capture/CaptureOverlayManager';

const display: CaptureDisplay = {
  id: '44',
  label: 'Left display',
  sourceId: 'screen:44:0',
  sourceName: 'Left display',
  bounds: { x: -1600, y: -120, width: 1600, height: 1000 },
  scaleFactor: 2,
  isPrimary: true,
};

const exactWindow: CapturableWindow = {
  sourceId: 'window:700:0',
  sourceName: 'Issue form',
  nativeWindowId: '700',
  appName: 'Browser',
  bounds: { x: -1450, y: 20, width: 1000, height: 720 },
  ownerPid: 70,
};

class LifecycleWindow implements CaptureOverlayWindow {
  static nextId = 1;
  private readonly windowHandlers = new Map<string, Array<() => void>>();
  private readonly rendererHandlers = new Map<string, Array<() => void>>();
  readonly webContents = {
    id: LifecycleWindow.nextId++,
    send: vi.fn(),
    on: vi.fn((event: string, callback: () => void) => {
      const handlers = this.rendererHandlers.get(event) || [];
      handlers.push(callback);
      this.rendererHandlers.set(event, handlers);
    }),
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
  private destroyed = false;

  isDestroyed(): boolean { return this.destroyed; }
  on(event: string, callback: () => void): void {
    const handlers = this.windowHandlers.get(event) || [];
    handlers.push(callback);
    this.windowHandlers.set(event, handlers);
  }
  crashRenderer(): void {
    this.rendererHandlers.get('render-process-gone')?.forEach((callback) => callback());
  }
}

function targetForCycle(index: number): CaptureTarget {
  if (index % 3 === 1) {
    return {
      kind: 'region',
      sourceId: display.sourceId,
      sourceName: 'Left display — Selected Region',
      displayId: display.id,
      displayBounds: display.bounds,
      scaleFactor: display.scaleFactor,
      region: { x: 100, y: 80, width: 640, height: 480 },
    };
  }
  if (index % 3 === 2) {
    return {
      kind: 'screen',
      sourceId: display.sourceId,
      sourceName: display.sourceName,
      displayId: display.id,
      displayBounds: display.bounds,
      scaleFactor: display.scaleFactor,
    };
  }
  return {
    kind: 'window',
    sourceId: exactWindow.sourceId,
    sourceName: exactWindow.sourceName,
    nativeWindowId: exactWindow.nativeWindowId,
    appName: exactWindow.appName,
    bounds: exactWindow.bounds,
    geometryAvailable: true,
  };
}

describe('capture selection and annotation lifecycle', () => {
  it('leaves no overlays or timers after repeated cancel/start/draw/pause/crash/stop cycles', async () => {
    const windows: LifecycleWindow[] = [];
    const timers = new Map<number, () => void>();
    const annotationEvents: AnnotationEvent[] = [];
    let timerId = 0;
    const dependencies: CaptureOverlayManagerDependencies = {
      prepareSelection: vi.fn().mockResolvedValue({
        displays: [display], windows: [exactWindow], windowSources: [],
      }),
      createWindow: vi.fn(() => {
        const window = new LifecycleWindow();
        windows.push(window);
        return window;
      }),
      loadRenderer: vi.fn().mockResolvedValue(undefined),
      getHostWindow: () => ({ hide: vi.fn(), show: vi.fn(), webContents: { send: vi.fn() } }),
      getCursorPoint: () => ({ x: -1000, y: 300 }),
      refreshWindow: vi.fn().mockResolvedValue(exactWindow),
      setInterval: (callback) => {
        timerId += 1;
        timers.set(timerId, callback);
        return timerId;
      },
      clearInterval: (id) => { timers.delete(id as number); },
      onDisplayChange: () => () => undefined,
      onAnnotationEvent: (event) => annotationEvents.push(event),
    };
    const manager = new CaptureOverlayManager(dependencies);

    for (let index = 0; index < 12; index += 1) {
      const selection = manager.selectTarget();
      await vi.waitFor(() => expect(windows.filter((window) => !window.isDestroyed())).toHaveLength(1));
      const selector = windows.find((window) => !window.isDestroyed())!;

      if (index % 4 === 0) {
        manager.cancelSelection();
        await expect(selection).resolves.toBeNull();
        expect(timers.size).toBe(0);
        continue;
      }

      const target = targetForCycle(index);
      const mode = target.kind === 'region' ? 'region' : target.kind === 'screen' ? 'screen' : 'window';
      expect(manager.setSelectionMode(selector.webContents.id, mode).success).toBe(true);
      await expect(manager.confirmTarget(selector.webContents.id, target)).resolves.toEqual({ success: true });
      await expect(selection).resolves.toMatchObject({ kind: target.kind, sourceId: target.sourceId });

      await manager.beginAnnotation(`session-${index}`, target);
      const annotation = windows.find((window) => !window.isDestroyed())!;
      expect(manager.setAnnotationMode('draw').success).toBe(true);
      const strokeId = `stroke-${index}`;
      for (const event of [
        {
          type: 'stroke-start', sessionId: `session-${index}`,
          stroke: {
            id: strokeId, tool: 'circle', color: '#ff3b30', width: 0.007,
            points: [{ x: 0.2, y: 0.2 }],
          },
        },
        {
          type: 'stroke-points', sessionId: `session-${index}`, strokeId,
          points: [{ x: 0.7, y: 0.7 }],
        },
        { type: 'stroke-end', sessionId: `session-${index}`, strokeId },
      ] as AnnotationEvent[]) {
        expect(manager.submitAnnotationEvent(annotation.webContents.id, event).success).toBe(true);
      }

      // Pause safety: interaction mode rejects any late drawing command.
      expect(manager.setAnnotationMode('interact').success).toBe(true);
      expect(manager.submitAnnotationEvent(annotation.webContents.id, {
        type: 'clear', sessionId: `session-${index}`,
      }).success).toBe(false);

      if (index === 10) annotation.crashRenderer();
      else manager.endAnnotation();
      expect(timers.size).toBe(0);
      expect(windows.every((window) => window.isDestroyed())).toBe(true);
    }

    manager.destroy();
    expect(timers.size).toBe(0);
    expect(annotationEvents.filter((event) => event.type === 'stroke-end')).toHaveLength(9);
  });
});
