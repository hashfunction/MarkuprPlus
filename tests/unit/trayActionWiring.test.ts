import { describe, expect, it } from 'vitest';
import {
  wireTrayActionCallbacks,
  type TrayActionRegistrar,
} from '../../src/main/trayActionWiring';

describe('main-process tray action wiring', () => {
  it('registers distinct popover, recording, and settings handlers', () => {
    const registered: Partial<
      Record<'tray' | 'recording' | 'settings', () => void>
    > = {};
    const registrar: TrayActionRegistrar = {
      onClick: (callback) => {
        registered.tray = callback;
      },
      onRecordingClick: (callback) => {
        registered.recording = callback;
      },
      onSettingsClick: (callback) => {
        registered.settings = callback;
      },
    };
    const events: string[] = [];

    wireTrayActionCallbacks(registrar, {
      openPopover: () => {
        events.push('popover');
      },
      toggleRecording: () => {
        events.push('recording');
      },
      openSettings: () => {
        events.push('settings');
      },
    });

    registered.tray?.();
    expect(events).toEqual(['popover']);

    registered.recording?.();
    expect(events).toEqual(['popover', 'recording']);

    registered.settings?.();
    expect(events).toEqual(['popover', 'recording', 'settings']);
  });
});
