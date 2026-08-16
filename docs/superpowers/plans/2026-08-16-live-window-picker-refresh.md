# Live Window Picker Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the capture picker synchronized with opened, closed, moved, resized, and reordered windows for as long as selection remains active.

**Architecture:** Add one non-overlapping 250 ms selection refresh loop to `CaptureOverlayManager`. A lightweight Electron source query supplies current window identifiers while the existing native geometry provider supplies bounds and front-to-back order; changed snapshots are broadcast to every selection renderer through the existing overlay-state channel.

**Tech Stack:** TypeScript, Electron 28 `desktopCapturer`, Vitest, existing native window geometry probes.

## Global Constraints

- Poll continuously while the picker is open; do not rely on pointer or focus events.
- Allow at most one OS refresh request in flight per pending selection.
- Retain initial thumbnails and application icons for sources that remain present.
- Stop selection polling on confirm, cancel, renderer failure, display change, or manager destruction.
- Ignore refresh results that arrive after their selection has ended.
- Preserve exact-source confirmation validation and all region, screen, annotation, and recording behavior.
- Add no dependency and no platform-specific event-hook infrastructure.

---

### Task 1: Refresh live selector window state

**Files:**
- Modify: `tests/unit/captureOverlayManager.test.ts`
- Modify: `src/main/capture/CaptureOverlayManager.ts`
- Modify: `tests/e2e/captureSelectionAndAnnotation.test.ts`

**Interfaces:**
- Consumes: `windowGeometryProvider.listWindows(sources: CaptureSource[]): Promise<CapturableWindow[]>`, `desktopCapturer.getSources`, and `IPC_CHANNELS.CAPTURE_OVERLAY_STATE_CHANGED`.
- Produces: `CaptureOverlayManagerDependencies.refreshSelection(): Promise<SelectionWindowSnapshot>` and a selection-owned refresh lifecycle.

- [ ] **Step 1: Write the failing live-refresh regression test**

Extend `createHarness` with a `refreshSelection` mock returning the initial windows and sources, and add a test named `broadcasts reordered and newly opened windows while selection remains active`. Open a selection, replace the mock result with a literal front-to-back list containing a newly frontmost window, invoke the selection interval callback, and assert:

```ts
expect(dependencies.refreshSelection).toHaveBeenCalledOnce();
expect(windows[0].webContents.send).toHaveBeenCalledWith(
  IPC_CHANNELS.CAPTURE_OVERLAY_STATE_CHANGED,
  expect.objectContaining({
    kind: 'selection',
    windows: [frontWindow, capturableWindow],
  }),
);
```

Use literal window identifiers and bounds. Confirm the refreshed target through the overlay sender and assert the pending selection resolves to that exact window target, proving confirmation validation uses the live state.

- [ ] **Step 2: Write the failing refresh-lifecycle regression test**

Add `does not overlap selection refreshes and ignores results after cancellation`. Hold the first `refreshSelection` promise unresolved, invoke the interval callback twice, and assert one call. Cancel selection, assert the interval map is empty, resolve the held promise, flush microtasks, and assert no state-change message was published.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npx vitest run tests/unit/captureOverlayManager.test.ts --reporter=verbose
```

Expected: the new tests fail because `CaptureOverlayManager` never calls `refreshSelection` and creates no selection refresh interval. Existing tests remain green.

- [ ] **Step 4: Add the lightweight Electron refresh boundary**

In `CaptureOverlayManager.ts`, introduce:

```ts
interface SelectionWindowSnapshot {
  windows: CapturableWindow[];
  windowSources: CaptureSource[];
}
```

Add required dependency `refreshSelection: () => Promise<SelectionWindowSnapshot>`. Implement an Electron refresh function that requests only `types: ['window']` with `thumbnailSize: { width: 0, height: 0 }` and `fetchWindowIcons: false`, maps sources to `CaptureSource`, filters mirror variants ending in `:1`, and resolves geometry through `windowGeometryProvider.listWindows`.

Reuse this lightweight function in `refreshElectronWindow`. Keep `prepareSelectionFromElectron` unchanged for the initial display mapping and thumbnails.

- [ ] **Step 5: Add the selection-owned polling lifecycle**

Extend `PendingSelection` with:

```ts
refreshHandle: unknown | null;
refreshInFlight: boolean;
```

After all selection overlays load, start a 250 ms interval tied to the exact `PendingSelection` object. On each tick, return early if that request is no longer current or already refreshing; otherwise await `dependencies.refreshSelection()` and publish only if the request is still current.

Before comparison, merge `thumbnail` and `appIcon` from matching previous sources/windows whenever refreshed metadata omits them. Compare source IDs/names/images and window IDs/names/apps/PIDs/bounds/images in array order so stacking changes count as changes. When changed, replace `windows` and `windowSources` on every selection overlay state and send `CAPTURE_OVERLAY_STATE_CHANGED`.

In `finishSelection`, clear `refreshHandle` before destroying overlays and resolving the pending promise. Keep in-flight state on the request object so late completion from an old request cannot block or update a newer request.

- [ ] **Step 6: Update the lifecycle E2E dependency fixture**

Add a deterministic `refreshSelection` implementation to `tests/e2e/captureSelectionAndAnnotation.test.ts`:

```ts
refreshSelection: vi.fn().mockResolvedValue({
  windows: [exactWindow],
  windowSources: [],
}),
```

Keep its existing repeated teardown assertion that `timers.size` returns to zero; it now covers selection refresh timers as well as annotation timers.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run tests/unit/captureOverlayManager.test.ts tests/e2e/captureSelectionAndAnnotation.test.ts --reporter=verbose
```

Expected: all focused checks pass, including live reorder, no-overlap, late-result suppression, and repeated cleanup.

- [ ] **Step 8: Commit the implementation**

```bash
git add src/main/capture/CaptureOverlayManager.ts tests/unit/captureOverlayManager.test.ts tests/e2e/captureSelectionAndAnnotation.test.ts
git commit -m "fix: refresh capture windows while selecting"
```

---

### Task 2: Verify the complete change

**Files:**
- Verify only; no production file changes are expected.

**Interfaces:**
- Consumes: all updated selector behavior and the existing project verification scripts.
- Produces: fresh evidence that the refresh loop is type-safe and does not regress other capture flows.

- [ ] **Step 1: Run the complete deterministic suite**

Run:

```bash
npx vitest run --reporter=dot --silent
```

Expected: every Vitest check passes with zero failures.

- [ ] **Step 2: Run static verification**

Run:

```bash
npm run typecheck
npm run lint
git diff --check
```

Expected: type checking and diff validation pass; lint has zero new errors or warnings attributable to this change.

- [ ] **Step 3: Inspect the final patch and working tree**

Run:

```bash
git show --stat --oneline HEAD
git status --short --branch
```

Expected: the implementation commit contains only the three planned code/test files and the working tree is clean.
