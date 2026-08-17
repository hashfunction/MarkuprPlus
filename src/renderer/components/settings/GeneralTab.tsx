import React from 'react';
import { PUBLIC_BRAND_NAME } from '../../../shared/publicBrand';
import type { PublicSettings } from '../../../shared/types';
import { SettingsSection, ToggleSetting, DirectoryPicker } from '../primitives';
import { styles } from './settingsStyles';

export const GeneralTab: React.FC<{
  settings: PublicSettings;
  onSettingChange: <K extends keyof PublicSettings>(key: K, value: PublicSettings[K]) => void;
  onResetSection: () => void;
}> = ({ settings, onSettingChange, onResetSection }) => (
  <div style={styles.tabContent}>
    <SettingsSection
      title="Output"
      description="Where your feedback sessions are saved"
      onReset={onResetSection}
    >
      <DirectoryPicker
        label="Output Directory"
        description="Screenshots and markdown files will be saved here"
        value={settings.outputDirectory}
        onChange={(value) => onSettingChange('outputDirectory', value)}
      />
    </SettingsSection>

    <SettingsSection title="Startup">
      <ToggleSetting
        label="Launch at Login"
        description={`Start ${PUBLIC_BRAND_NAME} automatically when you log in`}
        value={settings.launchAtLogin}
        onChange={(value) => onSettingChange('launchAtLogin', value)}
      />
    </SettingsSection>
  </div>
);
