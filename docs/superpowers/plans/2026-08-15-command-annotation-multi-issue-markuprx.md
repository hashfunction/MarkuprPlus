# Command Annotation, Multi-Issue Reports, and MarkuprX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build click-through Command-held annotation with separately captured and narrated report issues, complete the MarkuprX rebrand, and prove the packaged application through comprehensive automated and four-hour runtime verification.

**Architecture:** A platform input monitor emits validated modifier/button transitions to the existing overlay manager, which switches a non-focusable annotation window between click-through and interactive states. A pure marked-issue accumulator groups strokes until the next ordinary click, while the compositor stages a pre-navigation PNG candidate and report assembly deterministically associates post-session transcript segments. The final phases rename all public and internal product identifiers and add true Playwright Electron coverage plus recorded runtime evidence.

**Tech Stack:** Electron 28.3.3, React 18, TypeScript 5.3, Vitest 1.6, Playwright Electron, Canvas/MediaRecorder, Node child processes and filesystem APIs, JXA/Quartz on macOS, PowerShell/User32 on Windows.

**Scope check:** The interaction, reporting, rebrand, and verification work remains one ordered plan because the rebrand changes the bridge, IPC, package, storage, and test interfaces consumed by every other phase. Splitting it into independently executed plans would leave incompatible intermediate APIs and duplicate the real Electron harness.

## Global Constraints

- Human-facing product text is `MarkuprX`; machine-facing identifiers are `markuprx`.
- Release version is `3.0.0`; public npm binaries are `markuprx` and `markuprx-mcp` with no previous-name public aliases.
- Unmodified pointer input must remain OS-delivered to the selected application; never synthesize or replay ordinary clicks.
- macOS uses Command; Windows uses Control; unsupported monitors retain the explicit fallback Draw control.
- Snapshot candidates are captured on modifier release, before the next ordinary click can navigate.
- One issue contains all completed strokes before the next ordinary primary click; later marks are separate issues.
- A session supports at most 200 marked issues and each issue at most 100 completed strokes, with visible warnings at either cap.
- A transcript segment is assigned to at most one marked issue; unassigned transcript remains general feedback.
- Marked issues remain deterministic local output even when AI or transcription fails.
- No new native npm input-hook dependency is allowed.
- Exact-source capture, content protection, input validation, queue bounds, cleanup, and crash recovery must not regress.
- Waiting alone does not count toward the required four hours of test, diagnosis, improvement, and rerun work.

---

## File and Interface Map

### New focused modules

- `src/main/capture/GlobalAnnotationInputMonitor.ts`: platform child-process lifecycle, state-line validation, and health.
- `src/main/capture/annotationInputModel.ts`: pure transition reducer from samples to annotation actions.
- `src/main/capture/MarkedIssueAccumulator.ts`: pure stroke/candidate/commit state machine and serializable records.
- `src/main/capture/MarkedIssueArtifactStore.ts`: bounded PNG staging, promotion, fallback lookup, and cleanup.
- `src/main/output/MarkedIssueReportBuilder.ts`: comment association and marked-issue section/item construction.
- `src/main/migration/LegacyBrandMigration.ts`: the only allowlisted previous-brand literals and one-way data copy.
- `scripts/verify-brand.mjs`: source/filename brand audit.
- `playwright.config.ts`: real Electron UI configuration.
- `tests/ui/markuprx-electron.spec.ts`: built-app user-flow tests.
- `tests/fixtures/electronHarness.ts`: deterministic capture/audio/input test harness guarded by `MARKUPRX_E2E=1`.
- `docs/testing/2026-08-15-markuprx-verification-log.md`: timestamped four-hour evidence and fixes.

### Existing modules with defined extensions

- `src/shared/types.ts`: `GlobalAnnotationInputSample`, `AnnotationInputHealth`, `MarkedIssuePayload`, candidate/snapshot IPC payloads, and new channels.
- `src/main/capture/CaptureOverlayManager.ts`: consumes `GlobalAnnotationInputMonitor`; emits snapshot requests; preserves click-through focus invariants.
- `src/renderer/overlays/annotationOverlayModel.ts`: handles forced gesture completion and modifier-driven mode.
- `src/renderer/overlays/LiveAnnotationOverlay.tsx`: renders directions/tools and submits strokes without keyboard focus.
- `src/renderer/capture/RecordingCompositor.ts`: produces bounded PNG snapshots after a render barrier.
- `src/renderer/capture/ScreenRecordingRenderer.ts`: stages snapshot candidates and flushes their writes before stop.
- `src/main/SessionController.ts`: persists committed issue payloads and reports issue counts.
- `src/main/index.ts`: coordinates issue commit, artifact finalization, comment association, and final report assembly.
- `src/main/output/sessionAdapter.ts` and `src/main/output/templates/*`: preserve separate marked issue items in every export.
- `src/preload/index.ts` and `src/renderer/types/electron.d.ts`: expose typed candidate staging and annotation state.

---

### Task 1: Global annotation input transitions and platform monitor

**Files:**
- Create: `src/main/capture/annotationInputModel.ts`
- Create: `src/main/capture/GlobalAnnotationInputMonitor.ts`
- Test: `tests/unit/annotationInputModel.test.ts`
- Test: `tests/unit/globalAnnotationInputMonitor.test.ts`

**Interfaces:**
- Produces: `reduceAnnotationInput(previous, next, bounds): AnnotationInputAction[]`.
- Produces: `createGlobalAnnotationInputMonitor(options): GlobalAnnotationInputMonitor`.
- Produces actions: `{ type: 'modifier-down' }`, `{ type: 'modifier-up'; point: NormalizedPoint | null }`, and `{ type: 'plain-primary-down'; point: NormalizedPoint | null }`.

