import React from 'react';
import { styles } from '../settings/settingsStyles';

export const SettingsSection: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
  onReset?: () => void;
}> = ({ title, description, children, onReset }) => (
  <div style={styles.section}>
    <div style={styles.sectionHeader}>
      <div style={{ minWidth: 0 }}>
        <h3 style={styles.sectionTitle}>{title}</h3>
        {description && <p style={styles.sectionDescription}>{description}</p>}
      </div>
      {onReset && (
        <button style={styles.resetSectionButton} onClick={onReset} title="Reset section to defaults">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M1.75 7a5.25 5.25 0 109.006-3.668M7 3.5V1.75L9.625 4.375 7 7"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
    <div className="ff-portrait-card" style={styles.sectionContent}>{children}</div>
  </div>
);
