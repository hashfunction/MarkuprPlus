# MarkuprX Portrait Application Design System

## Product context

MarkuprX is an Electron menu-bar/taskbar app for recording screen feedback with narration and turning it into structured Markdown. It must feel fast, compact, native, and trustworthy. The primary interaction surface is a tray-anchored portrait popover rather than a conventional desktop window.

Primary logical surfaces:

- Capture home and status
- Settings
- Session history
- Keyboard shortcuts
- Onboarding and export dialogs
- Completed-session report and Review Editor

Compact recording and processing HUDs are deliberately separate and retain their smaller sizes.

## Viewport and shell

- Every non-HUD surface uses an exact 460 × 680 px BrowserWindow.
- The renderer fills the viewport and uses 12 px outer padding.
- The main elevated card has an 18 px radius, a fine cool-gray border, layered translucent navy surfaces, a deep shadow, and a subtle inset highlight.
- Secondary views use the same visual frame as the primary home card. They do not appear as a second modal floating over a visible home screen.
- A secondary view is structured as:
  1. sticky header with Back, title/subtitle, and optional compact action;
  2. optional compact navigation/filter strip;
  3. one vertically scrollable content region;
  4. optional sticky status/action footer only when essential.
- Avoid nested vertical scrollers. Horizontal scrolling is allowed only for a short settings section rail when it has visible affordance and keyboard support.
- All content and controls must fit within 436 px of usable width after the shell inset. No horizontal overflow.

## Visual language

Preserve the current MarkuprX visual identity.

- Background: layered radial blue/indigo glow over a deep navy-to-black vertical gradient.
- Main surfaces: translucent #161c27 / #1a212d family with restrained glass treatment.
- Primary text: #eef3ff.
- Secondary text: #c6d0e3.
- Muted text: #8f9db5.
- Primary action/accent: #0a84ff to #0077ed gradient.
- General theme accent default: #3b82f6; user-selectable accents remain supported.
- Success: #34c759 / #34d399 family.
- Warning: #f59e0b / #fbbf24 family.
- Error/live: #ff3b30 / #f87171 family.
- Borders: cool-gray alpha borders, generally 8–34% opacity depending on emphasis.
- Typography: SF Pro Text / SF Pro Display, Apple system fallbacks. Use SF Mono / Menlo for paths, hotkeys where appropriate, and technical values.
- No decorative fonts, neon colors, purple/pink gradients, or marketing-page styling.

## Type and spacing

- App/secondary title: 22–24 px, weight 600, tight line height.
- Section title: 11–13 px, weight 600, uppercase with 0.05–0.08 em tracking.
- Body: 12–14 px with 1.4–1.5 line height.
- Supporting metadata: 10–12 px.
- Use the existing 4, 6, 8, 10, 12, 14, 16, 20, 24, and 32 px rhythm.
- Touch/click targets should normally be at least 32 px and primary actions at least 42 px.
- Cards use 10–14 px radii; controls use 8–12 px radii; badges use pill radii.

## Navigation and information architecture

### Shared secondary header

- A clear Back button returns to the previous/main surface.
- Title is always visible while content scrolls.
- Close/Hide is not duplicated if Back already returns to home; the OS/tray interaction can hide the popover.
- Escape performs the same back/close action.
- Header must remain keyboard draggable-safe: noninteractive zones may use Electron drag regions; buttons use no-drag.

### Settings

- Preserve five sections: General, Recording, Appearance, Hotkeys, Advanced.
- Preferred representation: a compact horizontally scrollable segmented section rail below the sticky header, with icon + short label and the active section visibly selected.
- The active section content is a single vertical stream of compact settings cards.
- Controls that previously sat side-by-side wrap into full-width or label-above-control layouts at portrait width.
- The selected section and scroll position should remain stable while editing.
- Reset All belongs at the end of the Settings content or in a compact overflow action, not a permanently tall footer.

### Session history

- Header includes title/count and a full-width search field below it.
- Sort and selection actions live in a compact wrapping toolbar.
- Session rows become portrait cards: compact thumbnail on the left or top, title/date, metadata, short preview, and explicit action menu.
- Do not rely on hover to reveal necessary actions; touch and keyboard users need a visible overflow/menu affordance.
- List content owns the page scroller. Empty/loading states remain centered and concise.

### Keyboard shortcuts

- Full-width search below the title.
- Shortcuts remain grouped by category.
- Each row stacks descriptive copy and keycaps cleanly when needed; no horizontal clipping.
- Customizable shortcuts retain rebind affordances and conflict feedback.
- Long explanatory footer copy moves into the scroll content so it cannot squeeze the list.

### Report, Review Editor, onboarding, export, and error flows

- Reuse the same secondary shell/header/content pattern where applicable.
- Review toolbar actions wrap or move into an overflow menu; no clipped horizontal toolbar.
- Evidence cards, screenshots, text editors, and report paths scale to the available width.
- Dialog confirmations fit inside the portrait shell and trap focus without creating a larger BrowserWindow.
- Complete and error states use 460 × 680 and scroll internally when content exceeds the viewport.

## Tray context menu

Use the platform-native Electron tray menu.

- Retain recording action, Settings, About, Donate, and platform conventions.
- Add Help, opening https://markuprx.com.
- Add Contact, opening a pre-addressed mailto link to hello@markuprx.com.
- Provide Exit MarkuprX on Windows/Linux and Quit MarkuprX on macOS.
- Right-click opens this menu; left-click continues to toggle the portrait popover.

## Accessibility and motion

- Maintain visible 2 px accent focus rings and logical tab order.
- Use semantic dialogs, headings, tab/section navigation, lists, buttons, and switches.
- All icon-only actions require accessible names and tooltips.
- Do not encode state by color alone.
- Maintain at least WCAG AA text contrast.
- Entrance and state transitions remain restrained, generally 120–300 ms.
- Respect prefers-reduced-motion and avoid animated scrolling when reduced motion is requested.
- Keep the focused item visible when the content scroller moves.

## Implementation guardrails

- No new UI dependency is required.
- Extract one reusable portrait secondary shell to remove repeated modal/backdrop framing.
- Keep all existing settings and history capabilities; this is a layout/navigation redesign, not feature removal.
- Preserve IPC contracts unless a contract is needed for a newly explicit navigation action.
- Window-size constants should have one portrait source of truth shared by all non-HUD state mappings.
