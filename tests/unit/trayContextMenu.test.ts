import { describe, expect, it, vi } from 'vitest';
import {
  CONTACT_URL,
  DONATE_URL,
  HELP_URL,
  buildTrayContextMenuTemplate,
  type TrayMenuActions,
} from '../../src/main/trayContextMenu';
import type { TrayState } from '../../src/shared/types';

function createActions(
  overrides: Partial<TrayMenuActions> = {},
): TrayMenuActions {
  return {
    toggleRecording: vi.fn(),
    openSettings: vi.fn(),
    openExternal: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn(),
    reportExternalError: vi.fn(),
    ...overrides,
  };
}

function clickItem(
  template: ReturnType<typeof buildTrayContextMenuTemplate>,
  label: string,
): void {
  const item = template.find((candidate) => candidate.label === label);
  if (!item || typeof item.click !== 'function') {
    throw new Error(`Clickable tray item not found: ${label}`);
  }
  (item.click as () => void)();
}

function menuOrder(
  template: ReturnType<typeof buildTrayContextMenuTemplate>,
): string[] {
  return template.map((item) =>
    item.type === 'separator' ? '---' : item.label ?? '<unlabelled>',
  );
}

describe('tray context menu', () => {
  it('keeps approved actions in order and uses public MarkuprPlus copy on macOS', () => {
    const template = buildTrayContextMenuTemplate({
      platform: 'darwin',
      state: 'idle',
      actions: createActions(),
    });

    expect(menuOrder(template)).toEqual([
      'Buy Developer a Coffee',
      '---',
      'Start Recording',
      '---',
      'Settings...',
      '---',
      'Help',
      'Contact',
      '---',
      'About MarkuprPlus',
      '---',
      'Quit MarkuprPlus',
    ]);
    expect(menuOrder(template).join(' ')).not.toContain('MarkuprX');
  });

  it.each([
    ['win32', 'Exit MarkuprPlus'],
    ['linux', 'Exit MarkuprPlus'],
  ] as const)('uses Exit copy on %s', (platform, exitLabel) => {
    const template = buildTrayContextMenuTemplate({
      platform,
      state: 'idle',
      actions: createActions(),
    });

    expect(menuOrder(template).at(-1)).toBe(exitLabel);
    expect(template.some(({ label }) => label === 'Quit MarkuprPlus')).toBe(false);
  });

  it.each([
    ['idle', 'Start Recording', true],
    ['recording', 'Stop Recording', true],
    ['processing', 'Start Recording', false],
    ['complete', 'Start Recording', true],
    ['error', 'Start Recording', true],
  ] satisfies Array<[TrayState, string, boolean]>)(
    'represents the %s recording state',
    (state, recordingLabel, enabled) => {
      const template = buildTrayContextMenuTemplate({
        platform: 'darwin',
        state,
        actions: createActions(),
      });
      const recordingItem = template.find(({ label }) => label === recordingLabel);

      expect(recordingItem?.enabled).toBe(enabled);
      expect(template.at(-1)?.label).toBe('Quit MarkuprPlus');
    },
  );

  it('routes recording, settings, external, and quit actions exactly once', async () => {
    const actions = createActions();
    const template = buildTrayContextMenuTemplate({
      platform: 'darwin',
      state: 'idle',
      actions,
    });

    clickItem(template, 'Buy Developer a Coffee');
    clickItem(template, 'Start Recording');
    clickItem(template, 'Settings...');
    clickItem(template, 'Help');
    clickItem(template, 'Contact');
    clickItem(template, 'Quit MarkuprPlus');

    await vi.waitFor(() => {
      expect(actions.openExternal).toHaveBeenCalledTimes(3);
    });
    expect(actions.openExternal).toHaveBeenNthCalledWith(1, DONATE_URL);
    expect(actions.openExternal).toHaveBeenNthCalledWith(2, HELP_URL);
    expect(actions.openExternal).toHaveBeenNthCalledWith(3, CONTACT_URL);
    expect(actions.toggleRecording).toHaveBeenCalledOnce();
    expect(actions.openSettings).toHaveBeenCalledOnce();
    expect(actions.quit).toHaveBeenCalledOnce();
    expect(actions.reportExternalError).not.toHaveBeenCalled();
  });

  it('uses the exact approved public destinations', () => {
    expect(HELP_URL).toBe('https://markuprplus.com');
    expect(CONTACT_URL).toBe(
      'https://github.com/hashfunction/MarkuprPlus/issues/new',
    );
    expect(DONATE_URL).toBe('https://ko-fi.com/eddiesanjuan');
  });

  it.each([
    ['Buy Developer a Coffee', 'donate'],
    ['Help', 'help'],
    ['Contact', 'contact'],
  ] as const)(
    'reports an asynchronous %s launch failure without throwing',
    async (label, destination) => {
      const failure = new Error('external application unavailable');
      const actions = createActions({
        openExternal: vi.fn().mockRejectedValue(failure),
      });
      const template = buildTrayContextMenuTemplate({
        platform: 'linux',
        state: 'idle',
        actions,
      });

      expect(() => clickItem(template, label)).not.toThrow();
      await vi.waitFor(() => {
        expect(actions.reportExternalError).toHaveBeenCalledWith(
          destination,
          failure,
        );
      });
    },
  );

  it('reports a synchronous external-launch failure without throwing', async () => {
    const failure = new Error('shell unavailable');
    const actions = createActions({
      openExternal: vi.fn(() => {
        throw failure;
      }),
    });
    const template = buildTrayContextMenuTemplate({
      platform: 'darwin',
      state: 'idle',
      actions,
    });

    expect(() => clickItem(template, 'Help')).not.toThrow();
    await vi.waitFor(() => {
      expect(actions.reportExternalError).toHaveBeenCalledWith('help', failure);
    });
  });

  it('contains a reporter failure after an external launch fails', async () => {
    const reporterFailure = new Error('logger unavailable');
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);
    const actions = createActions({
      openExternal: vi.fn().mockRejectedValue(new Error('no browser')),
      reportExternalError: vi.fn(() => {
        throw reporterFailure;
      }),
    });
    const template = buildTrayContextMenuTemplate({
      platform: 'linux',
      state: 'idle',
      actions,
    });

    try {
      expect(() => clickItem(template, 'Help')).not.toThrow();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(actions.reportExternalError).toHaveBeenCalledOnce();
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });
});
