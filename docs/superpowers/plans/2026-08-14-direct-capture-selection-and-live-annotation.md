# Direct Capture Selection and Live Annotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add direct desktop window/region/full-screen selection and burn live pointer-marker annotations into recorded video and extracted report frames.

**Architecture:** A main-process overlay manager creates protected transparent BrowserWindows across displays, using native read-only window geometry to match desktop windows to Electron capture sources. The renderer records only the selected source through a canvas compositor that crops regions and draws normalized annotation events; completed strokes also become high-priority frame-extraction cues.

**Tech Stack:** Electron 28, React 18, TypeScript 5.3, Canvas 2D, MediaRecorder, Vitest, native macOS Core Graphics through JXA, Windows User32 through PowerShell.

## Global Constraints

- Window mode is the default for every interactive recording start.
- Never substitute a full-screen source when a selected window or region cannot be acquired.
- Region selection is constrained to one display and must be at least 32 by 32 device-independent pixels.
- Annotation overlay controls must not be captured; video annotations must come from the compositor.
- Keep MCP and CLI recording behavior unchanged.
- Add no package dependency.
- Target Electron 28, React 18, TypeScript 5.3, and Node 18+.

---

## File Map

- `src/shared/types.ts`: capture target, native window, overlay, and annotation IPC contracts and channels.
- `src/shared/captureGeometry.ts`: pure validation, hit-testing, crop, containment, and normalized coordinate helpers.
- `src/main/capture/WindowGeometryProvider.ts`: bounded platform window enumeration and exact Electron source matching.
- `src/main/capture/CaptureOverlayManager.ts`: selection/annotation BrowserWindow lifecycle, mode, pointer polling, and event routing.
- `src/main/ipc/captureHandlers.ts`: capture-selector and annotation IPC handlers plus existing persistence handlers.
- `src/main/ipc/types.ts`, `src/main/ipc/sessionHandlers.ts`, `src/main/index.ts`, `src/main/SessionController.ts`: target-aware interactive start, metadata, cleanup, and annotation cues.
- `src/preload/index.ts`, `src/renderer/types/electron.d.ts`: typed capture and overlay bridges.
- `src/renderer/overlays/CaptureOverlayApp.tsx`: renderer entry router for selector and annotation surfaces.
- `src/renderer/overlays/SelectionOverlay.tsx`: window/region/screen selection UI.
- `src/renderer/overlays/LiveAnnotationOverlay.tsx`: protected annotation drawing surface and toolbar.
- `src/renderer/capture/annotationScene.ts`: bounded annotation state reducer and Canvas 2D renderer.
- `src/renderer/capture/RecordingCompositor.ts`: selected-source crop, contain layout, marker, and annotation compositing.
- `src/renderer/capture/ScreenRecordingRenderer.ts`: exact-source capture and composed MediaRecorder lifecycle.
- `src/renderer/main.tsx`, `src/renderer/contexts/RecordingContext.tsx`, `src/renderer/components/RecordingOverlay.tsx`, `src/renderer/App.tsx`: overlay entry, annotation lifecycle, and HUD Draw control.
- `src/main/pipeline/TranscriptAnalyzer.ts`, `src/main/pipeline/PostProcessor.ts`: annotation cue priority and extraction timestamps.
- `src/main/output/sessionAdapter.ts`: preserve explicit `region` source metadata.
- `tests/unit/captureGeometry.test.ts`, `tests/unit/windowGeometryProvider.test.ts`, `tests/unit/annotationScene.test.ts`, `tests/unit/recordingCompositor.test.ts`, `tests/unit/captureOverlayManager.test.ts`: new focused tests.
- `tests/unit/screenRecordingRenderer.test.ts`, `tests/unit/sessionController.test.ts`, `tests/unit/transcriptAnalyzer.test.ts`, `tests/integration/sessionFlow.test.ts`, `tests/unit/navigationPreload.test.ts`: behavior extensions and regressions.
- `docs/GETTING_STARTED.md`, `docs/KEYBOARD_SHORTCUTS.md`, `docs/API.md`: user and bridge documentation.

---

### Task 1: Shared capture contracts and geometry

