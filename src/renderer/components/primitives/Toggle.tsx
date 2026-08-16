import React, { useId } from 'react';
import { styles } from '../settings/settingsStyles';

const TOGGLE_TRACK_WIDTH = 44;
const TOGGLE_KNOB_SIZE = 18;
const TOGGLE_KNOB_INSET = 3;
const TOGGLE_TRAVEL_DISTANCE = TOGGLE_TRACK_WIDTH - TOGGLE_KNOB_SIZE - TOGGLE_KNOB_INSET * 2;

export const ToggleSetting: React.FC<{
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}> = ({ label, description, value, onChange, disabled }) => {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <div style={styles.settingRow}>
      <div style={styles.settingInfo}>
        <span id={labelId} style={styles.settingLabel}>{label}</span>
        {description && <span id={descriptionId} style={styles.settingDescription}>{description}</span>}
      </div>
      <button
        type="button"
        style={{
          ...styles.toggle,
          backgroundColor: value ? 'var(--accent-default)' : 'var(--bg-tertiary)',
          borderColor: value ? 'var(--accent-hover)' : 'var(--border-strong)',
          boxShadow: value
            ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.14)'
            : 'inset 0 0 0 1px rgba(0, 0, 0, 0.06)',
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        role="switch"
        aria-checked={value}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <span
          aria-hidden="true"
          style={{
            ...styles.toggleKnob,
            transform: value ? `translateX(${TOGGLE_TRAVEL_DISTANCE}px)` : 'translateX(0px)',
          }}
        />
      </button>
    </div>
  );
};
