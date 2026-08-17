# MarkuprPlus Public Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present the application and its current public materials as MarkuprPlus, preserve every MarkuprX machine-facing compatibility contract, and publish five real portrait screenshots in a README that explains MarkuprPlus as a significantly enhanced evolution of markupr.

**Architecture:** A shared public-brand module supplies the runtime name and public destinations, while a small main-process adapter pins the existing user-data location before applying the new visible app name. Public UI, output, packaging, documentation, and marketing consume the new identity; machine-facing package/API/IPC/storage names remain unchanged. A syntax-aware audit distinguishes visible string literals from allowed compatibility identifiers, and deterministic Electron screenshots become stable README assets.

**Tech Stack:** Electron 28, React 18, TypeScript 5.3, Node.js ESM, Vitest 1, Playwright Electron, electron-builder, CSS/HTML/Markdown

## Global Constraints

- The public product name is exactly `MarkuprPlus`.
- Website and Help use exactly `https://markuprplus.com`.
- Contact uses exactly `https://github.com/hashfunction/MarkuprPlus/issues/new`.
- Source repository metadata uses exactly `https://github.com/hashfunction/MarkuprPlus`.
- Keep npm package `markuprx`, binaries `markuprx` and `markuprx-mcp`, MCP ID `com.markuprx/markuprx`, `window.markuprx`, `markuprx:` IPC channels, `MARKUPRX_` environment variables, current storage/keychain names, `.markuprx` file extension, and real published integration paths unchanged.
- Keep `appId: com.eddiesanjuan.markuprx` unchanged.
- Keep the existing MarkuprX user-data directory for production upgrades; an explicit Electron test-harness directory always wins.
- Historical changelog entries, completed plans/specs, archived release records, and Git history retain historically accurate names.
- Current public documents may show lower-case `markuprx` only when labeling a retained command, package, registry ID, extension, or real integration path.
- Add no runtime dependency.
- Curated README screenshots are exactly 460 by 680 pixels and contain no machine-specific paths, timestamps, or visible MarkuprX copy.
- Write a failing focused test before each production behavior change.
- Commit each independently passing task; the controller pushes reviewed commits to `origin/main` without force-push.

## Execution Dependency

Execute this plan after the portrait-popover plan has completed its Settings, History, Shortcuts, Review, contained-dialog, and tray tasks. Its screenshot task consumes those completed surfaces. If the portrait plan's final screenshot task already ran, refresh the visual snapshots after the public rebrand rather than retaining stale MarkuprX images.

## File Structure

- Create `src/shared/publicBrand.ts`: canonical public product name and external destinations.
- Create `src/main/runtimeBrand.ts`: apply the visible runtime name while preserving the legacy production user-data path.
- Create `tests/unit/publicBrand.test.ts`: exact constant and runtime-path contract.
- Create `tests/unit/publicPackagingMetadata.test.ts`: package/electron-builder public identity and stable machine-identity assertions.
- Create `scripts/verify-public-brand.mjs`: syntax-aware source/public-document brand audit and screenshot/image-path verification.
- Create `tests/unit/publicBrandAudit.test.ts`: audit behavior against controlled fixtures.
- Create `docs/images/markuprplus/*.png`: five curated portrait screenshots.
- Modify desktop, CLI, MCP, integration, and output files that contain current user-visible product copy.
- Modify packaging, installer source, brand verification, package verification, and smoke scripts.
- Modify README, current guides, website/landing pages, active launch copy, GitHub metadata, examples, and Action display copy.

---

### Task 1: Public Brand Contract and Stable Runtime Data Path

**Files:**
- Create: `src/shared/publicBrand.ts`
- Create: `src/main/runtimeBrand.ts`
- Create: `tests/unit/publicBrand.test.ts`
- Modify: `src/main/bootstrap.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Produces: `PUBLIC_BRAND_NAME`, `PUBLIC_WEBSITE_URL`, `PUBLIC_REPOSITORY_URL`, `PUBLIC_CONTACT_URL`, `LEGACY_USER_DATA_DIRECTORY_NAME`, `RuntimeBrandApp`, and `configureRuntimeBrand(app, preserveLegacyUserData)`.
- Preserves: the test harness's explicit path and production's existing `MarkuprX` user-data directory.

- [ ] **Step 1: Write the failing public-brand and runtime-path tests**

Create `tests/unit/publicBrand.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  LEGACY_USER_DATA_DIRECTORY_NAME,
  PUBLIC_BRAND_NAME,
  PUBLIC_CONTACT_URL,
  PUBLIC_REPOSITORY_URL,
  PUBLIC_WEBSITE_URL,
} from '../../src/shared/publicBrand';
import { configureRuntimeBrand } from '../../src/main/runtimeBrand';