**Files:**
- Create: `src/shared/captureGeometry.ts`
- Modify: `src/shared/types.ts`
- Test: `tests/unit/captureGeometry.test.ts`

**Interfaces:**
- Produces: `CaptureTarget`, `CaptureBounds`, `CapturableWindow`, `AnnotationEvent`, `AnnotationStroke`, `validateCaptureTarget(target, displays)`, `findWindowAtPoint(windows, point)`, `normalizeRegion(start, end, displayBounds)`, `regionToSourceCrop(target, videoSize)`, and `containRect(source, destination)`.
- Consumes: existing `DisplayInfo` and `CaptureSource` contracts.

- [ ] **Step 1: Write failing target and geometry tests**

Cover exact topmost hit testing, negative display origins, 32-pixel minimum regions, out-of-bounds clamping, 2x crop conversion, and aspect-preserving contain layout. Use the desired APIs directly, for example:

```ts
expect(findWindowAtPoint([back, front], { x: 120, y: 80 })?.sourceId).toBe(front.sourceId);
expect(normalizeRegion({ x: -1500, y: 100 }, { x: -1200, y: 400 }, display.bounds)).toEqual({
  x: 100, y: 100, width: 300, height: 300,
});
expect(regionToSourceCrop(regionTarget, { width: 3456, height: 2234 })).toEqual({
  x: 200, y: 200, width: 600, height: 600,
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run tests/unit/captureGeometry.test.ts`

Expected: FAIL because `src/shared/captureGeometry.ts` and the target contracts do not exist.

- [ ] **Step 3: Implement the contracts and pure helpers**

Add a discriminated `CaptureTarget` union with `kind: 'window' | 'region' | 'screen'`; define finite `CaptureBounds`, display metadata, normalized points, annotation tools (`freehand`, `circle`, `highlight`), and bounded annotation commands. Implement pure helpers with finite-number checks, integer rounding, region clamping, and no Electron imports.

- [ ] **Step 4: Verify GREEN and type safety**

Run: `npx vitest run tests/unit/captureGeometry.test.ts && npm run typecheck`

Expected: all focused tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/captureGeometry.ts tests/unit/captureGeometry.test.ts
git commit -m "feat: add capture target geometry contracts"
```

### Task 2: Native window geometry provider

**Files:**
- Create: `src/main/capture/WindowGeometryProvider.ts`
- Test: `tests/unit/windowGeometryProvider.test.ts`

**Interfaces:**
- Consumes: `CaptureSource[]`, platform string, `execFile` dependency.
- Produces: `WindowGeometryProvider.listWindows(sources): Promise<CapturableWindow[]>`, `parseMacWindowList(stdout, sources, ownPid)`, `parseWindowsWindowList(stdout, sources, ownPid)`, and `parseX11WindowList(stdout, sources, ownPid)`.

- [ ] **Step 1: Write failing parser and provider tests**

Use representative Core Graphics, PowerShell, and `wmctrl -lGpx` output. Assert exact `window:<nativeId>:0` matching (including hexadecimal X11 IDs), retained front-to-back order, exclusion of MarkuprX/current PID/system layers/zero-area windows, missing `wmctrl`, malformed output fallback to `[]`, and command timeout fallback.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/unit/windowGeometryProvider.test.ts`

Expected: FAIL because `WindowGeometryProvider` does not exist.

- [ ] **Step 3: Implement bounded platform adapters**

Use `execFile` argument arrays with a 2-second timeout and 2 MiB output cap. On macOS, use JXA `CGWindowListCopyWindowInfo`, `ObjC.castRefToObject`, and `ObjC.deepUnwrap`. On Windows, use PowerShell `Add-Type` User32 declarations and z-order enumeration. On X11, use `wmctrl -lGpx` when installed; return no direct geometry under Wayland or when the command is absent. Export parsers separately so tests exercise real matching rather than command mocks.

- [ ] **Step 4: Verify GREEN and run the real macOS probe**

Run: `npx vitest run tests/unit/windowGeometryProvider.test.ts && npm run typecheck`

Then run the provider's JXA command through `/usr/bin/osascript` and verify it returns at least one non-system visible window with finite bounds in the current macOS session.

- [ ] **Step 5: Commit**

