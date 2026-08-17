import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/shared/types';

vi.mock('../../src/renderer/hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      accent: { default: '#0066cc', subtle: '#e5f0ff' },
      bg: { primary: '#ffffff', secondary: '#f8fafc', subtle: '#f8fafc', tertiary: '#eeeeee' },
      border: { default: '#cccccc', strong: '#999999' },
      status: {
        error: '#cc0000', errorSubtle: '#fff0f0', success: '#008800', warning: '#996600',
      },
      text: {
        primary: '#111111', secondary: '#444444', tertiary: '#666666', link: '#0055aa', inverse: '#ffffff',
      },
    },
  }),
}));

import { GeneralTab } from '../../src/renderer/components/settings/GeneralTab';
import { RecordingTab } from '../../src/renderer/components/settings/RecordingTab';
import { AdvancedTab } from '../../src/renderer/components/settings/AdvancedTab';
import { DonateButton } from '../../src/renderer/components/DonateButton';

const noop = () => undefined;
const apiKey = {
  value: '',
  visible: false,
  testing: false,
  valid: null,
  error: null,
};

describe('truthful public Settings surfaces', () => {
  it('uses forced-colors-aware tokens for the support action', () => {
    const markup = renderToStaticMarkup(React.createElement(DonateButton, {
      message: 'Support MarkuprPlus',
    }));

    expect(markup).toContain('color:var(--text-secondary)');
    expect(markup).toContain('border-color:var(--border-default)');
    expect(markup).toContain('background-color:var(--bg-subtle)');
  });

  it('shows only supported General controls', () => {
    const markup = renderToStaticMarkup(React.createElement(GeneralTab, {
      settings: { ...DEFAULT_SETTINGS, outputDirectory: '/tmp/markuprplus-output' },
      onSettingChange: noop,
    }));

    expect(markup).toContain('Output Directory');
    expect(markup).not.toContain('Launch at Login');
  });

  it('keeps supported recording controls and omits inactive capture promises', () => {
    const markup = renderToStaticMarkup(React.createElement(RecordingTab, {
      settings: DEFAULT_SETTINGS,
      audioDevices: [],
      onSettingChange: noop,
      onResetSection: noop,
    }));

    expect(markup).toContain('Countdown Before Recording');
    expect(markup).toContain('Show Audio Waveform');
    expect(markup).toContain('Microphone');
    expect(markup).not.toContain('Show Recording HUD');
    expect(markup).not.toContain('Pause Threshold');
    expect(markup).not.toContain('Minimum Time Between Captures');
  });

  it('omits inactive debug and retention promises from Advanced Settings', () => {
    const markup = renderToStaticMarkup(React.createElement(AdvancedTab, {
      settings: { ...DEFAULT_SETTINGS, analysisProvider: 'rules' },
      openAiApiKey: apiKey,
      anthropicApiKey: apiKey,
      analysisProviderStatuses: [],
      isScanningProviders: false,
      whisperModelStatus: null,
      isRepairingLocalTranscription: false,
      localTranscriptionError: null,
      isClearingData: false,
      clearDataError: null,
      onSettingChange: noop,
      onAnalysisModelChange: noop,
      onRefreshAnalysisProviders: noop,
      onRepairLocalTranscription: noop,
      onOpenAiApiKeyChange: noop,
      onToggleOpenAiApiKeyVisibility: noop,
      onTestOpenAiApiKey: noop,
      onAnthropicApiKeyChange: noop,
      onToggleAnthropicApiKeyVisibility: noop,
      onTestAnthropicApiKey: noop,
      onClearAllData: noop,
      onExportSettings: noop,
      onImportSettings: noop,
      onResetSection: noop,
    }));

    expect(markup).toContain('Report Generation');
    expect(markup).toContain('Settings Management');
    expect(markup).not.toContain('Debug Mode');
    expect(markup).not.toContain('Keep Audio Backups');
  });
});
