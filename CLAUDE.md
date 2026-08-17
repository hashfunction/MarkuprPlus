# CLAUDE.md

Repository guidance for coding agents working on MarkuprPlus 3.0.0.

## Product boundary

MarkuprPlus is an Electron desktop app plus compatible CLI and MCP interfaces. It records screen/audio, supports live marked evidence, performs post-session transcription/frame extraction, constructs validated multi-issue reports, and lets the user review/export/deliver them.

Public product copy is **MarkuprPlus**. Preserve machine compatibility identifiers unless a migration is explicitly designed:

- npm/package/CLI `markuprx` and MCP binary `markuprx-mcp`;
- `.markuprx`, `.markuprx.json`, `MARKUPRX_*`;
- `window.markuprx`, `markuprx:` IPC, exported API/type names;
- app ID and existing storage/keychain/migration identifiers.

## Current implementation facts

- React 18 renderer, Electron 28 main/preload boundary, TypeScript 5.3.
- Styling is repository CSS and CSS variables; Tailwind and a `cn()` utility are not installed.
- Transcription is post-session local Whisper with optional OpenAI cloud recovery.
- Analysis providers are Local Rules, Ollama, LM Studio, Codex CLI, Claude Code CLI, and Anthropic API.
- There is no paid/premium tier, hosted-key proxy, macOS Dictation tier, or silence-triggered capture.
- Desktop Review exports Markdown/PDF/HTML/JSON; CLI templates are markdown/json/github-issue/linear/jira.
- The MCP server registers nine tools, including screen description and GitHub/Linear delivery.
- Updater code exists but is not initialized against a published feed.
- Published npm/Action/desktop releases do not exist yet; use source workflows.

## Process architecture

- `src/main/`: privileged Electron services, IPC handlers, capture, providers, output, settings, recovery.
- `src/preload/`: the only renderer bridge; expose narrow typed methods.
- `src/renderer/`: React UI, media capture renderers, portrait surfaces, overlays.
- `src/shared/`: contracts/constants shared across processes.
- `src/cli/`: command-line program and templates.
- `src/mcp/`: stdio MCP server and nine tools.
- `tests/unit`, `tests/integration`, `tests/e2e`: Vitest.
- `tests/ui`: real-Electron Playwright.

Do not expose raw `ipcRenderer`, filesystem, shell, or arbitrary channels to renderer code. Privileged boundaries must validate senders, paths, inputs, and media.

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run test:unit -- --run
npm run test:integration -- --run
npm run build
npm run test:ui-electron
npm run verify:source
```

Build/package commands are defined in `package.json`. There is no generic release command; do not document or invoke one. Signing/notarization depends on externally supplied credentials and must be verified on the actual artifact.

## Development rules

1. Read the nearest `AGENTS.md` if one is present, plus the applicable written plan before editing.
2. Add a failing regression first for behavior changes.
3. Preserve unrelated user changes and compatibility identifiers.
4. Keep renderer privilege narrow and IPC enumerated.
5. Treat renderer-provided paths/base64/provider output as untrusted.
6. Keep output deterministic and include public MarkuprPlus attribution.
7. Use Local Rules as the explicit analysis fallback; never silently switch to a cloud provider.
8. Verify focused tests, typecheck/lint, relevant integration/real-Electron tests, and build before claiming completion.

## Data flow

Local Whisper and Local Rules run on the machine. Ollama/LM Studio use local loopback. Codex/Claude CLIs use their configured accounts. Anthropic/OpenAI, screen description, GitHub, and Linear may receive selected content when invoked. MarkuprPlus adds no telemetry, but that does not make every provider local.

## Model downloads

Whisper model downloads are approximately tiny 75 MB, base 142 MB, small 466 MB, medium 1.5 GB, and large 3.1 GB. Do not describe every install as shipping with a model.

## Public links

- Source: https://github.com/hashfunction/MarkuprPlus
- Issues: https://github.com/hashfunction/MarkuprPlus/issues
- Canonical future home: https://markuprplus.com (not currently a download channel)
- Upstream attribution is recorded in the README's dedicated provenance section.
