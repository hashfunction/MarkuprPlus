# Key View Dependency Trees

The app uses logical views rather than URL routes. Trees below include UI-touching local imports and the shared state providers that determine what renders.

## Main portrait shell (`main`)

Entry: `src/renderer/AppWrapper.tsx`

Dependencies:
- `src/renderer/App.tsx`
  - `src/shared/types.ts`
  - `src/renderer/components/index.ts`
    - `src/renderer/components/CrashRecoveryDialog.tsx`
    - `src/renderer/components/Onboarding.tsx`
    - `src/renderer/components/SettingsPanel.tsx`
    - `src/renderer/components/CountdownTimer.tsx`
    - `src/renderer/components/AudioWaveform.tsx`
    - `src/renderer/components/KeyboardShortcuts.tsx`
    - `src/renderer/components/ExportDialog.tsx`
    - `src/renderer/components/SessionReview.tsx`
    - `src/renderer/components/RecordingOverlay.tsx`
    - `src/renderer/components/ProcessingOverlay.tsx`
  - `src/renderer/components/SessionHistory.tsx`
  - `src/renderer/components/HotkeyHint.tsx`
  - `src/renderer/components/StatusIndicator.tsx`
  - `src/renderer/contexts/index.ts`
    - `src/renderer/contexts/RecordingContext.tsx`
    - `src/renderer/contexts/ProcessingContext.tsx`
    - `src/renderer/contexts/UIContext.tsx`
  - `src/renderer/styles/app-shell.css`
- `src/renderer/components/ErrorBoundary.tsx`
- `src/renderer/contexts/RecordingContext.tsx`
- `src/renderer/contexts/ProcessingContext.tsx`
- `src/renderer/contexts/UIContext.tsx`

## Settings (`settings`)

Entry: `src/renderer/components/SettingsPanel.tsx`

Dependencies:
- `src/renderer/hooks/useTheme.ts`
  - `src/renderer/styles/theme.ts`
- `src/renderer/components/settings/index.ts`
  - `src/renderer/components/settings/GeneralTab.tsx`
    - `src/renderer/components/primitives/SettingsSection.tsx`
    - `src/renderer/components/primitives/Toggle.tsx`
    - `src/renderer/components/primitives/DirectoryPicker.tsx`
  - `src/renderer/components/settings/RecordingTab.tsx`
    - `src/renderer/components/primitives/SettingsSection.tsx`
    - `src/renderer/components/primitives/Toggle.tsx`
    - `src/renderer/components/primitives/Dropdown.tsx`
    - `src/renderer/components/primitives/Slider.tsx`
  - `src/renderer/components/settings/AppearanceTab.tsx`
    - `src/renderer/styles/theme.ts`
    - `src/renderer/components/primitives/SettingsSection.tsx`
    - `src/renderer/components/primitives/Dropdown.tsx`
    - `src/renderer/components/primitives/ColorPicker.tsx`
  - `src/renderer/components/settings/HotkeysTab.tsx`
    - `src/renderer/components/primitives/SettingsSection.tsx`
    - `src/renderer/components/primitives/KeyRecorder.tsx`
    - `src/renderer/components/HotkeyHint.tsx`
  - `src/renderer/components/settings/AdvancedTab.tsx`
    - `src/renderer/components/settings/AnalysisProviderSelector.tsx`
      - `src/renderer/components/settings/analysisProviderOptions.ts`
      - `src/renderer/components/primitives/SettingsSection.tsx`
    - `src/renderer/components/primitives/Toggle.tsx`
    - `src/renderer/components/primitives/ApiKeyInput.tsx`
    - `src/renderer/components/primitives/DangerButton.tsx`
  - `src/renderer/components/settings/tabConfig.tsx`
- `src/renderer/components/settings/settingsStyles.ts`
- `src/renderer/components/settings/useSettingsPanel.ts`
  - `src/shared/types.ts`
  - `src/renderer/components/settings/analysisProviderViewState.ts`

## Session history (`history`)

Entry: `src/renderer/components/SessionHistory.tsx`

Dependencies:
- `src/renderer/components/Skeleton.tsx`
- `src/renderer/hooks/useTheme.ts`
  - `src/renderer/styles/theme.ts`
- `src/shared/types.ts` through the preload bridge contract

## Keyboard shortcuts (`shortcuts`)

Entry: `src/renderer/components/KeyboardShortcuts.tsx`

Dependencies:
- No local child imports; the component owns its shortcut rows, category grouping, key badges, search, and legacy utility-class layout inline.
- Visual utility classes resolve through `src/renderer/styles/globals.css`.

## Shared renderer styling

- `src/renderer/styles/globals.css`
- `src/renderer/styles/app-shell.css`
- `src/renderer/styles/animations.css`
- `src/renderer/styles/theme.ts`
- `src/renderer/components/ThemeProvider.tsx`
