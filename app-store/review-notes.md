# App Review Notes — MarkuprPlus 3.1.0

MarkuprPlus is a menu bar app for creating structured visual-feedback reports for AI coding agents. It does not require an account and has no developer-operated telemetry.

## Review walkthrough — Local Rules (no companion required)

1. Launch MarkuprPlus and complete the short onboarding flow.
2. Grant Screen Recording permission when macOS requests it. This permission is required only to capture the window, region, or display the reviewer explicitly selects.
3. Grant Microphone permission to include narration, or continue without narration.
4. Open Settings → Advanced and select Local Rules. It is ready immediately and requires no account, companion, model, credential, or network connection.
5. Press Command-Shift-F and choose a window, region, or display.
6. Use the visible Draw control to mark a finding while interacting with the selected source.
7. Press Command-Shift-F again to stop. MarkuprPlus writes a local report and opens the review surface.
8. Edit or reorder findings, preview the Markdown, and export or copy the report path.

## Optional CLI Bridge

Version 3.1.0 restores optional compatibility with Codex CLI, Claude Code CLI, OpenCode, Cursor Agent, Qwen Code, Goose, Amp, Kiro, and Aider. This feature is not required to complete the review walkthrough above.

To test it, install the public npm package in Terminal with `npm install -g markuprx@latest`, run `markuprx bridge install`, then run `markuprx bridge token`. In MarkuprPlus, open Settings → Advanced, paste that token into CLI Integrations, and choose any compatible CLI already installed and signed in for the reviewer. `markuprx bridge status` reports whether the per-user companion is running.

The companion binds only to IPv4 loopback at `127.0.0.1:49647`, requires bearer-token authentication, and accepts only a fixed structured report protocol. The Mac App Store app does not execute external command-line tools inside its sandbox, does not accept or send arbitrary shell commands, and does not install the companion. The separately installed companion invokes only the provider explicitly selected by the user.

## AI and network behavior

Local Rules is always available and requires no model or network connection. On-device Whisper transcription runs locally after a model is installed. Ollama and LM Studio use fixed loopback endpoints. Anthropic API analysis is optional, requires the reviewer's own API key, and sends content only when that provider is explicitly selected. The key is stored in macOS Keychain.

The sandboxed Mac App Store build does not execute external coding-agent command-line tools inside the sandbox and does not contain an in-app updater. Optional CLI requests use the authenticated loopback companion described above. App updates are delivered by the Mac App Store.

## Files and permissions

Capture artifacts are stored locally in the app's sandbox or a user-selected export location. Screen Recording and Microphone usage strings explain their purpose before macOS presents permission controls. The app does not request camera, contacts, calendar, location, Photos, or advertising permissions.
