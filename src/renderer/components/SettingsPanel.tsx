/**
 * MarkuprX Settings Panel
 *
 * Thin composition shell. State lives in useSettingsPanel hook,
 * primitives in ./primitives/, tabs in ./settings/.
 */

import React, { useMemo } from 'react';
import { useTheme } from '../hooks/useTheme';
import { DonateButton } from './DonateButton';
import { GeneralTab, RecordingTab, AppearanceTab, HotkeysTab, AdvancedTab, TABS } from './settings';
import type { SettingsTab } from './settings';
import { styles } from './settings/settingsStyles';
import { useSettingsPanel } from './settings/useSettingsPanel';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  initialTab = 'general',
}) => {
  const { colors } = useTheme();
  const s = useSettingsPanel(isOpen, onClose, initialTab);

  const renderTabContent = useMemo(() => {
    switch (s.activeTab) {
      case 'general':
        return <GeneralTab settings={s.settings} onSettingChange={s.handleSettingChange} onResetSection={s.resetGeneralSection} />;
      case 'recording':
        return <RecordingTab settings={s.settings} audioDevices={s.audioDevices} onSettingChange={s.handleSettingChange} onResetSection={s.resetRecordingSection} />;
      case 'appearance':
        return <AppearanceTab settings={s.settings} onSettingChange={s.handleSettingChange} onResetSection={s.resetAppearanceSection} />;
      case 'hotkeys':
        return <HotkeysTab settings={s.settings} onHotkeyChange={s.handleHotkeyChange} onResetSection={s.resetHotkeysSection} />;
      case 'advanced':
        return (
          <AdvancedTab
            settings={s.settings}
            openAiApiKey={s.openAiApiKey}
            anthropicApiKey={s.anthropicApiKey}
            analysisProviderStatuses={s.analysisProviderStatuses}
            isScanningProviders={s.isScanningProviders}
            whisperModelStatus={s.whisperModelStatus}
            isRepairingLocalTranscription={s.isRepairingLocalTranscription}
            localTranscriptionError={s.localTranscriptionError}
            onSettingChange={s.handleSettingChange}
            onAnalysisModelChange={s.handleAnalysisModelChange}
            onRefreshAnalysisProviders={s.refreshAnalysisProviders}
            onRepairLocalTranscription={s.handleRepairLocalTranscription}
            onOpenAiApiKeyChange={s.handleOpenAiApiKeyChange}
            onToggleOpenAiApiKeyVisibility={s.handleToggleOpenAiApiKeyVisibility}
            onTestOpenAiApiKey={s.handleTestOpenAiApiKey}
            onAnthropicApiKeyChange={s.handleAnthropicApiKeyChange}
            onToggleAnthropicApiKeyVisibility={s.handleToggleAnthropicApiKeyVisibility}
            onTestAnthropicApiKey={s.handleTestAnthropicApiKey}
            onClearAllData={s.handleClearAllData}
            onExportSettings={s.handleExportSettings}
            onImportSettings={s.handleImportSettings}
            onResetSection={s.resetAdvancedSection}
          />
        );
      default:
        return null;
    }
  }, [
    s.activeTab, s.settings, s.audioDevices, s.openAiApiKey, s.anthropicApiKey,
    s.analysisProviderStatuses, s.isScanningProviders, s.refreshAnalysisProviders,
    s.whisperModelStatus, s.isRepairingLocalTranscription, s.localTranscriptionError,
    s.handleSettingChange, s.handleHotkeyChange,
    s.handleAnalysisModelChange, s.handleRepairLocalTranscription,
    s.handleOpenAiApiKeyChange, s.handleToggleOpenAiApiKeyVisibility, s.handleTestOpenAiApiKey,
    s.handleAnthropicApiKeyChange, s.handleToggleAnthropicApiKeyVisibility, s.handleTestAnthropicApiKey,
    s.handleClearAllData, s.handleExportSettings, s.handleImportSettings,
    s.resetGeneralSection, s.resetRecordingSection, s.resetAppearanceSection, s.resetHotkeysSection, s.resetAdvancedSection,
  ]);

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.backdrop} onClick={onClose} />

      <div
        ref={s.panelRef}
        style={{
          ...styles.panel,
          opacity: s.isAnimating ? 0 : 1,
          transform: s.isAnimating ? 'scale(0.95) translateY(10px)' : 'scale(1) translateY(0)',
        }}
      >
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerTitleWrap}>
            <h2 style={styles.headerTitle}>Settings</h2>
            {!s.analysisProviderViewState.ready && (
              <button
                type="button"
                style={styles.byokBadge}
                onClick={() => s.setActiveTab('advanced')}
                title="Open AI provider setup"
              >
                AI Setup Required
              </button>
            )}
          </div>
          <button style={styles.closeButton} onClick={onClose} aria-label="Close settings">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={{ ...styles.content, flexDirection: s.isCompact ? 'column' : 'row' }}>
          <nav style={{ ...styles.sidebar, ...(s.isCompact ? styles.sidebarCompact : {}) }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                style={{
                  ...styles.tabButton,
                  ...(s.isCompact ? styles.tabButtonCompact : {}),
                  backgroundColor: s.activeTab === tab.id ? 'var(--accent-subtle)' : 'transparent',
                  color: s.activeTab === tab.id ? colors.text.link : colors.text.tertiary,
                  borderColor: s.activeTab === tab.id ? 'var(--accent-muted)' : 'transparent',
                }}
                onClick={() => s.setActiveTab(tab.id)}
                aria-selected={s.activeTab === tab.id}
              >
                {tab.icon}
                <span style={styles.tabLabel}>{tab.label}</span>
              </button>
            ))}
          </nav>

          <div style={{ ...styles.tabPanel, ...(s.isCompact ? styles.tabPanelCompact : {}) }}>
            {renderTabContent}
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <div style={styles.footerLeft}>
            <span style={styles.footerText}>
              MarkuprX {s.appVersion ? `v${s.appVersion}` : ''} {s.hasChanges && <span style={styles.savedIndicator}>Changes saved</span>}
            </span>
            <DonateButton />
          </div>
          <button
            style={styles.resetAllButton}
            onClick={async () => {
              await s.resetGeneralSection();
              await s.resetRecordingSection();
              await s.resetAppearanceSection();
              await s.resetHotkeysSection();
              await s.resetAdvancedSection();
            }}
          >
            Reset All to Defaults
          </button>
        </div>
      </div>

      {/* spin keyframe provided by animations.css; form element styles below */}
      <style>
        {`
          input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: var(--accent-default);
            cursor: pointer;
            border: 2px solid var(--bg-primary);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          }

          input[type="range"]::-webkit-slider-runnable-track {
            width: 100%;
            height: 4px;
            background: rgba(124, 137, 160, 0.4);
            border-radius: 2px;
          }

          select {
            -webkit-appearance: none;
            appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 5l3 3 3-3' stroke='%238f9db5' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 12px center;
            padding-right: 36px;
          }

          select:focus {
            outline: none;
            border-color: var(--accent-default);
          }

          input[type="color"] {
            -webkit-appearance: none;
            appearance: none;
            border: none;
            width: 32px;
            height: 32px;
            padding: 0;
            cursor: pointer;
          }

          input[type="color"]::-webkit-color-swatch-wrapper {
            padding: 0;
          }

          input[type="color"]::-webkit-color-swatch {
            border: none;
            border-radius: 50%;
          }
        `}
      </style>
    </div>
  );
};

export default SettingsPanel;
