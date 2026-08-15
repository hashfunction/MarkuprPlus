import { describe, expect, it } from 'vitest';
import type {
  CaptureDisplay,
  CapturableWindow,
  CaptureSource,
} from '../../src/shared/types';
import {
  createSelectionState,
  reduceSelection,
  windowTargetFromSource,
} from '../../src/renderer/overlays/selectionModel';

const display: CaptureDisplay = {
  id: '2',
  label: 'Left Display',
  sourceId: 'screen:1:0',
  sourceName: 'Screen 2',
  bounds: { x: -1440, y: 0, width: 1440, height: 900 },
  scaleFactor: 2,
  isPrimary: false,
};

const back: CapturableWindow = {
  sourceId: 'window:10:0',
  sourceName: 'Back',
  nativeWindowId: '10',
  appName: 'Browser',
  bounds: { x: -1400, y: 20, width: 1000, height: 800 },
};

const front: CapturableWindow = {
  sourceId: 'window:20:0',
  sourceName: 'Front',
  nativeWindowId: '20',
  appName: 'Editor',
  bounds: { x: -1200, y: 100, width: 700, height: 600 },
};

const context = { display, windows: [front, back] };

describe('capture selection model', () => {
  it('starts in Window mode', () => {
    expect(createSelectionState().mode).toBe('window');
  });

  it('hovers the topmost window at a global pointer point', () => {
    const result = reduceSelection(createSelectionState(), {
      type: 'pointer-move',
      point: { x: -1000, y: 200 },
    }, context);

    expect(result.state.hoveredSourceId).toBe('window:20:0');
    expect(result.effect).toBeNull();
  });

  it('confirms the exact hovered window on pointer down', () => {
    const hovered = {
      ...createSelectionState(),
      hoveredSourceId: front.sourceId,
    };
    const result = reduceSelection(hovered, {
      type: 'pointer-down',
      point: { x: -1000, y: 200 },
    }, context);

    expect(result.effect).toEqual({
      type: 'confirm',
      target: {
        kind: 'window',
        sourceId: front.sourceId,
        sourceName: front.sourceName,
        nativeWindowId: front.nativeWindowId,
        appName: front.appName,
        bounds: front.bounds,
        geometryAvailable: true,
      },
    });
  });

  it('normalizes a region drag using global negative-origin coordinates', () => {
    const regionState = reduceSelection(createSelectionState(), { type: 'set-mode', mode: 'region' }, context).state;
    const started = reduceSelection(regionState, {
      type: 'pointer-down', point: { x: -1300, y: 100 },
    }, context).state;
    const result = reduceSelection(started, {
      type: 'pointer-up', point: { x: -900, y: 500 },
    }, context);

    expect(result.effect).toEqual({
      type: 'confirm',
      target: {
        kind: 'region',
        sourceId: display.sourceId,
        sourceName: 'Left Display — Selected Region',
        displayId: display.id,
        displayBounds: display.bounds,
        scaleFactor: display.scaleFactor,
        region: { x: 140, y: 100, width: 400, height: 400 },
      },
    });
  });

  it('keeps Region mode open with an error for a too-small drag', () => {
    const regionState = reduceSelection(createSelectionState(), { type: 'set-mode', mode: 'region' }, context).state;
    const started = reduceSelection(regionState, {
      type: 'pointer-down', point: { x: -1300, y: 100 },
    }, context).state;
    const result = reduceSelection(started, {
      type: 'pointer-up', point: { x: -1280, y: 200 },
    }, context);

    expect(result.effect).toBeNull();
    expect(result.state.error).toBe('Drag an area at least 32 × 32 pixels.');
  });

  it('confirms the current display explicitly in Full Screen mode', () => {
    const screenState = reduceSelection(createSelectionState(), { type: 'set-mode', mode: 'screen' }, context).state;
    const result = reduceSelection(screenState, {
      type: 'pointer-down', point: { x: -1000, y: 200 },
    }, context);

    expect(result.effect).toEqual({
      type: 'confirm',
      target: {
        kind: 'screen',
        sourceId: display.sourceId,
        sourceName: display.sourceName,
        displayId: display.id,
        displayBounds: display.bounds,
        scaleFactor: display.scaleFactor,
      },
    });
  });

  it('emits cancellation on Escape', () => {
    expect(reduceSelection(createSelectionState(), { type: 'cancel' }, context).effect).toEqual({ type: 'cancel' });
  });

  it('builds an exact window target from the source gallery when geometry is unavailable', () => {
    const source: CaptureSource = {
      id: 'window:300:0',
      name: 'Mail',
      type: 'window',
      appIcon: 'data:image/png;base64,mail',
    };

    expect(windowTargetFromSource(source, display)).toEqual({
      kind: 'window',
      sourceId: 'window:300:0',
      sourceName: 'Mail',
      nativeWindowId: '300',
      appName: 'Mail',
      bounds: display.bounds,
      geometryAvailable: false,
    });
  });
});
