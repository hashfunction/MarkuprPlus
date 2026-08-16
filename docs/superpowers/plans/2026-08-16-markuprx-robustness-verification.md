# MarkuprX Robustness Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize report-completion assertions, add high-risk Electron workflows and a packaged-app smoke test, stress the timing-sensitive paths, and reinstall the verified arm64 application.

**Architecture:** Keep production behavior unchanged unless a new functional test proves a defect. Use the existing deterministic Electron harness for end-to-end workflows, app-owned semantic completion signals for synchronization, real output artifacts for assertions, and a standalone Playwright/Electron script for the packaged executable.

**Tech Stack:** TypeScript, Electron 28, React, Vitest, Playwright Electron, Node.js filesystem APIs, electron-vite, electron-builder.

## Global Constraints

- Preserve ordinary mouse interaction; annotation activates only while Command is held on macOS.
- A plain click commits pending marks, clears the overlay, and lets the user continue interacting.
- Every marked issue retains a separate screenshot and associated narration in the final report.
- The product name is `MarkuprX`, version is `3.0.0`, and bundle identifier is `com.eddiesanjuan.markuprx`.
- No Apple signing or notarization credentials are assumed.
- Temporary diagnostics must not ship.
- Do not weaken artifact, metadata, comment, accessibility, security, or session-isolation assertions to make a test pass.

---

### Task 1: Stabilize the coalesced release/click workflow

**Files:**
- Modify: `tests/ui/markuprx-electron.spec.ts:506`
- Modify: `src/main/capture/CaptureOverlayManager.ts`
- Modify: `src/main/capture/MarkedIssueArtifactStore.ts`
- Modify: `src/main/ipc/captureHandlers.ts`
- Modify: `src/renderer/capture/ScreenRecordingRenderer.ts`

**Interfaces:**
- Consumes: the existing `Report Ready` heading emitted only after `OUTPUT_READY` finalization.
- Produces: a deterministic UI test that reads final artifacts only after the user-visible completion contract.

- [ ] **Step 1: Preserve the observed red evidence**

Record that the unchanged test failed 7 of 10 isolated repetitions with the report missing `./screenshots/marked-issue-001.png`, while boundary diagnostics showed dispatch, PNG staging, and promotion all succeeded.

- [ ] **Step 2: Add the semantic completion wait**

Immediately after clicking Stop in the coalesced-event test, add:

```ts
await expect(mainWindow.getByRole('heading', { name: 'Report Ready' }))
  .toBeVisible({ timeout: 45_000 });
```

Keep the existing comment, Markdown image-link, and PNG-size assertions unchanged.

- [ ] **Step 3: Remove temporary diagnostics**

Remove every `[MX-DIAG]` log statement from the four production files. Do not remove existing warning/error logging.

- [ ] **Step 4: Build and verify green repeatedly**

Run:

```bash
npm run build:desktop
npx playwright test --grep "commits one marked screenshot" --repeat-each=20 --workers=1 --reporter=list
```

Expected: 20 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add tests/ui/markuprx-electron.spec.ts src/main/capture/CaptureOverlayManager.ts src/main/capture/MarkedIssueArtifactStore.ts src/main/ipc/captureHandlers.ts src/renderer/capture/ScreenRecordingRenderer.ts
git commit -m "test: await finalized marked report evidence"
```

---

### Task 2: Cover Stop finalization of a pending marked issue

**Files:**
- Modify: `tests/ui/markuprx-electron.spec.ts`

**Interfaces:**
- Consumes: `selectDeterministicWindow`, `createInputSequence`, `drawStroke`, `diagnostics`, and the E2E transcript injector.
- Produces: an Electron test protecting the final unclicked mark at session stop.

- [ ] **Step 1: Write the functional test**

Add a test named `finalizes an unclicked marked area with narration when Stop is chosen` that:

```ts
const comment = 'The final pending mark must be included when recording stops.';
await input.next();
await input.next({ modifierDown: true });
await drawStroke(annotation, { x: 230, y: 190 }, { x: 450, y: 280 });
await input.next({ modifierDown: false });
await expect.poll(async () => (await diagnostics(mainWindow)).pendingMarkedIssue).toBe(true);
expect(await mainWindow.evaluate(async ({ text, recordedAt }) => {
  if (!window.markuprx.e2e) throw new Error('Electron test bridge is unavailable.');
  return window.markuprx.e2e.injectTranscript(text, recordedAt);
}, { text: comment, recordedAt: Date.now() })).toEqual({ success: true });
await mainWindow.waitForTimeout(2_200);
await mainWindow.getByRole('button', { name: 'Stop', exact: true }).click();
await expect(mainWindow.getByRole('heading', { name: 'Report Ready' }))
  .toBeVisible({ timeout: 60_000 });
