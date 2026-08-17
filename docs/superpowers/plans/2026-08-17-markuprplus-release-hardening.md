# MarkuprPlus Release Hardening Implementation Plan

> **For Codex:** REQUIRED SKILL: Use `superpowers:subagent-driven-development` to execute this plan one task at a time, with a fresh implementer and an independent reviewer for every task. Use `superpowers:test-driven-development` for behavior changes and `superpowers:verification-before-completion` before every completion claim.

**Goal:** Ship MarkuprPlus from a reviewed commit whose source, Electron runtime, privileged filesystem/security boundaries, macOS and Windows packages, public documentation, and live GitHub checks all withstand release-level verification.

**Architecture:** Preserve the current Electron main/preload/renderer split and the retained `markuprx` compatibility interfaces. Add small pure security helpers at privileged boundaries, inject dependencies into destructive operations so they can be tested without touching user data, centralize BrowserWindow and permission policy, and make the same repository-owned verification commands drive local work, CI, nightly, and release workflows.

**Tech Stack:** Node.js 22.23.2, TypeScript 5.9, Electron 43, React 18, electron-vite 5, Vite 7, Vitest 4, Playwright Electron, ESLint 9 flat config, electron-builder 26, GitHub Actions, CodeQL v4.

---

## Global execution constraints

- Execute Task 1 as soon as the current portrait task is reviewed. Execute Tasks 2–8 only after the portrait-surface and public-rebrand plans are complete, because those tasks validate the final public product.
- Work in `/Users/hashfunction/workspace/markupr/.worktrees/portrait-popover-surfaces`; the controller alone fast-forwards and pushes reviewed commits to `git@github.com:hashfunction/MarkuprPlus.git`.
- Never stage or commit `.superpowers/sdd/**`.
- Never rewrite or force-push history.
- Keep `name`, npm binaries, MCP identifiers, IPC channels, environment variables, persistence paths, keychain service names, and compatibility filenames using the existing `markuprx` identity. Public-facing product, documentation, executable, installer, and repository metadata use MarkuprPlus.
- Never recursively delete a user-selected output root. Destructive tests operate only under a fresh temporary directory.
- Do not add a badge until its underlying check exists. Do not claim signing, notarization, coverage hosting, or a security result that was not observed.
- For every task: write the focused failing test first, capture the expected failure, implement only enough to pass it, run the focused test, run its broader affected suite, self-review the diff, commit, request independent review, fix critical/important findings, and request re-review.

## Intended final file structure

```text
.github/
  CODEOWNERS
  PULL_REQUEST_TEMPLATE.md
  dependabot.yml
  workflows/
    ci.yml
    codeql.yml
    dependency-review.yml
    deploy-landing.yml
    nightly.yml
    release.yml
    test-action.yml
.node-version
CONTRIBUTING.md
README.md
SECURITY.md
eslint.config.js
package.json
package-lock.json
scripts/
  release-check.mjs
  smoke-packaged-app.mjs
  verify-brand.mjs
  verify-package.mjs
  verify-workflows.mjs
src/main/
  ipc/outputHandlers.ts
  ipc/settingsHandlers.ts
  output/ExportService.ts
  security/BrowserSecurity.ts
  security/NavigationGuard.ts
  security/pathContainment.ts
  settings/SettingsManager.ts
  settings/clearApplicationData.ts
src/preload/index.ts
tests/
  e2e/settings.test.ts
  unit/brandAudit.test.ts
  unit/browserSecurity.test.ts
  unit/clearApplicationData.test.ts
  unit/exportService.test.ts
  unit/navigationGuard.test.ts
  unit/packageVerification.test.ts
  unit/pathContainment.test.ts
  unit/preloadMainFrame.test.ts
  unit/settingsIpcSecurity.test.ts
  unit/workflowAudit.test.ts
vitest.config.ts
```

## Task 1: Restore a truthful clean source gate

**Files:**

- Modify: `scripts/verify-brand.mjs`
- Modify: `tests/unit/brandAudit.test.ts`
- Modify: `vitest.config.ts`
- Modify: `package.json`

### Step 1: Add regression cases for the verifier

Refactor `verify-brand.mjs` so its repository scan policy can be imported without running the CLI. Export a function with this contract:

```js
export function findBrandViolations(files, readFile, packageJson) {
  // returns an array of stable, human-readable violation strings
}
```

Extend `tests/unit/brandAudit.test.ts` with in-memory cases proving:

```ts
expect(scan({ 'README.md': 'MarkuprPlus' })).toEqual([]);
expect(scan({ 'README.md': 'The old public mark-upr wordmark without a hyphen' }))
  .toContain('README.md:1');
expect(scan({ 'docs/superpowers/specs/history.md': 'markupr' })).toEqual([]);
expect(scan({ 'src/main/index.ts': 'markupr' })).toContain('src/main/index.ts:1');
```

Use the actual contiguous legacy spelling in the fixture by constructing it from `['mark', 'upr'].join('')`, so the repository-wide verifier does not reject its own test. The rule must treat `MarkuprPlus` as the new public name and exclude `docs/superpowers/**` because approved historical decision records intentionally discuss old and new names. It must continue scanning README, package metadata, site content, workflows, application source, tests, and release configuration.