- [ ] **Step 1: Write reducer tests for modifier, click, bounds, and duplicate samples**

```ts
const bounds = { x: 100, y: 50, width: 800, height: 600 };
expect(reduceAnnotationInput(base, { ...base, sequence: 2, modifierDown: true }, bounds))
  .toEqual([{ type: 'modifier-down' }]);
expect(reduceAnnotationInput(modified, { ...modified, sequence: 3, modifierDown: false, cursor: { x: 300, y: 250 } }, bounds))
  .toEqual([{ type: 'modifier-up', point: { x: 0.25, y: 1 / 3 } }]);
expect(reduceAnnotationInput(modified, { ...modified, sequence: 4, modifierDown: false, cursor: { x: 2_000, y: 1_500 } }, bounds))
  .toEqual([{ type: 'modifier-up', point: null }]);
expect(reduceAnnotationInput(base, { ...base, sequence: 5, primaryDown: true, cursor: { x: 300, y: 250 } }, bounds))
  .toEqual([{ type: 'plain-primary-down', point: { x: 0.25, y: 1 / 3 } }]);
expect(reduceAnnotationInput(base, { ...base, sequence: 6, primaryDown: true, cursor: { x: 2_000, y: 1_500 } }, bounds))
  .toEqual([{ type: 'plain-primary-down', point: null }]);
```

- [ ] **Step 2: Run reducer tests and confirm the missing-module failure**

Run: `npx vitest run tests/unit/annotationInputModel.test.ts`

Expected: FAIL because `annotationInputModel.ts` does not exist.

- [ ] **Step 3: Implement finite validation, monotonic sequence handling, normalization, and transition reduction**

```ts
export function reduceAnnotationInput(
  previous: GlobalAnnotationInputSample | null,
  next: GlobalAnnotationInputSample,
  bounds: CaptureBounds,
): AnnotationInputAction[] {
  if (!validSample(next) || (previous && next.sequence <= previous.sequence)) return [];
  const point = normalizeScreenPoint(next.cursor, bounds);
  const actions: AnnotationInputAction[] = [];
  if (previous && !previous.modifierDown && next.modifierDown) actions.push({ type: 'modifier-down' });
  if (previous?.modifierDown && !next.modifierDown) actions.push({ type: 'modifier-up', point });
  if (previous && !previous.primaryDown && next.primaryDown && !next.modifierDown) {
    actions.push({ type: 'plain-primary-down', point });
  }
  return actions;
}
```

- [ ] **Step 4: Write monitor tests using a fake spawned child**

Cover initial health, newline-framed JSON, malformed/oversized lines, only-transition delivery, minimal environment, macOS/Windows command selection, unsupported-platform state, one restart, stop idempotence, and child kill.

- [ ] **Step 5: Run monitor tests and confirm failures for missing factory and scripts**

Run: `npx vitest run tests/unit/globalAnnotationInputMonitor.test.ts`

Expected: FAIL because `createGlobalAnnotationInputMonitor` is undefined.

- [ ] **Step 6: Implement the injected child-process monitor and 120 Hz JXA/PowerShell scripts**

```ts
export interface GlobalAnnotationInputMonitor {
  start(listener: (sample: GlobalAnnotationInputSample) => void): Promise<void>;
  stop(): Promise<void>;
  health(): AnnotationInputHealth;
}

const MAC_COMMAND_MASK = 1 << 20;
const MAX_LINE_BYTES = 1_024;
const MAX_RESTARTS = 1;
```

Use `spawn` argument arrays, `windowsHide: true`, a minimal environment, bounded line buffering, and explicit SIGTERM/SIGKILL cleanup. The scripts output only `{sequence,modifierDown,primaryDown,cursor,capturedAt}` JSON lines.

- [ ] **Step 7: Run focused and existing geometry/context tests**

Run: `npx vitest run tests/unit/annotationInputModel.test.ts tests/unit/globalAnnotationInputMonitor.test.ts tests/unit/windowGeometryProvider.test.ts tests/unit/captureGeometry.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the monitor boundary**

```bash
git add src/main/capture/annotationInputModel.ts src/main/capture/GlobalAnnotationInputMonitor.ts tests/unit/annotationInputModel.test.ts tests/unit/globalAnnotationInputMonitor.test.ts
git commit -m "feat: observe annotation modifier without blocking pointer input"
```

### Task 2: Pure marked-issue accumulator and limits

**Files:**
- Create: `src/main/capture/MarkedIssueAccumulator.ts`
- Modify: `src/shared/types.ts`
- Test: `tests/unit/markedIssueAccumulator.test.ts`

**Interfaces:**
- Consumes: validated `AnnotationEvent` and modifier/click timestamps.
- Produces: `MarkedIssueAccumulator.releaseModifier(at, videoStartTime)` with snapshot revision.
- Produces: `MarkedIssueAccumulator.commit(at)` returning one `MarkedIssuePayload | null`.
- Produces: serializable `MarkedIssueAccumulatorSnapshot` for crash recovery.

- [ ] **Step 1: Add failing tests for grouping, empty clicks, limits, stop, and restore**

```ts
accumulator.consume(strokeStart('s1', 'a'), 1_000);
accumulator.consume(strokeEnd('s1', 'a'), 1_200);
accumulator.consume(strokeStart('s1', 'b'), 1_500);
accumulator.consume(strokeEnd('s1', 'b'), 1_700);
const request = accumulator.releaseModifier(1_710, 500);
expect(request?.revision).toBe(1);
expect(accumulator.commit(2_000)?.strokeIds).toEqual(['a', 'b']);
expect(accumulator.commit(2_100)).toBeNull();
```

- [ ] **Step 2: Run the accumulator test and confirm it fails for the missing module/types**

Run: `npx vitest run tests/unit/markedIssueAccumulator.test.ts`

- [ ] **Step 3: Add exact shared payload and snapshot types**

```ts
export interface MarkedIssuePayload {
  id: string;
  ordinal: number;
  startedAt: number;
  markedAt: number;
  completedAt: number;
  strokeIds: string[];
  tools: AnnotationTool[];
  colors: AnnotationColor[];
  screenshotPath?: string;
  fallbackVideoTimestamp: number;
  captureContext?: CaptureContextSnapshot;
  comment?: string;
  transcriptionStatus: 'pending' | 'available' | 'unavailable';
  snapshotRevision: number;
  transcriptSegmentIds: string[];
}
```

- [ ] **Step 4: Implement accumulation with constants `MAX_MARKED_ISSUES = 200` and `MAX_STROKES_PER_ISSUE = 100`**

Keep active stroke IDs separate from completed strokes, deduplicate tools/colors in first-use order, assign deterministic `marked-issue-${ordinal}`, and return an explicit `limitReached` result rather than slicing.

- [ ] **Step 5: Add crash snapshot round-trip and invalid-event tests**

Verify restore preserves committed records and an active candidate but rejects a mismatched session ID, invalid timestamps, duplicate stroke endings, and more than one commit per click.

- [ ] **Step 6: Run accumulator and existing annotation-scene tests**

Run: `npx vitest run tests/unit/markedIssueAccumulator.test.ts tests/unit/annotationScene.test.ts tests/unit/captureSessionLifecycle.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit issue semantics**