```bash
git add src/main/capture/WindowGeometryProvider.ts tests/unit/windowGeometryProvider.test.ts
git commit -m "feat: enumerate capturable desktop windows"
```

### Task 3: Capture overlay manager and IPC surface

**Files:**
- Create: `src/main/capture/CaptureOverlayManager.ts`
- Modify: `src/main/ipc/captureHandlers.ts`
- Modify: `src/main/ipc/types.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/types/electron.d.ts`
- Test: `tests/unit/captureOverlayManager.test.ts`
- Test: `tests/unit/navigationPreload.test.ts`

**Interfaces:**
- Produces: `CaptureOverlayManager.configure(host)`, `selectTarget(): Promise<CaptureTarget | null>`, `beginAnnotation(sessionId, target)`, `endAnnotation()`, `setAnnotationMode('interact' | 'draw')`, `getOverlayState(senderId)`, `confirmTarget(senderId, target)`, `cancelSelection()`, and `submitAnnotationEvent(senderId, event)`.
- Produces preload methods: `capture.selectTarget()`, `capture.beginAnnotation(sessionId, target)`, `capture.endAnnotation()`, `capture.setAnnotationMode(mode)`, `capture.onAnnotationEvent(callback)`, `capture.onAnnotationState(callback)`, plus `captureOverlay.getState()`, `confirmTarget(target)`, `cancel()`, and `sendAnnotation(event)`.

- [ ] **Step 1: Write failing manager lifecycle tests**

Inject fake BrowserWindow, display, source, provider, and host dependencies. Assert one overlay per display, host hiding, cancellation restoration, window target validation, region clamp rejection, single-active-request behavior, content protection, click-through annotation mode, selected-window bounds refresh, display-change teardown, and complete teardown.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/unit/captureOverlayManager.test.ts tests/unit/navigationPreload.test.ts`

Expected: FAIL for missing manager and IPC channels.

- [ ] **Step 3: Implement manager lifecycle and validation**

Create protected frameless overlay windows with `setAlwaysOnTop(true, 'screen-saver')`, `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`, and per-display bounds. Pass renderer loading through an injected callback so development and packaged URLs stay centralized in `main/index.ts`. Map each overlay webContents ID to immutable selection state. Validate every confirmation against the state issued to that sender.

- [ ] **Step 4: Register the typed IPC bridge**

Add explicit channels for selection, overlay state, confirmation/cancellation, annotation lifecycle, annotation commands, and state/events. Use `invoke` for commands with results and event subscribers for main-to-renderer updates. Ensure the preload only sends typed data, never arbitrary channel names.

- [ ] **Step 5: Verify GREEN**

Run: `npx vitest run tests/unit/captureOverlayManager.test.ts tests/unit/navigationPreload.test.ts && npm run typecheck`

Expected: focused tests and typecheck pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/capture/CaptureOverlayManager.ts src/main/ipc/captureHandlers.ts src/main/ipc/types.ts src/shared/types.ts src/preload/index.ts src/renderer/types/electron.d.ts tests/unit/captureOverlayManager.test.ts tests/unit/navigationPreload.test.ts
git commit -m "feat: add protected capture overlay lifecycle"
```

### Task 4: Desktop selector renderer

**Files:**
- Create: `src/renderer/overlays/CaptureOverlayApp.tsx`
- Create: `src/renderer/overlays/SelectionOverlay.tsx`
- Create: `src/renderer/overlays/selectionModel.ts`
- Modify: `src/renderer/main.tsx`
- Test: `tests/unit/captureSelectionModel.test.ts`

**Interfaces:**
- Consumes: `CaptureOverlayState`, `captureOverlay.getState/confirmTarget/cancel`.
- Produces: `selectionReducer`, keyboard/mouse mode transitions, window hit testing, and confirmed `CaptureTarget` objects.

- [ ] **Step 1: Write failing selection-model tests**

