import React from 'react';
import type { AudioDevice, PublicSettings } from '../../../shared/types';
import { SettingsSection, ToggleSetting, DropdownSetting, SliderSetting } from '../primitives';
import { styles } from './settingsStyles';

export const RecordingTab: React.FC<{
  settings: PublicSettings;
  audioDevices: AudioDevice[];
  onSettingChange: <K extends keyof PublicSettings>(key: K, value: PublicSettings[K]) => void;
  onResetSection: () => void;
}> = ({ settings, audioDevices, onSettingChange, onResetSection }) => (
  <div style={styles.tabContent}>
    <SettingsSection
      title="Recording Behavior"
      description="Customize how recording sessions work"
      onReset={onResetSection}
    >
      <DropdownSetting
        label="Countdown Before Recording"
        description="Give yourself time to prepare"
        value={settings.defaultCountdown}
        options={[
          { value: 0, label: 'No countdown' },
          { value: 3, label: '3 seconds' },
          { value: 5, label: '5 seconds' },
        ]}
        onChange={(value) => onSettingChange('defaultCountdown', Number(value) as 0 | 3 | 5)}
      />
      <ToggleSetting
        label="Show Recording HUD"
        description="Display mic activity and shortcut hints while recording"
        value={settings.showTranscriptionPreview}
        onChange={(value) => onSettingChange('showTranscriptionPreview', value)}
      />
      <ToggleSetting
        label="Show Audio Waveform"
        description="Visual feedback of your voice levels"
        value={settings.showAudioWaveform}
        onChange={(value) => onSettingChange('showAudioWaveform', value)}
      />
    </SettingsSection>

    <SettingsSection title="Audio Input">
      <DropdownSetting
        label="Microphone"
        description="Select which microphone to use for voice capture"
        value={settings.audioDeviceId || 'default'}
        options={[
          { value: 'default', label: 'System Default' },
          ...audioDevices.map((device) => ({
            value: device.id,
            label: device.name + (device.isDefault ? ' (Default)' : ''),
          })),
        ]}
        onChange={(value) => onSettingChange('audioDeviceId', value === 'default' ? null : String(value))}
      />
    </SettingsSection>

    <SettingsSection title="Screenshot Timing">
      <SliderSetting
        label="Pause Threshold"
        description="How long to pause before capturing a screenshot"
        value={settings.pauseThreshold}
        min={500}
        max={3000}
        step={100}
        unit="ms"
        formatValue={(v) => `${(v / 1000).toFixed(1)}s`}
        onChange={(value) => onSettingChange('pauseThreshold', value)}
      />
      <SliderSetting
        label="Minimum Time Between Captures"
        description="Prevent too many screenshots in quick succession"
        value={settings.minTimeBetweenCaptures}
        min={300}
        max={2000}
        step={100}
        unit="ms"
        formatValue={(v) => `${(v / 1000).toFixed(1)}s`}
        onChange={(value) => onSettingChange('minTimeBetweenCaptures', value)}
      />
    </SettingsSection>
  </div>
);
