import React from 'react';
import { useTheme } from '../../hooks/useTheme';
import { styles } from '../settings/settingsStyles';

export interface ApiKeyState {
  value: string;
  visible: boolean;
  testing: boolean;
  valid: boolean | null;
  error: string | null;
}

export const ApiKeyInput: React.FC<{
  label: string;
  description?: string;
  serviceName: string;
  apiKey: ApiKeyState;
  onApiKeyChange: (value: string) => void;
  onToggleVisibility: () => void;
  onTest: () => void;
}> = ({ label, description, serviceName, apiKey, onApiKeyChange, onToggleVisibility, onTest }) => {
  const { colors } = useTheme();
  return (
  <div style={styles.settingRowVertical}>
    <div style={styles.settingInfo}>
      <span style={styles.settingLabel}>{label}</span>
      {description && <span style={styles.settingDescription}>{description}</span>}
    </div>
    <div style={styles.apiKeyContainer}>
      <div style={styles.apiKeyInputWrapper}>
        <input
          type={apiKey.visible ? 'text' : 'password'}
          value={apiKey.value}
          onChange={(e) => onApiKeyChange(e.target.value)}
          placeholder={`Enter your ${serviceName} API key`}
          style={{
            ...styles.apiKeyInput,
            borderColor: apiKey.error ? colors.status.error : apiKey.valid ? colors.status.success : colors.border.default,
          }}
        />
        <button style={styles.apiKeyVisibilityButton} onClick={onToggleVisibility} title={apiKey.visible ? 'Hide' : 'Show'}>
          {apiKey.visible ? (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M2.636 9.364S4.91 5.182 9 5.182s6.364 4.182 6.364 4.182-2.273 4.182-6.364 4.182-6.364-4.182-6.364-4.182z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M2 2l14 14M7.455 7.455a2 2 0 002.828 2.828M14.182 10.727c.6-.527.975-.961 1.182-1.363-1.636-3.273-4.364-5.182-6.364-5.182-.545 0-1.09.127-1.636.382M3.818 5.273C2.818 6.073 2.273 6.909 2 7.636c1.636 3.273 4.364 5.182 6.364 5.182.818 0 1.636-.255 2.454-.727"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>
      <button
        style={{
          ...styles.apiKeyTestButton,
          backgroundColor: apiKey.testing ? colors.bg.tertiary : apiKey.valid ? colors.status.success : colors.accent.default,
          cursor: !apiKey.value ? 'not-allowed' : 'pointer',
          opacity: !apiKey.value ? 0.5 : 1,
        }}
        onClick={onTest}
        disabled={!apiKey.value}
      >
        {apiKey.testing ? (
          <span style={styles.spinner} />
        ) : apiKey.valid ? (
          <>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 2.25a4.75 4.75 0 104.39 2.92"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path d="M10.7 2.3h1.2v1.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Retest
          </>
        ) : (
          'Test Connection'
        )}
      </button>
    </div>
    {apiKey.error && <span style={styles.apiKeyError}>{apiKey.error}</span>}
    {apiKey.valid && <span style={styles.apiKeySuccess}>API key verified.</span>}
  </div>
  );
};
