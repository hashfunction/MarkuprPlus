/**
 * MarkuprX Settings Panel
 *
 * Thin composition shell. State lives in useSettingsPanel hook,
 * primitives in ./primitives/, tabs in ./settings/.
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { DonateButton } from './DonateButton';
import { PortraitSurface } from './PortraitSurface';
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
  const s = useSettingsPanel(isOpen, onClose, initialTab);
  const tabListRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Partial<Record<SettingsTab, HTMLButtonElement | null>>>({});

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const currentIndex = TABS.findIndex((tab) => tab.id === s.activeTab);
      let nextIndex = currentIndex;
      if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TABS.length;
      else if (event.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
      } else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = TABS.length - 1;
      else return;

      event.preventDefault();
      const nextTab = TABS[nextIndex];
      s.setActiveTab(nextTab.id);
      requestAnimationFrame(() => {
        const button = tabRefs.current[nextTab.id];
        button?.focus();
        button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    },
    [s],
  );

  const handleResetAll = useCallback(async () => {
    await s.resetGeneralSection();
    await s.resetRecordingSection();
    await s.resetAppearanceSection();
    await s.resetHotkeysSection();
    await s.resetAdvancedSection();
  }, [
    s,
  ]);

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
    <PortraitSurface
      title="Settings"
      titleId="markuprx-settings-title"
      backLabel="Back to MarkuprX"
      onBack={onClose}
      subtitle={
        <span
          aria-live="polite"
          role={s.saveStatus === 'error' ? 'alert' : undefined}
          title={s.saveError ?? undefined}
        >
          {s.saveStatus === 'saving'
            ? 'Saving'
            : s.saveStatus === 'saved'
              ? 'Saved'
              : s.saveStatus === 'error'
                ? 'Unable to save'
                : 'MarkuprX ' + (s.appVersion ? 'v' + s.appVersion : '')}
        </span>
      }
      headerActions={
        !s.analysisProviderViewState.ready ? (
          <button
            type="button"
            style={styles.byokBadge}
            onClick={() => s.setActiveTab('advanced')}
          >
            AI Setup
          </button>
        ) : undefined
      }
      navigation={
        <nav
          ref={tabListRef}
          role="tablist"
          aria-label="Settings sections"
          style={styles.sectionRail}
          onKeyDown={handleTabKeyDown}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              id={'markuprx-settings-tab-' + tab.id}
              type="button"
              role="tab"
              aria-controls="markuprx-settings-panel"
              aria-selected={s.activeTab === tab.id}
              tabIndex={s.activeTab === tab.id ? 0 : -1}
              style={{
                ...styles.railTab,
                ...(s.activeTab === tab.id ? styles.railTabActive : {}),
              }}
              onClick={() => s.setActiveTab(tab.id)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      }
      contentLabel="Settings content"
    >
      <div
        id="markuprx-settings-panel"
        role="tabpanel"
        aria-labelledby={'markuprx-settings-tab-' + s.activeTab}
        style={styles.portraitPanel}
      >
        {renderTabContent}
        <div style={styles.portraitEndActions}>
          <DonateButton />
          <button type="button" style={styles.resetAllButton} onClick={handleResetAll}>
            Reset All to Defaults
          </button>
        </div>
      </div>

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
    </PortraitSurface>
  );
};

export default SettingsPanel;