### Step 2: Confirm the existing failure

Run:

```bash
npx vitest run tests/unit/brandAudit.test.ts
npm run verify:brand
```

Expected before implementation: the CLI test fails because the verifier flags approved plan/spec files and matches the `Markupr` prefix inside `MarkuprPlus`.

### Step 3: Implement explicit scan policy

Use an anchored suffix rule for the legacy public word instead of `(?!x)`. The negative lookahead must also exclude `plus`, case-insensitively:

```js
const previousBrand = new RegExp(`${previousMachineName}(?!x|plus)`, 'i');
const isDecisionRecord = (file) => file.startsWith('docs/superpowers/');
```

Skip decision records before filename/content checks. Retain the narrow migration-file allowlist, nonexistent-repository reference checks, exact compatibility binary checks, and executable CLI behavior. Do not broadly ignore `docs/**` or test fixtures.

Add `lcov` to the existing Vitest coverage reporters so the generated coverage set is internally complete even though no Codecov claim will be made:

```ts
reporter: ['text', 'text-summary', 'json', 'html', 'lcov'],
```

Add repository source verification scripts:

```json
"audit:prod": "npm audit --omit=dev --audit-level=high",
"verify:source": "npm run verify:brand && npm run lint && npm run typecheck && npm run test:ci && npm run build:desktop"
```

Keep the existing full-graph `audit` change for Task 2; at this stage `verify:source` must not hide the known dependency audit behind `--omit=dev`.

### Step 4: Verify and commit

Run:

```bash
npm run verify:brand
npx vitest run tests/unit/brandAudit.test.ts
npm run test:ci
git diff --check
```

Expected: the brand audit and all Vitest files pass and `coverage/lcov.info` exists.

Commit:

```bash
git add scripts/verify-brand.mjs tests/unit/brandAudit.test.ts vitest.config.ts package.json
git commit -m "fix: restore repository verification"
```

## Task 2: Modernize the build and test dependency graph

**Files:**

- Create: `.node-version`
- Create: `eslint.config.js`
- Delete: `.eslintrc.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vitest.config.ts`
- Modify: `CONTRIBUTING.md`

### Step 1: Record the vulnerable baseline

Run and save the console totals in the task report:

```bash
node --version
npm audit --json
npm ls electron electron-builder electron-vite vite vitest @vitest/coverage-v8 esbuild eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin typescript
```

Expected before implementation: the complete audit reports high and critical findings, Electron 28, electron-builder 24, Vitest 1, and ESLint 8.

### Step 2: Add configuration-contract tests before upgrading

Create a focused test in `tests/unit/toolchainConfig.test.ts` that parses `package.json`, `.node-version`, and the exported Vitest configuration and asserts:

- `.node-version` is exactly `22.23.2`;
- Electron is `^43.4.0`;
- electron-builder is `^26.15.3`;
- electron-vite is `^5.0.0`;
- Vite is `^7.3.6`;
- Vitest and coverage are both `^4.1.10`;
- esbuild is `^0.28.2`;
- ESLint is `^9.39.5`;
- both TypeScript ESLint packages are `^8.67.0`;
- TypeScript is `^5.9.3`;
- Vitest uses `pool: 'forks'`, `maxWorkers: 1`, and `isolate: false` and has no `poolOptions` property;
- the package engine remains `>=20.9.0`.

Run:

```bash
npx vitest run tests/unit/toolchainConfig.test.ts
```

Expected: FAIL on the old dependency and configuration values.

### Step 3: Upgrade exact compatible majors

Write `.node-version`:

```text
22.23.2
```

Update only these declared tool versions:

```json
"@typescript-eslint/eslint-plugin": "^8.67.0",
"@typescript-eslint/parser": "^8.67.0",
"@vitest/coverage-v8": "^4.1.10",
"electron": "^43.4.0",
"electron-builder": "^26.15.3",
"electron-vite": "^5.0.0",
"esbuild": "^0.28.2",
"eslint": "^9.39.5",
"eslint-plugin-react": "^7.37.5",
"eslint-plugin-react-hooks": "^7.1.1",
"typescript": "^5.9.3",
"vite": "^7.3.6",
"vitest": "^4.1.10"
```

Run `npm install` to regenerate the lockfile. Do not use `--force`, `--legacy-peer-deps`, or audit suppressions.

Replace the eslintrc file with an ESM flat config. Preserve the current TypeScript parser, React, hooks, browser/Node globals, ignored generated directories, and current rule severities. Change scripts to:

```json
"lint": "eslint src",
"lint:fix": "eslint src --fix"
```

Migrate Vitest 4 configuration:

```ts
pool: 'forks',
maxWorkers: 1,
isolate: false,
```

Remove `poolOptions`. Update contributor setup to Node 22.23.2 while documenting that the retained npm CLI engine remains Node 20.9+.

### Step 4: Resolve migration failures without weakening gates

Run in order:

```bash
npm ci
npm run lint
npm run typecheck
npx vitest run tests/unit/toolchainConfig.test.ts
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:ci
npm run build:desktop
npm audit --json
```