Test default Window mode, topmost hover, Window click confirmation, source-gallery window confirmation when geometry is unavailable, Region drag normalization/minimum rejection, Full Screen click confirmation, Escape cancellation, and display-local/global coordinate conversion.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/unit/captureSelectionModel.test.ts`

Expected: FAIL because `selectionModel.ts` does not exist.

- [ ] **Step 3: Implement the pure selection reducer**

Keep all geometry and state transitions outside React. Model `mode`, `hoveredSourceId`, `dragStart`, `dragCurrent`, `error`, and confirmation effects. Reuse `findWindowAtPoint` and `normalizeRegion`.

- [ ] **Step 4: Build the selector UI and entry routing**

Render a dim full-display surface with a high-contrast window outline, app/title badge, region rectangle and dimensions, and a compact Window/Region/Full Screen/Cancel palette. When direct geometry is unavailable, Window mode renders the existing Electron source thumbnails in a keyboard-accessible gallery instead of guessing bounds. Keep the renderer dependency-free and use semantic buttons, focus indicators, `aria-live` instructions, Escape, and W/R/S keyboard shortcuts. In `main.tsx`, render the overlay app when `overlay=selection` or `overlay=annotation`; only initialize microphone capture for the normal app entry.

- [ ] **Step 5: Verify GREEN and desktop build**

Run: `npx vitest run tests/unit/captureSelectionModel.test.ts && npm run typecheck && npm run build:desktop`

Expected: focused tests, typecheck, and renderer/main/preload build pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/overlays src/renderer/main.tsx tests/unit/captureSelectionModel.test.ts
git commit -m "feat: add direct desktop capture selector"
```

### Task 5: Annotation scene and video compositor

**Files:**
- Create: `src/renderer/capture/annotationScene.ts`
- Create: `src/renderer/capture/RecordingCompositor.ts`
- Test: `tests/unit/annotationScene.test.ts`
- Test: `tests/unit/recordingCompositor.test.ts`

**Interfaces:**
- Produces: `createAnnotationScene()`, `reduceAnnotationEvent(scene, event)`, `drawAnnotationScene(ctx, scene, viewport)`, `RecordingCompositor.start(sourceStream, target)`, `applyAnnotationEvent(event)`, `getOutputStream()`, and `stop()`.
- Consumes: shared normalized annotation and target contracts plus geometry helpers.

- [ ] **Step 1: Write failing annotation reducer tests**

Assert valid start/append/end, freehand point caps, circle endpoints, translucent highlight styling, undo, clear, invalid-session/event rejection, and marker coalescing.

- [ ] **Step 2: Verify annotation RED**

Run: `npx vitest run tests/unit/annotationScene.test.ts`

Expected: FAIL because the scene reducer does not exist.

- [ ] **Step 3: Implement the bounded annotation scene**

Use immutable completed strokes, at most one active stroke, a 2,000-point cap per stroke with endpoint-preserving decimation, an allowlisted color palette, normalized 0..1 points, and deterministic Canvas 2D rendering. Draw highlighter strokes with reduced alpha and `source-over`; draw the cursor marker last.

- [ ] **Step 4: Write failing compositor tests**

Inject fake document, video, canvas, context, requestAnimationFrame, and captureStream dependencies. Assert region crop arguments, source-first/stroke/marker draw order, contain letterboxing, stable output dimensions, 30 fps capture, metadata failure, and release of source/output tracks.

- [ ] **Step 5: Verify compositor RED**

Run: `npx vitest run tests/unit/recordingCompositor.test.ts`

Expected: FAIL because `RecordingCompositor` does not exist.

- [ ] **Step 6: Implement the compositor**

Wait for loaded metadata with a bounded timeout, choose output dimensions from the selected region or source, render black letterbox background plus contained source/crop, apply the annotation scene, and expose `canvas.captureStream(30)`. Treat missing Canvas 2D/captureStream/video dimensions as start errors and release every partial resource.

- [ ] **Step 7: Verify GREEN**

Run: `npx vitest run tests/unit/annotationScene.test.ts tests/unit/recordingCompositor.test.ts && npm run typecheck`