describe('MarkuprPlus public brand contract', () => {
  it('publishes the approved product name and destinations', () => {
    expect(PUBLIC_BRAND_NAME).toBe('MarkuprPlus');
    expect(PUBLIC_WEBSITE_URL).toBe('https://markuprplus.com');
    expect(PUBLIC_REPOSITORY_URL).toBe('https://github.com/hashfunction/MarkuprPlus');
    expect(PUBLIC_CONTACT_URL).toBe(
      'https://github.com/hashfunction/MarkuprPlus/issues/new',
    );
    expect(LEGACY_USER_DATA_DIRECTORY_NAME).toBe('MarkuprX');
  });

  it('sets the public name while retaining the production user-data directory', () => {
    const app = {
      getPath: vi.fn((name: string) => {
        if (name === 'appData') return '/Users/example/Library/Application Support';
        if (name === 'userData') return '/new/default';
        throw new Error('Unexpected path: ' + name);
      }),
      setName: vi.fn(),
      setPath: vi.fn(),
    };

    configureRuntimeBrand(app, true);

    expect(app.setName).toHaveBeenCalledWith('MarkuprPlus');
    expect(app.setPath).toHaveBeenCalledWith(
      'userData',
      '/Users/example/Library/Application Support/MarkuprX',
    );
  });

  it('does not replace an isolated test-harness user-data path', () => {
    const app = {
      getPath: vi.fn(() => '/isolated/harness'),
      setName: vi.fn(),
      setPath: vi.fn(),
    };

    configureRuntimeBrand(app, false);

    expect(app.setName).toHaveBeenCalledWith('MarkuprPlus');
    expect(app.setPath).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing modules fail**

Run: `npm run test:unit -- --run tests/unit/publicBrand.test.ts`

Expected: FAIL because `src/shared/publicBrand.ts` and `src/main/runtimeBrand.ts` do not exist.

- [ ] **Step 3: Add the exact public brand contract**

Create `src/shared/publicBrand.ts`:

```ts
export const PUBLIC_BRAND_NAME = 'MarkuprPlus';
export const PUBLIC_WEBSITE_URL = 'https://markuprplus.com';
export const PUBLIC_REPOSITORY_URL =
  'https://github.com/hashfunction/MarkuprPlus';
export const PUBLIC_CONTACT_URL =
  'https://github.com/hashfunction/MarkuprPlus/issues/new';

// This is a compatibility identifier, not current public branding.
export const LEGACY_USER_DATA_DIRECTORY_NAME = 'MarkuprX';
```

Create `src/main/runtimeBrand.ts`:

```ts
import { join } from 'node:path';
import {
  LEGACY_USER_DATA_DIRECTORY_NAME,
  PUBLIC_BRAND_NAME,
} from '../shared/publicBrand';

export interface RuntimeBrandApp {
  getPath(name: 'appData' | 'userData'): string;
  setName(name: string): void;
  setPath(name: 'userData', path: string): void;
}

export function configureRuntimeBrand(
  app: RuntimeBrandApp,
  preserveLegacyUserData: boolean,
): void {
  if (preserveLegacyUserData) {
    app.setPath(
      'userData',
      join(app.getPath('appData'), LEGACY_USER_DATA_DIRECTORY_NAME),
    );
  }
  app.setName(PUBLIC_BRAND_NAME);
}
```

- [ ] **Step 4: Apply the runtime identity before main initialization**

In `src/main/bootstrap.ts`, import `configureRuntimeBrand`. After the existing test-harness path block and before `await import('./index')`, call:

```ts
configureRuntimeBrand(app, !testHarnessAllowed);
```

Remove `app.setName('MarkuprX')` from `src/main/index.ts`. Do not rename environment variables or modify the harness's path assignments.

- [ ] **Step 5: Run focused, existing harness, and static checks**

Run: `npm run test:unit -- --run tests/unit/publicBrand.test.ts tests/unit/electronTestHarness.test.ts`

Expected: PASS with the production legacy path and isolated harness behavior both covered.

Run: `npm run typecheck && npm run lint`

Expected: PASS with no new warnings.

- [ ] **Step 6: Commit**

```bash
git add src/shared/publicBrand.ts src/main/runtimeBrand.ts src/main/bootstrap.ts src/main/index.ts tests/unit/publicBrand.test.ts
git commit -m "feat: establish MarkuprPlus public identity"
```

---

### Task 2: Desktop UI, Menus, Errors, and Accessibility Copy

**Files:**
- Modify: `src/main/ErrorHandler.ts`
- Modify: `src/main/MenuManager.ts`
- Modify: `src/main/PermissionManager.ts`
- Modify: `src/main/TrayManager.ts`
- Modify: `src/main/trayContextMenu.ts`
- Modify: `src/main/e2e/ElectronTestHarness.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc/settingsHandlers.ts`
- Modify: `src/main/platform/WindowsTaskbar.ts`
- Modify: `src/main/settings/SettingsManager.ts`
- Modify: `src/main/transcription/WhisperCppRunner.ts`
- Modify: `src/main/windows/TaskbarIntegration.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/assets/logo.svg`
- Modify: `src/renderer/assets/logo-dark.svg`
- Modify: `src/renderer/audio/AudioCaptureRenderer.ts`
- Modify: `src/renderer/capture/ScreenRecordingRenderer.ts`
- Modify: `src/renderer/components/CrashRecoveryDialog.tsx`
- Modify: `src/renderer/components/KeyboardShortcuts.tsx`
- Modify: `src/renderer/components/ModelDownloadDialog.tsx`
- Modify: `src/renderer/components/Onboarding.tsx`
- Modify: `src/renderer/components/SessionReview.tsx`
- Modify: `src/renderer/components/SettingsPanel.tsx`
- Modify: `src/renderer/components/TranscriptionTierSelector.tsx`
- Modify: `src/renderer/components/UpdateNotification.tsx`
- Modify: `src/renderer/components/settings/AppearanceTab.tsx`
- Modify: `src/renderer/components/settings/GeneralTab.tsx`
- Modify: `src/renderer/components/settings/HotkeysTab.tsx`
- Modify: `src/renderer/components/settings/analysisProviderOptions.ts`
- Modify: `src/renderer/components/settings/analysisProviderViewState.ts`
- Modify: `src/renderer/donateMessages.ts`
- Modify: `src/renderer/overlays/SelectionOverlay.tsx`
- Modify: `src/shared/hotkeys.ts`
- Modify: `tests/ui/markuprx-electron.spec.ts`
- Modify: `tests/unit/analysisProviderViewState.test.ts`
- Modify: `tests/unit/electronTestHarness.test.ts`
- Modify: `tests/unit/navigationGuard.test.ts`
- Modify: `tests/unit/trayContextMenu.test.ts`

**Interfaces:**
- Consumes: public-brand constants from Task 1 and tray-template interfaces from the portrait plan.
- Produces: visible MarkuprPlus copy throughout the desktop application while leaving `window.markuprx`, IPC, storage, and lower-case command identifiers unchanged.

- [ ] **Step 1: Add failing real-Electron public-copy assertions**

In `tests/ui/markuprx-electron.spec.ts`, add:

```ts
test('presents MarkuprPlus as the public desktop brand', async () => {
  const launched = await launchApplication(harness);
  application = launched.application;
  const window = launched.mainWindow;

  await expect(window.getByText('MarkuprPlus', { exact: true }).first()).toBeVisible();
  const runtimeName = await application.evaluate(({ app }) => app.getName());
  expect(runtimeName).toBe('MarkuprPlus');

  await window.getByRole('button', { name: 'Open Settings' }).click();
  await expect(window.getByText(/MarkuprPlus v/)).toBeVisible();
  await expect(window.getByRole('button', { name: 'Back to MarkuprPlus' })).toBeVisible();
  expect(await window.locator('body').innerText()).not.toContain('MarkuprX');
});
```

Extend `tests/unit/trayContextMenu.test.ts` to assert `About MarkuprPlus`, `Quit MarkuprPlus` on macOS, `Exit MarkuprPlus` on Windows/Linux, `PUBLIC_WEBSITE_URL` for Help, and `PUBLIC_CONTACT_URL` for Contact.

- [ ] **Step 2: Run the focused UI and tray tests and verify stale copy fails**

Run: `npm run test:unit -- --run tests/unit/trayContextMenu.test.ts && npm run build:desktop && npm run test:ui-electron -- --grep "public desktop brand"`

Expected: FAIL on old MarkuprX labels and/or destinations.

- [ ] **Step 3: Update native menus and main-process visible copy**

Use `PUBLIC_BRAND_NAME`, `PUBLIC_WEBSITE_URL`, and `PUBLIC_CONTACT_URL` in native menu/tray builders. Set the tray items to:

```ts
{ label: 'Help', click: externalAction('help', PUBLIC_WEBSITE_URL, actions) },
{ label: 'Contact', click: externalAction('contact', PUBLIC_CONTACT_URL, actions) },
{ label: 'About MarkuprPlus', role: 'about' },
{
  label: platform === 'darwin' ? 'Quit MarkuprPlus' : 'Exit MarkuprPlus',
  accelerator: 'CmdOrCtrl+Q',
  click: actions.quit,
},
```

Change human-facing permission prompts, taskbar descriptions, notifications, import/export dialog titles, fatal-load HTML, and reinstall/restart guidance in the listed main-process files from MarkuprX to MarkuprPlus. Change settings export's default filename to `MarkuprPlus-settings.json`; importing existing files remains supported because import has no filename restriction.

Keep log prefixes, internal class/type names, the legacy user-data constant, and `markuprx:` channel values unchanged.

- [ ] **Step 4: Update renderer-visible copy and wordmarks**

Replace visible product labels in the listed renderer files with MarkuprPlus. Required exact changes include:

```tsx
<p className="ff-shell__eyebrow">MarkuprPlus</p>
```

```tsx
backLabel="Back to MarkuprPlus"
```

```tsx
'MarkuprPlus ' + (s.appVersion ? 'v' + s.appVersion : '')
```

Change shortcut copy to `Exit MarkuprPlus`, onboarding to `Welcome to MarkuprPlus setup`, the selection overlay label to `Choose what MarkuprPlus should record`, and all settings descriptions/donation messages to MarkuprPlus. Update the renderer document title, crash-recovery copy, model-download copy, review attribution, transcription-selector copy, update notification, test-fixture canvas/display labels, and public-facing renderer log text. Update only the `<text>` content in both logo SVG files; preserve geometry, typography, colors, and view boxes.

- [ ] **Step 5: Run UI, menu, accessibility, and static checks**

Run: `npm run test:unit -- --run tests/unit/trayContextMenu.test.ts tests/unit/analysisProviderViewState.test.ts tests/unit/electronTestHarness.test.ts tests/unit/navigationGuard.test.ts`

Expected: PASS.

Run: `npm run build:desktop && npm run test:ui-electron -- --grep "public desktop brand|approved portrait surface|accessibility violations"`

Expected: PASS with no visible MarkuprX copy.

Run: `npm run typecheck && npm run lint`

Expected: PASS with no new warnings.

- [ ] **Step 6: Commit**

```bash
git add src/main src/renderer/App.tsx src/renderer/index.html src/renderer/assets src/renderer/audio/AudioCaptureRenderer.ts src/renderer/capture/ScreenRecordingRenderer.ts src/renderer/components src/renderer/donateMessages.ts src/renderer/overlays/SelectionOverlay.tsx src/shared/hotkeys.ts tests/ui/markuprx-electron.spec.ts tests/unit/analysisProviderViewState.test.ts tests/unit/electronTestHarness.test.ts tests/unit/navigationGuard.test.ts tests/unit/trayContextMenu.test.ts
git commit -m "feat: rebrand desktop surfaces as MarkuprPlus"
```

---

### Task 3: Generated Output, CLI, MCP, and Integration Copy

**Files:**
- Modify: `src/cli/doctor.ts`
- Modify: `src/cli/index.ts`
- Modify: `src/integrations/github/GitHubIssueCreator.ts`
- Modify: `src/integrations/github/types.ts`
- Modify: `src/integrations/linear/LinearIssueCreator.ts`
- Modify: `src/main/ai/analysisContract.ts`
- Modify: `src/main/ai/StructuredMarkdownBuilder.ts`
- Modify: `src/main/output/ClipboardService.ts`
- Modify: `src/main/output/MarkdownGenerator.ts`
- Modify: `src/main/output/MarkdownPatcher.ts`
- Modify: `src/main/output/templates/github-issue.ts`
- Modify: `src/main/output/templates/html-template.ts`
- Modify: `src/main/output/templates/jira.ts`
- Modify: `src/main/output/templates/json.ts`
- Modify: `src/main/output/templates/linear.ts`
- Modify: `src/main/output/templates/markdown.ts`
- Modify: `src/mcp/index.ts`
- Modify: `src/mcp/server.ts`
- Modify: `src/mcp/tools/analyzeVideo.ts`
- Modify: `src/mcp/tools/captureWithVoice.ts`
- Modify: `src/mcp/tools/pushToGitHub.ts`
- Modify: `src/mcp/tools/pushToLinear.ts`
- Modify: `src/mcp/tools/stopRecording.ts`
- Modify: `src/mcp/utils/Logger.ts`
- Modify: `tests/unit/cli.test.ts`
- Modify: `tests/unit/integrations/github/GitHubIssueCreator.test.ts`
- Modify: `tests/unit/integrations/linear/LinearIssueCreator.test.ts`
- Modify: `tests/unit/markdownGeneratorExpanded.test.ts`
- Modify: `tests/unit/mcp/server.test.ts`
- Modify: `tests/unit/templates/templates.test.ts`

**Interfaces:**
- Consumes: `PUBLIC_BRAND_NAME` and `PUBLIC_WEBSITE_URL`.
- Preserves: lower-case command/package/MCP machine identifiers and TypeScript API names such as `MarkuprXConfig` and `parseMarkuprXReport`.
- Produces: MarkuprPlus human-readable attribution in every generated or externally delivered artifact.

- [ ] **Step 1: Write failing output-attribution assertions**

In existing Markdown/template/integration tests, assert generated output contains:

```ts
expect(output).toContain('[MarkuprPlus](https://markuprplus.com)');
expect(output).not.toContain('[MarkuprX]');
expect(output).not.toContain('https://markuprx.com');
```

In `tests/unit/mcp/server.test.ts`, keep the registry/package identifier assertions unchanged and change only the human-readable server-name assertion to:

```ts
expect(server).toHaveProperty('name', 'MarkuprPlus');
```

Add CLI help assertions that output mentions MarkuprPlus while the command remains named `markuprx`.

- [ ] **Step 2: Run focused output/CLI/MCP tests and verify old attribution fails**

Run: `npm run test:unit -- --run tests/unit/markdownGeneratorExpanded.test.ts tests/unit/templates/templates.test.ts tests/unit/integrations/github/GitHubIssueCreator.test.ts tests/unit/integrations/linear/LinearIssueCreator.test.ts tests/unit/mcp/server.test.ts tests/unit/cli.test.ts`

Expected: FAIL on old visible branding; machine-identifier assertions remain green.

- [ ] **Step 3: Update human-readable output and integration copy**

Use public-brand constants in generated Markdown/HTML/integration attribution. Required forms:

```md
*Generated by [MarkuprPlus](https://markuprplus.com)*
```

```html
<meta name="generator" content="MarkuprPlus">
```

```json
"generator": "MarkuprPlus"
```

Change clipboard titles, fallback source name, transcription guidance, GitHub app display metadata, Linear footer, CLI descriptions/hints, structured-analysis attribution, MCP startup/log display text, MCP server display name, and MCP tool descriptions to MarkuprPlus.

Do not rename `MarkuprXConfig`, `parseMarkuprXReport`, the `.markuprx.json` config filename, the command name, package name, or MCP registry ID.

- [ ] **Step 4: Run focused and static checks**

Run: `npm run test:unit -- --run tests/unit/markdownGeneratorExpanded.test.ts tests/unit/templates/templates.test.ts tests/unit/integrations/github/GitHubIssueCreator.test.ts tests/unit/integrations/linear/LinearIssueCreator.test.ts tests/unit/mcp/server.test.ts tests/unit/cli.test.ts`

Expected: PASS.

Run: `npm run build:cli && npm run build:mcp && npm run typecheck && npm run lint`

Expected: CLI and MCP builds pass; no new warnings.

- [ ] **Step 5: Commit**

```bash
git add src/cli src/integrations src/main/ai/analysisContract.ts src/main/ai/StructuredMarkdownBuilder.ts src/main/output src/mcp tests/unit/cli.test.ts tests/unit/integrations tests/unit/markdownGeneratorExpanded.test.ts tests/unit/mcp/server.test.ts tests/unit/templates/templates.test.ts
git commit -m "feat: brand public output as MarkuprPlus"
```

---

### Task 4: Packaging, Installer, and Release Metadata

**Files:**
- Create: `tests/unit/publicPackagingMetadata.test.ts`
- Modify: `package.json`
- Modify: `electron-builder.yml`
- Modify: `assets/svg-source/dmg-background.svg`
- Modify: `assets/logo-400.png`
- Modify: `build/DMG_BACKGROUND_SPEC.md`
- Modify: `scripts/generate-icons.mjs`
- Modify: `scripts/generate-installer-images.cjs`
- Modify: `scripts/generate-og-image.mjs`
- Modify: `scripts/smoke-packaged-app.mjs`
- Modify: `scripts/verify-brand.mjs`
- Modify: `scripts/verify-package.mjs`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: public brand contract values.
- Produces: MarkuprPlus app/installer/artifact display identity while preserving package, app ID, extension, and binary compatibility.

- [ ] **Step 1: Write the failing package-metadata contract test**

Create `tests/unit/publicPackagingMetadata.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('public packaging identity', () => {
  it('ships MarkuprPlus while retaining machine-facing compatibility', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    const builder = readFileSync('electron-builder.yml', 'utf8');

    expect(packageJson.name).toBe('markuprx');
    expect(packageJson.productName).toBe('MarkuprPlus');
    expect(packageJson.homepage).toBe('https://markuprplus.com');
    expect(packageJson.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/hashfunction/MarkuprPlus.git',
    });
    expect(packageJson.bugs).toEqual({
      url: 'https://github.com/hashfunction/MarkuprPlus/issues',
    });
    expect(Object.keys(packageJson.bin)).toEqual(['markuprx', 'markuprx-mcp']);
    expect(packageJson.mcpName).toBe('com.markuprx/markuprx');

    expect(builder).toContain('appId: com.eddiesanjuan.markuprx');
    expect(builder).toContain('productName: MarkuprPlus');
    expect(builder).toContain('executableName: MarkuprPlus');
    expect(builder).toContain('name: MarkuprPlus Session');
    expect(builder).toContain('ext: markuprx');
    expect(builder).toContain('shortcutName: "MarkuprPlus"');
    expect(builder).toContain('artifactName: "markuprplus-${version}-${arch}.dmg"');
    expect(builder).toContain('artifactName: "markuprplus-Setup-${version}.exe"');
  });
});
```

- [ ] **Step 2: Run the metadata test and verify old product identity fails**

Run: `npm run test:unit -- --run tests/unit/publicPackagingMetadata.test.ts`

Expected: FAIL on `productName`, homepage/repository metadata, and builder display fields.

- [ ] **Step 3: Update package and electron-builder metadata**

Set these `package.json` fields without changing `name`, `bin`, or `mcpName`:

```json
{
  "productName": "MarkuprPlus",
  "homepage": "https://markuprplus.com",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/hashfunction/MarkuprPlus.git"
  },
  "bugs": {
    "url": "https://github.com/hashfunction/MarkuprPlus/issues"
  }
}
```

Update `electron-builder.yml`:

```yaml
appId: com.eddiesanjuan.markuprx
productName: MarkuprPlus
executableName: MarkuprPlus
```

Use `Install MarkuprPlus ${arch}`, `MarkuprPlus` publisher/shortcut labels, `MarkuprPlus Session`, `markuprplus-${version}-${arch}.dmg`, and `markuprplus-Setup-${version}.exe`. Keep `ext: markuprx`.

- [ ] **Step 4: Update installer source, generators, verification, and changelog**

Change visible labels and expected packaged executable/artifact names in the listed scripts and source assets. Extend `scripts/generate-icons.mjs` with `generateMarketplaceLogo()` that renders `src/renderer/assets/logo.svg` into the existing 400-by-400 transparent `assets/logo-400.png`, and call it from `main()`. Do not rename environment variables, script filenames, the setup script, temporary-path prefixes, or machine identifiers.

Add a top changelog section:

```md
## Unreleased — MarkuprPlus

- Rebranded the public desktop experience and documentation as MarkuprPlus.
- Preserved existing `markuprx` CLI, MCP, IPC, storage, and package compatibility.
- Added a portrait-first taskbar popover experience and new README screenshot gallery.
```

Update `scripts/verify-brand.mjs` expected `productName`, repository, bugs, and homepage values. Replace its old rule forbidding repository metadata with exact MarkuprPlus repository checks.

- [ ] **Step 5: Regenerate source-derived installer artwork and run checks**

Run: `npm run generate:icons && npm run generate:installer-images`

Expected: generated installer assets use MarkuprPlus copy.

Run: `npm run test:unit -- --run tests/unit/publicPackagingMetadata.test.ts && npm run verify:brand && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json electron-builder.yml assets/logo-400.png assets/svg-source/dmg-background.svg build scripts CHANGELOG.md tests/unit/publicPackagingMetadata.test.ts
git commit -m "build: package the app as MarkuprPlus"
```

---

### Task 5: Deterministic Public Screenshot Assets

**Files:**
- Modify: `tests/ui/markuprx-electron.spec.ts`
- Create: `docs/images/markuprplus/settings.png`
- Create: `docs/images/markuprplus/session-history.png`
- Create: `docs/images/markuprplus/keyboard-shortcuts.png`
- Create: `docs/images/markuprplus/review-editor.png`
- Create: `docs/images/markuprplus/onboarding.png`
- Modify: `tests/ui/markuprx-electron.spec.ts-snapshots/*.png`

**Interfaces:**
- Consumes: completed portrait surfaces, deterministic Electron harness, and MarkuprPlus visible copy.
- Produces: five stable 460-by-680 public images plus refreshed Playwright visual-regression snapshots.

- [ ] **Step 1: Add failing curated-image dimension and existence assertions**

Extend the UI test helpers with:

```ts
const publicScreenshotRoot = join(applicationRoot, 'docs', 'images', 'markuprplus');

async function writePublicScreenshot(
  page: Page,
  filename: string,
  mask: Locator[] = [],
): Promise<void> {
  await mkdir(publicScreenshotRoot, { recursive: true });
  await page.screenshot({
    path: join(publicScreenshotRoot, filename),
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    mask,
  });
}
```

Add a verification test after the five surface workflows:

```ts
test('writes five MarkuprPlus README screenshots at portrait dimensions', async () => {
  const names = [
    'settings.png',
    'session-history.png',
    'keyboard-shortcuts.png',
    'review-editor.png',
    'onboarding.png',
  ];
  for (const name of names) {
    const metadata = await sharp(join(publicScreenshotRoot, name)).metadata();
    expect({ width: metadata.width, height: metadata.height }).toEqual({
      width: 460,
      height: 680,
    });
  }
});
```

Extend the existing `@playwright/test` import with `type Locator`, extend the
existing `node:fs/promises` import with `mkdir`, and retain the existing
default `sharp` import.

- [ ] **Step 2: Run the image assertion and verify missing assets fail**

Run: `npm run build:desktop && npm run test:ui-electron -- --grep "README screenshots"`

Expected: FAIL because the curated images do not exist.

- [ ] **Step 3: Capture each stable surface**

Call `writePublicScreenshot` only after each existing Settings, History,
Shortcuts, Review, and onboarding workflow reaches its deterministic stable
state. Mask paths, timestamps, thumbnails, and changing version/download
values. Before every capture, inspect `body.innerText` plus all `aria-label`
values; assert the combined accessible copy contains `MarkuprPlus` and does
not contain `MarkuprX`. Dedicated surfaces satisfy the positive assertion
through their `Back to MarkuprPlus` control even when their visible heading is
feature-specific.

Use these exact filenames:

```ts
await writePublicScreenshot(window, 'settings.png');
await writePublicScreenshot(window, 'session-history.png', historyMasks);
await writePublicScreenshot(window, 'keyboard-shortcuts.png');
await writePublicScreenshot(window, 'review-editor.png', reviewMasks);
await writePublicScreenshot(window, 'onboarding.png');
```

- [ ] **Step 4: Refresh visual snapshots and inspect all images**

Run: `npm run build:desktop && npm run test:ui-electron -- --update-snapshots`

Expected: PASS and update only the declared portrait snapshots/public images.

Open all five curated PNG files and verify readable MarkuprPlus copy, complete controls, no clipping, no horizontal overflow, stable fixture content, and consistent visual language.

- [ ] **Step 5: Re-run screenshots without update mode**

Run: `npm run test:ui-electron`

Expected: PASS with no snapshot diff.

- [ ] **Step 6: Commit**

```bash
git add tests/ui/markuprx-electron.spec.ts tests/ui/markuprx-electron.spec.ts-snapshots docs/images/markuprplus
git commit -m "docs: add MarkuprPlus product screenshots"
```

---

### Task 6: README and Current Public Guides

**Files:**
- Create: `scripts/verify-public-brand.mjs`
- Create: `tests/unit/publicBrandAudit.test.ts`
- Modify: `README.md`
- Modify: `README-MCP.md`
- Modify: `CLAUDE.md`
- Modify: `CODE_OF_CONDUCT.md`
- Modify: `CONTRIBUTING.md`
- Modify: `PRODUCT_VISION.md`
- Modify: `SECURITY.md`
- Modify: `SIGNING_INSTRUCTIONS.md`
- Modify: `llms-install.md`
- Modify: `docs/AI_AGENT_QUICKSTART.md`
- Modify: `docs/AI_PIPELINE_DESIGN.md`
- Modify: `docs/API.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/CONFIGURATION.md`
- Modify: `docs/DEVELOPMENT.md`
- Modify: `docs/EXPORT_FORMATS.md`
- Modify: `docs/GETTING_STARTED.md`
- Modify: `docs/KEYBOARD_SHORTCUTS.md`
- Modify: `docs/TROUBLESHOOTING.md`
- Modify: `examples/cli-output-example.md`
- Modify: `examples/feedback-session-example.md`
- Modify: `examples/github-action-examples/basic-pr-feedback.yml`
- Modify: `examples/github-action-examples/qa-pipeline.yml`
- Modify: `examples/github-action-examples/visual-regression.yml`
- Modify: `examples/mcp-session-example.md`

**Interfaces:**
- Consumes: curated image paths from Task 5 and the compatibility contract.
- Produces: current public documentation that presents MarkuprPlus while keeping executable commands and real integration paths accurate.

- [ ] **Step 1: Add a failing README/public-guide audit fixture**

Create `tests/unit/publicBrandAudit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { auditPublicText } from '../../scripts/verify-public-brand.mjs';

describe('public brand audit', () => {
  it('rejects stale current-product and website copy', () => {
    expect(auditPublicText('README.md', '<h1>MarkuprX</h1>')).toContain(
      'README.md:1: stale public product name',
    );
    expect(auditPublicText('README.md', 'https://markuprx.com')).toContain(
      'README.md:1: stale public website',
    );
  });

  it('allows retained lower-case compatibility commands', () => {
    expect(auditPublicText('README.md', 'Run `npx markuprx analyze`')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the focused audit test and verify stale public copy fails**

Run: `npm run test:unit -- --run tests/unit/publicBrandAudit.test.ts`

Expected: FAIL until the audit helper exists and identifies stale copy.

Create `scripts/verify-public-brand.mjs` with this initial public-text audit:

```js
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const CURRENT_PUBLIC_TEXT_FILES = [
  'README.md',
  'README-MCP.md',
  'CLAUDE.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'PRODUCT_VISION.md',
  'SECURITY.md',
  'SIGNING_INSTRUCTIONS.md',
  'llms-install.md',
  'docs/AI_AGENT_QUICKSTART.md',
  'docs/AI_PIPELINE_DESIGN.md',
  'docs/API.md',
  'docs/ARCHITECTURE.md',
  'docs/CONFIGURATION.md',
  'docs/DEVELOPMENT.md',
  'docs/EXPORT_FORMATS.md',
  'docs/GETTING_STARTED.md',
  'docs/KEYBOARD_SHORTCUTS.md',
  'docs/TROUBLESHOOTING.md',
  'examples/cli-output-example.md',
  'examples/feedback-session-example.md',
  'examples/github-action-examples/basic-pr-feedback.yml',
  'examples/github-action-examples/qa-pipeline.yml',
  'examples/github-action-examples/visual-regression.yml',
  'examples/mcp-session-example.md',
];

export function auditPublicText(file, content) {
  const findings = [];
  content.split(/\r?\n/).forEach((line, index) => {
    if (/\bMarkuprX\b/.test(line)) {
      findings.push(`${file}:${index + 1}: stale public product name`);
    }
    if (/https?:\/\/[^\s)"']*markuprx\.com/i.test(line)) {
      findings.push(`${file}:${index + 1}: stale public website`);
    }
  });
  return findings;
}

export function auditCurrentPublicTextFiles() {
  return CURRENT_PUBLIC_TEXT_FILES.flatMap((file) =>
    auditPublicText(file, readFileSync(file, 'utf8')),
  );
}

if (process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const findings = auditCurrentPublicTextFiles();
  if (findings.length > 0) {
    findings.slice(0, 200).forEach((finding) => console.error(`- ${finding}`));
    if (findings.length > 200) {
      console.error(`- ...and ${findings.length - 200} more`);
    }
    process.exitCode = 1;
  } else {
    console.log('Public documentation brand audit passed.');
  }
}
```

- [ ] **Step 3: Rewrite the README hero and enhanced-from-markupr section**

Set the logo alt and heading to MarkuprPlus, link the website and repository, and keep npm badges pointed at the compatible `markuprx` package.

Insert after the introduction:

```md
## Significantly enhanced from markupr

MarkuprPlus is a significantly enhanced evolution of [markupr](https://github.com/hashfunction/markupr), retaining its fast screen-and-voice feedback workflow while expanding it into a resilient desktop, CLI, and MCP toolchain for AI coding agents.

- Portrait taskbar-popover UX across Settings, Session History, Keyboard Shortcuts, Review, onboarding, completion, and error states
- Live multi-issue annotation with context-aware screenshots
- Editable session review, export, history, and direct issue delivery
- Local Whisper transcription plus selectable local and hosted analysis providers
- Crash recovery, deterministic capture handling, CLI, MCP, and GitHub/Linear integrations

> Compatibility: the published npm package, CLI, and MCP binaries remain `markuprx` and `markuprx-mcp`.
```

Replace the old demo block near the top with this exact gallery:

```html
<table>
  <tr>
    <td align="center"><img src="docs/images/markuprplus/settings.png" width="320" alt="MarkuprPlus portrait Settings with a horizontal section rail"><br><sub>Settings</sub></td>
    <td align="center"><img src="docs/images/markuprplus/session-history.png" width="320" alt="MarkuprPlus portrait Session History with visible session actions"><br><sub>Session History</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/images/markuprplus/keyboard-shortcuts.png" width="320" alt="MarkuprPlus portrait Keyboard Shortcuts editor"><br><sub>Keyboard Shortcuts</sub></td>
    <td align="center"><img src="docs/images/markuprplus/review-editor.png" width="320" alt="MarkuprPlus portrait Review Editor with feedback cards"><br><sub>Review Editor</sub></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><img src="docs/images/markuprplus/onboarding.png" width="320" alt="MarkuprPlus contained onboarding wizard"><br><sub>Onboarding</sub></td>
  </tr>
</table>
```

Use `https://markuprplus.com` for public distribution/home links and `https://github.com/hashfunction/MarkuprPlus` for source links. Keep all commands and npm/GitHub Action paths operational.

- [ ] **Step 4: Update current guides and examples**

Replace MarkuprX as the current product name with MarkuprPlus in every listed guide/example. Replace stale `markuprx.com` website links with `markuprplus.com`. Do not change lower-case commands, package names, `.markuprx` filenames/extensions, `window.markuprx` code examples, MCP ID, or real `eddiesanjuan/markuprx-action` paths. Add a one-sentence compatibility note before the first lower-case command in README-MCP and `llms-install.md`.

- [ ] **Step 5: Run documentation audit and link/image checks**

Run: `npm run test:unit -- --run tests/unit/publicBrandAudit.test.ts`

Expected: PASS.

Run: `node scripts/verify-public-brand.mjs && npm run verify:brand`

Expected: PASS with all five README image paths present and no stale current-brand website link.

- [ ] **Step 6: Commit**

```bash
git add README.md README-MCP.md CLAUDE.md CODE_OF_CONDUCT.md CONTRIBUTING.md PRODUCT_VISION.md SECURITY.md SIGNING_INSTRUCTIONS.md llms-install.md docs examples scripts/verify-public-brand.mjs tests/unit/publicBrandAudit.test.ts
git commit -m "docs: present MarkuprPlus as the enhanced markupr"
```

---

### Task 7: Website, Marketing, GitHub, and Action Copy

**Files:**
- Modify: `site/index.html`
- Modify: `site/launch.html`
- Modify: `site/robots.txt`
- Modify: `site/sitemap.xml`
- Modify: `site/server.js`
- Modify: `docs/landing/index.html`
- Modify: `docs/landing/script.js`
- Modify: `docs/landing/styles.css`
- Modify: `launch-content/ONE-CLICK-KIT.md`
- Modify: `launch-content/devto-article.md`
- Modify: `launch-content/hackernews.md`
- Modify: `launch-content/mcp-submissions.md`
- Modify: `launch-content/product-hunt.md`
- Modify: `launch-content/reddit-posts.md`
- Modify: `launch-content/submission-status.md`
- Modify: `launch-content/twitter-thread.md`
- Modify: `launch-content/video-script.md`
- Modify: `.plans/distribution-3-week-plan.md`
- Modify: `.plans/launch-blog-post-devto.md`
- Modify: `.plans/launch-blog-post-hashnode.md`
- Modify: `.plans/launch-blog-post.md`
- Modify: `.plans/launch-content.md`
- Modify: `.plans/mcp-submissions.md`
- Modify: `.github/ISSUE_TEMPLATE/bug_report.md`
- Modify: `.github/ISSUE_TEMPLATE/feature_request.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/deploy-landing.yml`
- Modify: `.github/workflows/nightly.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `.github/workflows/test-action.yml`
- Modify: `markuprx-action/README.md`
- Modify: `markuprx-action/action.yml`

**Interfaces:**
- Consumes: approved public name/URLs and retained package/action paths.
- Produces: MarkuprPlus current marketing, SEO, issue templates, workflow display labels, and Action display identity.

- [ ] **Step 1: Extend the public-text audit with marketing paths and run RED**

Add every file listed in this task to `CURRENT_PUBLIC_TEXT_FILES`. Extend
`auditPublicText` to reject case-sensitive `MarkuprX`, case-insensitive
`markuprx.com`, and these obsolete source repository forms:

```js
const obsoleteRepositoryPatterns = [
  /github\.com\/eddiesanjuan\/markuprx(?:[/?#]|$)/i,
  /github\.com\/hashfunction\/markuprx(?:[/?#]|$)/i,
];
```

Do not flag lower-case package/command/action paths.

Run: `node scripts/verify-public-brand.mjs`

Expected: FAIL with stale website/marketing copy before the rewrite.

- [ ] **Step 2: Update website and landing metadata**

Use MarkuprPlus in titles, headings, image alt text, structured data, Open Graph/Twitter text, and download copy. Use `https://markuprplus.com` for canonical, Open Graph, sitemap, robots, and public links. Keep asset filenames and server routes unchanged unless they are visible labels.

- [ ] **Step 3: Update active launch and social material**

Present MarkuprPlus as the current product in every listed `.plans/` and `launch-content/` file. Preserve working commands and external package/action URLs. Replace claims that link the product itself to `markuprx.com` with `markuprplus.com`, and update source links to `hashfunction/MarkuprPlus`.

- [ ] **Step 4: Update GitHub and Action display metadata**

Use MarkuprPlus in issue-template prompts, workflow names, job/artifact display labels, release copy, Action `name`, Action `description`, and Action README prose. Keep the `markuprx-action` directory, published Action path, CLI invocation, npm package, and compatibility environment variables unchanged.

- [ ] **Step 5: Run brand, site, and workflow checks**

Run: `node scripts/verify-public-brand.mjs && npm run verify:brand`

Expected: PASS.

Run: `npm run test:unit -- --run tests/unit/brandAudit.test.ts tests/unit/publicBrandAudit.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: desktop, CLI, MCP, and static assets build successfully.

- [ ] **Step 6: Commit**

```bash
git add site docs/landing launch-content .plans .github markuprx-action scripts/verify-public-brand.mjs tests/unit/publicBrandAudit.test.ts
git commit -m "docs: rebrand public marketing as MarkuprPlus"
```

---

### Task 8: Syntax-Aware Brand Audit and Full Release Verification

**Files:**
- Modify: `scripts/verify-public-brand.mjs`
- Modify: `scripts/verify-brand.mjs`
- Modify: `tests/unit/publicBrandAudit.test.ts`
- Modify: `tests/unit/brandAudit.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: all prior public/compatibility decisions and curated screenshots.
- Produces: `npm run verify:brand` as the final public-brand/compatibility gate.

- [ ] **Step 1: Complete the failing syntax-aware audit tests**

Export pure helpers from `scripts/verify-public-brand.mjs` and cover these cases:

```ts
expect(auditSourceText('src/example.ts', "const title = 'MarkuprX';"))
  .toEqual(expect.arrayContaining([
    expect.stringContaining('stale visible string literal'),
  ]));
expect(auditSourceText('src/example.ts', 'type MarkuprXAPI = {};')).toEqual([]);
expect(auditSourceText('src/example.ts', "const channel = 'markuprx:session:start';"))
  .toEqual([]);
expect(auditSourceText(
  'src/shared/publicBrand.ts',
  "export const LEGACY_USER_DATA_DIRECTORY_NAME = 'MarkuprX';",
)).toEqual([]);
expect(auditPublicText('README.md', '`npx markuprx analyze demo.mov`')).toEqual([]);
expect(auditPublicText('README.md', 'Visit https://markuprx.com')).not.toEqual([]);
```

Run: `npm run test:unit -- --run tests/unit/publicBrandAudit.test.ts`

Expected: FAIL until all classification branches are implemented.

- [ ] **Step 2: Implement the source/public-file classifier**

Use the existing `typescript` dev dependency to parse `.ts` and `.tsx`. Inspect string literals, no-substitution templates, template literal text, and JSX text/attribute values for the exact visible name `MarkuprX` and stale public domain. Allow only:

- `LEGACY_USER_DATA_DIRECTORY_NAME = 'MarkuprX'` in `src/shared/publicBrand.ts`;
- literals in `src/main/migration/LegacyBrandMigration.ts` that describe prior product locations;
- embedded PowerShell identifiers `MarkuprXWindowProbe` and `MarkuprXAnnotationInputProbe` in their existing Windows probe modules;
- machine identifiers enumerated in Global Constraints;
- test fixtures that intentionally assert those compatibility values.

For public Markdown/HTML/YAML/JSON/text paths, reject `MarkuprX`, `markuprx.com`, and obsolete source-repository URLs. Strip fenced code blocks only for source-name detection; still reject stale domains inside code blocks. Allow lower-case retained commands/package/action paths.

Check that each README image path exists. Use `sharp` to assert each curated PNG is exactly 460 by 680 pixels.

- [ ] **Step 3: Wire the audit into the existing brand command**

Add this package script without changing compatibility-named setup scripts:

```json
"verify:public-brand": "node scripts/verify-public-brand.mjs",
"verify:brand": "node scripts/verify-brand.mjs && npm run verify:public-brand"
```

Ensure the script exits non-zero with `file:line` findings and caps terminal output at 200 entries plus a remaining-count summary.

- [ ] **Step 4: Run the complete automated verification**

Run: `npm run verify:brand`

Expected: PASS.

Run: `npm run test:unit -- --run`

Expected: PASS.

Run: `npm run test:integration -- --run`

Expected: PASS.

Run: `npm run test:e2e -- --run`

Expected: PASS.

Run: `npm run typecheck && npm run lint && npm run build`

Expected: PASS with no new warnings.

Run: `npm run test:ui-electron`

Expected: PASS without screenshot changes.

- [ ] **Step 5: Package and smoke-test MarkuprPlus**

Run: `npm run package:mac:unsigned`

Expected: MarkuprPlus unsigned artifacts are produced with `markuprplus-` artifact names while the app ID remains `com.eddiesanjuan.markuprx`.

Run: `npm run verify:package && npm run test:package-smoke`

Expected: native dependencies verify, `MarkuprPlus.app` launches, and the packaged process exits successfully.

- [ ] **Step 6: Inspect repository and remote state**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git grep -n 'https://markuprx.com' -- README.md README-MCP.md docs ':!docs/superpowers/**' ':!docs/testing/**' ':!docs/COPY_CHANGES_2026-02-12.md' site ':!site/whats-new-v2.5.0.html' launch-content ':!launch-content/v2.5.0-announcement.md' .plans .github markuprx-action`

Expected: no matches.

Run: `git status --short`

Expected: only intended audit/test updates before commit.

- [ ] **Step 7: Commit**

```bash
git add package.json scripts/verify-public-brand.mjs scripts/verify-brand.mjs tests/unit/publicBrandAudit.test.ts tests/unit/brandAudit.test.ts
git commit -m "test: enforce MarkuprPlus public branding"
```

- [ ] **Step 8: Confirm complete history on the new remote**

Run: `git push origin HEAD:main && git fetch origin && git status --short --branch`

Expected: the reviewed branch fast-forwards `origin/main`, the worktree is clean, and all prior history remains reachable.
