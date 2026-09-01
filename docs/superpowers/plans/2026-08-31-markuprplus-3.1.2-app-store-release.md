# MarkuprPlus 3.1.2 App Store Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, upload, and submit MarkuprPlus macOS version 3.1.2 build 5 to App Review.

**Architecture:** Keep the application source unchanged and make a patch-release metadata update across the package, MAS configuration, Store copy, and version assertions. Build the existing universal Electron MAS target with the dedicated Store provisioning profile, verify the signed bundle and installer independently, upload through Apple's authenticated delivery tooling, then select the processed build and submit the existing App Store Connect 3.1.2 version.

**Tech Stack:** Electron 28, TypeScript, Vitest, electron-builder MAS target, Apple codesign/productbuild tooling, App Store Connect.

**Spec:** `app-store/metadata/en-US.md`, `app-store/review-notes.md`, and the user-authorized 2026-08-31 release request.

## Global Constraints

- Use App Store Connect macOS version `3.1.2`, which already exists in Prepare for Submission.
- Use monotonically increasing MAS build `5`; live version `3.1.1` uses build `4`.
- Preserve bundle identifier `com.eddiesanjuan.markuprx` and team identifier `57RCCXKS94`.
- Preserve all user-owned untracked files under `marketing-video/`.
- Do not print or store Apple credentials, private keys, or account secrets.
- Keep automatic release after approval, immediate rollout, and the existing screenshots.

---

### Task 1: Version and Store Metadata

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `electron-builder.mas.yml`
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `README-MCP.md`
- Modify: `scripts/verify-brand.mjs`
- Modify: `app-store/metadata/en-US.md`
- Modify: `app-store/review-notes.md`
- Modify: `tests/unit/appStoreMetadata.test.ts`
- Modify: `tests/unit/brandAudit.test.ts`
- Modify: `tests/unit/cliBridgeDocumentation.test.ts`
- Modify: `tests/unit/publicPackageVerification.test.ts`

**Interfaces:**
- Consumes: live App Store evidence `3.1.1 (4)` and existing inflight version `3.1.2`.
- Produces: internally consistent source version `3.1.2`, MAS build `5`, and review-ready release copy.

- [x] **Step 1: Update version assertions first**

```text
package version: 3.1.2
MAS buildVersion: "5"
Store release heading: What's New in Version 3.1.2
Review notes heading: App Review Notes — MarkuprPlus 3.1.2
```

- [x] **Step 2: Run focused version tests and confirm the old metadata fails**

Run: `npx vitest run tests/unit/appStoreMetadata.test.ts tests/unit/brandAudit.test.ts tests/unit/cliBridgeDocumentation.test.ts tests/unit/publicPackageVerification.test.ts`

Expected before implementation: failures identifying stale `3.1.1` and build `4` values.

- [x] **Step 3: Update package and MAS metadata**

```json
{"version":"3.1.2"}
```

```yaml
buildVersion: "5"
```

- [x] **Step 4: Add the 3.1.2 changelog and Store copy**

```markdown
## 3.1.2 - 2026-08-31

### Changed

- Updated the optional CLI companion setup to use the public `markuprplus` package and commands.
- Bumped the Mac App Store bundle to version 3.1.2, build 5.
```

- [x] **Step 5: Run focused tests**

Run: `npx vitest run tests/unit/appStoreMetadata.test.ts tests/unit/brandAudit.test.ts tests/unit/cliBridgeDocumentation.test.ts tests/unit/publicPackageVerification.test.ts`

Expected: all focused tests pass.

---

### Task 2: Source Verification

**Files:**
- Read: all tracked application and test sources.

**Interfaces:**
- Consumes: Task 1 metadata changes.
- Produces: verified release source ready for signed packaging.

- [x] **Step 1: Run the complete release source gate**

Run: `npm run verify:source`

Expected: brand verification, lint, typecheck, unit/integration coverage run, and desktop build all exit zero.

- [x] **Step 2: Confirm the tracked diff and version tuple**

Run: `git diff --check && node -p "require('./package.json').version" && rg -n '^buildVersion:' electron-builder.mas.yml`

Expected: no whitespace errors, version `3.1.2`, build `5`, and no changes to user-owned marketing assets.

---

### Task 3: Signed Universal MAS Package

**Files:**
- Generated: `release-mas/MarkuprPlus.app`
- Generated: `release-mas/markuprplus-3.1.2-mas.pkg`
- Consumes: `/Users/hashfunction/Downloads/MarkuprPlus_Mac_App_Store.provisionprofile`

**Interfaces:**
- Consumes: verified Task 2 source and locally installed Apple Distribution/Installer identities.
- Produces: signed universal MAS app and installer package for build 5.

- [ ] **Step 1: Build and run repository MAS verification**

Run: `MARKUPRPLUS_MAS_PROVISIONING_PROFILE=/Users/hashfunction/Downloads/MarkuprPlus_Mac_App_Store.provisionprofile npm run package:mas`

Expected: package command exits zero and `verify:mas` reports one signed universal sandbox bundle.

- [ ] **Step 2: Independently verify binary identity**

```bash
codesign --verify --deep --strict --verbose=2 release-mas/MarkuprPlus.app
pkgutil --check-signature release-mas/markuprplus-3.1.2-mas.pkg
lipo -archs release-mas/MarkuprPlus.app/Contents/MacOS/MarkuprPlus
plutil -extract CFBundleShortVersionString raw -o - release-mas/MarkuprPlus.app/Contents/Info.plist
plutil -extract CFBundleVersion raw -o - release-mas/MarkuprPlus.app/Contents/Info.plist
```

Expected: valid signatures, `x86_64 arm64`, version `3.1.2`, and build `5`.

---

### Task 4: Upload and Processing

**Files:**
- External: App Store Connect app `6803780271`, macOS build `3.1.2 (5)`.

**Interfaces:**
- Consumes: verified Task 3 installer package and authenticated Apple account.
- Produces: uploaded and processed build selectable on version 3.1.2.

- [ ] **Step 1: Upload the package using authenticated Apple delivery tooling**

Run the available uploader against `release-mas/markuprplus-3.1.2-mas.pkg` without exposing credentials.

Expected: Apple returns a successful delivery identifier for bundle `com.eddiesanjuan.markuprx`, version `3.1.2`, build `5`.

- [ ] **Step 2: Wait for processing**

Monitor App Store Connect until build `3.1.2 (5)` has completed processing and is selectable.

Expected: no validation or processing errors.

---

### Task 5: Metadata and App Review Submission

**Files:**
- External: App Store Connect MarkuprPlus macOS version 3.1.2.

**Interfaces:**
- Consumes: processed Task 4 build and Task 1 release/review copy.
- Produces: App Review submission for version `3.1.2 (5)`.

- [ ] **Step 1: Fill and save version metadata**

Use `app-store/metadata/en-US.md` for What's New and `app-store/review-notes.md` for App Review Notes. Preserve screenshots, automatic release, immediate rollout, pricing, privacy answers, and existing categories.

- [ ] **Step 2: Select build 5 and resolve compliance prompts**

Select `3.1.2 (5)` and confirm the existing `ITSAppUsesNonExemptEncryption=false` declaration remains consistent.

- [ ] **Step 3: Add the version for review and submit**

Invoke App Store Connect Add for Review, then Submit to App Review.

Expected: App Review page shows version `3.1.2` with build `5` in Waiting for Review or the current post-submission review state.

- [ ] **Step 4: Record final evidence**

Report source commit, version/build tuple, package path and checksum, signature/architecture results, Apple delivery identifier, processing state, selected build, and final review state without secrets.