Expected: all focused tests and typecheck pass.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/capture/annotationScene.ts src/renderer/capture/RecordingCompositor.ts tests/unit/annotationScene.test.ts tests/unit/recordingCompositor.test.ts
git commit -m "feat: composite live markers into recordings"
```

### Task 6: Exact-source screen recorder integration

**Files:**
- Modify: `src/renderer/capture/ScreenRecordingRenderer.ts`
- Modify: `tests/unit/screenRecordingRenderer.test.ts`

**Interfaces:**
- Consumes: `StartOptions { sessionId: string; target: CaptureTarget }`, `RecordingCompositor`, and annotation events.
- Produces: existing persistence behavior with composed video and `handleAnnotationEvent(event)`.

- [ ] **Step 1: Add failing privacy and compositor tests**

Change tests to start with a `CaptureTarget`. Assert only the target source ID is requested; high-quality retry uses the same ID; a failed selected-window acquisition never enumerates/falls back to a screen; MediaRecorder receives the compositor output stream; annotation events reach the compositor; and stop releases source, composed, and recorder streams.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/unit/screenRecordingRenderer.test.ts`

Expected: FAIL because the recorder still accepts `sourceId` and records the raw stream.

- [ ] **Step 3: Integrate exact-source compositing**

Remove candidate source enumeration. Retry constraints only for `target.sourceId`. Start the compositor before persistence and MediaRecorder construction, subscribe to annotation events for the active session, and centralize idempotent cleanup. Preserve the existing chunk drain/finalization behavior.

- [ ] **Step 4: Verify GREEN and regressions**

Run: `npx vitest run tests/unit/screenRecordingRenderer.test.ts tests/e2e/recordingPipeline.test.ts && npm run typecheck`

Expected: focused unit and recording pipeline tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/capture/ScreenRecordingRenderer.ts tests/unit/screenRecordingRenderer.test.ts
git commit -m "feat: record selected source through compositor"
```

### Task 7: Interactive session start and annotation lifecycle

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/SessionController.ts`
- Modify: `src/main/ipc/sessionHandlers.ts`
- Modify: `src/main/ipc/types.ts`
- Modify: `src/main/ipc/captureHandlers.ts`
- Modify: `src/renderer/contexts/RecordingContext.tsx`
- Modify: `src/shared/types.ts`
- Test: `tests/unit/sessionController.test.ts`
- Test: `tests/integration/sessionFlow.test.ts`

**Interfaces:**
- Consumes: optional `CaptureTarget` in `session.start`; no target means interactive selection after permission checks.
- Produces: `SessionMetadata.captureTarget`, explicit `sourceType`, persisted `videoStartTime`, annotation overlay begin/end, and a cancellation result that leaves UI state idle.

- [ ] **Step 1: Write failing session metadata and cancellation tests**

Assert window/region/screen targets survive session serialization; no-target start invokes selector; selector cancellation does not call `SessionController.start`; explicit legacy source strings remain accepted; and region source type remains `region` instead of being inferred as `screen`.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/unit/sessionController.test.ts tests/integration/sessionFlow.test.ts`

Expected: FAIL because sessions do not accept or persist targets.

- [ ] **Step 3: Implement target-aware start and cleanup**

After permission checks, call `captureOverlayManager.selectTarget()` when no target was supplied. Return `{ success: false, cancelled: true }` on Escape. Start the controller with the exact source ID/name and target metadata. Configure the overlay manager with the existing renderer loader at app startup. End annotation overlays before stop/cancel/error and on app quit.

- [ ] **Step 4: Persist video timing and annotation cues**

In the screen-recording start handler, store `videoStartTime`. Validate annotation events against the active session. On `stroke-end`, register one `annotation` capture cue with tool/color metadata and broadcast the event to the primary renderer. Cap stored cue/event state.

- [ ] **Step 5: Integrate renderer lifecycle**

Pass `activeSession.metadata.captureTarget` to `ScreenRecordingRenderer`; construct a backward-compatible screen/window target only for older sessions. Begin the annotation overlay after compositor start. End it before recorder stop. Treat cancellation as idle, not error. Ensure stale state updates cannot restart a recorder after stop.

- [ ] **Step 6: Verify GREEN**

Run: `npx vitest run tests/unit/sessionController.test.ts tests/integration/sessionFlow.test.ts tests/e2e/recordingPipeline.test.ts && npm run typecheck`

Expected: focused session and pipeline tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/main/index.ts src/main/SessionController.ts src/main/ipc/sessionHandlers.ts src/main/ipc/types.ts src/main/ipc/captureHandlers.ts src/renderer/contexts/RecordingContext.tsx src/shared/types.ts tests/unit/sessionController.test.ts tests/integration/sessionFlow.test.ts
git commit -m "feat: start sessions from direct capture targets"
```

