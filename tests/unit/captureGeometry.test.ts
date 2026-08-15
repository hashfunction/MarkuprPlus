import { describe, expect, it } from 'vitest';
import {
  containRect,
  findWindowAtPoint,
  matchCaptureDisplays,
  normalizeRegion,
  regionToSourceCrop,
  sameCaptureTarget,
  validateCaptureTarget,
} from '../../src/shared/captureGeometry';
import type {
  CapturableWindow,
  CaptureDisplay,
  CaptureTarget,
} from '../../src/shared/types';

const display: CaptureDisplay = {
  id: '37',
  label: 'Built-in Display',
  sourceId: 'screen:0:0',
  sourceName: 'Entire Screen',
  bounds: { x: -1600, y: 0, width: 1728, height: 1117 },
  scaleFactor: 2,
  isPrimary: true,
};

function windowFixture(
  sourceId: string,
  bounds: CapturableWindow['bounds'],
): CapturableWindow {
  return {
    sourceId,
    sourceName: sourceId,
    nativeWindowId: sourceId.split(':')[1],
    appName: 'Fixture App',
    bounds,
    ownerPid: 42,
  };
}

describe('capture geometry', () => {
  it('maps displays by explicit display id even when capture sources are reversed', () => {
    const displays = matchCaptureDisplays(
      [
        { id: '1', label: 'Left', bounds: { x: -1440, y: 0, width: 1440, height: 900 }, scaleFactor: 1 },
        { id: '2', label: 'Right', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 2 },
      ],
      [
        { id: 'screen:1:0', name: 'Right source', displayId: '2' },
        { id: 'screen:0:0', name: 'Left source', displayId: '1' },
      ],
      '2',
    );

    expect(displays.map(({ id, sourceId }) => ({ id, sourceId }))).toEqual([
      { id: '1', sourceId: 'screen:0:0' },
      { id: '2', sourceId: 'screen:1:0' },
    ]);
    expect(displays[1].isPrimary).toBe(true);
  });

  it('does not pair unidentified sources to multiple displays by array order', () => {
    const displays = matchCaptureDisplays(
      [
        { id: '1', label: 'Left', bounds: { x: -1440, y: 0, width: 1440, height: 900 }, scaleFactor: 1 },
        { id: '2', label: 'Right', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 2 },
      ],
      [
        { id: 'screen:0:0', name: 'Unknown A' },
        { id: 'screen:1:0', name: 'Unknown B' },
      ],
      '2',
    );

    expect(displays).toEqual([]);
  });

  it('permits unidentified source fallback only when there is one display and one source', () => {
    const displays = matchCaptureDisplays(
      [{ id: '9', label: '', bounds: { x: 0, y: 0, width: 1280, height: 720 }, scaleFactor: 1 }],
      [{ id: 'screen:0:0', name: 'Only display' }],
      '9',
    );

    expect(displays).toEqual([{
      id: '9',
      label: 'Only display',
      sourceId: 'screen:0:0',
      sourceName: 'Only display',
      bounds: { x: 0, y: 0, width: 1280, height: 720 },
      scaleFactor: 1,
      isPrimary: true,
    }]);
  });

  it('selects the first matching window because input order is front to back', () => {
    const front = windowFixture('window:22:0', { x: 100, y: 50, width: 400, height: 300 });
    const back = windowFixture('window:11:0', { x: 0, y: 0, width: 800, height: 600 });

    expect(findWindowAtPoint([front, back], { x: 120, y: 80 })?.sourceId).toBe('window:22:0');
  });

  it('does not include the right or bottom edge in hit testing', () => {
    const target = windowFixture('window:11:0', { x: 10, y: 20, width: 100, height: 80 });

    expect(findWindowAtPoint([target], { x: 110, y: 40 })).toBeNull();
    expect(findWindowAtPoint([target], { x: 40, y: 100 })).toBeNull();
  });

  it('normalizes a drag on a negative-origin display into display-relative coordinates', () => {
    expect(
      normalizeRegion(
        { x: -1500, y: 100 },
        { x: -1200, y: 400 },
        display.bounds,
      ),
    ).toEqual({ x: 100, y: 100, width: 300, height: 300 });
  });

  it('clamps a region drag to its display', () => {
    expect(
      normalizeRegion(
        { x: -1700, y: -50 },
        { x: 500, y: 1400 },
        display.bounds,
      ),
    ).toEqual({ x: 0, y: 0, width: 1728, height: 1117 });
  });

  it('rejects regions smaller than 32 device-independent pixels', () => {
    expect(
      normalizeRegion(
        { x: -1500, y: 100 },
        { x: -1469, y: 300 },
        display.bounds,
      ),
    ).toBeNull();
  });

  it('converts a display-relative region to source-video pixels independently per axis', () => {
    const target: CaptureTarget = {
      kind: 'region',
      sourceId: display.sourceId,
      sourceName: 'Selected Region',
      displayId: display.id,
      displayBounds: display.bounds,
      scaleFactor: display.scaleFactor,
      region: { x: 100, y: 100, width: 300, height: 300 },
    };

    expect(regionToSourceCrop(target, { width: 3456, height: 2234 })).toEqual({
      x: 200,
      y: 200,
      width: 600,
      height: 600,
    });
  });

  it('contains a wide source without cropping it', () => {
    expect(containRect(
      { width: 1920, height: 1080 },
      { width: 1000, height: 1000 },
    )).toEqual({ x: 0, y: 218.75, width: 1000, height: 562.5 });
  });

  it('validates a region only against the exact advertised display source', () => {
    const valid: CaptureTarget = {
      kind: 'region',
      sourceId: display.sourceId,
      sourceName: 'Selected Region',
      displayId: display.id,
      displayBounds: display.bounds,
      scaleFactor: display.scaleFactor,
      region: { x: 100, y: 100, width: 300, height: 300 },
    };
    const stale = { ...valid, sourceId: 'screen:99:0' };

    expect(validateCaptureTarget(valid, [display])).toBe(true);
    expect(validateCaptureTarget(stale, [display])).toBe(false);
  });

  it('rejects a window target with non-finite geometry', () => {
    const target: CaptureTarget = {
      kind: 'window',
      sourceId: 'window:12:0',
      sourceName: 'Broken',
      nativeWindowId: '12',
      appName: 'Fixture App',
      bounds: { x: Number.NaN, y: 10, width: 400, height: 300 },
    };

    expect(validateCaptureTarget(target, [display])).toBe(false);
  });

  it('compares capture targets structurally without depending on property order', () => {
    const target: CaptureTarget = {
      kind: 'window',
      sourceId: 'window:12:0',
      sourceName: 'Editor',
      nativeWindowId: '12',
      appName: 'Editor App',
      bounds: { x: 10, y: 20, width: 400, height: 300 },
      geometryAvailable: true,
    };
    const reordered = {
      geometryAvailable: true,
      bounds: { height: 300, width: 400, y: 20, x: 10 },
      appName: 'Editor App',
      nativeWindowId: '12',
      sourceName: 'Editor',
      sourceId: 'window:12:0',
      kind: 'window',
    } as CaptureTarget;

    expect(sameCaptureTarget(target, reordered)).toBe(true);
    expect(sameCaptureTarget(target, { ...target, bounds: { ...target.bounds, width: 401 } })).toBe(false);
  });
});