Fix source/configuration incompatibilities exposed by the new tools. Do not disable type-aware checks wholesale, lower coverage thresholds, exclude failing production files, or add audit exceptions. The full audit may retain moderate/low findings only if the task report identifies the advisory, affected surface, and a dated review deadline. It must contain zero high and zero critical findings.

Set scripts to enforce both scopes:

```json
"audit": "npm audit --audit-level=high",
"audit:prod": "npm audit --omit=dev --audit-level=high"
```

### Step 5: Verify and commit

Run:

```bash
npm ci
npm run verify:brand
npm run lint
npm run typecheck
npm run test:ci
npm run build:desktop
npm run audit
npm run audit:prod
git diff --check
```

Commit:

```bash
git add .node-version eslint.config.js .eslintrc.json package.json package-lock.json vitest.config.ts CONTRIBUTING.md tests/unit/toolchainConfig.test.ts
git commit -m "build: modernize release toolchain"
```

## Task 3: Constrain destructive filesystem and settings operations

**Files:**

- Create: `src/main/security/pathContainment.ts`
- Create: `src/main/settings/clearApplicationData.ts`
- Create: `tests/unit/pathContainment.test.ts`
- Create: `tests/unit/clearApplicationData.test.ts`
- Create: `tests/unit/settingsIpcSecurity.test.ts`
- Modify: `src/main/ipc/outputHandlers.ts`
- Modify: `src/main/ipc/settingsHandlers.ts`
- Modify: `src/main/settings/SettingsManager.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/types.ts`
- Modify: `src/renderer/components/settings/useSettingsPanel.ts`
- Modify: `tests/e2e/settings.test.ts`

### Step 1: Write containment exploit tests

Implement tests against a temporary tree containing `output/session-a`, sibling `output-escape`, and a symlink `output/session-link` pointing outside. Define the helper API before implementation:

```ts
export function isPathInside(root: string, candidate: string, allowRoot = false): boolean;
export async function resolveContainedExistingPath(
  root: string,
  candidate: string,
  allowRoot?: boolean,
): Promise<string | null>;
```

Assertions:

```ts
expect(isPathInside(root, join(root, 'session-a'))).toBe(true);
expect(isPathInside(root, root)).toBe(false);
expect(isPathInside(root, root, true)).toBe(true);
expect(isPathInside(root, `${root}-escape`)).toBe(false);
expect(isPathInside(root, join(root, '..', 'outside'))).toBe(false);
expect(await resolveContainedExistingPath(root, escapingSymlink)).toBeNull();
```

Run and observe the missing-module failure:

```bash
npx vitest run tests/unit/pathContainment.test.ts
```

### Step 2: Implement one shared containment primitive

Use `path.resolve` and `path.relative` for lexical containment. Reject an empty relative unless `allowRoot` is true; reject a relative that equals `..`, starts with `..${sep}`, or is absolute. For existing destructive targets, compare `fs.realpath(root)` and `fs.realpath(candidate)` using the same rule. A missing root or candidate returns `null`; it does not fall back to an unchecked path.

Replace every output open/delete path check based on `startsWith` with the helper. Opening the output root itself remains allowed; session deletion does not. Validate the actual listed session directory rather than trusting a renderer-supplied folder. Reject a sibling-prefix and escaping symlink with `{ success: false, error: 'Invalid session path' }`.

### Step 3: Write safe-clear tests

Define an injected function:

```ts
export interface ClearApplicationDataResult {
  deleted: string[];
  failed: Array<{ path: string; error: string }>;
}

export async function clearOwnedApplicationData(deps: {
  outputRoot: string;
  listSessions: () => Promise<Array<{ dir: string }>>;
  removePath?: typeof rm;
}): Promise<ClearApplicationDataResult>;
```

Tests must prove:

- two listed real child session directories are removed;
- the output root remains;
- an unrelated file and unrelated directory under the root remain;
- a listed sibling-prefix path is rejected and remains;
- a listed escaping symlink is rejected and its target remains;
- one removal failure is returned in `failed` while the remaining safe session is still attempted;
- no call ever invokes `rm` on the output root.

Run:

```bash
npx vitest run tests/unit/clearApplicationData.test.ts
```

Expected: FAIL before implementation.

### Step 4: Return visible structured clear results

Implement the injected function and call it from `SETTINGS_CLEAR_ALL_DATA`. Delete only directories returned by `fileManager.listSessions()` that pass the realpath containment check. Then attempt both API-key deletions and append failures using stable labels such as `key:openai`. Only after owned-file and key deletion attempts should the handler reset settings, crash recovery, and session state.

Change the preload/shared API result from `void` to `ClearApplicationDataResult`. In Settings, show success only when `failed.length === 0`; on partial failure show how many items could not be removed and keep the action retryable. Do not expose absolute failed paths in renderer copy; map them to safe item labels in the IPC result.

### Step 5: Whitelist runtime setting keys

In `settingsHandlers.ts`, create:

```ts
const SETTING_KEYS = new Set<keyof AppSettings>(
  Object.keys(DEFAULT_SETTINGS) as Array<keyof AppSettings>,
);

function isSettingKey(value: unknown): value is keyof AppSettings {
  return typeof value === 'string' && SETTING_KEYS.has(value as keyof AppSettings);
}
```

Reject unknown keys on both `SETTINGS_GET` and `SETTINGS_SET`; do not allow `__proto__`, `constructor`, or arbitrary computed properties. Tests invoke the registered handlers with invalid keys and prove neither the manager nor object prototype changes.

### Step 6: Fail closed for production secrets

Refactor `SettingsManager` secret writes behind explicit storage adapters. The write algorithm is:

1. try keytar;
2. if keytar is unavailable/fails and Electron `safeStorage.isEncryptionAvailable()` is true, write the encrypted value to the settings store;
3. if both fail, throw `SecureStorageUnavailableError` and leave both the old stored value and settings object unchanged.

Plaintext fallback is allowed only when `MARKUPRX_E2E === '1'` and the Electron app is not packaged. On read, a legacy plaintext key must be written to a secure store and then removed from plaintext only after the secure write succeeds. If migration fails, return the legacy value for that session but retain it and log a warning so data is not destroyed; no new plaintext write occurs.

Extend existing SettingsManager tests for keytar success, safeStorage success, both failing, atomic legacy migration success, and failed migration retention. Never place a real-looking API key in fixtures.

### Step 7: Verify and commit

Run:

```bash
npx vitest run tests/unit/pathContainment.test.ts tests/unit/clearApplicationData.test.ts tests/unit/settingsIpcSecurity.test.ts tests/e2e/settings.test.ts
npx vitest run tests/unit/exportService.test.ts tests/unit/exportServiceExpanded.test.ts
npm run typecheck
npm run lint
npm run test:ci
git diff --check
```

Commit:

```bash
git add src/main/security/pathContainment.ts src/main/settings/clearApplicationData.ts src/main/ipc/outputHandlers.ts src/main/ipc/settingsHandlers.ts src/main/settings/SettingsManager.ts src/shared/types.ts src/preload/index.ts src/preload/types.ts src/renderer/components/settings/useSettingsPanel.ts tests/unit/pathContainment.test.ts tests/unit/clearApplicationData.test.ts tests/unit/settingsIpcSecurity.test.ts tests/e2e/settings.test.ts
git commit -m "security: constrain data and secret operations"
```

## Task 4: Centralize Electron window, navigation, and permission policy

**Files:**

- Create: `src/main/security/BrowserSecurity.ts`
- Create: `tests/unit/browserSecurity.test.ts`
- Create: `tests/unit/preloadMainFrame.test.ts`
- Modify: `src/main/security/NavigationGuard.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/windows/PopoverManager.ts`
- Modify: `src/main/capture/CaptureOverlayManager.ts`
- Modify: `src/main/output/ExportService.ts`
- Modify: `src/preload/index.ts`
- Modify: `tests/unit/navigationGuard.test.ts`
- Modify: `tests/unit/exportService.test.ts`
- Modify: `tests/unit/exportServiceExpanded.test.ts`

### Step 1: Write explicit preference and permission tests

Define pure helpers:

```ts
export const SECURE_WEB_PREFERENCES: Readonly<Electron.WebPreferences>;
export function secureWebPreferences(
  additions?: Pick<Electron.WebPreferences, 'preload' | 'partition'>,
): Electron.WebPreferences;
export function isTrustedRendererURL(rawUrl: string, devOrigin?: string): boolean;
export function installPermissionPolicy(
  electronSession: Pick<Electron.Session, 'setPermissionRequestHandler' | 'setPermissionCheckHandler'>,
  devOrigin?: string,
): void;
```

Tests prove caller additions cannot override:

```ts
nodeIntegration: false
contextIsolation: true
sandbox: true
webSecurity: true
webviewTag: false
navigateOnDragDrop: false
```

Permission tests allow only `media` from the exact packaged renderer (`file:` URL under the built renderer root) or exact configured development origin, reject subdomain/lookalike origins, and reject all other permission names. Clipboard, notifications, geolocation, MIDI, pointer lock, openExternal, and unknown strings are denied.

### Step 2: Harden navigation with redirect coverage

Extend the NavigationGuard harness to capture `will-navigate`, `will-redirect`, `will-attach-webview`, and `setWindowOpenHandler`. Assert:

- every in-app navigation and redirect is prevented;
- every webview is prevented;
- an HTTPS popup is denied in-app and passed once to `shell.openExternal`;
- HTTP, file, data, JavaScript, custom protocols, credentials in URL, and malformed URLs are denied without external launch;
- `shell.openExternal` rejection is caught.

Implement one `openTrustedExternalURL` helper that accepts only parseable `https:` URLs with a nonempty hostname and no username/password. Keep trusted system-settings launches outside this generic path.

### Step 3: Apply the central window policy

Replace duplicated BrowserWindow preference fragments in the main window, `PopoverManager`, capture/annotation overlay, and any other repository-owned window with `secureWebPreferences({ preload })`. Spread caller-specific values before the fixed security values so the fixed values win.

