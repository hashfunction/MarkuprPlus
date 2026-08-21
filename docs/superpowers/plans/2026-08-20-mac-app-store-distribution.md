# MarkuprPlus Mac App Store Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce and publish a sandboxed $9.99 Mac App Store edition of MarkuprPlus alongside the free GitHub edition.

**Architecture:** A shared build-time distribution value derives Store-safe capabilities consumed by main and renderer code. A separate electron-builder MAS configuration, entitlement set, verification command, privacy page, metadata kit, and screenshot kit leave the existing direct-distribution path unchanged.

**Tech Stack:** Electron, Electron MAS runtime, React, TypeScript, Vitest, electron-vite, electron-builder, Apple code signing/App Store Connect, static HTML, Superdesign.

**Spec:** `docs/superpowers/specs/2026-08-20-mac-app-store-distribution-design.md`

## Global Constraints

- The US App Store price is $9.99 with no in-app purchases.
- The free MIT/GitHub edition remains available.
- The direct build retains CLI providers, GitHub updating, and the global annotation observer.
- The Store build exposes Anthropic API, Ollama, LM Studio, and Local Rules only.
- The Store build never initializes `electron-updater` or launches `/usr/bin/osascript`.
- Bundle identifier remains `com.eddiesanjuan.markuprx`.
- Provisioning profiles and private keys are never committed.
- Final `Submit for Review` requires action-time confirmation.

---

### Task 1: Distribution Capability Boundary

**Files:**
- Create: `src/shared/distribution.ts`
- Modify: `electron.vite.config.ts`
- Modify: `src/main/ai/providers/AnalysisProviderRegistry.ts`
- Modify: `src/main/capture/GlobalAnnotationInputMonitor.ts`
- Modify: `src/main/capture/CaptureOverlayManager.ts`
- Modify: `src/renderer/components/settings/analysisProviderOptions.ts`
- Test: `tests/unit/distributionCapabilities.test.ts`
- Test: `tests/unit/ai/analysisProviderRegistry.test.ts`
- Test: `tests/unit/globalAnnotationInputMonitor.test.ts`
- Test: `tests/unit/analysisProviderOptions.test.ts`

**Interfaces:**
- Produces: `DistributionKind = 'direct' | 'mas'`, `capabilitiesForDistribution(kind)`, `currentDistribution()`, and `currentDistributionCapabilities()`.
- Consumes: build-time `__MARKUPRPLUS_DISTRIBUTION__` injected by electron-vite.

- [ ] **Step 1: Write failing pure capability and consumer tests**

```ts
expect(capabilitiesForDistribution('mas')).toEqual({
  externalCliProviders: false,
  externalInputObserver: false,
  selfUpdater: false,
});
expect(providerIdsForDistribution('mas')).toEqual([
  'ollama', 'lmstudio', 'anthropic-api', 'rules',
]);
```

Add a monitor test that constructs the macOS observer with `externalProcessAllowed: false`, calls `start`, expects `unsupported`, and proves the spawn function was not called. Add a registry test that passes `allowCliProviders: false` and proves `codex-cli` and `claude-cli` are unsupported while Store-safe adapters remain registered.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npx vitest run tests/unit/distributionCapabilities.test.ts tests/unit/ai/analysisProviderRegistry.test.ts tests/unit/globalAnnotationInputMonitor.test.ts tests/unit/analysisProviderOptions.test.ts`

Expected: FAIL because the distribution module and new arguments do not exist.

- [ ] **Step 3: Implement the minimal distribution boundary**

```ts
export type DistributionKind = 'direct' | 'mas';

