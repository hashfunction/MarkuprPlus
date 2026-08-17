# MarkuprPlus Release Hardening Design

**Date:** 2026-08-17
**Status:** Approved for autonomous execution

## Goal

Make the completed MarkuprPlus release defensible as a public desktop application: all advertised GitHub checks must be real and green, known high-impact dependency findings must be remediated, privileged Electron and filesystem boundaries must fail safely, packaged builds must be exercised, and independent code and security reviews must close before release handoff.

## Decision Context

The user explicitly requested autonomous release hardening after all feature and rebrand work. This specification therefore records the selected design and its alternatives without adding another approval pause.

The baseline audit found:

- the public repository exists at `https://github.com/hashfunction/MarkuprPlus` and preserves the imported history;
- the original `markupr` README used real CI, Release, latest-release, download, license, and support badges;
- the current README retained only npm and license badges;
- the live CI workflow is red: the test job rejects approved planning documents, macOS package verification fails, and Windows packaging fails, while the real Electron UI job passes;
- the local coverage run has 1 brand-audit failure and 1,531 passing tests;
- `npm audit --omit=dev` reports zero findings, but the complete dependency graph reports 22 findings: 3 moderate, 16 high, and 3 critical;
- Electron is declared as a development dependency even though it is the shipped desktop runtime, so a production-only audit hides relevant Electron advisories;
- the app already uses context isolation, disabled Node integration, sandboxed primary/overlay/popover windows, a renderer CSP, and a navigation guard;
- targeted inspection found release-blocking data-boundary risks: Clear All Data recursively removes the configured output root, lexical `startsWith` checks can accept sibling prefixes, production API-key writes can fall back to plaintext, and the hidden PDF renderer lacks explicit script/sandbox policy;
- workflow permissions are not consistently minimized and action references are mutable major tags.

## Considered Approaches

### 1. Badge and workflow polish only

Restore the original badges, add CodeQL, and leave dependencies and application boundaries unchanged.

This is rejected. A green-looking README would conceal the current red workflow and the full audit's Electron/tooling findings. It would improve presentation without improving the release.

### 2. Targeted release modernization and hardening

Repair existing gates, move the desktop build to patched compatible tool versions, fix the concrete privileged-boundary findings, minimize and pin workflow permissions/actions, add CodeQL and dependency review, validate packages on macOS and Windows, and run independent final reviews.

This is selected. It materially improves the actual release while preserving MarkuprPlus behavior, the retained `markuprx` compatibility interfaces, and the existing application architecture.

### 3. Broad security rewrite

Replace the IPC layer, storage system, updater, capture stack, and release infrastructure before publishing.

This is rejected for this release. It would expand risk and invalidate much of the tested behavior without evidence that a rewrite is needed. Review findings may justify focused follow-up work, but not an unbounded redesign.

## Release Trust Model

### Protected assets

- API keys and provider configuration;
- screen recordings, audio, transcripts, screenshots, reports, and recovery data;
- user-selected directories and unrelated user files beside MarkuprPlus output;
- main-process filesystem, clipboard, shell, capture, permission, and update privileges;
- package integrity, native module architecture, installer metadata, and release artifacts;
- the accuracy of public CI, security, and release claims.

### Principal attack and failure surfaces

- compromised or malformed renderer content reaching preload IPC;
- external navigation, popup, redirect, webview, permission, or drag-and-drop behavior;
- settings import and untyped IPC payloads;
- directory traversal, sibling-prefix mistakes, symlinks, and over-broad recursive deletion;
- insecure fallback storage for API keys;
- generated HTML rendered for PDF;
- stale or vulnerable Electron/build/test dependencies;
- mutable or over-privileged GitHub Actions;
- packages that build but contain wrong-architecture or missing native modules;
- checks that pass locally but fail on a clean GitHub runner.

## Dependency and Runtime Policy

The release candidate uses a Node 22 build environment and patched, mutually compatible tool versions. The audited target set is:

- Electron `43.4.0` or newer within major 43;
- electron-builder `26.15.3` or newer within major 26;
- electron-vite `5.0.0` or newer within major 5;
- Vite `7.3.6` or newer within major 7, because electron-vite 5 does not declare Vite 8 compatibility;
- Vitest and `@vitest/coverage-v8` `4.1.10` at matching versions;
- esbuild `0.28.2` or newer within major 0.28;
- `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` `8.67.0` at matching versions;
- ESLint `9.39.5` or newer within major 9, with a flat configuration;
- TypeScript stays on compatible major 5 and is pinned to `5.9.3` or newer within that major;
- React remains on 18 unless a separate functional reason requires its upgrade.

The npm package's existing Node runtime compatibility is not raised merely because the desktop build tool requires Node 22. Contributor and CI documentation uses Node 22; the retained CLI/MCP package engine changes only if tests prove the shipped code requires it.

The complete dependency graph, not only `--omit=dev`, must contain no high or critical audit finding. A lower-severity finding may remain only with an advisory-specific rationale, affected-surface analysis, and a dated review deadline. Blanket audit suppression is prohibited.

## Application Security Boundaries

### Safe application-data clearing

Clear All Data must never recursively remove the configured output root. It enumerates MarkuprPlus-owned session directories using existing metadata, verifies each candidate is a real descendant rather than a symlink or sibling-prefix path, removes only those owned directories, and leaves the root plus unrelated files intact. App-created export bundles may be removed only when they match the exact owned bundle convention and pass the same containment checks.

The destructive call returns a structured result with deleted and failed entries. A partial failure is visible in the Settings surface; it cannot silently report success.

### Path containment

One shared path-containment helper replaces lexical `resolved.startsWith(base)` checks. It uses `path.relative`, rejects absolute relatives and `..` traversal, distinguishes whether the root itself is allowed, and uses real paths before destructive operations when targets exist. Tests cover a valid child, the root, a sibling sharing the root prefix, `..` traversal, and a symlink escaping the root.

### Settings and secrets

Runtime settings keys are checked against the exact `DEFAULT_SETTINGS` key set before read or write. Imported values continue through the existing per-setting validation.

New production API-key writes may use keytar or Electron safeStorage only. If both secure stores fail, the save fails with actionable copy and does not write plaintext. Legacy plaintext values are migrated to secure storage when possible and removed after verified migration. Plaintext fallback remains permitted only inside the explicit non-packaged Electron test harness.

### Renderer and navigation policy

