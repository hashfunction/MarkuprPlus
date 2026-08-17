# MarkuprPlus Public Rebrand Design

**Date:** 2026-08-17
**Status:** Approved

## Goal

Present the desktop product and its public materials as **MarkuprPlus**, describe it as a significantly enhanced evolution of [`markupr`](https://github.com/hashfunction/markupr), and show real screenshots of the finished portrait interface without breaking any existing MarkuprX integrations or saved data.

## Product Decision

This is a public-shell rebrand, not a machine-identity migration.

MarkuprPlus becomes the name people see in the app, installers, generated reports, documentation, the website, and marketing. Existing machine-facing `markuprx` identifiers remain stable wherever changing them could break an installation, script, integration, stored credential, or external package reference.

## Public Brand Contract

- Product name: `MarkuprPlus`
- Website and Help destination: `https://markuprplus.com`
- Contact destination: `https://github.com/hashfunction/MarkuprPlus/issues/new`
- Source repository: `https://github.com/hashfunction/MarkuprPlus`
- Positioning sentence: `MarkuprPlus is a significantly enhanced evolution of markupr.`
- Existing logo and visual tokens remain in use; this change does not commission a new logo or icon.

## Compatibility Contract

The following stay unchanged and may continue to contain `markuprx` or `MarkuprX` where they are machine-facing rather than public branding:

- npm package name `markuprx`;
- CLI binaries and commands `markuprx` and `markuprx-mcp`;
- MCP registry identifier `com.markuprx/markuprx`;
- preload global `window.markuprx` and its TypeScript API names;
- IPC channel strings beginning with `markuprx:`;
- environment variables beginning with `MARKUPRX_`;
- existing user-data, settings, recovery, output, temporary, and keychain identifiers;
- Windows session file extension `.markuprx`;
- existing published GitHub Action path and other real third-party URLs whose paths contain `markuprx`;
- internal source/test filenames whose names are coupled to those stable interfaces;
- historical changelog entries, archived release material, completed design specifications, and implementation plans when they describe the product name that existed at that time.

Public documentation may show a compatibility command such as `npx markuprx` or a package URL containing `markuprx`. It must label that value as the retained package or command name and must not present MarkuprX as the current product name.

## Desktop and Packaging Surface

Change user-visible desktop identity to MarkuprPlus:

- Electron runtime app name;
- package `productName` and homepage;
- packaged product, executable, installer shortcut, publisher, file-association display copy, DMG title, and artifact display names;
- application menu, tray menu, About copy, dialogs, notifications, onboarding, settings copy, errors, and accessibility labels;
- human-readable attribution in generated Markdown, HTML, JSON, issue, and integration output;
- test descriptions and expectations that assert visible product copy.

Keep the existing app ID and storage/keychain identifiers. Because changing the Electron runtime name can change its default user-data directory, startup must explicitly preserve the existing MarkuprX user-data location outside the isolated test harness. The harness-provided user-data path always wins. This prevents a public rename from making existing settings, sessions, models, or recovery data appear missing.

The public file-association name becomes `MarkuprPlus Session`, while the `.markuprx` extension remains compatible.

## Help, Contact, and External Links

The native tray context menu and application Help menu use the public brand contract:

- Help opens `https://markuprplus.com`;
- Contact opens `https://github.com/hashfunction/MarkuprPlus/issues/new`;
- macOS shows `Quit MarkuprPlus`;
- Windows and Linux show `Exit MarkuprPlus`;
- About and Settings labels use MarkuprPlus.

External launches remain guarded. A rejected `shell.openExternal` call is reported through the existing error channel/logging path and does not throw through an Electron menu callback.

## Public Documentation and Marketing

Update current public-facing material:

- `README.md` and `README-MCP.md`;
- current getting-started, configuration, architecture, API, troubleshooting, export, keyboard-shortcut, development, and AI-agent guides;
- the website and static landing pages under `site/` and `docs/landing/`;
- current launch and social copy under `launch-content/` and active `.plans/` launch files;
- GitHub issue templates, workflow display names, artifact display names, and Action metadata;
- current contributor/security/community documents where they name the present product;
- brand/package verification scripts and current setup instructions.

Do not rewrite historical release records merely to make the past use the new name. Add a new rebrand entry to the changelog and keep older entries accurate.

## README Narrative

The README opens with the MarkuprPlus wordmark, the existing one-line promise, website/repository links, and a concise compatibility note for the existing npm package.

Near the top, add an **Enhanced from markupr** section with this core statement:

> MarkuprPlus is a significantly enhanced evolution of [markupr](https://github.com/hashfunction/markupr), retaining its fast screen-and-voice feedback workflow while expanding it into a resilient desktop, CLI, and MCP toolchain for AI coding agents.

The section summarizes enhancements that exist in the repository:

- portrait taskbar-popover UX across Settings, Session History, Keyboard Shortcuts, Review, onboarding, completion, and error states;
- live multi-issue annotation and context-aware screenshots;
- editable session review, export, history, and issue delivery;
- local Whisper transcription plus selectable local and hosted analysis providers;
- crash recovery, deterministic capture handling, CLI, MCP, and GitHub/Linear integration.

Command examples remain truthful and continue to use `markuprx` until separate package/binary aliases are deliberately shipped.

## Screenshot Contract

After the portrait UX is complete, generate real deterministic Electron screenshots for:

1. Settings;
2. Session History;
3. Keyboard Shortcuts;
4. Review Editor;
5. onboarding.

Store curated copies at:

- `docs/images/markuprplus/settings.png`
- `docs/images/markuprplus/session-history.png`
- `docs/images/markuprplus/keyboard-shortcuts.png`
- `docs/images/markuprplus/review-editor.png`
- `docs/images/markuprplus/onboarding.png`

Each image represents the real 460-by-680 portrait window, uses deterministic fixture data, hides machine-specific paths and timestamps, disables animation and carets, and contains only MarkuprPlus public copy. Keep the visual-regression snapshots used by Playwright separately; README images are stable public assets rather than links into a test snapshot directory.

README presents the five images as an accessible compact gallery near the introduction. Each image has descriptive alt text and a short caption. Remove the existing top-of-README demo asset if it visibly carries stale branding; it may remain elsewhere only if it contains no obsolete public name.

## Verification Boundary

Extend brand verification so it understands the difference between public and compatibility surfaces.

The audit must fail when:

- a designated public file presents MarkuprX as the current product;
- a renderer/main-process user-visible string presents MarkuprX;
- the MarkuprPlus website, repository, or issue URL is wrong;
- packaging metadata exposes the old display name;
- README screenshot paths are missing;
- a curated screenshot is not 460 by 680 pixels;
- a curated screenshot or public document contains an obsolete current-brand label where text inspection is possible.

The audit must allow explicit compatibility occurrences in machine identifiers, real package/action URLs, migration code, tests for those interfaces, and historical files. The allowlist is path- and purpose-specific rather than a repository-wide exemption.

Required verification:

- focused tests for the public brand contract and startup user-data preservation;
- tray template tests for Help, Contact, and platform-specific Quit/Exit labels;
- unit tests for updated generated-report attribution where applicable;
- the existing unit, integration, end-to-end, typecheck, lint, and build suites;
- real Electron checks for visible MarkuprPlus copy and absence of visible MarkuprX copy;
- deterministic screenshot generation and dimension checks;
- unsigned package build, package metadata verification, and packaged launch smoke test;
- `npm run verify:brand` over current public and compatibility surfaces;
- a README link/image-path check.

## Rollout and History

All work lands through normal commits on the existing history and pushes to `git@github.com:hashfunction/MarkuprPlus.git`. No force-push, history rewrite, package namespace transfer, data migration, or destructive cleanup is part of this rebrand.

The repository history will continue to contain MarkuprX because it records the product's previous identity. The completed tree presents MarkuprPlus publicly while retaining deliberate compatibility strings internally.

## Success Criteria

- A user opening the app, installer, generated report, README, website, or current public documentation sees MarkuprPlus.
- Help opens `markuprplus.com`; Contact opens a new issue in `hashfunction/MarkuprPlus`.
- Existing `markuprx` commands, MCP configurations, renderer IPC, settings, credentials, saved sessions, models, and recovery data continue to work.
- README clearly identifies MarkuprPlus as a significantly enhanced evolution of markupr and shows five real portrait screenshots.
- Automated brand verification distinguishes intentional internal compatibility strings from stale public branding.
- The full history remains intact on the MarkuprPlus remote.