Call `installPermissionPolicy(session.defaultSession, developmentOrigin)` once after Electron readiness and before renderer load. Preserve legitimate microphone/screen-capture behavior: operating-system capture authorization remains in `PermissionManager`; Chromium `media` permission is allowed only to the owned renderer.

Do not enable remote content, webviews, arbitrary partitions, or Node integration to repair a failing test.

### Step 4: Constrain preload to the main frame

Guard bridge exposure:

```ts
if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('markuprx', api);
}
```

The test stubs `process.isMainFrame` false and true, imports the preload module in isolation, and proves exposure occurs exactly once only for the true case.

### Step 5: Harden generated PDF rendering

Construct the hidden PDF BrowserWindow with `secureWebPreferences()` plus `javascript: false`. Add a CSP meta element to generated HTML equivalent to:

```html
default-src 'none'; img-src data: file:; style-src 'unsafe-inline'; font-src data:
```

Keep all user-provided content HTML-escaped. Tests inspect BrowserWindow arguments and generated HTML, and prove a payload containing `<script>` and `</style>` appears only escaped while the CSP remains intact.

### Step 6: Verify and commit

Run:

```bash
npx vitest run tests/unit/browserSecurity.test.ts tests/unit/navigationGuard.test.ts tests/unit/preloadMainFrame.test.ts tests/unit/exportService.test.ts tests/unit/exportServiceExpanded.test.ts tests/unit/captureOverlayManager.test.ts
npm run typecheck
npm run lint
npm run test:ci
npm run build:desktop
npm run test:ui-electron
git diff --check
```

Commit:

```bash
git add src/main/security/BrowserSecurity.ts src/main/security/NavigationGuard.ts src/main/index.ts src/main/windows/PopoverManager.ts src/main/capture/CaptureOverlayManager.ts src/main/output/ExportService.ts src/preload/index.ts tests/unit/browserSecurity.test.ts tests/unit/navigationGuard.test.ts tests/unit/preloadMainFrame.test.ts tests/unit/exportService.test.ts tests/unit/exportServiceExpanded.test.ts
git commit -m "security: harden Electron renderer boundaries"
```

## Task 5: Make package verification portable and behavioral

**Files:**

- Modify: `scripts/verify-package.mjs`
- Modify: `scripts/smoke-packaged-app.mjs`
- Create: `tests/unit/packageVerification.test.ts`
- Modify: `electron-builder.yml`
- Modify: `package.json`

### Step 1: Reproduce platform-classification failures in unit tests

Refactor `verify-package.mjs` to export pure helpers without executing its CLI:

```js
export function classifyArtifactPath(pathname) {
  return { platform: 'mac' | 'win', arch: 'arm64' | 'x64' } | null;
}
export function expectedPublicMetadata() {
  return { productName: 'MarkuprPlus', appId: 'com.eddiesanjuan.markuprx' };
}
```

Add fixtures for:

- `release/mac-arm64/MarkuprPlus.app`;
- `release/mac-x64/MarkuprPlus.app`;
- electron-builder's `release/mac/MarkuprPlus.app` default x64 output;
- Windows unpacked x64 executable;
- filenames containing the retained lowercase machine identity only in allowed internal locations;
- stale public `MarkuprX` executable/installer metadata, which must fail.

Run the focused test and observe failure before refactoring.

### Step 2: Verify actual native runtime and metadata

For each discovered unpacked app, verify:

- Electron executable exists;
- `app.asar` exists;
- keytar and sharp native binaries exist for the artifact architecture;
- macOS uses `file`/Mach-O inspection and Windows uses PE machine inspection or electron-builder metadata available on the runner;
- `package.json` and electron-builder metadata expose MarkuprPlus while keeping the legacy app ID;
- no public installer/executable/desktop shortcut uses MarkuprX;
- updater owner/repository is `hashfunction/MarkuprPlus` when present.

The script exits nonzero if no supported unpacked artifact is found. It prints one deterministic line per verified target.

### Step 3: Isolate and repeat packaged-app smoke

Update `smoke-packaged-app.mjs` so every launch receives a new temporary `userData` directory and test-only output directory through explicit E2E arguments/environment. It must wait for a positive readiness signal from the packaged app, verify portrait window bounds, then request graceful quit. A timeout is failure and always terminates the spawned child before removing only its validated temporary directory.

Add scripts:

```json
"verify:package": "node scripts/verify-package.mjs",
"test:package-smoke": "node scripts/smoke-packaged-app.mjs",
"test:package-smoke:twice": "npm run test:package-smoke && npm run test:package-smoke"
```

Ensure `prebuild:win` runs before Windows packaging and that `electron-builder.yml` points to generated installer assets that exist on a clean Windows runner.

### Step 4: Build fresh host packages

Remove only the explicit repository build output `release/` after resolving its absolute path and confirming it is under the worktree. Then run:

```bash
npm run build
npm run package:mac:unsigned -- --publish never
npm run verify:package
npm run test:package-smoke:twice
```

On a non-macOS host, perform the host-equivalent package and leave macOS smoke to GitHub. Do not report an unrun platform as passed.

