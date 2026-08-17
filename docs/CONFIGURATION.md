# MarkuprPlus configuration

Open Settings from the tray/taskbar menu or with `Cmd+,` on macOS and `Ctrl+,` elsewhere. Settings use the same scrollable portrait window as the rest of the app.

## General

### Output directory

New sessions default to `~/Documents/markuprx`. The lower-case directory is retained for compatibility. Choose another writable directory in Settings if desired.

A completed session can contain its recording, audio, transcript, metadata, screenshots, and generated report. Keep enough disk space for recordings and any downloaded Whisper models.

### Launch at login

Disabled by default. Enabling it registers the packaged app with the operating system. Development builds may not behave like an installed application.

### Updates

The `checkForUpdates` setting and update IPC surface exist, but the current application does not initialize a published update feed and packaging has no release publisher configured. Treat updates as manual source updates until a signed release channel is announced.

## Recording

- **Countdown:** `0` by default; `3` or `5` seconds are available.
- **Transcription preview:** retained setting; current capture performs post-session transcription rather than promising live transcription.
- **Audio waveform:** controls the recording feedback visualization.
- **Audio device:** uses the selected input or system default.

Pause/resume temporarily stops and restarts capture components. It is not a promise that a hidden recovery buffer continues recording audio while paused.

## Capture

- Image format: PNG or JPEG.
- JPEG quality: 1–100; default 85.
- Maximum image width: 800–2400; default 1920.
- Manual screenshot hotkey: `CmdOrCtrl+Shift+S` by default.
- Annotation tools: freehand, circle, and highlight.

The retained pause-threshold and minimum-capture-interval fields are accepted for compatibility, but the current session controller does not perform automatic silence-triggered screenshots. Use manual cues or commit an annotated issue.

## Transcription

Local Whisper requires a downloaded model. Available downloads are approximately:

| Model | Download |
|---|---:|
| Tiny | 75 MB |
| Base | 142 MB |
| Small | 466 MB |
| Medium | 1.5 GB |
| Large | 3.1 GB |

OpenAI transcription is an optional cloud recovery path when its key is configured. Audio selected for that path leaves the machine and is handled according to OpenAI's service terms.

## Analysis

Choose one provider and, when offered, a model:

| Provider | Connection | Setup |
|---|---|---|
| Local Rules | Local | None |
| Ollama | Local | Run Ollama on its fixed loopback endpoint and install a model |
| LM Studio | Local | Run the local server and load a model |
| Codex CLI | CLI | Install and authenticate `codex` |
| Claude Code CLI | CLI | Install and authenticate `claude` |
| Anthropic API | Cloud | Store an Anthropic API key in Settings |

CLI providers follow the installed CLI's account and data flow. Anthropic receives selected report input when used. Local services stay local only when they are genuinely bound to the local machine.

If enhanced analysis is unavailable or invalid, MarkuprPlus records the reason and falls back to Local Rules instead of silently using another cloud provider.

## Hotkeys

Defaults:

| Action | Accelerator |
|---|---|
| Start/Stop | `CmdOrCtrl+Shift+F` |
| Manual frame cue | `CmdOrCtrl+Shift+S` |
| Pause/Resume | `CmdOrCtrl+Shift+P` |

Settings validates global accelerators and reports conflicts. Reset restores these defaults.

## Appearance and accessibility

- Theme: system (default), light, or dark.
- Accent color: configurable.
- Reduced motion and forced-colors modes follow operating-system/browser preferences.
- macOS Accessibility permission improves global Command-key annotation tracking; explicit Draw/Done controls remain available as a fallback.

## Diagnostics and retention

- Debug mode increases local diagnostic output.
- Keep audio backups is off by default.
- Clear All Data is destructive and asks for confirmation; back up needed sessions first.

MarkuprPlus does not add telemetry. Provider requests and delivery integrations are separate, explicit data flows.

## Storage and migration

Application settings are stored as `settings.json` under Electron's preserved compatibility user-data location. Secrets use the OS credential service when available and the existing encrypted fallback otherwise. Sessions are written to the configured output directory.

Export Settings creates `MarkuprPlus-settings.json`. Import accepts an existing compatible JSON file regardless of its old filename, validates recognized fields, and does not require renaming the file first.

Machine-facing names remain stable: `.markuprx.json`, `.markuprx`, `MARKUPRX_*`, `window.markuprx`, and `markuprx:` IPC identifiers are not public display branding.

For exact legacy paths and safe recovery steps, see [Troubleshooting](TROUBLESHOOTING.md).
