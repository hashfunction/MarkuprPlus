# MarkuprPlus product vision

This document separates the product that exists today from ideas that remain roadmap material.

## Purpose

MarkuprPlus makes visual software feedback easier to reproduce and act on. A person records the relevant screen area, narrates what is wrong, optionally marks exact evidence, and reviews the resulting issues before sharing anything.

It is the significantly enhanced evolution described in the README's provenance section: the fast capture idea remains, while the current application adds resilient recording, separately committed evidence, post-session transcription and analysis, multi-issue review, history/recovery, exports, delivery integrations, CLI/MCP interfaces, and a keyboard-accessible portrait UI.

## Current product

### Capture

- Operates from the macOS menu bar or Windows taskbar.
- Selects an exact display, window, or region.
- Records screen and microphone streams.
- Supports manual frame cues and live freehand, circle, and highlight annotations.
- Lets each marked issue be committed separately with matching screenshot/context.
- Offers explicit annotation fallback controls when global modifier observation is unavailable.

MarkuprPlus does not claim real-time transcription or automatic silence-triggered screenshots. Audio transcription and frame correlation happen after the recording stops. Pause stops active audio capture until the session resumes.

### Process and review

- Local Whisper can transcribe post-session audio after a model is downloaded.
- Recovery tries local Whisper first; OpenAI is an optional saved-key cloud fallback only after local transcription is unavailable or fails.
- Local Rules always provides a deterministic report construction path.
- Codex CLI, Claude Code CLI, Ollama, LM Studio, or Anthropic API can be selected for enhanced analysis.
- The Review Editor supports multiple findings, editing, categories, severity, screenshots, reordering, and deletion.
- Session History and crash recovery retain useful evidence from previous or interrupted work.

### Export and delivery

- Desktop export: Markdown, PDF, HTML, and JSON.
- CLI templates: Markdown, JSON, GitHub issue, Linear, and Jira.
- Explicit GitHub and Linear delivery integrations.
- Clipboard and open-folder actions for local handoff.

### Interfaces

- Native Electron desktop application.
- Compatible `markuprx` command-line interface.
- Compatible `markuprx-mcp` Model Context Protocol server with nine tools.

The lower-case names are retained machine interfaces; public product surfaces use MarkuprPlus.

## Product principles

1. **Review before delivery.** A generated report is a draft until the user checks it.
2. **Evidence stays connected.** Narration, time, screen context, annotations, and screenshots should remain attributable to the same finding.
3. **Local is a real option.** Local Whisper, Local Rules, Ollama, and LM Studio should support a local processing path when configured locally.
4. **External data flow is explicit.** Cloud/CLI providers and GitHub/Linear delivery are choices, not invisible fallbacks.
5. **Failure preserves work.** Watchdogs, crash recovery, deterministic output, and clear warnings matter more than pretending failures cannot happen.
6. **The tray surface remains small.** Every secondary workflow fits the same portrait window with one intentional scroller and keyboard access.
7. **Compatibility is deliberate.** Existing commands, configuration filenames, environment variables, IPC names, package identity, and stored data remain readable.

## Current privacy boundary

Capture media and reports are written to the configured output directory. Local Whisper and Local Rules run on the machine; transcription attempts local Whisper before any saved-key OpenAI fallback. Ollama and LM Studio use loopback services. Codex CLI and Claude Code CLI use their configured accounts and may send content to their service. Anthropic analysis, OpenAI transcription, GitHub delivery, Linear delivery, and screen-description providers send selected content externally when invoked.

MarkuprPlus does not add application telemetry. That is separate from the data flow of a provider the user selects.

## Roadmap, not shipped behavior

The following are possible future directions, not current product promises:

- published signed/notarized desktop downloads and package registries;
- enabled automatic-update distribution backed by published release metadata;
- additional analysis or transcription adapters;
- expanded Linux desktop support and signed Windows validation;
- optional team workflows or hosted services with a separately reviewed privacy/security model;
- richer batch re-analysis and collaboration.

There is no current paid tier, hosted-key subscription, Stripe integration, proprietary proxy, macOS Dictation tier, or silence-triggered capture service. Future work should not compromise the review-before-delivery, explicit-egress, or compatibility principles above.

## Success criteria

MarkuprPlus succeeds when a user can reproduce an issue once, preserve the right visual evidence, understand exactly what will leave the machine, and hand a concise reviewed report to the next person or agent without re-explaining the session.

Source and issues: [github.com/hashfunction/MarkuprPlus](https://github.com/hashfunction/MarkuprPlus)