```bash
git add src/shared/types.ts src/main/capture/MarkedIssueAccumulator.ts tests/unit/markedIssueAccumulator.test.ts
git commit -m "feat: group annotation strokes into marked issues"
```

### Task 3: Click-through overlay manager and modifier-driven drawing

**Files:**
- Modify: `src/main/capture/CaptureOverlayManager.ts`
- Modify: `src/main/capture/CaptureSessionLifecycle.ts`
- Modify: `src/renderer/overlays/annotationOverlayModel.ts`
- Modify: `src/renderer/overlays/LiveAnnotationOverlay.tsx`
- Modify: `src/shared/types.ts`
- Test: `tests/unit/captureOverlayManager.test.ts`
- Test: `tests/unit/annotationOverlayModel.test.ts`
- Test: `tests/e2e/captureSelectionAndAnnotation.test.ts`

**Interfaces:**
- Consumes: `GlobalAnnotationInputMonitor` and `MarkedIssueAccumulator` from Tasks 1–2.
- Produces: the new `AnnotationEvent` variant `snapshot-request` and reuses the existing `clear` event for issue clearing.
- Preserves: `setAnnotationMode` as an explicit fallback API.

- [ ] **Step 1: Write failing manager tests proving normal input never focuses or captures the overlay**

```ts
await manager.beginAnnotation('session-1', target);
monitor.emit(sample({ modifierDown: true }));
expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
expect(window.focus).not.toHaveBeenCalled();
monitor.emit(sample({ modifierDown: false }));
expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
```

Also assert a plain primary transition inside or outside the capture bounds commits once, broadcasts clear, and leaves the original input unsynthesized.

- [ ] **Step 2: Run focused manager tests and confirm expected failures**

Run: `npx vitest run tests/unit/captureOverlayManager.test.ts`

- [ ] **Step 3: Make annotation windows non-focusable and inject/start/stop the monitor**

Add `setFocusable(false)` to the protected annotation window path, remove `focus()` from drawing transitions, scope monitor startup to `beginAnnotation`, and force click-through before every failure/teardown path.

- [ ] **Step 4: Track the active stroke in the manager and close it on modifier release**

When release arrives before renderer `pointerup`, send a normalized final point followed by `stroke-end`; then send one snapshot request only when the accumulator has completed marks.

- [ ] **Step 5: Update the overlay reducer and component for forced completion and directions**

```tsx
<p role="note">
  Hold {isMac ? '⌘' : 'Ctrl'} and drag to mark · click to save and continue
</p>
```

Keep tool controls excluded via `data-annotation-control`, use `showInactive`, and ensure the component never calls focus APIs.

- [ ] **Step 6: Add tests for modifier-first requirement, release ordering, pause preservation, monitor crash, and fallback Draw mode**

The unsupported-platform fixture must show fallback state and still pass existing manual draw tests.

- [ ] **Step 7: Run overlay/model/lifecycle suites**

