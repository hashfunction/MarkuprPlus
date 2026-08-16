import React, { useId } from 'react';
import { styles } from '../settings/settingsStyles';

export const DropdownSetting: React.FC<{
  label: string;
  description?: string;
  value: string | number;
  options: { value: string | number; label: string }[];
  onChange: (value: string | number) => void;
  disabled?: boolean;
}> = ({ label, description, value, options, onChange, disabled }) => {
  const controlId = useId();
  const descriptionId = useId();
  return (
    <div style={styles.settingRow}>
      <div style={styles.settingInfo}>
        <label htmlFor={controlId} style={styles.settingLabel}>{label}</label>
        {description && <span id={descriptionId} style={styles.settingDescription}>{description}</span>}
      </div>
      <select
        id={controlId}
        aria-describedby={description ? descriptionId : undefined}
        style={{
          ...styles.select,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};
