import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  app,
  Menu,
  nativeImage,
  shell,
  Tray,
  type MenuItemConstructorOptions,
} from 'electron';
import {
  createTrayManager,
  type ITrayManager,
} from '../../src/main/TrayManager';

type TrayListener = (...args: unknown[]) => void;

interface TrayDouble {
  setImage: ReturnType<typeof vi.fn>;
  setToolTip: ReturnType<typeof vi.fn>;
  setContextMenu: ReturnType<typeof vi.fn>;
  popUpContextMenu: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

let tray: TrayDouble;
let listeners: Map<string, TrayListener[]>;
let templates: MenuItemConstructorOptions[][];
let builtMenus: object[];
let managers: ITrayManager[];
let nativeIcon: {
  isEmpty: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  setTemplateImage: ReturnType<typeof vi.fn>;
};

function createManager(platform: NodeJS.Platform): ITrayManager {
  const manager = createTrayManager(platform);
  managers.push(manager);
  return manager;
}

function emitTrayEvent(event: string): void {
  const registered = listeners.get(event) ?? [];
  registered.forEach((listener) => listener({}));
}

function clickMenuItem(templateIndex: number, label: string): void {
  const item = templates[templateIndex]?.find(
    (candidate) => candidate.label === label,
  );
  if (!item || typeof item.click !== 'function') {
    throw new Error(`Clickable tray item not found: ${label}`);
  }
  (item.click as () => void)();
}

describe('TrayManager native integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listeners = new Map();
    templates = [];
    builtMenus = [];
    managers = [];
    tray = {
      setImage: vi.fn(),
      setToolTip: vi.fn(),
      setContextMenu: vi.fn(),
      popUpContextMenu: vi.fn(),
      on: vi.fn((event: string, listener: TrayListener) => {
        const registered = listeners.get(event) ?? [];
        registered.push(listener);
        listeners.set(event, registered);
      }),
      destroy: vi.fn(),
    };
    vi.mocked(Tray).mockImplementation(function TrayMock() {
      return tray as never;
    });

    nativeIcon = {
      isEmpty: vi.fn(() => false),
      resize: vi.fn(),
      setTemplateImage: vi.fn(),
    };
    nativeIcon.resize.mockReturnValue(nativeIcon);
    vi.mocked(nativeImage.createFromPath).mockReturnValue(nativeIcon as never);

    vi.mocked(Menu.buildFromTemplate).mockImplementation((template) => {
      templates.push(template);
      const menu = { sequence: builtMenus.length };
      builtMenus.push(menu);
      return menu as never;
    });
    vi.mocked(shell.openExternal).mockResolvedValue(undefined);
  });

  afterEach(() => {
    managers.forEach((manager) => manager.destroy());
    vi.useRealTimers();
  });

  it('uses separate macOS click events so right-click opens only the menu', () => {
    const manager = createManager('darwin');
    const openPopover = vi.fn();
    manager.onClick(openPopover);

    manager.initialize();

    expect(listeners.get('click')).toHaveLength(1);
    expect(listeners.get('right-click')).toHaveLength(1);
    expect(listeners.has('mouse-up')).toBe(false);
    expect(tray.setContextMenu).toHaveBeenCalledOnce();
    expect(tray.setContextMenu).toHaveBeenCalledWith(null);

    emitTrayEvent('right-click');
    expect(tray.popUpContextMenu).toHaveBeenCalledOnce();
    expect(tray.popUpContextMenu).toHaveBeenCalledWith(builtMenus[0]);
    expect(openPopover).not.toHaveBeenCalled();

    emitTrayEvent('click');
    expect(openPopover).toHaveBeenCalledOnce();
    expect(tray.popUpContextMenu).toHaveBeenCalledOnce();
  });

  it.each(['win32', 'linux'] as const)(
    'preserves left-click and installs the native context menu on %s',
    (platform) => {
      const manager = createManager(platform);
      const openPopover = vi.fn();
      manager.onClick(openPopover);

      manager.initialize();

      expect(listeners.get('click')).toHaveLength(1);
      expect(listeners.has('right-click')).toBe(false);
      expect(tray.setContextMenu).toHaveBeenCalledWith(builtMenus[0]);
      emitTrayEvent('click');
      expect(openPopover).toHaveBeenCalledOnce();
    },
  );

  it('rebuilds the dynamic menu once per state change without duplicating handlers', () => {
    const manager = createManager('darwin');
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    manager.initialize();
    expect(Menu.buildFromTemplate).toHaveBeenCalledOnce();

    vi.mocked(Menu.buildFromTemplate).mockClear();
    manager.setState('recording');

    expect(Menu.buildFromTemplate).toHaveBeenCalledOnce();
    expect(
      templates.at(-1)?.some(({ label }) => label === 'Stop Recording'),
    ).toBe(true);
    expect(listeners.get('click')).toHaveLength(1);
    expect(listeners.get('right-click')).toHaveLength(1);

    manager.initialize();
    expect(Tray).toHaveBeenCalledOnce();
    expect(listeners.get('click')).toHaveLength(1);
    expect(listeners.get('right-click')).toHaveLength(1);
    consoleWarn.mockRestore();
  });

  it('shows MarkuprPlus in every public state tooltip', () => {
    const manager = createManager('darwin');
    manager.initialize();
    manager.setState('recording');
    manager.setState('processing');
    manager.setState('complete');
    manager.setState('error');

    const tooltips = tray.setToolTip.mock.calls.map(([tooltip]) =>
      String(tooltip),
    );
    expect(tooltips).toEqual([
      expect.stringMatching(/^MarkuprPlus - Ready/),
      expect.stringMatching(/^MarkuprPlus - Recording/),
      'MarkuprPlus - Processing...',
      'MarkuprPlus - Feedback captured!',
      'MarkuprPlus - Error (click for details)',
    ]);
    expect(tooltips.join(' ')).not.toContain('MarkuprX');
  });

  it('normalizes legacy branding at the public custom-tooltip boundary', () => {
    const manager = createManager('darwin');
    manager.initialize();
    tray.setToolTip.mockClear();

    manager.setTooltip('MarkuprX - Paused (Cmd+Shift+P to resume)');

    expect(tray.setToolTip).toHaveBeenCalledOnce();
    expect(tray.setToolTip).toHaveBeenCalledWith(
      'MarkuprPlus - Paused (Cmd+Shift+P to resume)',
    );
  });

  it('keeps left-click and the recording menu action isolated', async () => {
    const manager = createManager('darwin');
    const openPopover = vi.fn();
    const toggleRecording = vi.fn();
    const openSettings = vi.fn();
    manager.onClick(openPopover);
    manager.onRecordingClick(toggleRecording);
    manager.onSettingsClick(openSettings);
    manager.initialize();

    clickMenuItem(0, 'Start Recording');
    expect(toggleRecording).toHaveBeenCalledOnce();
    expect(openPopover).not.toHaveBeenCalled();

    emitTrayEvent('click');
    expect(openPopover).toHaveBeenCalledOnce();
    expect(toggleRecording).toHaveBeenCalledOnce();

    clickMenuItem(0, 'Settings...');
    clickMenuItem(0, 'Help');
    clickMenuItem(0, 'Contact');
    clickMenuItem(0, 'Quit MarkuprPlus');

    await vi.waitFor(() => {
      expect(shell.openExternal).toHaveBeenCalledTimes(2);
    });
    expect(openSettings).toHaveBeenCalledOnce();
    expect(shell.openExternal).toHaveBeenNthCalledWith(
      1,
      'https://markuprplus.com',
    );
    expect(shell.openExternal).toHaveBeenNthCalledWith(
      2,
      'https://github.com/hashfunction/MarkuprPlus/issues/new',
    );
    expect(app.quit).toHaveBeenCalledOnce();
  });

  it('logs an external launch failure without throwing from the native handler', async () => {
    const failure = new Error('default browser unavailable');
    vi.mocked(shell.openExternal).mockRejectedValueOnce(failure);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const manager = createManager('linux');
    manager.initialize();

    expect(() => clickMenuItem(0, 'Help')).not.toThrow();
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        '[TrayManager] Failed to open help:',
        failure,
      );
    });
    consoleError.mockRestore();
  });

  it('marks every loaded macOS processing frame as a Template image', async () => {
    vi.useFakeTimers();
    const manager = createManager('darwin');
    manager.initialize();
    manager.setState('processing');
    nativeIcon.setTemplateImage.mockClear();

    await vi.advanceTimersByTimeAsync(200);

    expect(nativeImage.createFromPath).toHaveBeenLastCalledWith(
      expect.stringContaining('tray-processing-1Template.png'),
    );
    expect(nativeIcon.setTemplateImage).toHaveBeenCalledWith(true);
  });
});
