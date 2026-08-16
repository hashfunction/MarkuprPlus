import React, { useCallback } from 'react';
import { styles } from '../settings/settingsStyles';

export const DirectoryPicker: React.FC<{
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ label, description, value, onChange }) => {
  const handleBrowse = useCallback(async () => {
    try {
      const result = await window.markuprx.settings.selectDirectory();
      if (result) {
        onChange(result);
      }
    } catch {
      // User cancelled or error
    }
  }, [onChange]);

  return (
    <div style={styles.settingRow}>
      <div style={styles.settingInfo}>
        <span style={styles.settingLabel}>{label}</span>
        {description && <span style={styles.settingDescription}>{description}</span>}
      </div>
      <div style={styles.directoryPicker}>
        <input
          type="text"
          value={value}
          readOnly
          style={styles.directoryInput}
          placeholder="Select output directory..."
        />
        <button style={styles.browseButton} onClick={handleBrowse}>
          Browse...
        </button>
      </div>
    </div>
  );
};
