# Live Window Picker Refresh Design

**Status:** Approved under the user's instruction to proceed autonomously.

## Context

The capture picker obtains Electron capture sources and native window geometry once, immediately before it opens. Each selection overlay then keeps that initial `windows` array for all pointer hit testing. If the user switches applications, opens or closes a window, or changes window bounds or stacking order while the picker is visible, the hover calculation still uses the stale snapshot and cannot highlight the new frontmost window.

## Goals

- Keep the picker window list current for its entire lifetime.
- Detect opened, closed, moved, resized, and reordered windows, including application switches made with Alt-Tab or Command-Tab.
- Update all display overlays from one authoritative refresh result.
- Keep refresh work bounded and stop it immediately when selection ends.
- Preserve exact-source validation when the user confirms a window.

## Non-Goals

- Do not stream or compare screen pixels; ordinary content changes inside an unchanged window do not alter hover geometry.
- Do not add platform-specific event-hook infrastructure.
- Do not change region selection, full-screen selection, annotation, or recording behavior.

## Design

While a selection is pending, `CaptureOverlayManager` will run a continuous 250 ms refresh loop. Each tick requests a lightweight capture-source snapshot and current native window geometry. Only one refresh may be in flight, so a slow OS query cannot build a queue. The manager will compare the new window and source metadata with the last published selection state and broadcast `CAPTURE_OVERLAY_STATE_CHANGED` to every live selection overlay only when the data differs.

The initial preparation remains unchanged so thumbnails are available when the picker first opens. Subsequent refreshes omit thumbnails and window icons to avoid unnecessary image work, while retaining previously acquired image metadata for sources that remain present. Newly discovered sources are still selectable by name, identifier, geometry, and stacking order.

The refresh timer is owned separately from annotation polling. It starts only after selection overlays have been created and is cleared on confirmation, cancellation, renderer failure, display-topology cancellation, manager destruction, or replacement by another lifecycle. Late asynchronous results check the identity of the pending selection before publishing, preventing a completed or newer request from receiving stale state.

If a refresh fails, the picker retains its last valid state and tries again on the next tick. An empty successful snapshot is published because it can legitimately mean that all capturable windows were closed.

## Testing

A manager-level regression test will open a selector, return a reordered/new window snapshot on a refresh tick, and assert that every overlay receives the updated front-to-back list. It will also prove that overlapping refreshes are suppressed and that cancellation clears the timer and ignores late results. Existing selection-model hit-testing tests protect the rule that the first matching window is the highlighted frontmost window.

## Success Criteria

- A window brought forward after the picker opens becomes the hover target within one completed refresh cycle.
- New, closed, moved, and resized windows update without reopening the picker.
- Refresh calls never overlap.
- No selection refresh timer or late state update survives selector teardown.
- Focused tests, the full Vitest suite, type checking, and lint complete without new failures.
