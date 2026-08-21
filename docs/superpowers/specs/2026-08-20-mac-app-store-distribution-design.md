# MarkuprPlus Mac App Store Distribution Design

**Date:** 2026-08-20
**Status:** Approved for autonomous execution

## Goal

Publish MarkuprPlus as a paid Mac App Store app at the US $9.99 price point while keeping the existing MIT-licensed GitHub download free. The Store edition is the convenient, Apple-managed purchase that supports development; the direct edition remains the full-power distribution for users who want external CLI integrations.

## Product Positioning

The listing leads with the outcome: **visual feedback for AI coding agents**. MarkuprPlus records a chosen window and narration, turns every mark into a separate finding with its own frame and words, and produces structured reports that Codex, Claude Code, Cursor, and other coding agents can act on.

The Store listing must not imply that Apple, OpenAI, Anthropic, or any named coding-agent vendor endorses MarkuprPlus. It must distinguish these facts:

- agent-ready Markdown, screenshots, and reports work without an AI provider;
- on-device Whisper performs transcription when a local model is installed;
- Anthropic API, Ollama, and LM Studio are optional analysis providers in the Store build;
- Codex CLI and Claude Code CLI execution are available only in the free direct-download edition because the Store build is sandboxed;
- the $9.99 purchase pays for convenient App Store installation, updates, and support of continued development; the open-source project remains available at no charge.

## Distribution Architecture

One source tree produces two explicit distributions:

- `direct`: the existing Developer ID DMG/ZIP build with GitHub release updating, Codex/Claude CLI adapters, and the global `osascript` annotation observer;
- `mas`: an Apple Distribution build using Electron's MAS runtime and App Sandbox, Store-managed updates, sandbox-safe providers only, and the existing in-app Draw fallback instead of the external global input observer.

A small shared distribution module exposes a build-time `direct | mas` value and derives capabilities from it. Main-process and renderer code consume those capabilities so provider availability, updater behavior, and annotation input stay consistent. Tests call the pure capability function directly; they do not depend on a real MAS process.

## MAS Capabilities

The Store build keeps:

- exact-window, region, and display capture through Electron's MAS runtime, subject to macOS Screen Recording permission;
- microphone capture with a clear usage string;
- on-device Whisper using the signed, bundled executable and downloaded model data;
- deterministic Local Rules reports;
- Anthropic API analysis using a key stored in Keychain;
- Ollama and LM Studio through fixed loopback endpoints;
- Markdown, HTML, JSON, and PDF export to user-selected locations;
- App Store-managed updates.

The Store build disables:

- Codex CLI and Claude Code CLI discovery/execution;
- the `/usr/bin/osascript` global modifier/mouse observer;
- GitHub/self-update checks and installation;
- any workflow that assumes arbitrary executable access outside the app container.

When external-process annotation is unavailable, the existing Draw control remains the supported Store interaction. The interface must not show unavailable CLI provider cards.

## Packaging and Signing

Add a dedicated `electron-builder.mas.yml` rather than mutating the trusted direct-distribution configuration. It produces a universal MAS target from the already-built Electron output, uses bundle identifier `com.eddiesanjuan.markuprx`, Apple Distribution signing, an embedded Mac App Store provisioning profile, and no notarization hook.

The main MAS entitlement file enables:

- `com.apple.security.app-sandbox`;
- `com.apple.security.network.client`;
- `com.apple.security.device.audio-input`;
- `com.apple.security.files.user-selected.read-write`;
- the Electron JIT/unsigned-executable-memory allowances required by the MAS runtime.

Child helpers inherit the sandbox and receive only the Electron runtime allowances they require. The package carries `NSMicrophoneUsageDescription`, `NSScreenCaptureUsageDescription`, and an export-compliance declaration in `Info.plist`. The direct build retains its current entitlements and notarization behavior.

The repository must never commit a downloaded provisioning profile or App Store Connect API private key. A profile path is supplied by `MARKUPRPLUS_MAS_PROVISIONING_PROFILE`; packaging fails clearly when it is absent.

## Package Verification

A new MAS verification mode checks the generated `.app`/`.pkg` without applying direct-distribution assertions. It verifies:

- canonical product and bundle identifiers;
- the MAS target's universal architecture;
- App Sandbox, network client, audio input, and user-selected file entitlements;
- absence of `app-update.yml`;
- no direct-distribution DMG/ZIP artifacts in the MAS output directory;
- valid nested signatures and an embedded provisioning profile when producing a signed submission package.

Local source tests cover distribution capability derivation, provider filtering, global observer disabling, renderer option filtering, and packaging configuration. A MAS development profile is required for a locally launchable sandbox smoke test; an Apple Distribution build is upload-only and is verified structurally before Transporter upload.

