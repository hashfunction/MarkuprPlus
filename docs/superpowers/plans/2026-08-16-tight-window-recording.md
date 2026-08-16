# Tight Window Recording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acquire window sources at their native geometry so selected-window video, annotations, and staged screenshots share the same tight coordinate space.

**Architecture:** Make the existing exact-source acquisition loop target-aware. Window targets take one basic, dimension-free acquisition path; screen and region targets retain their current high-quality attempt and same-source basic fallback, after which the existing compositor and persistence pipeline remain unchanged.

**Tech Stack:** TypeScript, Electron desktop capture constraints, MediaRecorder, Vitest.

## Global Constraints

- A window target must use its selected `window:*` source ID with no forced width or height.
- A window acquisition or composition failure must fail closed without trying a display source.
- Screen and region targets must retain high-quality constraints and same-source fallback.
- The compositor must keep a stable output canvas and continue containing resized window frames without cropping.
- Annotation, screenshot, timestamp, report, CLI, and MCP behavior must remain unchanged.
- Add no dependency and no new capture backend.

---

### Task 1: Use native constraints for selected windows

**Files:**
- Modify: `tests/unit/screenRecordingRenderer.test.ts`
- Modify: `src/renderer/capture/ScreenRecordingRenderer.ts`

**Interfaces:**
- Consumes: `CaptureTarget.kind`, `ScreenRecordingRenderer.getDesktopConstraints(sourceId, highQuality)`, and the selected `chromeMediaSourceId`.
- Produces: target-aware acquisition attempts in `ScreenRecordingRenderer.acquireAndComposeExactSource(sourceId, target)`.

- [ ] **Step 1: Add the explicit window test fixture**

Add beside `screenTarget`:

```ts
const windowTarget: CaptureTarget = {
  kind: 'window',
  sourceId: 'window:703:0',
  sourceName: 'Android Emulator - Medium_Phone_API_36.1:5554',
  nativeWindowId: '703',
  appName: 'qemu-system-aarch64',
  bounds: { x: 960, y: 58, width: 552, height: 922 },
  geometryAvailable: true,
};
```

- [ ] **Step 2: Write the failing acquisition regression test**

Inside the `start` test group, add:

```ts
it('acquires window targets once without display-size constraints', async () => {
  await renderer.start({ sessionId: 'sess-1', target: windowTarget });

  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
    audio: false,
    video: {
      cursor: 'never',
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: windowTarget.sourceId,
      },
    },
  });
  expect(compositor.start).toHaveBeenCalledWith(rawStream, windowTarget);
  expect(mockRecorderInstance.stream).toBe(composedStream);
});
```

The production change that makes this test pass is choosing only the basic exact-source attempt for `target.kind === 'window'`.

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
npx vitest run tests/unit/screenRecordingRenderer.test.ts --reporter=verbose
```

Expected: the new test fails because the window request contains `minWidth`, `minHeight`, `maxWidth`, `maxHeight`, and `maxFrameRate`. Existing tests remain green.

- [ ] **Step 4: Implement the target-aware attempt sequence**

In `acquireAndComposeExactSource`, replace the unconditional quality sequence with:

```ts
const qualityAttempts = target.kind === 'window' ? [false] : [true, false];
for (const highQuality of qualityAttempts) {
```

Keep the existing exact source ID, cleanup, and retry branches unchanged. A window therefore has one basic attempt, while a screen or region still retries basic constraints after a failed high-quality acquisition or composition.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```bash
npx vitest run tests/unit/screenRecordingRenderer.test.ts tests/unit/recordingCompositor.test.ts --reporter=verbose
```

Expected: all renderer and compositor checks pass, including native window acquisition, selected-source isolation, screen fallback, resized-window containment, and annotation mapping.

- [ ] **Step 6: Commit the implementation**

```bash
git add src/renderer/capture/ScreenRecordingRenderer.ts tests/unit/screenRecordingRenderer.test.ts
git commit -m "fix: preserve native window capture geometry"
```

---

### Task 2: Verify the complete capture change

**Files:**
- Verify only; no additional production changes are expected.

**Interfaces:**
- Consumes: the target-aware capture path and existing project validation commands.
- Produces: fresh evidence that the regression is fixed without changing other capture paths.

- [ ] **Step 1: Run the complete deterministic test suite**

Run:

```bash
npx vitest run --reporter=dot --silent
```

Expected: every Vitest test passes with zero failures.

- [ ] **Step 2: Run static verification**

Run:

```bash
npm run typecheck
npm run lint
git diff --check
```

Expected: type checking, lint, and whitespace validation pass.

- [ ] **Step 3: Inspect commits and working tree**

Run:

```bash
git log -3 --oneline --decorate
git status --short --branch
```

Expected: the design, plan, and implementation commits are present and the working tree is clean.