Run: `npx vitest run tests/unit/captureOverlayManager.test.ts tests/unit/annotationOverlayModel.test.ts tests/e2e/captureSelectionAndAnnotation.test.ts tests/unit/annotationPauseSafety.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit click-through interaction**

```bash
git add src/main/capture/CaptureOverlayManager.ts src/main/capture/CaptureSessionLifecycle.ts src/renderer/overlays/annotationOverlayModel.ts src/renderer/overlays/LiveAnnotationOverlay.tsx src/shared/types.ts tests/unit/captureOverlayManager.test.ts tests/unit/annotationOverlayModel.test.ts tests/e2e/captureSelectionAndAnnotation.test.ts
git commit -m "feat: draw while holding modifier and preserve click-through"
```

### Task 4: Compositor PNG candidates and artifact staging

**Files:**
- Create: `src/main/capture/MarkedIssueArtifactStore.ts`
- Modify: `src/renderer/capture/RecordingCompositor.ts`
- Modify: `src/renderer/capture/ScreenRecordingRenderer.ts`
- Modify: `src/main/ipc/captureHandlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/types/electron.d.ts`
- Modify: `src/shared/types.ts`
- Test: `tests/unit/markedIssueArtifactStore.test.ts`
- Test: `tests/unit/recordingCompositor.test.ts`
- Test: `tests/unit/screenRecordingRenderer.test.ts`
- Test: `tests/unit/captureOverlayPreload.test.ts`

**Interfaces:**
- Produces: `RecordingCompositor.capturePng(): Promise<Uint8Array>`.
- Produces: `MarkedIssueArtifactStore.stageCandidate(sessionId, revision, bytes)` and `promoteIssues(sessionId, issues, sessionDir)`.
- Produces renderer API: `window.markuprx.capture.stageMarkedIssueCandidate(payload)` before the later rebrand task.

- [ ] **Step 1: Add failing compositor tests for render barrier, PNG bytes, stopped state, and encoding failure**

Use a fake canvas `toBlob` and manually flush the next animation frame. Assert the blob is requested only after `renderFrame` includes the final stroke.

- [ ] **Step 2: Run compositor tests and confirm `capturePng` is missing**

Run: `npx vitest run tests/unit/recordingCompositor.test.ts`

- [ ] **Step 3: Implement bounded snapshot encoding**

```ts
async capturePng(): Promise<Uint8Array> {
  if (!this.running || !this.canvas) throw new Error('Recording compositor is not active.');
  await this.afterNextRenderedFrame();
  const blob = await canvasToBlob(this.canvas, 'image/png');
  if (blob.size > MAX_MARKED_SCREENSHOT_BYTES) throw new Error('Marked screenshot exceeds the size limit.');
  return new Uint8Array(await blob.arrayBuffer());
}
```

- [ ] **Step 4: Add failing artifact-store tests for traversal rejection, replacement, atomic promotion, missing candidates, and cleanup**

Use a temporary test directory and assert only UUID-like session IDs, positive revisions, PNG signatures, and the 15 MiB byte cap are accepted.

- [ ] **Step 5: Implement candidate staging and promotion**

Write `candidate-<revision>.png.part`, rename atomically, replace older uncommitted candidates, copy promoted files to `screenshots/marked-issue-<ordinal>.png`, and remove session staging on success/cancel/startup cleanup.

- [ ] **Step 6: Add typed snapshot request and staging IPC**

Validate session ownership, revision, byte type/size, and PNG signature in `captureHandlers`. Do not accept renderer-provided filesystem paths.

- [ ] **Step 7: Make ScreenRecordingRenderer capture and flush candidate writes**

On `snapshot-request`, call `capturePng`, stage the candidate, record failure for video fallback, and add the promise to `snapshotWrites`. `stop()` must await both media chunk writes and snapshot writes before resolving.

- [ ] **Step 8: Run all snapshot/staging/preload tests**

Run: `npx vitest run tests/unit/markedIssueArtifactStore.test.ts tests/unit/recordingCompositor.test.ts tests/unit/screenRecordingRenderer.test.ts tests/unit/captureOverlayPreload.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit candidate capture**

```bash
git add src/main/capture/MarkedIssueArtifactStore.ts src/renderer/capture/RecordingCompositor.ts src/renderer/capture/ScreenRecordingRenderer.ts src/main/ipc/captureHandlers.ts src/preload/index.ts src/renderer/types/electron.d.ts src/shared/types.ts tests/unit/markedIssueArtifactStore.test.ts tests/unit/recordingCompositor.test.ts tests/unit/screenRecordingRenderer.test.ts tests/unit/captureOverlayPreload.test.ts
git commit -m "feat: stage marked screenshots before navigation"
```

### Task 5: Persist and finalize marked issues through the session lifecycle

**Files:**
- Modify: `src/main/SessionController.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/CrashRecovery.ts`
- Modify: `src/main/pipeline/CaptureMomentHints.ts`
- Modify: `src/main/pipeline/PostProcessor.ts`
- Modify: `src/main/pipeline/FrameExtractor.ts`
- Test: `tests/unit/sessionController.test.ts`
- Test: `tests/unit/crashRecovery.test.ts`
- Test: `tests/unit/captureMomentHints.test.ts`
- Test: `tests/unit/postProcessorAnnotationFrames.test.ts`

**Interfaces:**
- Consumes: committed accumulator records and promoted artifact paths.
- Produces: `SessionMetadata.markedIssues: MarkedIssuePayload[]`.
- Produces: fallback `KeyMoment.markedIssueId` and `ExtractedFrame.markedIssueId`.

- [ ] **Step 1: Add failing lifecycle tests for commit count, stop finalization, candidate failure, and crash restore**

Assert two ordinary-click commits remain two metadata records, screenshot count increments once per committed issue, and stopping commits an active marked candidate exactly once.

- [ ] **Step 2: Run lifecycle tests and confirm missing metadata behavior**

Run: `npx vitest run tests/unit/sessionController.test.ts tests/unit/crashRecovery.test.ts`

- [ ] **Step 3: Add controller methods with defensive copies**

```ts
setMarkedIssues(issues: MarkedIssuePayload[]): boolean;
getMarkedIssues(): MarkedIssuePayload[];
```

Persist on every commit, include issues in serialization/recovery, and make `screenshotCount` reflect committed issues plus existing nonissue cues without counting individual strokes.

- [ ] **Step 4: Replace per-stroke annotation cues with per-issue fallback moments**

`captureContextsToKeyMoments` must emit one hint per marked issue that lacks a staged screenshot and carry `markedIssueId`. Existing AI/manual/pause hints remain unchanged and cannot deduplicate separate marked issue IDs.

- [ ] **Step 5: Preserve markedIssueId through analyzer caps and frame extraction**

Update priority/deduplication so every marked issue survives the ordinary 20-frame heuristic cap; apply a separate 200-issue bound from the accumulator.

