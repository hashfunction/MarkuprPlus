import React from 'react';
import type { AppSettings } from '../../../shared/types';
// useTheme available for future theme-aware styling
import { darkTheme, lightTheme } from '../../styles/theme';
import { SettingsSection, DropdownSetting, ColorPicker } from '../primitives';
import { styles } from './settingsStyles';

export const AppearanceTab: React.FC<{
  settings: AppSettings;
  onSettingChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onResetSection: () => void;
}> = ({ settings, onSettingChange, onResetSection }) => {
  const previewColors = settings.theme === 'light' ? lightTheme : darkTheme;
  return (
  <div style={styles.tabContent}>
    <SettingsSection
      title="Theme"
      description="Choose how MarkuprX looks"
      onReset={onResetSection}
    >
      <DropdownSetting
        label="Theme Mode"
        description="Match your system or choose a specific theme"
        value={settings.theme}
        options={[
          { value: 'system', label: 'System' },
          { value: 'dark', label: 'Dark' },
          { value: 'light', label: 'Light' },
        ]}
        onChange={(value) => onSettingChange('theme', value as 'system' | 'dark' | 'light')}
      />
    </SettingsSection>

    <SettingsSection title="Accent Color">
      <ColorPicker
        label="Accent Color"
        description="Used for buttons, links, and highlights"
        value={settings.accentColor}
        onChange={(value) => onSettingChange('accentColor', value)}
      />
    </SettingsSection>

    {/* Live Preview */}
    <SettingsSection title="Preview">
      <div style={styles.themePreview}>
        <div
          style={{
            ...styles.previewCard,
            backgroundColor: previewColors.bg.primary,
            borderColor: previewColors.border.default,
          }}
        >
          <div style={styles.previewHeader}>
            <div style={{ ...styles.previewDot, backgroundColor: settings.accentColor }} />
            <span
              style={{
                ...styles.previewTitle,
                color: previewColors.text.primary,
              }}
            >
              Recording Session
            </span>
          </div>
          <button
            style={{
              ...styles.previewButton,
              backgroundColor: settings.accentColor,
            }}
          >
            Start Recording
          </button>
        </div>
      </div>
    </SettingsSection>
  </div>
  );
};
