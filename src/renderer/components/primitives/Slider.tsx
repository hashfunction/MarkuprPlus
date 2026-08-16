import React, { useId } from 'react';
import { styles } from '../settings/settingsStyles';

export const SliderSetting: React.FC<{
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
  formatValue?: (value: number) => string;
}> = ({ label, description, value, min, max, step, unit = '', onChange, disabled, formatValue }) => {
  const controlId = useId();
  const descriptionId = useId();
  const displayValue = formatValue ? formatValue(value) : `${value}${unit}`;

  return (
    <div style={styles.settingRow}>
      <div style={styles.settingInfo}>
        <label htmlFor={controlId} style={styles.settingLabel}>{label}</label>
        {description && <span id={descriptionId} style={styles.settingDescription}>{description}</span>}
      </div>
      <div style={styles.sliderContainer}>
        <span style={styles.sliderValue}>{displayValue}</span>
        <input
          id={controlId}
          aria-describedby={description ? descriptionId : undefined}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          style={{
            ...styles.slider,
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        />
      </div>
    </div>
  );
};
