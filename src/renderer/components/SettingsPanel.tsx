/**
 * MarkuprX Settings Panel
 *
 * Thin composition shell. State lives in useSettingsPanel hook,
 * primitives in ./primitives/, tabs in ./settings/.
 */

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PUBLIC_BRAND_NAME } from '../../shared/publicBrand';
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
  const railControlRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<Partial<Record<SettingsTab, HTMLButtonElement | null>>>({});
  const [railDirection, setRailDirection] = useState<'forward' | 'backward'>('forward');
  const [railHasOverflow, setRailHasOverflow] = useState(false);

  const updateRailAffordance = useCallback(() => {
    const rail = tabListRef.current;
    if (!rail) return;
    const maximumScroll = rail.scrollWidth - rail.clientWidth;
    const firstTab = tabRefs.current[TABS[0].id];
    const startingScroll = firstTab?.offsetLeft ?? 0;
    setRailHasOverflow(maximumScroll > 1);
    if (rail.scrollLeft <= startingScroll + 1) setRailDirection('forward');
    else if (rail.scrollLeft >= maximumScroll - 1) setRailDirection('backward');
  }, []);

  const revealActiveTab = useCallback((tabId: SettingsTab) => {
    const rail = tabListRef.current;
    const control = railControlRef.current;
    const button = tabRefs.current[tabId];
    if (!rail || !control || !button) return;

    const railBox = rail.getBoundingClientRect();
    const controlBox = control.getBoundingClientRect();
    const buttonBox = button.getBoundingClientRect();
    const maximumScroll = rail.scrollWidth - rail.clientWidth;
    const tabIndex = TABS.findIndex((tab) => tab.id === tabId);
    let nextScroll = rail.scrollLeft;
    if (tabIndex === 0) {
      nextScroll = button.offsetLeft;
    } else if (tabIndex === TABS.length - 1) {
      nextScroll = maximumScroll;
    } else if (buttonBox.left < railBox.left) {
      nextScroll += buttonBox.left - railBox.left;
    } else if (buttonBox.right > controlBox.left) {
      nextScroll += buttonBox.right - controlBox.left;
    }
    rail.scrollLeft = Math.max(0, Math.min(nextScroll, maximumScroll));
    updateRailAffordance();
  }, [updateRailAffordance]);

  useLayoutEffect(() => {
    if (!isOpen) return undefined;
    const rail = tabListRef.current;
    if (!rail) return undefined;
    const frame = requestAnimationFrame(updateRailAffordance);
    const observer = new ResizeObserver(updateRailAffordance);
    observer.observe(rail);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [isOpen, updateRailAffordance]);

  useLayoutEffect(() => {
    if (!isOpen) return undefined;
    revealActiveTab(s.activeTab);
    const frame = requestAnimationFrame(() => revealActiveTab(s.activeTab));
    return () => cancelAnimationFrame(frame);
  }, [isOpen, revealActiveTab, s.activeTab]);

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
        button?.focus({ preventScroll: true });
      });
    },
    [s],
  );

  const handleRailAdvance = useCallback(() => {
    const rail = tabListRef.current;
    const control = railControlRef.current;
    if (!rail || !control) return;
    const visibleLeft = rail.getBoundingClientRect().left;
    const visibleRight = control.getBoundingClientRect().left;
    const candidates = TABS.map((tab) => ({
      tab,
      button: tabRefs.current[tab.id] ?? null,
    })).filter((candidate): candidate is {
      tab: typeof TABS[number];
      button: HTMLButtonElement;
    } => candidate.button !== null);
    const target = railDirection === 'forward'
      ? candidates.find(({ button }) => button.getBoundingClientRect().right > visibleRight + 1)
      : [...candidates].reverse()
        .find(({ button }) => button.getBoundingClientRect().left < visibleLeft - 1);
    if (!target) return;

    s.setActiveTab(target.tab.id);
    requestAnimationFrame(() => {
      target.button.focus({ preventScroll: true });
    });
  }, [railDirection, s]);

  const handleResetAll = useCallback(async () => {
    const resetSections = [
      s.resetGeneralSection,
      s.resetRecordingSection,
      s.resetRecordingCompatibilitySection,
      s.resetAppearanceSection,
      s.resetHotkeysSection,
      s.resetAdvancedSection,
    ];
    for (const resetSection of resetSections) {
      if (!await resetSection()) return;
    }
  }, [
    s,
  ]);

  const renderTabContent = useMemo(() => {
    switch (s.activeTab) {
      case 'general':
        return <GeneralTab settings={s.settings} onSettingChange={s.handleSettingChange} />;
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
            isClearingData={s.isClearingData}
            clearDataError={s.clearDataError}
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
          />
        );
      default:
        return null;
    }
  }, [
    s.activeTab, s.settings, s.audioDevices, s.openAiApiKey, s.anthropicApiKey,
    s.analysisProviderStatuses, s.isScanningProviders, s.refreshAnalysisProviders,
    s.whisperModelStatus, s.isRepairingLocalTranscription, s.localTranscriptionError,
    s.isClearingData, s.clearDataError,
    s.handleSettingChange, s.handleHotkeyChange,
    s.handleAnalysisModelChange, s.handleRepairLocalTranscription,
    s.handleOpenAiApiKeyChange, s.handleToggleOpenAiApiKeyVisibility, s.handleTestOpenAiApiKey,
    s.handleAnthropicApiKeyChange, s.handleToggleAnthropicApiKeyVisibility, s.handleTestAnthropicApiKey,
    s.handleClearAllData, s.handleExportSettings, s.handleImportSettings,
    s.resetRecordingSection, s.resetAppearanceSection, s.resetHotkeysSection,
  ]);

  if (!isOpen) return null;

  return (
    <PortraitSurface
      title="Settings"
      titleId="markuprx-settings-title"
      backLabel={`Back to ${PUBLIC_BRAND_NAME}`}
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
                : `${PUBLIC_BRAND_NAME} ${s.appVersion ? `v${s.appVersion}` : ''}`}
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
        <div className="ff-settings-section-navigation">
          <nav
            ref={tabListRef}
            className="ff-settings-section-rail"
            role="tablist"
            aria-label="Settings sections"
            style={styles.sectionRail}
            onKeyDown={handleTabKeyDown}
            onScroll={updateRailAffordance}
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className="ff-settings-section-tab"
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
          <button
            ref={railControlRef}
            className="ff-settings-section-rail__more"
            type="button"
            aria-label={railDirection === 'forward'
              ? 'Show more settings sections'
              : 'Show previous settings sections'}
            data-direction={railDirection}
            disabled={!railHasOverflow}
            onClick={handleRailAdvance}
          >
            <span aria-hidden="true">{railDirection === 'forward' ? '›' : '‹'}</span>
          </button>
        </div>
      }
      contentLabel="Settings content"
    >
      <div
        id="markuprx-settings-panel"
        className="ff-portrait-content"
        role="tabpanel"
        aria-labelledby={'markuprx-settings-tab-' + s.activeTab}
        style={styles.portraitPanel}
      >
        {renderTabContent}
        <div style={styles.portraitEndActions}>
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
