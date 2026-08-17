import React, { useState, useCallback } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { styles } from '../settings/settingsStyles';

export const DangerButton: React.FC<{
  label: string;
  description?: string;
  buttonText: string;
  onConfirm: () => void;
  confirmText?: string;
  disabled?: boolean;
  busy?: boolean;
}> = ({ label, description, buttonText, onConfirm, confirmText, disabled = false, busy = false }) => {
  const [confirming, setConfirming] = useState(false);
  const { colors } = useTheme();

  const handleClick = useCallback(() => {
    if (disabled) return;
    if (confirming) {
      onConfirm();
      setConfirming(false);
    } else {
      setConfirming(true);
      // Auto-reset after 3 seconds
      setTimeout(() => setConfirming(false), 3000);
    }
  }, [confirming, disabled, onConfirm]);

  return (
    <div style={styles.settingRow}>
      <div style={styles.settingInfo}>
        <span style={styles.settingLabel}>{label}</span>
        {description && <span style={styles.settingDescription}>{description}</span>}
      </div>
      <button
        style={{
          ...styles.dangerButton,
          backgroundColor: confirming ? colors.status.error : colors.status.errorSubtle,
          color: confirming ? colors.text.inverse : colors.status.error,
          borderColor: confirming ? colors.status.error : colors.status.errorSubtle,
        }}
        onClick={handleClick}
        disabled={disabled}
        aria-busy={busy || undefined}
      >
        {confirming ? confirmText || 'Click again to confirm' : buttonText}
      </button>
    </div>
  );
};