```

Then assert the report contains `MX-001`, the exact comment, and `./screenshots/marked-issue-001.png`; assert metadata has one marked issue with that comment and screenshot path; assert the PNG is larger than 1,000 bytes.

- [ ] **Step 2: Run the isolated test**

Run:

```bash
npm run build:desktop
npx playwright test --grep "finalizes an unclicked marked area" --workers=1 --reporter=list
```

Expected: PASS. If it fails on product behavior, preserve the failure, diagnose it with `superpowers:systematic-debugging`, and make only the smallest test-driven production fix.

- [ ] **Step 3: Stress the stop-finalization path**

Run:

```bash
npx playwright test --grep "finalizes an unclicked marked area" --repeat-each=10 --workers=1 --reporter=list
```

Expected: 10 passed, 0 failed.

- [ ] **Step 4: Commit**

```bash
git add tests/ui/markuprx-electron.spec.ts
git commit -m "test: cover pending mark finalization on stop"
```

---

### Task 3: Cover back-to-back session isolation

**Files:**
- Modify: `tests/ui/markuprx-electron.spec.ts`

**Interfaces:**
- Consumes: the existing session launch, annotation, commit, output, and metadata helpers.
- Produces: an Electron test proving recorder, accumulator, artifacts, comments, and session identity reset between sessions.

- [ ] **Step 1: Write the functional test**

Add `keeps marked evidence isolated across back-to-back sessions` with a 120-second timeout. In one Electron application process:

1. Start a session, commit one issue with comment `First session checkout feedback.`, stop, and await `Report Ready`.
2. Start a second session, commit one issue with comment `Second session navigation feedback.`, stop, and await `Report Ready`.
3. Poll until the output root contains exactly two session directories.
4. Read both reports and metadata files.

Assert with literal expectations:

```ts
expect(new Set(metadata.map((entry) => entry.sessionId)).size).toBe(2);
expect(reports.filter((report) => report.includes(firstComment))).toHaveLength(1);
expect(reports.filter((report) => report.includes(secondComment))).toHaveLength(1);
expect(reports.every((report) => report.includes('./screenshots/marked-issue-001.png'))).toBe(true);
expect(metadata.every((entry) => entry.markedIssues.length === 1)).toBe(true);
```

For each session directory, assert `screenshots/marked-issue-001.png` is larger than 1,000 bytes. Also assert the first-comment report excludes the second comment and vice versa.

- [ ] **Step 2: Run the isolated test**

Run:

```bash
npm run build:desktop
npx playwright test --grep "back-to-back sessions" --workers=1 --reporter=list
```

Expected: PASS. A failure that shows cross-session state is a product defect and must be fixed under TDD rather than weakening assertions.

- [ ] **Step 3: Repeat for state-reset confidence**

Run:

```bash
npx playwright test --grep "back-to-back sessions" --repeat-each=5 --workers=1 --reporter=list
```

Expected: 5 passed, 0 failed.

- [ ] **Step 4: Commit**

```bash
git add tests/ui/markuprx-electron.spec.ts
git commit -m "test: verify back-to-back marked session isolation"
```

---

### Task 4: Add reusable packaged-app smoke verification

**Files:**
- Create: `scripts/smoke-packaged-app.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `MARKUPRX_PACKAGED_EXECUTABLE` when provided; otherwise the host-architecture macOS path under `release/`.
- Produces: `npm run test:package-smoke`, exiting nonzero if runtime identity, packaging, version, title, or onboarding is wrong.

- [ ] **Step 1: Add the smoke script**

Create a script that imports Playwright's `_electron`, creates isolated output/user-data/documents directories with `mkdtemp`, launches the package with the E2E environment, and evaluates:

```js
const applicationInfo = await application.evaluate(({ app }) => ({
  name: app.getName(),
  packaged: app.isPackaged,
  version: app.getVersion(),
}));
const arch = await application.evaluate(() => process.arch);
```

Fail unless `name === 'MarkuprX'`, `packaged === true`, `version === '3.0.0'`, the title contains `MarkuprX`, and the heading `Welcome to MarkuprX` is visible. Always close Electron and recursively remove only the created temporary root in `finally`. Print a compact JSON success object.

- [ ] **Step 2: Add the package script**

Add to `package.json`:

```json
"test:package-smoke": "node scripts/smoke-packaged-app.mjs"
```

- [ ] **Step 3: Exercise the real package**

Run:

```bash
npm run build
npm run package:mac:unsigned
npm run verify:package
npm run test:package-smoke
```

Expected: package verification passes and the smoke script reports an arm64 packaged MarkuprX 3.0.0 runtime on this host.

- [ ] **Step 4: Commit**

```bash
git add package.json scripts/smoke-packaged-app.mjs
git commit -m "test: add packaged MarkuprX launch smoke"
```

---

### Task 5: Run comprehensive regression and reinstall

**Files:**
- Modify: `docs/testing/2026-08-15-markuprx-verification-log.md`

**Interfaces:**
- Consumes: all application test/build/package scripts and the final arm64 bundle.
- Produces: fresh verification evidence and a running `/Applications/MarkuprX.app`.

- [ ] **Step 1: Run static, unit, integration, end-to-end, brand, and security checks**

Run:

```bash
npx vitest run --reporter=dot --silent
npm run typecheck
npm run lint
npm run verify:brand
npm audit --omit=dev --audit-level=low
```

Expected: all tests/typecheck/brand/audit pass; lint has zero errors and any warnings are listed in the verification log.

- [ ] **Step 2: Run the full Electron UI suite twice**

Run:

```bash
npm run build:desktop
npm run test:ui-electron
npm run test:ui-electron
```

Expected: every UI test passes on both runs, including accessibility, settings, selector, mouse passthrough behavior, pause/resume, coalesced input, fallback controls, recovery, multiple issues, pending stop, and back-to-back sessions.

- [ ] **Step 3: Rebuild and verify every deliverable**

Run:

```bash
npm run build
npm run package:mac:unsigned
npm run verify:package
npm run test:package-smoke
```

Expected: desktop/CLI/MCP builds pass, both macOS architectures package, native runtimes match their targets, and the arm64 package smoke passes.

- [ ] **Step 4: Update and commit the verification record**

Append the new test counts, repeat results, package identity, audit result, and any known non-error warnings to `docs/testing/2026-08-15-markuprx-verification-log.md`.

```bash
git add docs/testing/2026-08-15-markuprx-verification-log.md
git commit -m "test: record extended MarkuprX robustness checks"
```

- [ ] **Step 5: Install transactionally and launch**

Verify the source bundle first. If `/Applications/MarkuprX.app` exists, quit it and move it to a timestamped `/Applications/MarkuprX.app.backup-YYYYMMDD-HHMMSS`. Copy the verified `release/mac-arm64/MarkuprX.app` through an explicit staging path, move it to `/Applications/MarkuprX.app`, run `npm run test:package-smoke` with `MARKUPRX_PACKAGED_EXECUTABLE=/Applications/MarkuprX.app/Contents/MacOS/MarkuprX`, then launch it normally with `open /Applications/MarkuprX.app`.

- [ ] **Step 6: Final evidence**

Confirm:

```bash
git status --short --branch
git worktree list
plutil -extract CFBundleIdentifier raw /Applications/MarkuprX.app/Contents/Info.plist
plutil -extract CFBundleShortVersionString raw /Applications/MarkuprX.app/Contents/Info.plist
file /Applications/MarkuprX.app/Contents/MacOS/MarkuprX
pgrep -fl /Applications/MarkuprX.app/Contents/MacOS/MarkuprX
```

Expected: clean `main`, only the main worktree, bundle ID `com.eddiesanjuan.markuprx`, version `3.0.0`, arm64 executable, and a running installed process.

