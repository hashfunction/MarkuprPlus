# MarkuprPlus development

## Prerequisites

- Node.js 20.9 or newer
- npm
- ffmpeg on `PATH`
- Git
- platform build tools needed by Electron native dependencies

No provider key is required to run unit tests or use Local Rules. Local Whisper requires a downloaded model. OpenAI is a saved-key cloud fallback attempted only after local transcription is unavailable or fails; Anthropic analysis is an optional cloud path. Codex/Claude CLIs and Ollama/LM Studio require their own installations.

## Install and run

```bash
git clone https://github.com/hashfunction/MarkuprPlus.git
cd MarkuprPlus
npm install
npm run dev
```

Useful commands:

```bash
npm run build
npm run build:desktop
npm run build:cli
npm run build:mcp
npm run typecheck
npm run lint
npm run test:unit -- --run
npm run test:integration -- --run
npm run test:ui-electron
npm run verify:source
```

Package commands are listed in `package.json`. There is no generic release command; signing, notarization, and publication are credential/workflow-dependent operations.

## Repository layout

```text
src/main/       privileged Electron services and IPC handlers
src/preload/    contextBridge API
src/renderer/   React UI, overlays, media renderers
src/shared/     types, channels, compatibility/public-brand constants
src/cli/        command-line interface
src/mcp/        MCP stdio server and tools
tests/unit/     focused Vitest coverage
tests/integration/ service boundaries
tests/ui/       real-Electron Playwright coverage
scripts/        builds, generators, brand/package verifiers
```

## Runtime flow

1. Bootstrap configures public runtime branding while preserving the production compatibility user-data location.
2. Main initializes settings, handlers, recovery, session controller, tray, menus, and windows.
3. Renderer communicates through `window.markuprx` only.
4. Recording persists evidence; stopping triggers post-session transcription, frame extraction, analysis, validation, and Review.

No active OpenAI WebSocket/live-transcription or silence-triggered screenshot pipeline exists. Update infrastructure is present but no published feed is initialized.

## Provider development

Analysis adapters implement discovery/readiness, model options, cancellation, timeouts, bounded output, and the shared validation contract. Current providers are Local Rules, Ollama, LM Studio, Codex CLI, Claude Code CLI, and Anthropic API.

Never silently fail over to a different paid/cloud provider. Invalid/unavailable enhanced analysis records a reason and uses Local Rules.

Transcription work must preserve the local-first ordering: a successful downloaded local Whisper recovery must not read a saved key or construct a cloud request; configured OpenAI is considered only after local recovery is unavailable or fails.

## Desktop testing

The Electron harness uses an explicit isolated user-data path and deterministic media/input fixtures. It is rejected outside authorized test conditions. Use focused Playwright grep patterns while iterating, then run the relevant/full suite.

Portrait surfaces are 460 × 680 with one primary scroller. HUD sizes are intentionally smaller. UI changes should cover light/dark, keyboard/focus, reduced motion, forced colors, and representative zoom where relevant.

## Security checklist

- Validate IPC arguments, and add sender/origin authorization where the registration requires it; do not assume it exists globally.
- Validate filesystem containment and symlink behavior.
- Decode/validate media bytes rather than trusting MIME declarations.
- Keep generated HTML escaped and BrowserWindow preferences constrained.
- Use argument arrays for child processes; never concatenate untrusted shell input.
- Make cleanup bounded, target-specific, and awaited.
- Keep secrets out of renderer state, logs, fixtures, and docs.

## Debugging

Enable Debug Mode in Settings for additional local diagnostics. Prefer a minimal focused regression before editing. Record the exact failure, isolate the first incorrect boundary, and keep cleanup deterministic so test/app child processes do not leak into later runs.

## Packaging

Public bundles/executables/artifacts use MarkuprPlus while the package name, app ID, extension, environment variables, and other machine compatibility interfaces remain unchanged. Run `npm run verify:package` against fresh outputs. Do not claim a signed/notarized release unless the exact artifact has been verified.