Every application BrowserWindow explicitly keeps `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, `webviewTag: false`, and `navigateOnDragDrop: false`. The PDF renderer additionally disables JavaScript and its generated document carries a restrictive CSP.

The navigation guard blocks top-level navigation, redirects, and webviews; denies every in-app popup; and hands only valid HTTPS destinations to the operating-system browser. HTTP, file, data, JavaScript, and custom protocols are rejected by this generic path. Existing explicit system-settings launches remain in their dedicated trusted main-process code.

The preload bridge is exposed only in a main frame. The default Electron session permits media requests only from the owned renderer URL used by the packaged app or the exact development origin, and denies unexpected permission types and untrusted origins.

## GitHub Checks and Supply-Chain Policy

### CI

The `CI` workflow remains the primary branch badge and required aggregate. It runs with top-level `contents: read`, concurrency cancellation, and these gates:

1. brand/workflow validation, lint, typecheck, and complete high-severity npm audit;
2. unit, integration, and end-to-end Vitest coverage on Linux;
3. real Electron UI and accessibility tests on macOS;
4. unsigned macOS and Windows packages from clean installs;
5. native-runtime/package metadata verification;
6. a packaged-app launch smoke on the host macOS architecture;
7. one aggregate `CI Success` job that fails when any required job fails.

The workflow does not cache `node_modules`; npm's download cache is sufficient and avoids stale native binaries. Diagnostic artifacts upload on failure. Coverage is retained as a GitHub artifact. No Codecov badge or claim is added without an intentionally configured Codecov project.

### CodeQL and dependency review

A dedicated `CodeQL` workflow uses the current CodeQL v4 action. One matrix entry analyzes `javascript-typescript` with the `security-extended` query suite and a second analyzes `actions`. It runs on main, pull requests, and a weekly schedule. Only its analyze job receives `security-events: write`.

Pull requests also run GitHub's dependency review and fail on high or critical newly introduced advisories. Dependabot covers npm and GitHub Actions on a weekly schedule with bounded grouping and without excluding indirect security fixes.

### Action immutability and permissions

All `uses:` references in active workflows are pinned to full immutable commit SHAs with a comment naming the human-readable release. A repository check rejects mutable tags and missing top-level permissions. Each job receives only permissions required for its operation; release and Pages publication keep their existing narrowly scoped write permissions.

### Release and nightly workflows

Release and nightly packaging consume the same build, audit, native-runtime, and metadata verification commands as CI. Release artifacts retain SHA-256 checksums. A workflow may fall back to unsigned builds when signing secrets are intentionally absent, but its summary and release notes must identify the signing state truthfully.

## README Badges

The polished MarkuprPlus README restores all real equivalents from the original project and adds the new security check:

- CI workflow status on `main`;
- CodeQL workflow status on `main`;
- Release workflow status;
- latest GitHub release;
- total GitHub release downloads;
- retained npm package version;
- retained npm package monthly downloads;
- MIT license;
- existing support link if it remains active.

Every badge points to `hashfunction/MarkuprPlus` or the retained `markuprx` npm package as appropriate. Static “secure,” “passing,” coverage, platform, or quality badges without a backing check are prohibited.

## Verification Strategy

Verification is deliberately redundant in three meaningfully different passes:

### Pass 1: clean source gate

From the release-candidate commit, perform a clean `npm ci`, full audit, brand/workflow validation, lint, typecheck, Vitest coverage, and production build. This proves the locked source graph and deterministic compile/test path.

### Pass 2: native functional gate

Run the real Electron suite three consecutive times with fixture isolation. It covers onboarding, Settings persistence and failures, recording/processing HUD geometry, start/mark/stop, completion, Review, History, Shortcuts, transient dialogs, tray routes, accessibility, and exact portrait dimensions/overflow. Repetition is a flake detector, not a substitute for behavior coverage.

### Pass 3: package and security gate

Build fresh unsigned packages, verify native-module architecture and public metadata, launch the packaged app twice from isolated data roots, confirm the updater configuration contract, run both npm audits, and inspect the package for stale public branding or secrets. GitHub's macOS and Windows package jobs and CodeQL must finish green on the same commit.

No completion claim is made from an earlier commit's results. The final verification report records the exact commit, commands, pass counts, package paths, audit summary, GitHub run URLs, and any consciously accepted lower-severity risk.

## Independent Review Gates

After implementation and all local passes:

1. a whole-branch code reviewer checks the complete diff against the portrait, rebrand, and release-hardening specifications;
2. a separate security reviewer performs a threat-model-led review of Electron preferences, preload/IPC, navigation, permissions, secrets, path handling, deletion, child processes, generated output, updates, packaging, dependencies, and workflows;
3. critical and important findings are fixed with focused regression tests;
4. the corresponding reviewer re-reviews each fix range;
5. the complete local gates and live GitHub checks run again on the reviewed head.

Review agents do not edit or push. Reviewed controller commits fast-forward `origin/main`; history is never rewritten.

## Error Handling and Evidence

- A clean local pass cannot override a failed GitHub platform job.
- A package build without native-runtime verification is a failure.
- A test retried into success is investigated; retries do not erase flake evidence.
- A security scan unavailable because of repository settings is reported as unavailable, not passed.
- A workflow badge is added only after its file exists and its live run can be observed.
- Signing and notarization are reported separately from functional package correctness because credentials may not exist in the execution environment.
- Existing unrelated user files and Git history are never deleted or rewritten during hardening.

## Success Criteria

- The full npm audit contains no high or critical finding, including Electron and build/test tooling.
- Clear All Data cannot delete the configured output root or unrelated files.
- New API keys are never stored plaintext in production.
- Owned BrowserWindows, navigation, permissions, and generated PDF rendering have explicit restrictive policies backed by tests.
- CI, CodeQL, dependency review, package verification, and release workflows use minimal permissions and immutable action references.
- Original-style CI/Release/release/download/license badges and the new CodeQL badge point to real MarkuprPlus checks.
- The clean source pass, three repeated native functional passes, and fresh package/security pass succeed on the final commit.
- macOS and Windows GitHub jobs and CodeQL are green on that commit.
- Independent whole-branch code and security reviews have no unresolved critical or important finding.
- All reviewed commits and complete prior history remain on `git@github.com:hashfunction/MarkuprPlus.git`.
