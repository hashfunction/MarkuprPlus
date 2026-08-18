import { describe, expect, it, vi } from 'vitest';
import { synchronizeRuntimeSettings } from '../../src/main/settings/synchronizeRuntimeSettings';

describe('runtime settings synchronization', () => {
  it('hydrates the selected microphone and keeps audio and native menus aligned', () => {
    let onChange: ((key: string, value: unknown) => void) | undefined;
    const unsubscribe = vi.fn();
    const settings = {
      get: vi.fn(() => 'studio-microphone'),
      onChange: vi.fn((callback: (key: string, value: unknown) => void) => {
        onChange = callback;
        return unsubscribe;
      }),
    };
    const audio = { setDevice: vi.fn() };
    const menu = { refresh: vi.fn() };

    const cleanup = synchronizeRuntimeSettings(settings, audio, menu);

    expect(audio.setDevice).toHaveBeenCalledWith('studio-microphone');
    expect(menu.refresh).not.toHaveBeenCalled();

    onChange?.('audioDeviceId', null);
    onChange?.('audioDeviceId', 'conference-microphone');
    onChange?.('theme', 'dark');
    onChange?.('showAudioWaveform', false);
    onChange?.('outputDirectory', '/tmp/unrelated');

    expect(audio.setDevice.mock.calls).toEqual([
      ['studio-microphone'],
      [null],
      ['conference-microphone'],
    ]);
    expect(menu.refresh).toHaveBeenCalledTimes(2);

    cleanup();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
