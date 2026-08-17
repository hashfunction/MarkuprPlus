import { describe, expect, it, vi } from 'vitest';
import {
  createElectronTestCaptureFixtures,
  ElectronTestInputMonitor,
  getElectronTestReviewSaveDelay,
  isElectronTestHarnessAllowed,
} from '../../src/main/e2e/ElectronTestHarness';

describe('Electron test harness guard', () => {
  it('requires an explicit environment flag and an unpackaged application', () => {
    expect(isElectronTestHarnessAllowed({ requested: true, isPackaged: false })).toBe(true);
    expect(isElectronTestHarnessAllowed({ requested: false, isPackaged: false })).toBe(false);
    expect(isElectronTestHarnessAllowed({ requested: true, isPackaged: true })).toBe(false);
  });

  it('allows a bounded review-save delay only in the unpackaged test harness', () => {
    expect(getElectronTestReviewSaveDelay({
      requested: true,
      isPackaged: false,
      value: '500',
    })).toBe(500);
    expect(getElectronTestReviewSaveDelay({
      requested: true,
      isPackaged: true,
      value: '500',
    })).toBe(0);
    expect(getElectronTestReviewSaveDelay({
      requested: false,
      isPackaged: false,
      value: '500',
    })).toBe(0);
    expect(getElectronTestReviewSaveDelay({
      requested: true,
      isPackaged: false,
      value: 'not-a-number',
    })).toBe(0);
    expect(getElectronTestReviewSaveDelay({
      requested: true,
      isPackaged: false,
      value: '999999',
    })).toBe(2_000);
  });

  it('delivers only validated, increasing input samples while running', async () => {
    const listener = vi.fn();
    const monitor = new ElectronTestInputMonitor('darwin');
    await monitor.start(listener);

    expect(monitor.inject({
      sequence: 1,
      modifierDown: false,
      primaryDown: false,
      cursor: { x: 20, y: 30 },
      capturedAt: 1_000,
    })).toEqual({ success: true });
    expect(monitor.inject({
      sequence: 1,
      modifierDown: true,
      primaryDown: false,
      cursor: { x: 20, y: 30 },
      capturedAt: 1_001,
    })).toEqual({ success: false, error: 'Input sequence must increase.' });
    expect(monitor.inject({
      sequence: 2,
      modifierDown: true,
      primaryDown: false,
      cursor: { x: Number.NaN, y: 30 },
      capturedAt: 1_002,
    })).toEqual({ success: false, error: 'Invalid annotation input sample.' });

    expect(listener).toHaveBeenCalledOnce();
    expect(monitor.health()).toMatchObject({ state: 'running', platform: 'darwin' });
  });

  it('can force the fallback state without delivering further samples', async () => {
    const listener = vi.fn();
    const monitor = new ElectronTestInputMonitor('win32');
    await monitor.start(listener);

    monitor.setAvailable(false, 'Injected observer failure.');

    expect(monitor.health()).toEqual({
      state: 'failed',
      platform: 'win32',
      restartCount: 0,
      error: 'Injected observer failure.',
    });
    expect(monitor.inject({
      sequence: 1,
      modifierDown: false,
      primaryDown: false,
      cursor: { x: 20, y: 30 },
      capturedAt: 1_000,
    })).toEqual({ success: false, error: 'Test input monitor is not running.' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('creates an exact deterministic window target inside the real display bounds', () => {
    const fixtures = createElectronTestCaptureFixtures({
      id: '42',
      label: 'Test Display',
      bounds: { x: -1200, y: 40, width: 1200, height: 800 },
      scaleFactor: 2,
    });

    expect(fixtures.display).toMatchObject({
      id: '42',
      label: 'Test Display',
      sourceId: 'screen:e2e:0',
      sourceName: 'MarkuprPlus Test Display',
      bounds: { x: -1200, y: 40, width: 1200, height: 800 },
      isPrimary: true,
    });
    expect(fixtures.window).toMatchObject({
      sourceId: 'window:e2e:0',
      appName: 'MarkuprPlus Test Fixture',
    });
    expect(fixtures.window.bounds.x).toBeGreaterThanOrEqual(fixtures.display.bounds.x);
    expect(fixtures.window.bounds.y).toBeGreaterThanOrEqual(fixtures.display.bounds.y);
    expect(fixtures.window.bounds.x + fixtures.window.bounds.width)
      .toBeLessThanOrEqual(fixtures.display.bounds.x + fixtures.display.bounds.width);
    expect(fixtures.window.bounds.y + fixtures.window.bounds.height)
      .toBeLessThanOrEqual(fixtures.display.bounds.y + fixtures.display.bounds.height);
  });
});