export function capabilitiesForDistribution(kind: DistributionKind) {
  const store = kind === 'mas';
  return {
    externalCliProviders: !store,
    externalInputObserver: !store,
    selfUpdater: !store,
  } as const;
}
```

Inject the distribution define into main, preload, and renderer builds. Filter renderer cards and registry adapters from the same capability. Return the existing `unsupported` monitor health when the external observer is disabled.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command.

Expected: all focused tests pass with zero failures.

- [ ] **Step 5: Commit the capability boundary**

```bash
git add src/shared/distribution.ts electron.vite.config.ts src/main/ai/providers/AnalysisProviderRegistry.ts src/main/capture/GlobalAnnotationInputMonitor.ts src/main/capture/CaptureOverlayManager.ts src/renderer/components/settings/analysisProviderOptions.ts tests/unit/distributionCapabilities.test.ts tests/unit/ai/analysisProviderRegistry.test.ts tests/unit/globalAnnotationInputMonitor.test.ts tests/unit/analysisProviderOptions.test.ts
git commit -m "feat: add Mac App Store runtime capabilities"
```

### Task 2: MAS Packaging, Entitlements, and Verification

**Files:**
- Create: `electron-builder.mas.yml`
- Create: `build/entitlements.mas.plist`
- Create: `build/entitlements.mas.inherit.plist`
- Create: `scripts/verify-mas-package.mjs`
- Modify: `package.json`
- Test: `tests/unit/masPackaging.test.ts`

**Interfaces:**
- Consumes: `MARKUPRPLUS_MAS_PROVISIONING_PROFILE`, Apple Distribution identity, and the `mas` desktop bundle from Task 1.
- Produces: `npm run package:mas`, `npm run verify:mas`, and submission artifacts under `release-mas/`.

- [ ] **Step 1: Write failing executable packaging tests**

The test loads YAML/plists and runs the verifier against controlled fixture bundles. It asserts the MAS target, universal architectures, bundle identifier, usage strings, sandbox/network/audio/file entitlements, absence of the notarization hook, and a nonzero verifier result when `app-update.yml` is present or App Sandbox is absent.

- [ ] **Step 2: Run the package test and verify RED**

Run: `npx vitest run tests/unit/masPackaging.test.ts`

Expected: FAIL because the MAS artifacts and verifier do not exist.

- [ ] **Step 3: Add the dedicated MAS configuration and scripts**

Use `release-mas` as output, `mas` as the only target, `arm64` and `x64` architectures, `Apple Distribution` signing, the environment-provided provisioning profile, no `afterSign`, and these Info.plist keys:

```yaml
extendInfo:
  LSUIElement: true
  NSMicrophoneUsageDescription: MarkuprPlus records narration while you review a screen.
  NSScreenCaptureUsageDescription: MarkuprPlus captures the window, region, or display you choose for visual feedback.
  ITSAppUsesNonExemptEncryption: false
