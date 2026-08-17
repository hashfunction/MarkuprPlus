# Task 2: Portrait Surface Router and Approved Settings Layout

## Implementation

- Added the reusable `PortraitSurface` component and its shared portrait scrolling, header, navigation, footer, focus, and reduced-motion CSS contract.
- Routed Settings, Session History, and Keyboard Shortcuts as exclusive children of the main shell card; the existing main recording surface is now rendered only for `currentView === 'main'`.
- Replaced the Settings modal with the approved named portrait region, horizontal overflow rail, roving tab semantics (including Arrow keys, Home, and End), and in-content end actions.
- Replaced the old `hasChanges`/animation/compact state with `SettingsSaveStatus`, preserving optimistic setting values and existing theme, provider refresh, hotkey, and API-key side effects.
- Added the real-Electron portrait-window/no-overflow regression test, a Settings accessibility/tab-navigation test, and the visible `Saved` assertion after appearance persistence.

## Files changed

- `src/renderer/App.tsx`
- `src/renderer/components/PortraitSurface.tsx` (new)
- `src/renderer/components/index.ts`
- `src/renderer/components/SettingsPanel.tsx`
- `src/renderer/components/settings/settingsStyles.ts`
- `src/renderer/components/settings/useSettingsPanel.ts`
- `src/renderer/styles/app-shell.css`
- `src/renderer/styles/portrait-surface.css` (new)
- `tests/ui/markuprx-electron.spec.ts`

## TDD evidence

### RED

Command:

```sh
npm run build:desktop && npm run test:ui-electron -- --grep "approved portrait surface"
```

Result: build completed; the one new real-Electron test failed as intended. `getByRole('dialog', { name: 'Settings' })` resolved to one element while the test expected zero, proving the pre-change implementation was still modal.

### GREEN

Command:

```sh
npm run build:desktop && npm run test:ui-electron -- --grep "approved portrait surface|appearance settings|accessibility violations"
```

Result: build completed and all three focused Electron tests passed.

## Verification

```sh
npm run build:desktop && npm run test:ui-electron -- --grep "approved portrait surface|appearance settings|accessibility violations" && npm run typecheck && npm run lint && git diff --check
```

Result: Electron build completed; 3/3 focused Electron tests passed; `tsc --noEmit` passed; ESLint exited successfully with seven pre-existing warnings and no errors; `git diff --check` passed.

## Self-review

- Confirmed there is no Settings `dialog`/`aria-modal`, no sidebar/compact-tab branch, no fixed Settings footer, and no obsolete resize/animation/panel-ref state.
- Confirmed all three dedicated views are mounted only within the shell card and the home/recording content is guarded by `currentView === 'main'`.
- Confirmed all save/reset/API-key persistence paths report saving, saved, or error without removing their existing side effects.
- Adaptation: the prescribed test's fuzzy `getByRole('region', { name: 'Settings' })` also matched the required `Settings content` scroller in this Playwright version. The test uses `exact: true` to target the named outer Settings surface while retaining the specified content label.
- Independent review found no critical or important issues. It noted that the new callbacks depend on the returned panel-state object (functionally correct but recreated each render) and that save-error/reset/API-key status transitions rely on implementation review rather than additional focused tests.

## Concerns

- ESLint retains seven unrelated pre-existing warnings in App, Onboarding, TranscriptionPreview, popoverLayout, and GitHubIssueCreator; this task introduces no lint errors or new warnings.
- Per controller direction, the completed task is committed locally only and not pushed.
