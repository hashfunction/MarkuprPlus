interface OutputDirectorySettingsSource {
  get: (key: 'outputDirectory') => string;
  onChange: (callback: (key: string, newValue: unknown) => void) => () => void;
}

interface OutputDirectoryConsumer {
  setOutputDirectory: (directory: string) => void;
}

/** Keep the file service aligned with the one persisted public setting. */
export function synchronizeOutputDirectory(
  settings: OutputDirectorySettingsSource,
  files: OutputDirectoryConsumer,
): () => void {
  files.setOutputDirectory(settings.get('outputDirectory'));
  return settings.onChange((key, newValue) => {
    if (key === 'outputDirectory' && typeof newValue === 'string') {
      files.setOutputDirectory(newValue);
    }
  });
}