### Task 8: Live annotation overlay and HUD controls

**Files:**
- Create: `src/renderer/overlays/LiveAnnotationOverlay.tsx`
- Modify: `src/renderer/overlays/CaptureOverlayApp.tsx`
- Modify: `src/renderer/components/RecordingOverlay.tsx`
- Modify: `src/renderer/contexts/RecordingContext.tsx`
- Modify: `src/renderer/App.tsx`
- Create: `tests/unit/annotationOverlayModel.test.ts`

**Interfaces:**
- Produces: HUD `onToggleDraw`, `annotationMode`, `annotationAvailable`; overlay pointer-to-normalized stroke commands; freehand/circle/highlight/color/undo/clear/Done controls.
- Consumes: capture annotation bridge and shared annotation contracts.

- [ ] **Step 1: Write failing overlay model tests**

Test pointer capture, freehand append/end, circle endpoints, highlight default width/alpha, Escape-to-interact, undo/clear commands, paused-mode rejection, and normalized point clamping.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/unit/annotationOverlayModel.test.ts`

Expected: FAIL because the live overlay model does not exist.

- [ ] **Step 3: Build the protected drawing surface**

Render existing strokes and active preview from the same annotation scene functions used by the compositor. Use pointer capture, a crosshair cursor, semantic toolbar buttons, four allowlisted colors, visible active tool/mode, and Escape/Done. Send only normalized bounded commands through preload.

- [ ] **Step 4: Add HUD Draw/Interact control**

Expose annotation state in `RecordingContext`; add a compact Draw button to `RecordingOverlay`; disable it while paused/mutating; switch the manager between click-through and draw mode; and keep Stop reachable above the annotation surface. Update shortcut copy so the existing manual screenshot cue is not mislabeled as drawing.

- [ ] **Step 5: Verify GREEN and build**

Run: `npx vitest run tests/unit/annotationOverlayModel.test.ts tests/unit/appIntegration.test.ts && npm run typecheck && npm run build:desktop`

Expected: focused tests, typecheck, and desktop build pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/overlays/LiveAnnotationOverlay.tsx src/renderer/overlays/CaptureOverlayApp.tsx src/renderer/components/RecordingOverlay.tsx src/renderer/contexts/RecordingContext.tsx src/renderer/App.tsx tests/unit/annotationOverlayModel.test.ts
git commit -m "feat: add live recording annotation controls"
```

### Task 9: Annotation-aware report frame extraction

**Files:**
- Modify: `src/main/pipeline/TranscriptAnalyzer.ts`
- Modify: `src/main/pipeline/PostProcessor.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/output/sessionAdapter.ts`
- Modify: `src/main/output/MarkdownGenerator.ts`
- Modify: `src/main/output/MarkdownPatcher.ts`
- Modify: `tests/unit/transcriptAnalyzer.test.ts`
- Create: `tests/unit/annotationFrameExtraction.test.ts`

**Interfaces:**
- Consumes: annotation capture contexts plus `SessionMetadata.videoStartTime`.
- Produces: `captureContextsToKeyMoments(contexts, videoStartTime)`, high-priority annotation moments, and annotation context text in reports.

- [ ] **Step 1: Write failing frame moment tests**