### Step 5: Verify and commit

Run:

```bash
npx vitest run tests/unit/packageVerification.test.ts tests/unit/nativeRuntimePackaging.test.ts
npm run typecheck
npm run lint
npm run build
npm run verify:package
npm run test:package-smoke:twice
git diff --check
```

Commit:

```bash
git add scripts/verify-package.mjs scripts/smoke-packaged-app.mjs tests/unit/packageVerification.test.ts electron-builder.yml package.json
git commit -m "build: verify packaged MarkuprPlus runtime"
```

## Task 6: Add immutable, least-privilege GitHub gates

**Files:**

- Create: `.github/workflows/codeql.yml`
- Create: `.github/workflows/dependency-review.yml`
- Create: `scripts/verify-workflows.mjs`
- Create: `tests/unit/workflowAudit.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/nightly.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `.github/workflows/test-action.yml`
- Modify: `.github/workflows/deploy-landing.yml`
- Modify: `.github/dependabot.yml`
- Modify: `package.json`

### Step 1: Write a repository workflow audit

Make `verify-workflows.mjs` export:

```js
export function findWorkflowViolations(entries) {
  return string[];
}
```

Its CLI scans every `.yml` and `.yaml` under `.github/workflows`. Tests prove it rejects:

- `uses: actions/checkout@v6`;
- a 39- or 41-character pseudo-SHA;
- missing top-level `permissions:`;
- `permissions: write-all`;
- a remote reusable workflow pinned to a tag;
- a floating Docker action tag.

It accepts local `uses: ./...` and full lowercase 40-hex SHAs followed by a version comment. It also checks that `ci.yml`, `codeql.yml`, and `dependency-review.yml` exist.

Add:

```json
"verify:workflows": "node scripts/verify-workflows.mjs"
```

Run the focused test and CLI. Expected before workflow changes: FAIL on mutable action tags and missing policy.

### Step 2: Rebuild CI around repository-owned gates

Use Node `22.23.2`, `permissions: contents: read`, and concurrency cancellation. Pin actions to these reviewed commits with comments:

```yaml
actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6
actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6
actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f # v6
actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131 # v7
```

The CI workflow contains:

1. `validate`: `npm ci`, brand audit, workflow audit, lint, typecheck, full audit, production audit, desktop build;
2. `test`: full Vitest coverage and upload `coverage/` as a GitHub artifact;
3. `electron-ui`: real Electron suite on macOS and diagnostics on failure;
4. `package`: a fail-fast-false macOS/Windows matrix that uses clean `npm ci`, runs Windows prebuild when needed, builds unsigned with `--publish never`, runs package verification, and uploads artifacts;
5. `package-smoke`: host-architecture macOS package plus two packaged launches;
6. `ci-success`: `if: always()` and explicit success checks for every required job.

Do not cache `node_modules`. Setup-node's npm download cache is sufficient. Remove the unconfigured Codecov action; retain coverage as an immutable run artifact.

### Step 3: Add CodeQL and dependency review

`codeql.yml` runs on pushes to main, pull requests to main, weekly schedule, and manual dispatch. Use:

```yaml
github/codeql-action/init@ff2f1c621b7f889edc0d3c761ac2e6a3f8cdb0dd # v4.37.7
github/codeql-action/analyze@ff2f1c621b7f889edc0d3c761ac2e6a3f8cdb0dd # v4.37.7
```

Matrix languages are `javascript-typescript` and `actions`. Apply `queries: security-extended` to JavaScript/TypeScript. Top level has `contents: read`; the analysis job adds only `security-events: write`, `packages: read`, and `actions: read` if CodeQL requires them.

`dependency-review.yml` runs only on pull requests, top-level `contents: read`, and uses:

```yaml
actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294 # v5.0.0
```

Set `fail-on-severity: high`, comment summary disabled unless write permission is intentionally granted, and no vulnerability allowlist.

### Step 4: Pin all remaining workflows and minimize permissions

Use the reviewed commits:

```yaml
actions/cache@caa296126883cff596d87d8935842f9db880ef25 # v5
actions/configure-pages@983d7736d9b0ae728b81ab479565c72886d7745b # v5
actions/upload-pages-artifact@7b1f4a764d45c48632c6b24a0339c27f5614fb0b # v4
actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e # v4
softprops/action-gh-release@3bb12739c298aeb8a4eeaf626c5b8d85266b0e65 # v2
```

Replace a third-party nightly deletion action with authenticated `gh` CLI commands under explicit `actions: write` permission, scoped to the named nightly workflow/artifacts. Release gets `contents: write` only in the publication job. Pages gets `pages: write` and `id-token: write` only in deploy. Test-action stays read-only. Every build path runs the same `npm run audit`, `npm run build`, and `npm run verify:package` commands as CI.

Update Dependabot to weekly npm and GitHub Actions checks, each limited to five open PRs. Group non-security development tooling by ecosystem while allowing security updates to arrive independently.

### Step 5: Validate workflow syntax and behavior

Run:

```bash
npx vitest run tests/unit/workflowAudit.test.ts
npm run verify:workflows
npm run verify:brand
npm run lint
npm run typecheck
npm run test:ci
git diff --check
```

If `actionlint` is available, also run `actionlint`. Otherwise parse every workflow with an installed YAML parser in a one-off read-only command and record that limitation; do not silently skip syntax validation.

Commit:

```bash
git add .github/workflows .github/dependabot.yml scripts/verify-workflows.mjs tests/unit/workflowAudit.test.ts package.json
git commit -m "ci: add release security gates"
```

## Task 7: Polish public trust documentation and badges

**Files:**

- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `CONTRIBUTING.md`
- Modify: `.github/CODEOWNERS`
- Modify: `.github/PULL_REQUEST_TEMPLATE.md`
- Modify: `.github/ISSUE_TEMPLATE/config.yml`
- Modify: `scripts/verify-brand.mjs`
- Modify: `tests/unit/brandAudit.test.ts`

### Step 1: Extend the public-metadata audit

Add exact assertions to the brand audit for:

- repository: `https://github.com/hashfunction/MarkuprPlus`;
- issues: `https://github.com/hashfunction/MarkuprPlus/issues`;
- homepage/help: `https://markuprplus.com`;
- product name and description: MarkuprPlus;
- compatibility fields: npm `name`, bins, MCP name, app ID, and legacy migration paths remain unchanged;
- README references `actions/workflows/ci.yml`, `codeql.yml`, `release.yml`, latest releases, GitHub downloads, npm `markuprx`, MIT license, and the existing funding destination;
- README has no Codecov or static passing/security badge;
- README embeds the five tracked 460×680 screenshots from the rebrand plan;
- CODEOWNERS contains `@hashfunction` and no stale owner;
- SECURITY supports the 3.x release and directs private vulnerability reports through GitHub private vulnerability reporting when available, with GitHub Security Advisories as the canonical link.