## Website, Privacy, and Support

Add a public `https://markuprplus.com/privacy` page and link it from the site footer. The policy states that MarkuprPlus has no account or telemetry, stores captures locally, asks before using cloud providers, sends selected report material only to the provider the user chooses, and stores API keys in the system keychain. It identifies on-device transcription, local provider endpoints, Apple commerce, retention, deletion, and the support contact.

App Store metadata uses:

- Marketing URL: `https://markuprplus.com`
- Privacy Policy URL: `https://markuprplus.com/privacy`
- Support URL: `https://github.com/hashfunction/MarkuprPlus/issues/new`

## Store Metadata Direction

Proposed English (U.S.) metadata:

- Name: `MarkuprPlus`
- Subtitle: `Visual feedback for AI agents`
- Promotional text: `See it, say it, circle it—and hand your coding agent a structured report with the exact frame and words behind every issue.`
- Primary category: Developer Tools
- Secondary category: Productivity
- Price: US $9.99, no in-app purchases
- Copyright: `2026 Trieflow LLC`

Keywords prioritize visual feedback, bug reporting, screen recording, transcription, developer tools, AI agents, Markdown, and screenshots without repeating name/subtitle words unnecessarily.

The description opens with the AI-agent workflow, then explains exact capture, one-mark/one-issue evidence, provider choices, privacy, exports, and the relationship to the free GitHub edition. Review notes give Apple a short capture walkthrough and explicitly disclose Screen Recording and Microphone permission use.

## Store Screenshots

Create five 2880×1800 PNGs from existing real product captures. The series uses the website's dark navy, electric blue, warm coral, and cream visual language; large type remains outside the product screenshot.

1. **Your AI fixes what you mark** — hero workflow and annotated evidence.
2. **One mark. One actionable issue.** — marked frame plus structured Markdown.
3. **Talk through bugs as you test** — recording and on-device Whisper.
4. **Choose how AI analyzes the session** — sandbox-safe providers only.
5. **Everything stays under your control** — local-first privacy and export surfaces.

Every image shows only capabilities present in the Store build. CLI provider screenshots must not appear in Store assets.

## App Store Connect Workflow

The browser workflow uses the signed-in Trieflow LLC account. Before an app record can be created, the Account Holder must personally accept the updated Apple Developer Program License Agreement. The Paid Apps Agreement must move from `Pending User Info` to active; banking details are sensitive and remain a user handoff.

After those prerequisites:

1. register the explicit bundle ID `com.eddiesanjuan.markuprx` with only required capabilities;
2. create a Mac App Store distribution provisioning profile;
3. create the `MarkuprPlus` macOS app record;
4. set the US $9.99 price point and availability;
5. enter metadata, privacy answers, age rating, export compliance, review notes, and support URLs;
6. upload the signed MAS package through Transporter or Apple's supported upload path;
7. select the processed build and validate the submission;
8. stop for explicit action-time confirmation before `Submit for Review`.

## Privacy and Compliance Answers

The app collects no data for tracking and has no developer-operated account or telemetry. Files remain on the Mac unless the user explicitly selects a cloud analysis provider. The exact App Privacy answers must be based on the shipped Store build and the final privacy policy, not on broad website claims.

MarkuprPlus uses standard encryption supplied by Electron and HTTPS libraries. The Info.plist declares the appropriate non-exempt-encryption status only after the App Store Connect export-compliance questionnaire is answered consistently. Age rating is expected to be the lowest available rating because the app contains no social, gambling, sexual, violent, or unrestricted web-browsing features.

## Failure Handling

- Missing agreement acceptance: preserve the App Store Connect tab and hand off to the Account Holder.
- Missing banking information: identify the exact Paid Apps Agreement status and hand off without reading or entering bank details.
- Missing provisioning profile: stop packaging with one actionable error and never fall back to Developer ID signing.
- Unsupported MAS runtime behavior: keep the direct edition unchanged, fail the MAS verification, and do not upload.
- App Review rejection: record the exact reason, add a focused regression/compliance change, rebuild, and resubmit only after verification.

## Success Criteria

- The direct build retains its current provider, updater, and annotation behavior.
- The Store build exposes no external CLI providers or self-updater and never launches `osascript`.
- MAS entitlements, Info.plist keys, signature, profile, architectures, and package layout pass verification.
- The privacy page is public and matches the shipped behavior.
- Five 2880×1800 Store screenshots and complete AI-focused metadata are ready.
- App Store Connect shows the app at the US $9.99 price point with the processed build selected and no validation errors.
- The final review submission occurs only after explicit confirmation.
