import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  ModelDownloadDialogView,
  type ModelDownloadDialogViewProps,
} from '../../src/renderer/components/ModelDownloadDialog';
import {
  ThemeContext,
  buildTheme,
  type ThemeContextValue,
} from '../../src/renderer/hooks/useTheme';
import {
  accentColors,
  borderRadius,
  shadows,
  spacing,
  transitions,
  typography,
  zIndex,
} from '../../src/renderer/styles/theme';

const builtTheme = buildTheme({
  mode: 'dark',
  accentColor: accentColors.blue.default,
  systemPrefersDark: true,
});

const themeValue: ThemeContextValue = {
  mode: 'dark',
  accentColor: accentColors.blue.default,
  isDark: true,
  colors: builtTheme.colors,
  setMode: vi.fn(),
  setAccentColor: vi.fn(),
  toggleMode: vi.fn(),
  typography,
  spacing,
  shadows,
  borderRadius,
  transitions,
  zIndex,
  getAccentColors: () => accentColors,
  getCSSVar: () => '',
};

const baseProps: Omit<ModelDownloadDialogViewProps, 'state'> = {
  selectedModel: 'tiny',
  models: [{
    name: 'tiny',
    filename: 'ggml-tiny.bin',
    sizeMB: 75,
    ramRequired: '1 GB',
    quality: 'Fast local transcription',
    isDownloaded: false,
  }],
  showAdvanced: true,
  progress: {
    model: 'tiny',
    downloadedBytes: 39_321_600,
    totalBytes: 78_643_200,
    percent: 50,
    speedBps: 1_048_576,
    estimatedSecondsRemaining: 38,
  },
  error: `Download failed: ${'unbroken-network-error-'.repeat(30)}`,
  onSelectModel: vi.fn(),
  onToggleAdvanced: vi.fn(),
  onDownload: vi.fn(),
  onSkip: vi.fn(),
  onCancel: vi.fn(),
  onComplete: vi.fn(),
};

function renderState(state: ModelDownloadDialogViewProps['state']): string {
  return renderToStaticMarkup(createElement(
    ThemeContext.Provider,
    { value: themeValue },
    createElement(ModelDownloadDialogView, { ...baseProps, state }),
  ));
}

describe('ModelDownloadDialogView', () => {
  it.each([
    ['prompt', 'Download Speech Recognition Model', 'Download Now'],
    ['downloading', 'Downloading Model...', 'Cancel Download'],
    ['complete', 'Download Complete!', 'Start Using MarkuprX'],
    ['error', 'Download Failed', 'Try Again'],
  ] as const)('renders the %s state in the shared contained-dialog contract', (
    state,
    title,
    action,
  ) => {
    const html = renderState(state);

    expect(html).toContain('class="ff-contained-dialog-layer"');
    expect(html).toContain('class="ff-contained-dialog"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="markuprx-model-download-title"');
    expect(html).toContain('tabindex="-1"');
    expect(html.match(/ff-contained-dialog__body/g)).toHaveLength(1);
    expect(html.match(/ff-contained-dialog__actions/g)).toHaveLength(1);
    expect(html).toContain(title);
    expect(html).toContain(action);
  });

  it('preserves advanced choices and a long download error without nested dialog semantics', () => {
    const prompt = renderState('prompt');
    const error = renderState('error');

    expect(prompt).toContain('Fast local transcription');
    expect(prompt).toContain('Hide options');
    expect(error).toContain('unbroken-network-error-');
    expect(error.match(/role="dialog"/g)).toHaveLength(1);
  });
});
