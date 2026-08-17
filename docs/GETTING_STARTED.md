# Getting started with MarkuprPlus

MarkuprPlus is currently available from source. There are no published desktop downloads, GitHub Releases, npm package, or GitHub Action release yet. [markuprplus.com](https://markuprplus.com) is the canonical forthcoming home, not a current download page.

## Supported development path

- **macOS:** desktop development, real-Electron testing, and unsigned x64/arm64/universal packaging are exercised by the repository.
- **Windows:** packaging and taskbar integration are configured, but treat them as pre-release until a signed Windows artifact is independently validated.
- **Linux desktop:** future-facing; CLI/MCP portability is separate from a supported desktop release.

You need Node.js 20.9 or newer, npm, ffmpeg on `PATH`, source-build disk space, recording space, and additional room for any Whisper model (75 MB–3.1 GB).

## Build from source

```bash
git clone https://github.com/hashfunction/MarkuprPlus.git
cd MarkuprPlus
npm install
npm run dev
```

Build all interfaces with:

```bash
npm run build
```

The retained lower-case CLI and MCP names are compatibility interfaces. They are not currently available from npm; run `node dist/cli/index.mjs --help` and `node dist/mcp/index.mjs` after building.

## First-run onboarding

The contained onboarding flow has six stages:

1. **Welcome** — an overview of the screen-and-voice workflow.
2. **Microphone** — request and verify audio input permission.
3. **Screen Recording** — request capture permission.
4. **OpenAI transcription** — optional cloud transcription setup; it may be skipped when using local Whisper.
5. **Analysis** — optionally validate/save an Anthropic API key and learn that analysis providers can be chosen later in Settings; this onboarding stage does not perform provider discovery or selection.
6. **Success** — complete setup and open the Start surface.

On macOS, screen-recording permission changes can require restarting the app. Accessibility permission is optional but improves reliable global modifier observation for live annotation. MarkuprPlus exposes explicit annotation fallback controls; do not grant administrator access.

## Choose a processing path

### Local-first

1. Download a Whisper model in Settings.
2. Select Local Rules, Ollama, or LM Studio for report analysis.
3. If using Ollama/LM Studio, start the local service and choose a compatible model.

Local Whisper and Local Rules need no cloud request. Post-session recovery tries local Whisper first; only if it is unavailable or fails can a previously saved OpenAI key enable the cloud fallback. Ollama/LM Studio remain local only when configured on the local machine.

### CLI-backed analysis

Install and authenticate Codex CLI or Claude Code CLI, then select it in Settings. These tools follow their own account and service behavior; “CLI” does not automatically mean offline.

### Cloud processing

OpenAI transcription and Anthropic analysis require their respective keys. New key saves use the OS credential service or protected Electron storage and fail closed rather than writing plaintext when secure storage is unavailable; review [Configuration](CONFIGURATION.md#storage-and-migration) before saving a hosted key. OpenAI receives encoded audio only after local recovery is unavailable or fails. Anthropic receives selected report content when chosen for analysis.

## Record a session

1. Choose **Start Recording** from the tray/taskbar menu or press `CmdOrCtrl+Shift+F`.
2. Select a window, region, or display.
3. Narrate what you are doing.
4. Use `CmdOrCtrl+Shift+S` for a manual frame cue.
5. Hold Command (macOS) or Control (Windows) to annotate when global modifier access is available, or use the explicit Draw control. Freehand, circle, and highlight tools are available.
6. Commit each marked issue so its screenshot and context stay separate.
7. Stop recording and wait for post-session transcription/frame extraction.
8. Review, edit, categorize, and save or export the findings.

## Review and history

The Review Editor supports multiple issues, screenshots, categories, severity, reordering, editing, and deletion. Session History can search/sort sessions, open folders, delete, and export selected sessions. Incomplete persisted evidence can be recovered after an interrupted run.

Desktop Review export supports Markdown, PDF, HTML, and JSON. The CLI separately supports `markdown`, `json`, `github-issue`, `linear`, and `jira` templates.

## Next steps

- [Configuration](CONFIGURATION.md)
- [Keyboard shortcuts](KEYBOARD_SHORTCUTS.md)
- [MCP server](../README-MCP.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [GitHub Issues](https://github.com/hashfunction/MarkuprPlus/issues)
