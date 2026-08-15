import { describe, expect, it, vi } from 'vitest';
import type { CaptureSource } from '../../src/shared/types';
import {
  WindowGeometryProvider,
  parseMacWindowList,
  parseWindowsWindowList,
  parseX11WindowList,
} from '../../src/main/capture/WindowGeometryProvider';

const sources: CaptureSource[] = [
  { id: 'window:220:0', name: 'Documentation', type: 'window', thumbnail: 'data:image/png;base64,doc' },
  { id: 'window:330:0', name: 'Terminal', type: 'window', thumbnail: 'data:image/png;base64,term' },
  { id: 'window:440:1', name: 'markupR', type: 'window' },
  { id: 'screen:0:0', name: 'Entire Screen', type: 'screen' },
];

describe('macOS window geometry parsing', () => {
  it('matches native window numbers exactly and preserves front-to-back order', () => {
    const stdout = JSON.stringify([
      {
        id: 330,
        ownerPid: 80,
        ownerName: 'iTerm2',
        title: 'Terminal',
        layer: 0,
        alpha: 1,
        onScreen: true,
        bounds: { X: 0, Y: 33, Width: 1200, Height: 800 },
      },
      {
        id: 220,
        ownerPid: 70,
        ownerName: 'Safari',
        title: 'Documentation',
        layer: 0,
        alpha: 1,
        onScreen: true,
        bounds: { X: 100, Y: 100, Width: 900, Height: 700 },
      },
    ]);

    const windows = parseMacWindowList(stdout, sources, 999);

    expect(windows.map((window) => window.sourceId)).toEqual(['window:330:0', 'window:220:0']);
    expect(windows[0]).toMatchObject({
      appName: 'iTerm2',
      sourceName: 'Terminal',
      nativeWindowId: '330',
      bounds: { x: 0, y: 33, width: 1200, height: 800 },
      thumbnail: 'data:image/png;base64,term',
    });
  });

  it('filters own-process, system-layer, transparent, off-screen, and zero-area windows', () => {
    const template = {
      ownerName: 'App', title: 'Documentation', layer: 0, alpha: 1, onScreen: true,
      bounds: { X: 10, Y: 10, Width: 500, Height: 400 },
    };
    const stdout = JSON.stringify([
      { ...template, id: 220, ownerPid: 999 },
      { ...template, id: 220, ownerPid: 2, layer: 1 },
      { ...template, id: 220, ownerPid: 3, alpha: 0 },
      { ...template, id: 220, ownerPid: 4, onScreen: false },
      { ...template, id: 220, ownerPid: 5, bounds: { X: 0, Y: 0, Width: 0, Height: 400 } },
    ]);

    expect(parseMacWindowList(stdout, sources, 999)).toEqual([]);
  });

  it('returns an empty list for malformed native output', () => {
    expect(parseMacWindowList('{not-json', sources, 999)).toEqual([]);
  });
});

describe('Windows window geometry parsing', () => {
  it('maps decimal HWNDs and rejects cloaked windows', () => {
    const stdout = JSON.stringify([
      { handle: '220', pid: 70, appName: 'Browser', title: 'Documentation', x: 10, y: 20, width: 800, height: 600, visible: true, cloaked: false },
      { handle: '330', pid: 80, appName: 'Terminal', title: 'Terminal', x: 30, y: 40, width: 700, height: 500, visible: true, cloaked: true },
    ]);

    expect(parseWindowsWindowList(stdout, sources, 999)).toEqual([
      expect.objectContaining({
        sourceId: 'window:220:0',
        appName: 'Browser',
        bounds: { x: 10, y: 20, width: 800, height: 600 },
      }),
    ]);
  });
});

describe('X11 window geometry parsing', () => {
  it('maps hexadecimal IDs to Electron decimal source IDs', () => {
    const x11Sources: CaptureSource[] = [
      { id: 'window:60817415:0', name: 'Terminal', type: 'window' },
    ];
    const stdout = '0x03a00007  0 1669 0 33 1728 994 workstation iTerm2.ITerm2 Terminal\n';

    expect(parseX11WindowList(stdout, x11Sources, 999)).toEqual([
      expect.objectContaining({
        sourceId: 'window:60817415:0',
        nativeWindowId: '60817415',
        appName: 'iTerm2',
        sourceName: 'Terminal',
        bounds: { x: 0, y: 33, width: 1728, height: 994 },
      }),
    ]);
  });
});

describe('WindowGeometryProvider', () => {
  it('returns no direct geometry when the native command times out', async () => {
    const execFile = vi.fn((_file, _args, _options, callback) => {
      callback(Object.assign(new Error('timed out'), { killed: true }), '', '');
      return {};
    });
    const provider = new WindowGeometryProvider({
      platform: 'darwin',
      ownPid: 999,
      execFile: execFile as never,
    });

    await expect(provider.listWindows(sources)).resolves.toEqual([]);
  });

  it('does not launch X11 tooling in a Wayland session', async () => {
    const execFile = vi.fn();
    const provider = new WindowGeometryProvider({
      platform: 'linux',
      ownPid: 999,
      env: { XDG_SESSION_TYPE: 'wayland' },
      execFile: execFile as never,
    });

    await expect(provider.listWindows(sources)).resolves.toEqual([]);
    expect(execFile).not.toHaveBeenCalled();
  });
});