- [ ] **Step 6: Finalize artifacts before report payload creation and clean staging on cancel/error**

Await renderer snapshot writes, promote available candidates, attach fallback paths after post-processing, and retain an evidence warning when neither path exists.

- [ ] **Step 7: Run focused lifecycle/postprocessor tests**

Run: `npx vitest run tests/unit/sessionController.test.ts tests/unit/crashRecovery.test.ts tests/unit/captureMomentHints.test.ts tests/unit/postProcessorAnnotationFrames.test.ts tests/unit/frameExtractor.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit durable issue lifecycle**

```bash
git add src/main/SessionController.ts src/main/index.ts src/main/CrashRecovery.ts src/main/pipeline/CaptureMomentHints.ts src/main/pipeline/PostProcessor.ts src/main/pipeline/FrameExtractor.ts tests/unit/sessionController.test.ts tests/unit/crashRecovery.test.ts tests/unit/captureMomentHints.test.ts tests/unit/postProcessorAnnotationFrames.test.ts
git commit -m "feat: persist separate marked issues through processing"
```

### Task 6: Associate narration and render every report/export format

**Files:**
- Create: `src/main/output/MarkedIssueReportBuilder.ts`
- Modify: `src/main/output/MarkdownGenerator.ts`
- Modify: `src/main/output/MarkdownPatcher.ts`
- Modify: `src/main/output/sessionAdapter.ts`
- Modify: `src/main/output/templates/markdown.ts`
- Modify: `src/main/output/templates/html-template.ts`
- Modify: `src/main/output/templates/json.ts`
- Modify: `src/main/output/templates/github-issue.ts`
- Modify: `src/main/output/templates/linear.ts`
- Modify: `src/main/output/templates/jira.ts`
- Modify: `src/shared/types.ts`
- Test: `tests/unit/markedIssueReportBuilder.test.ts`
- Test: `tests/unit/markdownGeneratorExpanded.test.ts`
- Test: `tests/unit/markdownPatcherAnnotation.test.ts`
- Test: `tests/e2e/exportPipeline.test.ts`

**Interfaces:**
- Produces: `assignMarkedIssueComments(issues, segments, context): MarkedIssuePayload[]`.
- Produces: `buildMarkedIssueFeedbackItems(issues): MarkdownFeedbackItem[]`.
- Produces: `insertMarkedIssuesSection(markdown, issues, screenshotDir): string`.

- [ ] **Step 1: Write failing comment-association tests**

```ts
const assigned = assignMarkedIssueComments(twoIssues, segments, { videoStartTime: 1_000, hasAudio: true });
expect(assigned[0].comment).toBe('The save button overlaps the footer.');
expect(assigned[1].comment).toBe('This dialog needs a cancel action.');
expect(new Set(assigned.flatMap((issue) => issue.transcriptSegmentIds)).size).toBe(2);
```

Cover 30-second window start, previous completion boundary, 12-second preceding fallback, midpoint boundaries, no narration, and transcription failure.

- [ ] **Step 2: Run the report-builder test and confirm the missing-module failure**

Run: `npx vitest run tests/unit/markedIssueReportBuilder.test.ts`

- [ ] **Step 3: Implement deterministic single-assignment comment association**

Sort issues and segments, maintain an assigned segment-ID set, normalize whitespace, and set explicit `available`/`unavailable` status. Preserve all unassigned segments for general feedback.

- [ ] **Step 4: Write failing Markdown tests for stable separate `MX-001` entries and evidence**

Assert ordered `## Marked Issues`, comment block, timestamp, app/focus context, tools/colors, relative image path, missing-evidence warning, and placement before `## Auto-Extracted Screenshots`.

- [ ] **Step 5: Implement marked feedback items and Markdown insertion without duplicate generic frames**

Escape user text and paths, preserve one section per committed issue, and filter generic extracted frames by `markedIssueId` after their issue evidence is resolved.

- [ ] **Step 6: Update review session and all structured/template adapters**

HTML, JSON, GitHub Issue, Linear, Jira, and Markdown templates must keep separate issue IDs and screenshots. JSON includes the full finalized marked issue array with relative paths.

- [ ] **Step 7: Run report/export suites**

