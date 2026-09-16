import React from 'react';
import { PUBLIC_BRAND_NAME } from '../../../shared/publicBrand';
import type { AppSettings } from '../../../shared/types';
import { UI_LANGUAGES, normalizeUiLanguage } from '../../../shared/uiLanguage';
import { SettingsSection, ToggleSetting, DirectoryPicker, DropdownSetting } from '../primitives';
import { styles } from './settingsStyles';

export const GeneralTab: React.FC<{
  settings: AppSettings;
  onSettingChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onResetSection: () => void;
}> = ({ settings, onSettingChange, onResetSection }) => (
  <div style={styles.tabContent}>
    <SettingsSection title="Language">
      <DropdownSetting
        label="Interface language"
        description="English by default. Changes apply immediately."
        value={settings.uiLanguage}
        options={UI_LANGUAGES.map(({ id, name }) => ({ value: id, label: name }))}
        onChange={(value) => onSettingChange('uiLanguage', normalizeUiLanguage(value))}
      />
    </SettingsSection>

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