Run the focused test. Expected: FAIL until public policy files are updated.

### Step 2: Restore truthful original-style badges

At the top of README, point badges to real endpoints:

- CI workflow on `main`;
- CodeQL workflow on `main`;
- Release workflow;
- latest GitHub release;
- total release downloads;
- npm version for `markuprx`;
- npm monthly downloads for `markuprx`;
- MIT license;
- current funding link, only if `.github/FUNDING.yml` still defines it.

Keep the README's “significantly enhanced evolution of markupr” provenance statement and all five real UI screenshots. Explain clearly that the desktop product is MarkuprPlus while CLI/MCP compatibility commands remain `markuprx`.

### Step 3: Update contributor and security policy

Document Node 22.23.2, `npm ci`, source verification, real Electron tests, package verification, audits, and the no-force-push/no-secret rule. The pull request template requires:

- tests added/updated;
- source gate passed;
- full audit passed;
- Electron test run when UI/main/preload changes;
- package verification when packaging/native dependencies change;
- screenshots for public UI changes;
- no secrets or unrelated generated artifacts.

Set CODEOWNERS to `* @hashfunction` and add narrower workflow/security ownership only if the same valid owner applies. Add issue-template configuration links for Help at `https://markuprplus.com` and Contact at the MarkuprPlus new-issue URL. Do not advertise an email that the user has not approved.

### Step 4: Verify and commit

Run:

```bash
npm run verify:brand
npx vitest run tests/unit/brandAudit.test.ts
npm run verify:workflows
npm run lint
npm run typecheck
git diff --check
```

Open every badge/image/link target or query it over HTTPS and record its status. A workflow badge may return “no status” before its first run; the referenced workflow and URL must still exist.

Commit:

```bash
git add README.md SECURITY.md CONTRIBUTING.md .github/CODEOWNERS .github/PULL_REQUEST_TEMPLATE.md .github/ISSUE_TEMPLATE/config.yml scripts/verify-brand.mjs tests/unit/brandAudit.test.ts
git commit -m "docs: polish MarkuprPlus release trust"
```

## Task 8: Create one reproducible release gate and final evidence

**Files:**

- Create: `scripts/release-check.mjs`
- Create: `tests/unit/releaseCheck.test.ts`
- Modify: `package.json`
- Create: `docs/release/2026-08-17-verification.md`

### Step 1: Test command orchestration without running it

Export a command manifest from `release-check.mjs`:

```js
export const SOURCE_GATE = [
  ['npm', ['run', 'verify:brand']],
  ['npm', ['run', 'verify:workflows']],
  ['npm', ['run', 'lint']],
  ['npm', ['run', 'typecheck']],
  ['npm', ['run', 'test:ci']],
  ['npm', ['run', 'build:desktop']],
  ['npm', ['run', 'audit']],
  ['npm', ['run', 'audit:prod']],
];
```

The script accepts `--source`, `--electron`, `--package`, or `--all`. The Electron mode runs Playwright three separate times, not one command with hidden retries. Package mode runs build, host package, package verification, and two separate smoke launches. It stops on first failure, preserves subprocess exit codes, prints the failed command, and never deletes outside the validated repository `release/` directory.

Unit tests inject a command runner and prove exact ordering, three Electron invocations, two smoke invocations, and stop-on-first-failure.

### Step 2: Add package scripts