Run: `npx vitest run tests/unit/markedIssueReportBuilder.test.ts tests/unit/markdownGeneratorExpanded.test.ts tests/unit/markdownPatcherAnnotation.test.ts tests/e2e/exportPipeline.test.ts tests/markdownGenerator.test.ts tests/output.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit marked issue reporting**

```bash
git add src/main/output/MarkedIssueReportBuilder.ts src/main/output/MarkdownGenerator.ts src/main/output/MarkdownPatcher.ts src/main/output/sessionAdapter.ts src/main/output/templates src/shared/types.ts tests/unit/markedIssueReportBuilder.test.ts tests/unit/markdownGeneratorExpanded.test.ts tests/unit/markdownPatcherAnnotation.test.ts tests/e2e/exportPipeline.test.ts
git commit -m "feat: pair marked screenshots with separate narrated issues"
```

### Task 7: Full multi-issue recording integration and UI directions

**Files:**
- Modify: `src/renderer/contexts/RecordingContext.tsx`
- Modify: `src/renderer/components/RecordingOverlay.tsx`
- Modify: `src/renderer/components/Onboarding.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/main/index.ts`
- Test: `tests/unit/appIntegration.test.ts`
- Test: `tests/unit/onboardingFlow.test.ts`
- Test: `tests/e2e/captureSelectionAndAnnotation.test.ts`
- Create: `tests/integration/markedIssueSessionFlow.test.ts`

**Interfaces:**
- Consumes all Tasks 1–6.
- Produces one complete start -> draw -> snapshot -> click -> clear -> repeat -> stop -> report flow.

- [ ] **Step 1: Add a failing integration test with three marked screens and three transcript comments**

The test must use three different click completion times, assert three promoted PNG paths, three issue IDs, three distinct comments, and zero marked frames in the generic frame section.

- [ ] **Step 2: Run the new integration test and confirm the lifecycle is not yet wired**

Run: `npx vitest run tests/integration/markedIssueSessionFlow.test.ts`

- [ ] **Step 3: Wire monitor health and issue counts into RecordingContext**

Expose `annotationInputHealth`, `pendingMarkedIssue`, and `markedIssueCount`; disable modifier workflow during pause/mutation; preserve pending marks across pause; clear local state after commit.

- [ ] **Step 4: Replace the primary Draw copy with concise directions and first-use guidance**

The HUD shows “Hold ⌘ and drag to mark · click to save and continue” on macOS and Ctrl on Windows. Onboarding explains that the ordinary click still activates the target. The explicit Draw button appears only as the fallback affordance or accessibility alternative.

- [ ] **Step 5: Wire stop/cancel/error sequencing to flush snapshots and monitor teardown**

Stop order is: finish active stroke -> request candidate -> await snapshot writes -> commit final issue -> clear/stop monitor -> stop recorder -> run session post-processing. Cancel removes uncommitted and committed staging files.

- [ ] **Step 6: Run integration, UI model, and existing recording suites**

Run: `npx vitest run tests/integration/markedIssueSessionFlow.test.ts tests/unit/appIntegration.test.ts tests/unit/onboardingFlow.test.ts tests/e2e/captureSelectionAndAnnotation.test.ts tests/e2e/recordingPipeline.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the complete interaction flow**

```bash
git add src/renderer/contexts/RecordingContext.tsx src/renderer/components/RecordingOverlay.tsx src/renderer/components/Onboarding.tsx src/renderer/App.tsx src/main/index.ts tests/unit/appIntegration.test.ts tests/unit/onboardingFlow.test.ts tests/e2e/captureSelectionAndAnnotation.test.ts tests/integration/markedIssueSessionFlow.test.ts
git commit -m "feat: complete multi-issue annotation workflow"
```

### Task 8: Rebrand runtime, package, bridge, storage, and release identifiers

