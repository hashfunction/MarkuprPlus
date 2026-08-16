import React, { useState } from 'react';
import { accentColors } from '../../styles/theme';
import { useTheme } from '../../hooks/useTheme';
import { styles } from '../settings/settingsStyles';

export const ACCENT_COLORS = [
  { name: accentColors.blue.name, value: accentColors.blue.default },
  { name: accentColors.violet.name, value: accentColors.violet.default },
  { name: accentColors.pink.name, value: accentColors.pink.default },
  { name: accentColors.red.name, value: accentColors.red.default },
  { name: accentColors.orange.name, value: accentColors.orange.default },
  { name: accentColors.amber.name, value: accentColors.amber.default },
  { name: accentColors.emerald.name, value: accentColors.emerald.default },
  { name: accentColors.teal.name, value: accentColors.teal.default },
  { name: accentColors.cyan.name, value: accentColors.cyan.default },
];

export const ColorPicker: React.FC<{
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ label, description, value, onChange }) => {
  const [customColor, setCustomColor] = useState(value);
  const { colors } = useTheme();

  const normalizedValue = value.toLowerCase();
  const isPreset = ACCENT_COLORS.some((c) => c.value.toLowerCase() === normalizedValue);

  return (
    <div style={styles.settingRowVertical}>
      <div style={styles.settingInfo}>
        <span style={styles.settingLabel}>{label}</span>
        {description && <span style={styles.settingDescription}>{description}</span>}
      </div>
      <div style={styles.colorPickerContainer}>
        {ACCENT_COLORS.map((color) => (
          <button
            key={color.value}
            style={{
              ...styles.colorSwatch,
              backgroundColor: color.value,
              boxShadow: normalizedValue === color.value.toLowerCase() ? `0 0 0 2px ${colors.bg.primary}, 0 0 0 4px ${color.value}` : 'none',
            }}
            onClick={() => onChange(color.value)}
            title={color.name}
            aria-label={`Select ${color.name} accent color`}
          />
        ))}
        <div style={styles.customColorContainer}>
          <input
            type="color"
            aria-label="Choose a custom accent color"
            value={isPreset ? customColor : value}
            onChange={(e) => {
              setCustomColor(e.target.value);
              onChange(e.target.value);
            }}
            style={styles.customColorInput}
            title="Custom color"
          />
          <span style={styles.customColorLabel}>Custom</span>
        </div>
      </div>
    </div>
  );
};
