# Extractable Components

## AppPortraitShell

- Source: `src/renderer/App.tsx`
- Category: layout
- Description: Fixed-size portrait popover shell with gradient background, elevated card, title/status header, and vertically scrollable content.
- Extractable props: `sessionState` (string, default: "idle"), `currentView` (string, default: "main"), `showStatus` (boolean, default: true)
- Hardcoded: MarkuprX eyebrow, header icon geometry, shell gradient, card border/radius/shadow, primary and secondary action styling

## SecondaryViewShell

- Source: currently repeated across `src/renderer/components/SettingsPanel.tsx`, `SessionHistory.tsx`, and `KeyboardShortcuts.tsx`
- Category: layout
- Description: Candidate reusable portrait secondary surface with sticky header, optional compact toolbar, one vertical scroller, and optional footer/status strip.
- Extractable props: `title` (string), `subtitle` (string, optional), `showBack` (boolean, default: true), `showClose` (boolean, default: false)
- Hardcoded: 460 × 680 viewport relationship, 12 px outer inset, 18 px card radius, blue focus ring, dark glass surface

## SettingsSection

- Source: `src/renderer/components/primitives/SettingsSection.tsx`
- Category: basic
- Description: Titled settings group with description, reset affordance, and bordered content card.
- Extractable props: `title` (string), `description` (string, optional), `showReset` (boolean, default: false)
- Hardcoded: uppercase section label, reset icon, card surface, spacing and borders

## ToggleSetting

- Source: `src/renderer/components/primitives/Toggle.tsx`
- Category: basic
- Description: Labeled setting row with explanatory copy and an accessible switch.
- Extractable props: `label` (string), `description` (string), `value` (boolean)
- Hardcoded: switch dimensions, knob geometry, accent styling

## DropdownSetting

- Source: `src/renderer/components/primitives/Dropdown.tsx`
- Category: basic
- Description: Labeled select row used across general, recording, and appearance settings.
- Extractable props: `label` (string), `description` (string), `value` (string)
- Hardcoded: select chevron, field styling and row spacing

## SessionCard

- Source: `src/renderer/components/SessionHistory.tsx`
- Category: basic
- Description: Selectable session summary with thumbnail, title/date, duration, screenshot/item counts, preview, and contextual actions.
- Extractable props: `isSelected` (boolean, default: false), `isFocused` (boolean, default: false), `showActions` (boolean, default: false)
- Hardcoded: metadata icons, action icon set, thumbnail ratio, card visual treatment

## ShortcutRow

- Source: `src/renderer/components/KeyboardShortcuts.tsx`
- Category: basic
- Description: Shortcut description and platform-aware key-badge row with optional rebinding state.
- Extractable props: `isEditing` (boolean, default: false), `customizable` (boolean, default: false), `keys` (string)
- Hardcoded: keycap styling, edit/check/cancel icons, row spacing

## DonateButton

- Source: `src/renderer/components/DonateButton.tsx`
- Category: basic
- Description: Reusable rotating support action shown at the bottom of primary and settings surfaces.
- Extractable props: `className` (string, optional)
- Hardcoded: Ko-fi destination, message rotation, heart/coffee visual
