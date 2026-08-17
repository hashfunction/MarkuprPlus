# MarkuprPlus architecture

MarkuprPlus is an Electron application with separate main, preload, and renderer responsibilities, plus source-built CLI and MCP entry points.

## Process boundary

```text
renderer (React, unprivileged UI)
             |
       window.markuprx
       validated IPC
             |
preload (contextBridge, narrow typed API)
             |
main (capture, files, credentials, providers, exports)
```

`window.markuprx` and `markuprx:` IPC channels are retained compatibility interfaces. They are not public display branding and should not be renamed casually.

The renderer does not receive raw Electron/Node authority. Privileged handlers validate the sender, arguments, paths, media, and allowed operation. Navigation and new-window attempts are guarded; external URLs go through explicit main-process handlers.

## Main-process services

- `SessionController`: bounded recording state machine and orchestration.
- `TrayManager` / `MenuManager`: native tray/taskbar and application menus.
- Capture managers: source selection, recording lifecycle, overlays, manual cues, and marked-issue accumulation.
- Audio/transcription services: recorded audio plus post-session local Whisper/OpenAI recovery.
- Pipeline services: frame extraction, evidence correlation, analysis-provider selection, validation, and Local Rules fallback.
- Output services: deterministic report generation, trusted-media handling, Review export, session listing/deletion, clipboard/folder actions.
- `SettingsManager`: schema-validated settings and credential-store access.
- Crash recovery: persisted in-progress evidence and recovery/discard workflow.
- Permission/error handlers: OS permission guidance, bounded diagnostics, and user-visible failure states.

An `AutoUpdater` implementation and renderer API exist, but current startup does not initialize a published update feed and packaging has no publisher endpoint. It is dormant infrastructure, not an active distribution promise.

## Renderer surfaces

React contexts coordinate UI settings, recording state, and navigation. The main secondary surfaces share a 460 × 680 portrait shell and one intentional primary scroller:

- Start/status popover;
- Settings;
- Session History;
- Keyboard Shortcuts;
- Review Editor;
- onboarding and recovery flows.

The recording HUD (316 × 90) and processing HUD (320 × 140) remain intentionally compact. Capture/selection/annotation overlays are separate transparent windows bound to the chosen target.

Accessibility behaviors include keyboard navigation, focus containment/restoration, reduced-motion support, forced-colors support, labelled controls, and visible focus. Theme tokens support system/light/dark modes.

## Recording lifecycle

```text
idle -> starting -> recording -> stopping -> processing -> complete -> idle
                         |                         |
                         +-> paused/resumed        +-> error/recovery
```

Each non-idle state is bounded so an external service cannot leave the UI indefinitely stuck. During recording, the app persists recoverable evidence. Stopping ends capture before post-session transcription, frame extraction, and analysis.

Current capture does not perform real-time transcription or automatic silence-triggered screenshots. Manual cues and committed annotations supply intentional evidence points.

## Evidence model

A marked issue combines:

- timestamp and narration window;
- trusted screenshot reference;
- annotation tool/strokes;
- cursor, active-window, and focused-element context when available;
- optional classification/description added in Review.

The accumulator commits each marked issue once and keeps evidence separate. Output generators consume a normalized session model; they do not scrape the renderer DOM or grant analysis providers filesystem authority.

## Transcription and analysis

Post-session transcription uses a downloaded local Whisper model when available, with an optional configured OpenAI recovery path. Analysis selects exactly one of Local Rules, Ollama, LM Studio, Codex CLI, Claude Code CLI, or Anthropic API. All enhanced output passes through a shared validator. Invalid/unavailable enhanced analysis falls back to Local Rules with a recorded reason rather than another hidden provider.

See [AI pipeline design](AI_PIPELINE_DESIGN.md) for data-flow details.

## Persistence

- Settings: `settings.json` in the preserved Electron user-data directory.
- Secrets: OS credential store when available, otherwise the existing encrypted compatibility fallback.
- Sessions: configured output directory, default `~/Documents/markuprx`.
- Recovery: atomic, bounded in-progress metadata/evidence.

Paths are resolved and checked at privileged boundaries. Output deletion and export operate only on validated contained targets; trusted media is byte-validated before use.

## Exports and integrations

Desktop Review exports Markdown, PDF, HTML, and JSON. CLI templates are Markdown, JSON, GitHub issue, Linear, and Jira. GitHub/Linear delivery is explicit and separate from local generation.

PDF rendering uses a constrained hidden BrowserWindow. HTML/PDF content is escaped and generated from trusted templates. Markdown images are copied into a contained relative directory when enabled; JSON remains metadata-oriented.

## CLI and MCP

The CLI and MCP server reuse analysis, transcription, template, and integration modules without starting the desktop UI. The MCP server communicates over stdio and registers nine tools. Lower-case binary/package/MCP registry IDs remain stable for compatibility.

## Testing strategy

- Vitest unit/integration tests exercise pure state, providers, output, IPC helpers, security boundaries, and services.
- Real-Electron Playwright tests exercise main/preload/renderer behavior, capture harness flows, recovery, portrait layout, accessibility, and deterministic screenshots.
- Package verification inspects public bundle/executable metadata, native architectures, runtime asset allowlists, and artifact naming.

Use `npm run verify:source`, `npm run test:ui-electron`, and the applicable package verifier before release decisions.