**Files:**
- Create: `src/main/migration/LegacyBrandMigration.ts`
- Create: `scripts/verify-brand.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `electron-builder.yml`
- Modify: `src/**/*.ts`
- Modify: `src/**/*.tsx`
- Modify: `tests/**/*.ts`
- Modify: `scripts/*`
- Rename: `scripts/setup-markuprx.sh` -> `scripts/setup-markuprx.sh`
- Test: `tests/unit/legacyBrandMigration.test.ts`
- Test: `tests/unit/brandAudit.test.ts`

**Interfaces:**
- Produces canonical runtime bridge `window.markuprx` and IPC prefix `markuprx:`.
- Produces public commands `markuprx` and `markuprx-mcp`.
- Produces one allowlisted migration module for previous local data.

- [ ] **Step 1: Write a failing brand-audit test and script**

The script recursively scans repository-controlled filenames and UTF-8 content, excludes `.git`, `node_modules`, `dist`, `coverage`, `release`, and the verification log, and allows previous-name literals only in `LegacyBrandMigration.ts` and `legacyBrandMigration.test.ts`.

Run: `node scripts/verify-brand.mjs`

Expected: FAIL with the current source locations and filenames.

- [ ] **Step 2: Write failing one-way migration tests**

Use injected filesystem/store paths. Assert existing settings and session directories copy once into MarkuprX paths, new data wins on conflicts, migration is idempotent, and missing legacy data is a no-op.

- [ ] **Step 3: Implement the isolated migration module**

Keep all previous-name literals inside this module. Call it before new settings/session stores initialize. Never surface those literals in dialogs, logs, generated reports, or exported metadata.

- [ ] **Step 4: Perform the mechanical machine-identifier rename**

Apply the mappings `MARKUPRX` -> `MARKUPRX`, `markuprx` -> `markuprx`, and old mixed-case display spelling -> `MarkuprX` across source/tests/config. Rename the setup script. Then manually correct class names, test descriptions, package binaries, config files, temp/output directories, and bridge declarations.

- [ ] **Step 5: Set release/package metadata to 3.0.0 and new identifiers**

```json
{
  "name": "markuprx",
  "version": "3.0.0",
  "bin": {
    "markuprx": "./dist/cli/index.mjs",
    "markuprx-mcp": "./dist/mcp/index.mjs"
  },
  "mcpName": "com.markuprx/markuprx"
}
```

Use bundle ID `com.eddiesanjuan.markuprx`, product/executable `MarkuprX`, extension `markuprx`, and new installer artifact names.

- [ ] **Step 6: Update all preload, renderer, IPC, test mock, and environment-variable consumers**

There must be no compatibility bridge or old IPC handler. Update `window.markuprx`, `markuprx:*`, `MARKUPRX_*`, log prefixes, and test setup atomically.

- [ ] **Step 7: Run brand audit, typecheck, core unit tests, CLI, and MCP tests**

Run: `node scripts/verify-brand.mjs`

Run: `npm run typecheck`

Run: `npx vitest run tests/unit/brandAudit.test.ts tests/unit/legacyBrandMigration.test.ts tests/unit/navigationPreload.test.ts tests/unit/captureOverlayPreload.test.ts tests/unit/cli.test.ts tests/e2e/cliPipeline.test.ts tests/e2e/mcpServer.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit runtime rebrand**

```bash
git add -A
git commit -m "feat!: rebrand runtime and package as MarkuprX"
```

### Task 9: Rebrand documentation, website, assets, action, and CI

**Files:**
- Modify: `README.md`
- Modify: `README-MCP.md`
- Modify: `CLAUDE.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/**`
- Modify: `site/**`
- Modify: `launch-content/**`
- Modify: `.github/**`
- Modify: `assets/**`
- Modify: `src/renderer/assets/logo.svg`
- Modify: `src/renderer/assets/logo-dark.svg`
- Rename: `markuprx-action/` -> `markuprx-action/`
- Modify: `electron-builder.yml`
- Modify: `scripts/generate-*.{mjs,cjs}`

**Interfaces:**
- Consumes: canonical naming from Task 8.
- Produces: zero previous-brand shipping content and regenerated branded assets.

- [ ] **Step 1: Rename the action directory and update workflow paths/references**

Use `markuprx-action`, `eddiesanjuan/markuprx-action@v1`, and update test-action triggers, checks, entrypoint messages, and README examples.

- [ ] **Step 2: Replace all human-facing copy, commands, URLs, email domains, badges, structured data, and generated attribution**

Use `MarkuprX`, `markuprx`, and `https://markuprx.com` consistently. Historical release pages are rebranded because they are shipping website content.

- [ ] **Step 3: Update and regenerate logos, icons, installer art, Open Graph assets, and tray assets**

Run: `npm run generate:icons`

Run: `npm run generate:tray-icons`

Run: `npm run generate:installer-images`

Inspect raster outputs at original resolution and verify no previous wordmark remains.

- [ ] **Step 4: Run source/filename brand audit and website syntax/link checks**

Run: `node scripts/verify-brand.mjs`

Run the local site server, request every HTML page, and assert HTTP 200 plus canonical `markuprx.com` metadata. Check that download/action/package links use new names.

- [ ] **Step 5: Run docs/example/workflow-focused tests and shell syntax checks**

Run: `bash -n scripts/*.sh markuprx-action/*.sh`

Run: `npm run build:cli && npm run build:mcp`

Expected: PASS with new binary names in bundle smoke tests.

- [ ] **Step 6: Commit content rebrand**

```bash
git add -A
git commit -m "docs: complete MarkuprX product rebrand"
```

### Task 10: Add real Playwright Electron UI coverage

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `playwright.config.ts`
- Create: `tests/fixtures/electronHarness.ts`
- Create: `tests/ui/markuprx-electron.spec.ts`
- Modify: `src/main/index.ts`
- Modify: `src/renderer/capture/ScreenRecordingRenderer.ts`
- Modify: `src/preload/index.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces scripts `test:ui-electron` and `test:all`.
- Test-only APIs exist only when `MARKUPRX_E2E=1`; production calls fail closed.

- [ ] **Step 1: Install Playwright test support without downloading unrelated browsers**

Run: `npm install --save-dev @playwright/test`

Add `test:ui-electron`, `test:all`, and CI artifact scripts for screenshots/traces/reports.

- [ ] **Step 2: Add a failing built-app launch test**

```ts
test('launches MarkuprX and shows the idle capture action', async () => {
  const app = await electron.launch({ args: ['.'], env: harnessEnv });
  const window = await app.firstWindow();
  await expect(window).toHaveTitle(/MarkuprX/);
  await expect(window.getByRole('button', { name: /start/i })).toBeVisible();
  await app.close();
});
```

- [ ] **Step 3: Build and run the launch test to capture the first real failure**

Run: `npm run build:desktop && npm run test:ui-electron -- --grep "launches MarkuprX"`

- [ ] **Step 4: Implement a guarded deterministic capture/audio/input harness**

Under `MARKUPRX_E2E=1`, provide a canvas-backed moving test source, generated silent/voiced PCM fixture, a temporary output root, and a typed input-sample injector. Refuse the testing IPC channel unless both the environment flag and non-packaged mode are true.

- [ ] **Step 5: Add full user-flow tests**

Cover onboarding and permission guidance, target selection, visible hold-to-draw directions, modifier draw, click-through target counter increment, mark clearing, three issue capture, pause/resume, stop/processing, report review, settings, export, and restart recovery. Inspect generated PNG signatures/dimensions and report issue/comment text from disk.

- [ ] **Step 6: Add accessibility and visual-state tests**

Test keyboard-only focus order, ARIA names/states, light/dark mode, reduced motion, narrow HUD width, error messages, and fallback Draw control. Capture screenshots/traces on failure.

- [ ] **Step 7: Run real Electron UI suite repeatedly**

Run: `npm run build:desktop && npm run test:ui-electron`

Run it at least five consecutive times to expose lifecycle flakes. Expected: all repetitions PASS with no orphan Electron/input-monitor processes.

- [ ] **Step 8: Commit real UI coverage**

```bash
git add package.json package-lock.json playwright.config.ts tests/fixtures/electronHarness.ts tests/ui/markuprx-electron.spec.ts src/main/index.ts src/renderer/capture/ScreenRecordingRenderer.ts src/preload/index.ts .github/workflows/ci.yml
git commit -m "test: add real Electron UI coverage"
```

### Task 11: Stress, failure injection, security, and coverage hardening

**Files:**
- Create: `tests/e2e/markedIssueStress.test.ts`
- Create: `tests/e2e/annotationFailureRecovery.test.ts`
- Modify: `vitest.config.ts`
- Modify: `src/main/capture/GlobalAnnotationInputMonitor.ts`
- Modify: `src/main/capture/CaptureOverlayManager.ts`
- Modify: `src/main/capture/MarkedIssueAccumulator.ts`
- Modify: `src/main/capture/MarkedIssueArtifactStore.ts`
- Modify: `src/renderer/capture/ScreenRecordingRenderer.ts`
- Modify: `src/main/output/MarkedIssueReportBuilder.ts`
- Modify: `tests/setup.ts`

**Interfaces:**
- Consumes complete application.
- Produces stable cleanup behavior and higher critical-path coverage thresholds.

- [ ] **Step 1: Add repeated lifecycle and race tests**

Run 50 deterministic cycles mixing start/cancel/start, modifier-before-mouse, mouse-before-modifier, rapid release/click, multiple strokes, pause/resume, stop-during-draw, window resize, and target termination. Assert no timers, child processes, overlays, temp candidates, stream tracks, or listener leaks.

- [ ] **Step 2: Add injected failure tests**

Inject monitor spawn/parse/exit failure, overlay crash, compositor encode failure, oversized/malformed PNG, filesystem permission failure, ffmpeg failure, transcription failure, AI failure, renderer crash, and crash recovery. Assert clicks stay unblocked and every already committed issue remains represented.

- [ ] **Step 3: Run stress/failure tests and use systematic debugging for every discovered defect**

Run: `npx vitest run tests/e2e/markedIssueStress.test.ts tests/e2e/annotationFailureRecovery.test.ts --reporter=verbose`

Expected initial outcome: tests expose any cleanup/race defects; diagnose root cause before patching.

- [ ] **Step 4: Run coverage and raise thresholds for new critical modules**

Run: `npm run test:ci`

Set global thresholds no lower than current values and add per-file thresholds of 90% lines/functions/statements and 80% branches for the input reducer, accumulator, artifact store, and report builder.

- [ ] **Step 5: Run security/static verification**

Run: `npm audit --omit=dev --audit-level=high`

Run: `npm run lint && npm run typecheck`

Inspect child-process arguments/environment, IPC validators, path containment, byte caps, candidate cleanup, and test-only handler guards.

- [ ] **Step 6: Commit hardening fixes and tests**

```bash
git add -A
git commit -m "test: harden annotation lifecycle and failure recovery"
```

### Task 12: Four-hour runtime verification, packaging, and completion audit

**Files:**
- Create: `docs/testing/2026-08-15-markuprx-verification-log.md`
- Modify: `src/main/capture/GlobalAnnotationInputMonitor.ts`
- Modify: `src/main/capture/CaptureOverlayManager.ts`
- Modify: `src/main/capture/MarkedIssueAccumulator.ts`
- Modify: `src/main/capture/MarkedIssueArtifactStore.ts`
- Modify: `src/renderer/capture/RecordingCompositor.ts`
- Modify: `src/renderer/capture/ScreenRecordingRenderer.ts`
- Modify: `src/main/output/MarkedIssueReportBuilder.ts`
- Modify: `tests/e2e/markedIssueStress.test.ts`
- Modify: `tests/e2e/annotationFailureRecovery.test.ts`
- Modify: `tests/ui/markuprx-electron.spec.ts`

**Interfaces:**
- Produces authoritative timestamped evidence for every acceptance criterion.

- [ ] **Step 1: Start the verification log with environment and baseline evidence**

Record wall-clock timestamps, commit, macOS/Node/npm/Electron versions, permission states, available displays, ffmpeg/ffprobe versions, baseline commands, and outcomes. Each later entry records activity, evidence, defect, fix commit, and rerun result.

- [ ] **Step 2: Run the complete clean automated matrix**

Run: `npm run test:all`

Run: `npm run test:ci`

Run: `npm run lint && npm run typecheck && npm audit --omit=dev --audit-level=high`

Run: `npm run build && npm run package:mac:unsigned`

Record exact counts, durations, exit codes, warnings, coverage, and artifact paths.

- [ ] **Step 3: Exercise the development app against a real application window**

With screen, microphone, and accessibility permissions, verify normal hover/scroll/click, Command-held pen/circle/highlight, multiple strokes per issue, navigation click-through/clear, at least five separate issues, pause/resume, stop-with-active-marks, and output review. Record screenshots and resulting session paths.

- [ ] **Step 4: Inspect generated media and every report format**

Use `ffprobe` for duration/geometry/streams and `ffmpeg` to extract comparison frames. Validate each marked PNG visually and structurally. Inspect Markdown, HTML, JSON, GitHub Issue, Linear, and Jira output for distinct ordered issue/comment/evidence pairs and no duplicate generic frames.

- [ ] **Step 5: Exercise the packaged application and platform edge cases**

Launch the unsigned packaged app, re-check onboarding/rebrand/permissions, record a real window, and inspect output. Exercise dark/light, reduced motion, narrow popover, high-DPI, available secondary displays, fallback Draw control, selected-window move/resize/close, and app restart recovery.

- [ ] **Step 6: Continue active test/fix/rerun cycles until four real hours are documented**

Rotate through Electron UI repetitions, stress/failure suites, real recordings, exports, packaging, resource-leak inspection, and fresh-process reruns. For every defect, record reproduction evidence, add a failing regression test, fix root cause, and rerun the affected and broader suites. Do not count idle waiting.

- [ ] **Step 7: Perform a requirement-by-requirement completion audit**

For each of the ten design acceptance criteria, link authoritative source, automated test, runtime evidence, and output artifact. Run `node scripts/verify-brand.mjs` and a clean `git status`. Treat missing or indirect evidence as incomplete and continue testing.

- [ ] **Step 8: Invoke verification-before-completion and request code review**

Re-run all commands required by that skill using fresh output. Address every valid review finding with a regression test and rerun.

- [ ] **Step 9: Commit final verification evidence and any last fixes**

```bash
git add docs/testing/2026-08-15-markuprx-verification-log.md
git commit -m "test: document four-hour MarkuprX verification"
```

Only claim completion after the worktree, generated artifacts, runtime behavior, and fresh verification output prove every original requirement.