```

Add scripts:

```json
"build:mas": "MARKUPRPLUS_DISTRIBUTION=mas node scripts/build.mjs",
"package:mas": "npm run build:mas && electron-builder --config electron-builder.mas.yml",
"verify:mas": "node scripts/verify-mas-package.mjs release-mas"
```

- [ ] **Step 4: Run the package test and verify GREEN**

Run the Step 2 command.

Expected: all MAS packaging tests pass.

- [ ] **Step 5: Build the MAS source bundle without signing**

Run: `npm run build:mas`

Expected: Electron main, preload, renderer, CLI, and MCP builds exit 0.

- [ ] **Step 6: Commit MAS packaging**

```bash
git add electron-builder.mas.yml build/entitlements.mas.plist build/entitlements.mas.inherit.plist scripts/verify-mas-package.mjs package.json tests/unit/masPackaging.test.ts
git commit -m "build: add Mac App Store package target"
```

### Task 3: Privacy and Store Metadata Kit

**Files:**
- Create: `site/privacy.html`
- Create: `app-store/metadata/en-US.md`
- Create: `app-store/review-notes.md`
- Create: `app-store/privacy-answers.md`
- Modify: `site/index.html`
- Modify: `site/sitemap.xml`
- Test: `tests/unit/appStoreMetadata.test.ts`

**Interfaces:**
- Produces: exact strings and URLs copied into App Store Connect.
- Consumes: the Store-safe capability set from Task 1.

- [ ] **Step 1: Write failing behavior-focused metadata tests**

Run the site server on an ephemeral port and request `/privacy`; assert HTTP 200, the no-account/no-telemetry/local-storage/cloud-choice facts, and a footer link from `/`. Parse the metadata kit and assert Apple's character limits: name ≤30, subtitle ≤30, promotional text ≤170, keywords ≤100, and description ≤4000.

- [ ] **Step 2: Run the metadata test and verify RED**

Run: `npx vitest run tests/unit/appStoreMetadata.test.ts`

Expected: FAIL because `/privacy` and the metadata kit do not exist.

- [ ] **Step 3: Add the privacy page and exact Store copy**

Use the approved headline `Visual feedback for AI agents`, lead the description with the see/say/mark/report loop, and disclose that the paid Store edition coexists with the free open-source GitHub edition. Name only Store-safe providers in the Store feature list.

- [ ] **Step 4: Run metadata tests and verify GREEN**

Run the Step 2 command.

Expected: metadata and public privacy behavior pass all assertions.

- [ ] **Step 5: Commit Store copy and privacy**

```bash
git add site/privacy.html site/index.html site/sitemap.xml app-store/metadata/en-US.md app-store/review-notes.md app-store/privacy-answers.md tests/unit/appStoreMetadata.test.ts
git commit -m "docs: add App Store metadata and privacy policy"
```

### Task 4: App Store Screenshot Kit

**Files:**
- Create: `app-store/screenshots/source/`
- Create: `app-store/screenshots/2880x1800/`
- Create: `app-store/screenshots/README.md`

**Interfaces:**
- Consumes: real captures under `docs/images/markuprplus/` and the website's brand language.
- Produces: five visually verified 2880×1800 PNGs that show only Store-build capabilities.

- [ ] **Step 1: Prepare the Superdesign brief and on-brand context**

Use the five exact headlines from the spec, a split product-marketing layout, the website's navy/blue/coral/cream palette, and real product screenshots as content assets. Do not use the existing provider image because it displays CLI providers.

- [ ] **Step 2: Generate five editable graphic drafts**

Run Superdesign's authenticated CLI, upload the selected product captures, and create one `graphic` draft per 2880×1800 screenshot. Copy stays in the HTML layer; product captures remain undistorted.

- [ ] **Step 3: Visually review every draft in Chrome**

Check exact copy, contrast, crop, safe capability claims, and overflow. Apply no more than one autonomous correction iteration per draft.

- [ ] **Step 4: Export final PNG files and verify dimensions**

Run: `sips -g pixelWidth -g pixelHeight app-store/screenshots/2880x1800/*.png`

Expected: five files, each exactly 2880×1800.

- [ ] **Step 5: Commit the screenshot kit**

```bash
git add app-store/screenshots
git commit -m "docs: add Mac App Store screenshot kit"
```

### Task 5: Apple Account and Signed Submission Build

**Files:**
- No committed secrets or profiles.
- Output: `release-mas/` submission package.

**Interfaces:**
- Consumes: Account Holder agreement acceptance, active Paid Apps Agreement, registered App ID, MAS provisioning profile, and Apple Distribution certificate.
- Produces: a processed App Store Connect macOS build.

- [ ] **Step 1: Complete all non-sensitive Apple account setup in Chrome**

After the Account Holder accepts the updated legal agreement, register `com.eddiesanjuan.markuprx`, create the macOS app record, and create/download the Mac App Store provisioning profile. Confirm before the browser downloads the profile if the browser asks for download permission.

- [ ] **Step 2: Build and verify the signed universal MAS package**

Run:

```bash
MARKUPRPLUS_MAS_PROVISIONING_PROFILE=/absolute/path/to/profile.provisionprofile npm run package:mas
npm run verify:mas
```

Expected: universal MAS artifact, valid nested signatures, embedded profile, required entitlements, and no update metadata.

- [ ] **Step 3: Upload and wait for processing**

Use Apple's supported Transporter/upload flow, then wait in App Store Connect until the build finishes processing. Record and fix any upload validation error before continuing.

### Task 6: Complete and Validate the $9.99 Listing

**Files:**
- No repository files unless App Store validation reveals a focused defect.

**Interfaces:**
- Consumes: metadata and screenshots from Tasks 3–4 and the processed build from Task 5.
- Produces: a validation-clean App Store Connect version ready for review.

- [ ] **Step 1: Set commercial and distribution fields**

Choose the US $9.99 price point, all eligible countries/regions, Developer Tools primary category, Productivity secondary category, and no in-app purchases.

- [ ] **Step 2: Enter localized metadata and upload screenshots**

Copy exact strings from `app-store/metadata/en-US.md`, upload the five screenshots in order, and set marketing, support, and privacy URLs.

- [ ] **Step 3: Complete compliance and review information**

Use `app-store/privacy-answers.md` and `app-store/review-notes.md`; answer age rating and export compliance from shipped behavior. Confirm before typing any sensitive review contact information.

- [ ] **Step 4: Select the processed build and run App Store Connect validation**

Resolve every blocking field and confirm the page is ready to submit.

- [ ] **Step 5: Stop for explicit final submission confirmation**

Describe the exact app/version/account action and ask for confirmation immediately before clicking `Submit for Review`.

### Task 7: Full Verification and Branch Handoff

**Files:**
- Update: `app-store/submission-status.md`

**Interfaces:**
- Produces: exact test/build/store evidence and a clean integration choice.

- [ ] **Step 1: Run source verification**

Run:

```bash
npm run verify:brand
npm run lint
npm run typecheck
npx vitest run
npm run build:desktop
npm run build:mas
```

Expected: every command exits 0; Vitest reports zero failed tests.

- [ ] **Step 2: Record package and App Store evidence**

Document artifact paths, signature/profile/entitlement evidence, App Store Connect version state, processed build number, price point, countries/regions, and any remaining Account Holder action without copying sensitive identifiers.

- [ ] **Step 3: Commit final status**

```bash
git add app-store/submission-status.md
git commit -m "docs: record Mac App Store submission status"
```

- [ ] **Step 4: Invoke the finishing-development-branch workflow**

Present merge/PR/keep/discard choices only after fresh verification evidence.
