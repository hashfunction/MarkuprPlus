# MarkuprPlus configuration

Open Settings from the tray/taskbar menu or with `Cmd+,` on macOS and `Ctrl+,` elsewhere. Settings use the same scrollable portrait window as the rest of the app.

## General

### Output directory

New sessions default to `~/Documents/markuprx`. The lower-case directory is retained for compatibility. Choose another writable directory in Settings if desired.

A completed session can contain its recording, audio, transcript, metadata, screenshots, and generated report. Keep enough disk space for recordings and any downloaded Whisper models.

### Updates

The `checkForUpdates` setting and update IPC surface exist, but the current application does not initialize a published update feed and packaging has no release publisher configured. Treat updates as manual source updates until a signed release channel is announced.

## Recording

- **Countdown:** `0` by default; `3` or `5` seconds are available.
- **Audio waveform:** controls the recording feedback visualization.
- **Audio device:** uses the selected input or system default.

Pause/resume temporarily stops and restarts capture components. It is not a promise that a hidden recovery buffer continues recording audio while paused.

## Capture

- Image format: PNG or JPEG.
- JPEG quality: 1–100; default 85.
- Maximum image width: 800–2400; default 1920.
- Manual screenshot hotkey: `CmdOrCtrl+Shift+S` by default.
- Annotation tools: freehand, circle, and highlight.

The current session controller does not perform automatic silence-triggered screenshots. Use manual cues or commit an annotated issue.

## Transcription

Local Whisper requires a downloaded model. Available downloads are approximately:

| Model | Download |
|---|---:|
| Tiny | 75 MB |
| Base | 142 MB |
| Small | 466 MB |
| Medium | 1.5 GB |
| Large | 3.1 GB |

Post-session recovery tries local Whisper first when PCM audio and a downloaded model are available. Only after local transcription is unavailable or fails does it read a configured OpenAI key and, when encoded audio exists, use OpenAI as a cloud fallback. That audio leaves the machine and is handled according to OpenAI's service terms. Without a saved key, recovery makes no OpenAI request.

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

Session audio and recordings are saved alongside completed reports for transcription and agent handoff. Clear All Data is destructive and asks for confirmation; back up needed sessions first.

Older settings files can contain `launchAtLogin`, `showTranscriptionPreview`, `pauseThreshold`, `minTimeBetweenCaptures`, `debugMode`, and `keepAudioBackups`. These keys remain accepted for import/storage compatibility, but they are not presented as active controls because the current runtime does not implement the behavior those names previously promised.

MarkuprPlus does not add telemetry. Provider requests and delivery integrations are separate, explicit data flows.

## Storage and migration

Application settings are stored as `settings.json` under Electron's preserved compatibility user-data location. Sessions are written to the configured output directory.

New API-key saves attempt, in order:

1. the operating system credential service through keytar;
2. a genuinely protected Electron `safeStorage` entry.

New credential writes fail closed when neither mechanism is available, with no plaintext fallback. Linux `safeStorage` reporting the unprotected `basic_text` backend is rejected. Omit hosted API keys when supported secure storage is unavailable. Local Whisper and Local Rules require no hosted key; local Ollama/LM Studio avoid an app-stored hosted key as well.

Legacy profiles can contain older credential material. Migration copies it only through a verified secure write and read-back, then attempts removal of the legacy source; cleanup failures retain the source for a later retry. Do not inspect, print, attach, or casually back up credential storage files.

Settings → Advanced → Clear All Data removes only verified app-owned session directories, leaving the configured root and unrelated children intact. It attempts all credential stores, recovery cleanup, and settings reset even after a failure, then shows a stable partial result that can be retried. Credential-backend cleanup remains best-effort, so a completed action is not proof that every OS keychain entry was erased. See [Troubleshooting](TROUBLESHOOTING.md) for safe backup and cleanup guidance.

Export Settings creates `MarkuprPlus-settings.json` from an allowlisted public settings projection that excludes secrets and unknown/internal persisted data. Import accepts a compatible older JSON filename, rejects unknown/dotted/internal keys and invalid values, and applies nothing unless the complete file validates atomically.

Machine-facing names remain stable: `.markuprx.json`, `.markuprx`, `MARKUPRX_*`, `window.markuprx`, and `markuprx:` IPC identifiers are not public display branding.

For exact legacy paths and safe recovery steps, see [Troubleshooting](TROUBLESHOOTING.md).