Assert annotation timestamps are relative to video start rather than session start, receive a 150ms completion offset, clamp at zero, deduplicate close cues, outrank session/pause/periodic moments, and preserve tool/color context on extracted frames.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/unit/annotationFrameExtraction.test.ts tests/unit/transcriptAnalyzer.test.ts`

Expected: FAIL because capture contexts are not converted to extraction moments.

- [ ] **Step 3: Merge annotation cues into post-processing**

Build `KeyMoment` values from annotation contexts, pass them alongside AI hints to `PostProcessor`, and update `momentPriority` so `Annotation completed` has the highest semantic priority. Keep the existing 20-frame cap and attach the nearest capture context using `videoStartTime`.

- [ ] **Step 4: Surface annotation context in output**

Preserve explicit `sourceType: 'region'`; add a concise `Annotation: <tool>, <color>` suffix where capture context lines are already rendered. Do not add a second image or separate annotation asset because the frame pixels are authoritative.

- [ ] **Step 5: Verify GREEN**

Run: `npx vitest run tests/unit/annotationFrameExtraction.test.ts tests/unit/transcriptAnalyzer.test.ts tests/markdownGenerator.test.ts tests/unit/markdownGeneratorExpanded.test.ts && npm run typecheck`

Expected: focused report and analyzer tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/pipeline/TranscriptAnalyzer.ts src/main/pipeline/PostProcessor.ts src/main/index.ts src/main/output/sessionAdapter.ts src/main/output/MarkdownGenerator.ts src/main/output/MarkdownPatcher.ts tests/unit/transcriptAnalyzer.test.ts tests/unit/annotationFrameExtraction.test.ts
git commit -m "feat: prioritize annotated report frames"
```

### Task 10: Documentation, stress tests, and release verification

**Files:**
- Modify: `docs/GETTING_STARTED.md`
- Modify: `docs/KEYBOARD_SHORTCUTS.md`
- Modify: `docs/API.md`
- Modify: `CHANGELOG.md`
- Create: `tests/e2e/captureSelectionAndAnnotation.test.ts`

**Interfaces:**
- Consumes: completed interactive capture and annotation behavior.
- Produces: documented workflow, IPC contract, automated stress coverage, and fresh verification evidence.

- [ ] **Step 1: Write failing end-to-end contract tests**

Use Electron/window mocks to run repeated select-cancel, select-start-stop, annotation-toggle, stroke, stop, and restart cycles. Assert no overlay window, recorder, listener, timer, or active persistence artifact remains after each cycle. Include window, region, screen, negative-origin display, pause, source-ended, and renderer-crash cases.

- [ ] **Step 2: Verify RED, then implement only missing cleanup seams**

Run: `npx vitest run tests/e2e/captureSelectionAndAnnotation.test.ts`

Expected initial result: FAIL on any lifecycle seam not already exposed. Add only the idempotent cleanup hooks required by those failing cases, then rerun until green.

- [ ] **Step 3: Update user and API documentation**

Document Window as the default, Window/Region/Full Screen controls, click-drag region behavior, marker halo, Draw/Interact modes, tools, persistence/undo/clear behavior, pause limitation, fail-closed privacy behavior, and new typed IPC methods. Add the feature under an Unreleased changelog section.

- [ ] **Step 4: Run the complete automated verification matrix**

Run each fresh and inspect exit codes:

```bash
npm run typecheck
npm run lint
npx vitest run
npm run build
git diff --check
```

Expected: typecheck/build/tests exit 0; lint has no new errors or warnings beyond the recorded baseline warnings; all 1,284 baseline tests plus new tests pass; diff check is clean.

- [ ] **Step 5: Run native/manual macOS workflow verification**

Build and launch the local Electron app. Exercise Window, Region, and Full Screen selection; Escape cancellation; window movement/resizing; interaction/draw switching; every tool/color; undo/clear; pause; stop; selected-window close; and at least ten rapid cancel/start/stop cycles. Use `ffprobe` to inspect duration/dimensions and `ffmpeg` to extract representative PNG frames. Compare those frames with the selected bounds and confirm marker/stroke pixels are present. Complete a narrated session and open its generated Markdown report to confirm at least one annotation-completion frame is referenced.

- [ ] **Step 6: Commit documentation and verification tests**

```bash
git add docs/GETTING_STARTED.md docs/KEYBOARD_SHORTCUTS.md docs/API.md CHANGELOG.md tests/e2e/captureSelectionAndAnnotation.test.ts
git commit -m "test: verify capture selection and annotation workflow"
```

- [ ] **Step 7: Final requirement audit**

Re-read `docs/superpowers/specs/2026-08-14-direct-capture-selection-and-live-annotation-design.md`. Map each goal, non-goal, privacy constraint, error path, and test case to implementation or verification evidence. Report any platform limitation or manual case blocked by local OS permission honestly; do not convert a blocked manual check into a success claim.
