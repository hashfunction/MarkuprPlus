import React from 'react';
import type { PublicSettings } from '../../../shared/types';
import { SettingsSection, DirectoryPicker } from '../primitives';
import { styles } from './settingsStyles';

export const GeneralTab: React.FC<{
  settings: PublicSettings;
  onSettingChange: <K extends keyof PublicSettings>(key: K, value: PublicSettings[K]) => void;
}> = ({ settings, onSettingChange }) => (
  <div style={styles.tabContent}>
    <SettingsSection
      title="Output"
      description="Where your feedback sessions are saved"
    >
      <DirectoryPicker
        label="Output Directory"
        description="Screenshots and markdown files will be saved here"
        value={settings.outputDirectory}
        onChange={(value) => onSettingChange('outputDirectory', value)}
      />
    </SettingsSection>
  </div>
);