```json
"verify:release:source": "node scripts/release-check.mjs --source",
"verify:release:electron": "node scripts/release-check.mjs --electron",
"verify:release:package": "node scripts/release-check.mjs --package",
"verify:release": "node scripts/release-check.mjs --all"
```

The orchestrator must call existing npm scripts; do not duplicate their logic or hide output.

### Step 3: Verify orchestrator and commit

Run:

```bash
npx vitest run tests/unit/releaseCheck.test.ts
npm run verify:release:source
git diff --check
```

Commit code before producing final evidence:

```bash
git add scripts/release-check.mjs tests/unit/releaseCheck.test.ts package.json
git commit -m "build: add reproducible release gate"
```

### Step 4: Run clean verification on the exact candidate

Record `git rev-parse HEAD`. Remove only untracked generated build/test outputs after resolving and validating each path under the worktree; preserve every tracked file and user change. Then run:

```bash
npm ci
npm run verify:release:source
npm run verify:release:electron
npm run verify:release:package
```

Run `npm audit --json` and `npm audit --omit=dev --json` once more and record totals. Search packaged/public artifacts for stale public MarkuprX branding and obvious secret patterns; distinguish approved compatibility identifiers from public violations.

Create `docs/release/2026-08-17-verification.md` with:

- exact candidate SHA;
- Node/npm/platform versions;
- each command and exit status;
- Vitest file/test counts and coverage summary;
- each of the three independent Electron run counts;
- package paths, architectures, metadata-verification results, and both smoke runs;
- audit severity totals;
- accepted lower-severity findings with rationale/deadline, or “none”;
- signing/notarization status reported separately;
- GitHub CI, CodeQL, and release run URLs once observed;
- independent review SHAs and dispositions.

Commit only the evidence that already exists locally:

```bash
git add docs/release/2026-08-17-verification.md
git commit -m "docs: record MarkuprPlus release verification"
```

## Final controller procedure: review, publish, and observe

This procedure is not delegated to an implementer.

1. Read and apply `superpowers:requesting-code-review`.
2. Send the complete diff from the pre-portrait base through final candidate to a fresh whole-branch reviewer. Require findings grouped as Critical, Important, Minor, with file/line evidence and test gaps. The reviewer does not edit or push.
3. Send the same candidate to a different security reviewer with the trust model from the design. Require explicit review of BrowserWindow preferences, preload/IPC sender/origin assumptions, navigation/redirects, permission policy, secrets, settings import, deletion/path/symlinks, shell/child processes, generated HTML/PDF, updater, packaging, dependencies, and workflows.
4. Assign every critical/important finding to a fresh implementer with a focused failing regression test. Re-run the corresponding reviewer on the fix range. Repeat until both reviewers approve with no unresolved critical/important finding.
5. Read and apply `superpowers:verification-before-completion`. Re-run the clean source gate, three Electron passes, fresh package verification, two packaged smokes, full audit, production audit, brand audit, and workflow audit on the new reviewed HEAD.
6. Fast-forward the root `main` worktree to the reviewed feature head. Confirm `git status --short`, `git log --oneline --decorate -12`, `git remote -v`, and `git merge-base --is-ancestor` before pushing. Push normally to `git@github.com:hashfunction/MarkuprPlus.git`; never force.
7. Observe the GitHub API/workflow pages for that exact SHA until CI and CodeQL reach terminal state. Confirm macOS package, Windows package, Electron UI, source/test, aggregate CI, and both CodeQL matrix entries are green. If a job fails, download/read its logs, reproduce when possible, fix by TDD, review, rerun every affected local gate, push the new reviewed SHA, and observe again.
8. Open the public README and verify all five screenshots and every badge render against MarkuprPlus. Open Help and Contact from the tray test or real packaged app and confirm HTTPS/domain/issue routing.
9. Update the verification document with final run URLs/results, repeat its review, commit, push, and ensure documentation-only CI/CodeQL remain green.
10. Read and apply `superpowers:finishing-a-development-branch`. Because the user already selected merge, leave `main` fast-forwarded with all preserved history and report the exact final SHA, tests, audits, packages, review outcomes, run URLs, and any remaining non-blocking risk such as absent signing credentials.

## Definition of done

- Portrait, rebrand, and hardening specifications are all implemented on the same reviewed `main` history.
- `npm audit` and `npm audit --omit=dev` contain zero high and zero critical findings.
- Clear All Data cannot remove the selected root, unrelated children, sibling-prefix paths, or symlink targets.
- New production API-key writes cannot fall back to plaintext.
- Every owned BrowserWindow, redirect/navigation path, preload exposure, generated PDF, and renderer permission uses the tested restrictive policy.
- The source gate, three real Electron passes, host package verification, and two packaged smoke launches pass on the exact final commit.
- GitHub CI, macOS, Windows, Electron UI, aggregate CI, and CodeQL are green on the exact final commit.
- README badges and five screenshots render from the public MarkuprPlus repository.
- Independent code and security reviews have no unresolved critical or important finding.
- `origin` is `git@github.com:hashfunction/MarkuprPlus.git`, all prior history is preserved, and no force push occurred.
