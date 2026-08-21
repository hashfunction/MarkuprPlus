/**
 * PopoverManager Unit Tests
 *
 * Covers tray anchoring, including the invariant that the window must never
 * sit at Electron's default (screen-centered) position. A dialog parented to
 * the popover surfaces the window without going through show(), so the
 * anchored position has to be applied at creation time.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from 'electron';

vi.mock('../../src/main/security/NavigationGuard', () => ({
  protectRendererNavigation: vi.fn(),
}));

import { PopoverManager } from '../../src/main/windows/PopoverManager';

const TRAY_BOUNDS = { x: 1400, y: 0, width: 24, height: 24 };
const WORK_AREA = { x: 0, y: 23, width: 1920, height: 1057 };

function createTray() {
  return {
    getBounds: vi.fn(() => TRAY_BOUNDS),
    setImage: vi.fn(),
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
  } as unknown as Electron.Tray;
}

describe('PopoverManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // PopoverManager anchors against the display containing the tray.
    (screen as unknown as Record<string, unknown>).getDisplayMatching = vi.fn(() => ({
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: WORK_AREA,
      scaleFactor: 2,
    }));
  });

  it('anchors the window under the tray at creation time', () => {
    const manager = new PopoverManager({ width: 460, height: 680, tray: createTray() });
    const window = manager.create();

    // Expected anchor: centered under the tray icon, just below the menu bar.
    const expectedX = Math.round(TRAY_BOUNDS.x + TRAY_BOUNDS.width / 2 - 460 / 2);
    const expectedY = TRAY_BOUNDS.y + TRAY_BOUNDS.height + 4;

    expect(window.setPosition).toHaveBeenCalledWith(expectedX, expectedY, false);
  });

  it('does not leave the window at the default centered position before show()', () => {
    const manager = new PopoverManager({ width: 460, height: 680, tray: createTray() });
    const window = manager.create();

    // create() must position the window; show() is not the only anchoring path.
    expect(window.setPosition).toHaveBeenCalled();

    const [x] = vi.mocked(window.setPosition).mock.calls[0];
    const screenCenterX = Math.round((WORK_AREA.width - 460) / 2);
    expect(x).not.toBe(screenCenterX);
  });

  it('re-anchors on demand without showing the window', () => {
    const manager = new PopoverManager({ width: 460, height: 680, tray: createTray() });
    const window = manager.create();
    vi.mocked(window.setPosition).mockClear();

    manager.reanchor();

    expect(window.setPosition).toHaveBeenCalledTimes(1);
    expect(window.show).not.toHaveBeenCalled();
  });
});
