import React from 'react';
import type { AnalysisProviderStatus, AppSettings } from '../../../shared/types';
import { useTheme } from '../../hooks/useTheme';
import { SettingsSection, ToggleSetting, ApiKeyInput, DangerButton } from '../primitives';
import type { ApiKeyState } from '../primitives';
import { styles } from './settingsStyles';
import { AnalysisProviderSelector } from './AnalysisProviderSelector';

export const AdvancedTab: React.FC<{
  settings: AppSettings;
  openAiApiKey: ApiKeyState;
  anthropicApiKey: ApiKeyState;
  analysisProviderStatuses: AnalysisProviderStatus[];
  isScanningProviders: boolean;
  onSettingChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onRefreshAnalysisProviders: () => void;
  onOpenAiApiKeyChange: (value: string) => void;
  onToggleOpenAiApiKeyVisibility: () => void;
  onTestOpenAiApiKey: () => void;
  onAnthropicApiKeyChange: (value: string) => void;
  onToggleAnthropicApiKeyVisibility: () => void;
  onTestAnthropicApiKey: () => void;
  onClearAllData: () => void;
  onExportSettings: () => void;
  onImportSettings: () => void;
  onResetSection: () => void;
}> = ({
  settings,
  openAiApiKey,
  anthropicApiKey,
  analysisProviderStatuses,
  isScanningProviders,
  onSettingChange,
  onRefreshAnalysisProviders,
  onOpenAiApiKeyChange,
  onToggleOpenAiApiKeyVisibility,
  onTestOpenAiApiKey,
  onAnthropicApiKeyChange,
  onToggleAnthropicApiKeyVisibility,
  onTestAnthropicApiKey,
  onClearAllData,
  onExportSettings,
  onImportSettings,
  onResetSection,
}) => {
  const { colors } = useTheme();
  return (
  <div style={styles.tabContent}>
    <AnalysisProviderSelector
      provider={settings.analysisProvider}
      statuses={analysisProviderStatuses}
      isScanning={isScanningProviders}
      onSelect={(provider) => onSettingChange('analysisProvider', provider)}
      onRefresh={onRefreshAnalysisProviders}
    />

    {/* Transcription workflow */}
    <SettingsSection
      title="Transcription Workflow"
      description="Simple and reliable capture pipeline"
      onReset={onResetSection}
    >
      <div style={styles.settingDescription}>
        markupR records screen + microphone first, then runs transcription after you stop.
        OpenAI is the primary cloud path. Local Whisper is optional fallback when available.
      </div>
    </SettingsSection>

    <SettingsSection
      title="Credentials"
      description="Keys are stored locally and only used for their named service."
    >
      <div style={styles.settingDescription}>
        OpenAI is an optional cloud transcription path. Analysis uses the provider selected above.
      </div>
    </SettingsSection>

    {/* OpenAI API Key (BYOK primary transcription fallback) */}
    <SettingsSection
      title="OpenAI API Key"
      description="Optional cloud transcription"
    >
      <div style={styles.serviceInfo}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3l2.4 1.4 2.8-.3 1.2 2.6 2.3 1.6-.8 2.7.8 2.7-2.3 1.6-1.2 2.6-2.8-.3L12 21l-2.4-1.4-2.8.3-1.2-2.6-2.3-1.6.8-2.7-.8-2.7 2.3-1.6 1.2-2.6 2.8.3L12 3z"
            stroke={colors.status.success}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M9.5 12h5M12 9.5v5" stroke={colors.status.success} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <div>
          <span style={styles.serviceName}>OpenAI Audio Transcription</span>
          <span style={styles.serviceDescription}>
            Used for reliable post-session narration transcription when local models are unavailable.
          </span>
        </div>
      </div>
      <ApiKeyInput
        label="API Key"
        description="Optional when local transcription is available"
        serviceName="OpenAI"
        apiKey={openAiApiKey}
        onApiKeyChange={onOpenAiApiKeyChange}
        onToggleVisibility={onToggleOpenAiApiKeyVisibility}
        onTest={onTestOpenAiApiKey}
      />
    </SettingsSection>

    {settings.analysisProvider === 'anthropic-api' && (
      <SettingsSection
        title="Anthropic API Key"
        description="Required only when Anthropic API is selected above"
      >
      <div style={styles.serviceInfo}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 20L10.5 4h3L20 20h-3.5l-1.3-3.3H8.8L7.5 20H4zM9.9 13.9h4.2L12 8.4l-2.1 5.5z"
            fill={colors.status.warning}
          />
        </svg>
        <div>
          <span style={styles.serviceName}>Anthropic Analysis</span>
          <span style={styles.serviceDescription}>
            Used to generate structured, agent-ready markdown insights from your capture session.
          </span>
        </div>
      </div>
      <ApiKeyInput
        label="API Key"
        description="Used only for Anthropic analysis"
        serviceName="Anthropic"
        apiKey={anthropicApiKey}
        onApiKeyChange={onAnthropicApiKeyChange}
        onToggleVisibility={onToggleAnthropicApiKeyVisibility}
        onTest={onTestAnthropicApiKey}
      />
      </SettingsSection>
    )}

    <SettingsSection title="Debug & Backup">
      <ToggleSetting
        label="Debug Mode"
        description="Enable verbose logging for troubleshooting"
        value={settings.debugMode}
        onChange={(value) => onSettingChange('debugMode', value)}
      />
      <ToggleSetting
        label="Keep Audio Backups"
        description="Save audio recordings alongside transcriptions"
        value={settings.keepAudioBackups}
        onChange={(value) => onSettingChange('keepAudioBackups', value)}
      />
    </SettingsSection>

    <SettingsSection title="Settings Management">
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Export Settings</span>
          <span style={styles.settingDescription}>Save your settings to a file</span>
        </div>
        <button style={styles.secondaryButton} onClick={onExportSettings}>
          Export
        </button>
      </div>
      <div style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Import Settings</span>
          <span style={styles.settingDescription}>Load settings from a file</span>
        </div>
        <button style={styles.secondaryButton} onClick={onImportSettings}>
          Import
        </button>
      </div>
    </SettingsSection>

    <SettingsSection title="Danger Zone">
      <DangerButton
        label="Clear All Data"
        description="Delete all sessions, screenshots, and reset settings"
        buttonText="Clear All Data"
        confirmText="Click to confirm deletion"
        onConfirm={onClearAllData}
      />
    </SettingsSection>
  </div>
  );
};
