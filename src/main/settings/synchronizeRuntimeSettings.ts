interface RuntimeSettingsSource {
  get: (key: 'audioDeviceId') => string | null;
  onChange: (callback: (key: string, newValue: unknown) => void) => () => void;
}

interface AudioDeviceConsumer {
  setDevice: (deviceId: string | null) => void;
}

interface NativeMenuConsumer {
  refresh: () => void;
}

/** Keep stateful main-process consumers aligned with every accepted settings path. */
export function synchronizeRuntimeSettings(
  settings: RuntimeSettingsSource,
  audio: AudioDeviceConsumer,
  menu: NativeMenuConsumer,
): () => void {
  audio.setDevice(settings.get('audioDeviceId'));

  return settings.onChange((key, newValue) => {
    if (key === 'audioDeviceId' && (newValue === null || typeof newValue === 'string')) {
      audio.setDevice(newValue);
      return;
    }

    if (key === 'theme' || key === 'showAudioWaveform') {
      menu.refresh();
    }
  });
}
