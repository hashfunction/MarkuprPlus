# Portrait Popover Surfaces and Tray Context Menu Design

## Summary

MarkuprX will use one consistent portrait window for every non-HUD application surface. The idle popover already establishes the target footprint: exactly 460 by 680 CSS pixels. Settings, Session History, Keyboard Shortcuts, completion and error states, the Review Editor, onboarding, export, recovery, and nested confirmations will fit within that same fixed outer window and expose overflow through deliberate internal scrolling instead of widening the `BrowserWindow`.

Settings will use the approved Option A layout: a sticky portrait header, a horizontally scrollable section rail, and one vertical content scroller. Other content-heavy surfaces will use the same shell contract while adapting their information architecture to stacked cards and compact action rows.

The tray icon's native right-click menu will add Help, Contact, and platform-appropriate Exit/Quit actions. Left-click behavior remains unchanged.

Approved visual reference: [Option A — compact section rail](https://p.superdesign.dev/draft/4081b8c9-c411-41c5-af6f-83e99bf13732).

## Goals

- Keep every non-HUD `BrowserWindow` state at exactly 460 by 680 pixels.
- Preserve every existing setting, history action, shortcut editor, review action, onboarding step, export option, recovery action, completion detail, and error detail.
- Give each surface one obvious vertical scroll region with no page-level horizontal overflow.
- Make navigation, primary actions, and status understandable at portrait width.
- Reuse the existing MarkuprX colors, typography, radii, borders, shadows, and control styling.
- Keep recording and processing HUDs at their current compact sizes and positions.
- Add native right-click Help, Contact, and Exit/Quit menu items on macOS, Windows, and Linux.
- Preserve keyboard access, focus management, reduced-motion behavior, and screen-reader semantics.

## Non-goals

- Making the popover user-resizable.
- Changing recording, processing, settings persistence, session storage, export, or report data behavior.
- Removing or merging settings sections, history actions, shortcut categories, or review fields.
- Replacing the current visual design system or introducing a second mobile-style theme.
- Changing left-click tray behavior, recording hotkeys, or application-menu commands.
- Building a new hosted help center or contact service.
- Changing the compact recording and processing HUD dimensions.

## Approaches Considered

### 1. Sticky header plus horizontal section rail (selected)

Settings keeps its five familiar destinations in a compact horizontally scrollable rail directly below the header. The active section remains visible, and only the content body scrolls vertically. This preserves fast section switching, requires no extra navigation level, and maps cleanly onto the current `activeTab` state.

### 2. Settings overview plus detail pages

A portrait overview would list all five sections and push a detail page after selection. It provides a calm first screen, but every section switch costs an additional navigation step and introduces another state layer that does not exist today.

### 3. Retain responsive wrapped tabs inside the current modal

The current compact fallback wraps tabs into rows while the components remain modal overlays over the home surface. This saves architectural work but consumes too much vertical space, obscures the fact that Settings is now the active screen, and does not provide a reusable answer for History, Shortcuts, or Review.

## Shared Window and Surface Contract

### Outer dimensions

One shared layout module will define the authoritative dimensions used by the main and renderer processes:

```ts
export const PORTRAIT_POPOVER_SIZE = { width: 460, height: 680 } as const;

export const HUD_POPOVER_SIZES = {
  recording: { width: 316, height: 90 },
  processing: { width: 320, height: 140 },
} as const;
```

Idle, Settings, History, Shortcuts, complete, Review, error, and all nested non-HUD flows use `PORTRAIT_POPOVER_SIZE`. The shared constant removes the current disagreement between `PopoverManager` state sizes and `UIContext.mapOverlaySize`.

`PopoverManager` remains responsible for applying the size and re-anchoring the popover to the tray. Switching among portrait surfaces does not resize or reposition the window. Entering or leaving recording/processing still applies the compact HUD size and existing HUD positioning.

### Portrait surface component

A reusable renderer shell will provide:

- a fixed-height flex column that fills the existing `ff-shell__card`;
- an optional sticky header with Back, title, concise status, and trailing actions;
- an optional sticky section rail or compact toolbar below the header;
- exactly one primary `overflow-y: auto` content region;
- an optional compact sticky action bar only when actions must remain continuously available;
- safe wrapping, `min-width: 0`, and text truncation rules that prevent horizontal page overflow.

Settings, History, and Shortcuts become top-level application surfaces selected by `currentView`, not modal dialogs drawn over a still-visible home page. The Review Editor is a top-level complete-state surface. True transient decisions such as delete confirmation or export remain modal dialogs, but their backdrop and panel are bounded by the portrait card.

The shared shell owns only layout and navigation semantics. Existing feature hooks and action handlers continue to own state and data mutations.

### Navigation and focus

- Entering a top-level surface moves focus to its heading or first meaningful control.
- Back and Escape return Settings, History, or Shortcuts to the main surface.
- Closing a transient dialog returns focus to the control that opened it.
- A destructive confirmation consumes Escape before the underlying surface does.
- Tab order follows the visual order; no off-screen control remains tabbable.
- Reduced-motion mode removes scale and slide transitions while preserving state changes.

## Surface Information Architecture

### Main, completion, and error

The current home composition remains the visual source of truth for the portrait shell. Idle content, recent sessions, status, primary recording action, paths, and recovery information continue to stack inside the main scroller.

The complete summary and error state normalize from their current special heights to 460 by 680. Long paths wrap or truncate within their cards, action groups wrap to additional rows, and overflow scrolls vertically. No action is removed.

### Settings

The approved Settings structure is:

1. Sticky header with Back, `Settings`, saved/readiness status, and the conditional AI Setup action.
2. Horizontally scrollable rail containing General, Recording, Appearance, Hotkeys, and Advanced.
3. One vertically scrollable active-section body.
4. Reset-all actions at the end of the content rather than a wide permanent footer.

The rail uses tab semantics, Left/Right arrow navigation, Home/End support, and automatic scroll-into-view for the active tab. Wheel and trackpad input over the rail may scroll it horizontally without creating page-level overflow.

Each settings section keeps its existing component and behavior. At portrait width:

- section cards stack vertically;
- labels and descriptions wrap above their control when a side-by-side row would become cramped;
- text fields and selectors use the available width;
- companion actions such as Browse, Test, Refresh, Import, or Export wrap into a following row when needed;
- switches remain aligned to the trailing edge and never shrink;
- API-key and model controls preserve validation, visibility, and loading states;
- section reset remains available near the section heading;
- destructive clear/reset confirmations stay inside the portrait viewport.

Changing a setting continues to use the existing debounced persistence path. The header exposes concise `Saving`, `Saved`, or actionable error status without adding a separate footer.

### Session History

History uses a sticky Back/title header followed by a compact toolbar inside the main scroll flow:

- search occupies a full-width row;
- filter and sort controls wrap into a second row;
- result count and selection status remain visible without competing with the title;
- bulk actions appear in a compact selection bar only while sessions are selected.

Each session becomes a full-width stacked card. Title, relative date, duration, source, and file metadata wrap predictably. Open remains the clear primary action. Folder, export, and delete remain available through an always-visible overflow button rather than hover-only controls. The overflow menu is clamped to the portrait viewport and remains keyboard accessible.

Loading skeletons, empty state, search-empty state, recoverable load errors, and delete confirmation all use the same content width. Long lists scroll inside the shell; the outer window never grows.

### Keyboard Shortcuts

Shortcuts uses the common header and one vertical scroller. Categories become stacked sections, and each shortcut is a card or row with a wrapping label/description and a trailing key display. Editing occurs inline in the same row, with conflict, invalid-key, and saved states directly beneath it. Category reset and reset-all actions remain available without a wide footer.

### Review Editor

The Review Editor becomes a complete-state portrait surface rather than a wide editor inside the main card. It uses:

- a sticky header with Back/Close, session title, save status, and compact primary action access;
- stacked session summary and feedback-item cards;
- full-width editable fields and wrapping metadata;
- visible item selection plus a compact overflow menu for secondary move/delete actions;
- a bounded screenshot/media preview that preserves aspect ratio;
- a sticky bottom action bar only for the actions that must remain available while editing, with secondary actions allowed to wrap.

Saving continues through the existing `reviewSave` handler. Copy, open-folder, export, close, item edits, ordering, and deletion remain functionally unchanged. Save failure stays on the Review surface with an inline retry instead of closing the editor.

### Onboarding, export, recovery, and confirmations

Onboarding remains a step flow but fills the portrait card instead of presenting an oversized inner panel. Its step heading/progress stays fixed, the current step body scrolls, and Back/Continue/Skip actions remain in a compact bottom row.

Export, crash recovery, model download, data deletion, reset, and history deletion remain modal because they interrupt the current task. Every modal:

- is bounded to the portrait card with 12-pixel outer clearance;
- has a scrollable body when its content exceeds available height;
- keeps its title and final actions visible where practical;
- never changes the `BrowserWindow` size;
- traps focus while open and restores it on close;
- allows long paths and error messages to wrap without horizontal scrolling.

The recording countdown is a transient recording transition and retains its existing behavior. It must still fit inside whichever portrait state launches it before the compact HUD takes over.

## Renderer and Main-Process Flow

```text
tray/menu/user action
  -> UIContext.currentView or recording state
  -> shared surface-to-size mapping
  -> PopoverManager applies portrait or compact HUD dimensions
  -> App renders exactly one top-level portrait surface
  -> surface component calls existing feature handlers
  -> existing IPC and persistence paths remain unchanged
```

`UIContext` retains `main | settings | history | shortcuts` as the top-level navigation model. The renderer no longer hard-codes 920-by-760 or 720-by-720 overlay sizes. Review remains derived from complete-session state and `showReviewEditor`, but it uses the same portrait shell contract.

Nested modal state does not participate in outer-window sizing. This prevents an export, confirmation, or onboarding step from producing a resize race with the active top-level surface.

## Tray Context Menu

The existing native context menu remains the implementation mechanism. Right-click continues to open it explicitly on macOS and through `setContextMenu` on Windows/Linux. Left-click continues to toggle/open the popover.

The menu adds:

- **Help** — opens `https://markuprx.com` in the default browser;
- **Contact** — opens `mailto:hello@markuprx.com?subject=MarkuprX%20Support` in the default mail client;
- **Quit MarkuprX** on macOS or **Exit MarkuprX** on Windows/Linux — calls `app.quit()`.

Start/Stop Recording, Settings, and About items remain. Help and Contact sit together above About; Exit/Quit remains the final item after a separator. Processing-state enablement for Start/Stop remains unchanged.

The menu template will be built by a testable pure helper that receives platform, state, and callbacks. External-link failures are caught and logged without closing or destabilizing the app. Exit/Quit remains available in every tray state.

## Error Handling

- A failed outer resize logs the failure and leaves the current usable window in place; renderer navigation still completes.
- Surface data-load failures render an inline error and retry action inside the scroller.
- Settings persistence errors remain visible until a later successful save or explicit retry.
- History action failures remain attached to the affected session or bulk-action bar.
- Review save failures preserve unsaved edits and expose Retry.
- External Help or Contact launch failures are nonfatal and logged with the destination type, not sensitive content.
- Content too large for a card wraps or scrolls vertically; clipping an essential action is treated as a regression.

## Accessibility and Interaction Requirements

- No top-level portrait surface uses `aria-modal`; only true transient dialogs do.
- Each top-level surface has one level-one or dialog-title-equivalent accessible heading.
- Settings tabs expose `role="tablist"`, selected state, keyboard navigation, and associated tab panels.
- All icon-only controls have accessible names and visible focus treatment.
- Essential history actions are discoverable without hover.
- Controls meet the existing desktop target-size standard and retain at least 8 pixels between adjacent destructive and primary actions.
- Text supports wrapping at 200 percent zoom without introducing horizontal page scroll.
- Scroll regions remain reachable by keyboard and expose visible focus when focused.
- Light, dark, high-contrast, and reduced-motion themes continue to use existing tokens.

## Testing Strategy

### Test-driven implementation

Each behavior change begins with a focused failing test, followed by the smallest production change that makes it pass. Size mapping, native menu behavior, and each converted surface are verified independently before the full suite runs.

### Unit and component tests

- Shared sizing maps every non-HUD surface/state to 460 by 680 and preserves the two compact HUD sizes.
- `UIContext` requests the shared portrait dimensions for Settings, History, and Shortcuts.
- `PopoverManager` applies the shared sizes and re-anchors only when required.
- The tray template contains Help, Contact, and platform-appropriate Exit/Quit in every state.
- Help and Contact use the exact approved destinations; Exit/Quit calls `app.quit()`.
- Settings rail selection, keyboard movement, active-tab scroll-into-view, save status, and reset behavior.
- History search/filter/selection behavior and accessible per-session overflow actions.
- Shortcut editing, validation, conflicts, and reset behavior after the layout conversion.
- Review editing, save failure, item actions, and close behavior after the layout conversion.
- Modal focus trapping, Escape precedence, and focus restoration.

### Electron UI tests

Launch the real Electron renderer and assert the actual `BrowserWindow` bounds for:

- idle/home;
- Settings and all five sections;
- History with empty, populated, selected, and long-list fixtures;
- Shortcuts with editing and conflict fixtures;
- complete summary and Review Editor;
- error, onboarding, export, recovery, and destructive-confirmation states;
- recording and processing HUDs.

For every portrait fixture, assert 460-by-680 outer dimensions, no document-level horizontal overflow, a usable vertical scroll path when content exceeds the viewport, reachable primary and destructive actions, and successful keyboard traversal. Add screenshot checks for the shared header, Settings rail, History cards, Shortcuts list, and Review Editor.

The native-menu test will inspect the built template and invoke handlers directly because Electron does not expose reliable automated interaction with the operating system's tray menu. A manual smoke check will right-click the packaged tray icon on the available platform and exercise Help, Contact, and Exit/Quit.

### Repository verification

Run focused tests during development, then the full unit suite, Electron UI suite, typecheck, lint, production build, and an unsigned packaged-app smoke test. Inspect both short and long content in light and dark themes.

## Acceptance Criteria

1. Opening Settings, History, Shortcuts, complete/error details, or Review never makes the outer window wider or taller than 460 by 680.
2. Every non-HUD surface and nested dialog remains usable at 460 by 680 through internal vertical scrolling.
3. The Settings rail provides all five current sections without a wide sidebar and keeps the active section visible.
4. No existing setting, history action, shortcut action, review action, onboarding step, export option, recovery action, or confirmation is removed.
5. History item actions are available without hover, and all action menus remain inside the viewport.
6. The Review Editor preserves all editing and save behavior in the portrait shell.
7. Recording and processing HUD sizes and positioning are unchanged.
8. Right-clicking the tray icon exposes Help, Contact, and Exit/Quit on every supported desktop platform while left-click behavior remains unchanged.
9. Help opens the MarkuprX site, Contact opens the pre-addressed support email, and Exit/Quit terminates the application.
10. Automated tests, typecheck, lint, build, and packaged-app smoke verification pass with no horizontal-overflow or focus-order regressions.
