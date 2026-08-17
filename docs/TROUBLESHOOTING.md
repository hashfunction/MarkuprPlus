# MarkuprPlus troubleshooting

Use the least destructive check that can explain the problem. Do not delete application or session directories as a first step.

## App does not start

From a source checkout:

```bash
node --version
npm install
npm run typecheck
npm run build:desktop
npm run dev
```

Node.js must be 20.9 or newer and ffmpeg must be on `PATH` for media workflows. Capture the terminal error when opening an issue.

Packaged macOS application paths use the public app name, for example `/Applications/MarkuprPlus.app`. Unsigned local builds may require an explicit one-time approval in System Settings; official signing/notarization is not claimed until a release artifact is published and verified.

## Compatibility data paths

The legacy user-data directory remains `MarkuprX` as a compatibility path.

Production deliberately points Electron `userData` there so upgrades keep settings, credentials, and recovery state. Do not rename that directory. The default session output remains `~/Documents/markuprx` and can be changed in Settings.

## Credential fallback and safe cleanup

MarkuprPlus tries the OS credential service, then Electron `safeStorage`. If both fail, it can store an API key as an owner-only plaintext entry in `secure-keys.json`. Best-effort mode `0600` limits ordinary file access but does not encrypt the value.

The fallback file is inside the compatibility user-data directory named above. Its parent is normally `~/Library/Application Support` on macOS, `%APPDATA%` on Windows, and `$XDG_CONFIG_HOME` (or `~/.config`) on Linux. Do not open, print, attach, or back up the file: encrypted and plaintext entries can both be sensitive, and older installations may also contain a legacy fallback map in `settings.json`.

To clear stored OpenAI/Anthropic keys without viewing them:

1. Back up any session output you need.
2. Open Settings → Advanced.
3. Choose **Clear All Data** and confirm.

Clear All Data removes the configured output directory, attempts current/legacy keychain and fallback cleanup, resets settings, and clears recovery data. It is intentionally destructive. Credential cleanup is best-effort: backend deletion failures can be logged while the action completes, so completion is not proof that every stored entry was erased. If confirmation matters, use the operating system credential manager to verify/remove the app's entries without printing their values. If you cannot use a supported OS keychain or Electron `safeStorage`, omit hosted API keys and select a no-key path such as Local Rules/local Whisper instead.

To diagnose a settings problem safely:

1. Quit the app.
2. Back up only needed session output or recovery artifacts, explicitly excluding `secure-keys.json`, `settings.json`, and Settings Export files that may contain older secret material. Do not copy the entire compatibility user-data directory.
3. Relaunch and record non-secret settings manually; the current Settings Export is not a safe general backup because it reads raw persisted state.
4. Use the in-app reset/clear actions only after reading their confirmation and preserving needed session data.

Exported settings use `MarkuprPlus-settings.json`; compatible older JSON exports can still be selected during import, but both old and current exports must be treated as sensitive until inspected through a hardened non-secret projection.

## Screen capture is blank or unavailable

### macOS

1. Open System Settings → Privacy & Security → Screen Recording.
2. Enable MarkuprPlus or the terminal/editor running the development build.
3. Quit and relaunch after changing the permission.
4. Select the exact display/window again.

### Windows

Confirm the target window is visible and not protected by DRM/secure-desktop restrictions. Windows desktop support is pre-release until a signed artifact is independently validated.

## Microphone is unavailable

1. Confirm the intended device is connected and selected in Settings.
2. Check OS microphone permission for MarkuprPlus (or the development host).
3. Verify another app is not holding the device exclusively.
4. Use the recording waveform/level display to confirm input before a long session.

## Annotation does not activate

On macOS, Accessibility permission improves global Command-key observation. Without it, use the visible Draw/Done fallback control. On Windows the modifier is Control. Annotation tools are freehand, circle, and highlight.

If a modifier seems stuck, release it and use the explicit fallback control. Pause returns annotation to interaction mode for safety.

## Transcription failed

### Local Whisper

- Confirm a model is downloaded in Settings.
- Confirm the model file is complete and there is enough disk space.
- Retry with the base/tiny model when diagnosing memory or download constraints.
- Remember that transcription occurs after the session stops, not continuously during recording.

### OpenAI recovery

- Confirm an OpenAI key is stored and valid.
- Confirm network access and account availability.
- Understand that selected audio is sent to OpenAI when this path is used.

Capture evidence remains valuable even if transcription fails; inspect the session/recovery state before deleting anything.

## Analysis provider is unavailable

- **Local Rules:** requires no external service and is the deterministic fallback.
- **Ollama/LM Studio:** start the loopback service, load a model, and refresh discovery.
- **Codex/Claude Code CLI:** install the executable, authenticate it, and confirm it runs outside MarkuprPlus.
- **Anthropic API:** validate the stored key and network access.

MarkuprPlus does not silently switch to another cloud provider. The report records fallback diagnostics when Local Rules is used.

## Session is stuck or app exited

The session state machine has bounded starting/stopping/processing states. Reopen MarkuprPlus and use the Crash Recovery dialog if incomplete persisted evidence is found. Choose Recover before Discard when the evidence matters.

For a recovered session, verify its screenshots and transcript before exporting. A recovery report may contain warnings when an expected artifact could not be restored.

## Export failed

- Confirm the destination exists and is writable.
- Avoid exporting through a symlinked/untrusted screenshot directory.
- Confirm source screenshot bytes still exist and are supported PNG/JPEG/WebP media.
- For Markdown, enabling images creates contained colocated assets; disabling images removes screenshot references.
- HTML/PDF can embed evidence; JSON is deliberately metadata-oriented.

## CLI or MCP does not run

The npm package is not published today. Build from source:

```bash
npm run build:cli
npm run build:mcp
node dist/cli/index.mjs --help
node dist/mcp/index.mjs
```

Use an absolute MCP server path and restart the client after configuration changes. Diagnostics are written to stderr.

## Logs and issue reports

Debug mode adds local diagnostics. Electron logs and recovery data live under the preserved user-data location; session artifacts live under the configured output directory. Avoid attaching API keys, private audio, screenshots, or full settings files to a public issue.

When reporting a reproducible bug, include:

- MarkuprPlus version/commit;
- OS and architecture;
- source or packaged run method;
- selected transcription and analysis provider names (never keys);
- concise reproduction steps;
- sanitized error/log excerpt.

Use [GitHub Issues](https://github.com/hashfunction/MarkuprPlus/issues) for ordinary bugs and requests. Follow [SECURITY.md](../SECURITY.md) for vulnerabilities. [markuprplus.com](https://markuprplus.com) is the canonical forthcoming home, not a current download/support service.
