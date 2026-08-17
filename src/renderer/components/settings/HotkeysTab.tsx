import React, { useCallback } from 'react';
import { PUBLIC_BRAND_NAME } from '../../../shared/publicBrand';
import type { HotkeyConfig, PublicSettings } from '../../../shared/types';
import { SettingsSection, KeyRecorder } from '../primitives';
import { HotkeyHint } from '../HotkeyHint';
import { styles } from './settingsStyles';

export const HotkeysTab: React.FC<{
  settings: PublicSettings;
  onHotkeyChange: (key: keyof HotkeyConfig, value: string) => void;
  onResetSection: () => void;
}> = ({ settings, onHotkeyChange, onResetSection }) => {
  // Detect conflicts
  const findConflict = useCallback(
    (currentKey: keyof HotkeyConfig, value: string): string | null => {
      const entries = Object.entries(settings.hotkeys) as [keyof HotkeyConfig, string][];
      for (const [key, hotkey] of entries) {
        if (key !== currentKey && hotkey === value) {
          const labels: Record<keyof HotkeyConfig, string> = {
            toggleRecording: 'Start/Stop Recording',
            manualScreenshot: 'Manual Screenshot',
            pauseResume: 'Pause/Resume',
          };
          return labels[key];
        }
      }
      return null;
    },
    [settings.hotkeys]
  );

  return (
    <div style={styles.tabContent}>
      <SettingsSection
        title="Keyboard Shortcuts"
        description={`Customize global hotkeys for ${PUBLIC_BRAND_NAME}`}
        onReset={onResetSection}
      >
        <KeyRecorder
          label="Start/Stop Recording"
          description="Toggle recording on and off"
          value={settings.hotkeys.toggleRecording}
          onChange={(value) => onHotkeyChange('toggleRecording', value)}
          conflict={findConflict('toggleRecording', settings.hotkeys.toggleRecording)}
        />
        <KeyRecorder
          label="Manual Screenshot"
          description="Capture a screenshot immediately"
          value={settings.hotkeys.manualScreenshot}
          onChange={(value) => onHotkeyChange('manualScreenshot', value)}
          conflict={findConflict('manualScreenshot', settings.hotkeys.manualScreenshot)}
        />
        <KeyRecorder
          label="Pause/Resume"
          description="Temporarily pause active capture"
          value={settings.hotkeys.pauseResume}
          onChange={(value) => onHotkeyChange('pauseResume', value)}
          conflict={findConflict('pauseResume', settings.hotkeys.pauseResume)}
        />
      </SettingsSection>

      <SettingsSection title="Quick Reference">
        <div style={styles.hotkeyReference}>
          <div style={styles.hotkeyRefItem}>
            <span style={styles.hotkeyRefLabel}>Start/Stop Recording</span>
            <HotkeyHint keys={settings.hotkeys.toggleRecording} size="medium" />
          </div>
          <div style={styles.hotkeyRefItem}>
            <span style={styles.hotkeyRefLabel}>Manual Screenshot</span>
            <HotkeyHint keys={settings.hotkeys.manualScreenshot} size="medium" />
          </div>
          <div style={styles.hotkeyRefItem}>
            <span style={styles.hotkeyRefLabel}>Pause/Resume</span>
            <HotkeyHint keys={settings.hotkeys.pauseResume} size="medium" />
          </div>
        </div>
      </SettingsSection>
    </div>
  );
};
