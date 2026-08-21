# App Review Notes — MarkuprPlus 3.0.0

MarkuprPlus is a menu bar app for creating structured visual-feedback reports for AI coding agents. It does not require an account and has no developer-operated telemetry.

## Review walkthrough

1. Launch MarkuprPlus and complete the short onboarding flow.
2. Grant Screen Recording permission when macOS requests it. This permission is required only to capture the window, region, or display the reviewer explicitly selects.
3. Grant Microphone permission to include narration, or continue without narration.
4. Press Command-Shift-F and choose a window, region, or display.
5. Use the visible Draw control to mark a finding while interacting with the selected source.
6. Press Command-Shift-F again to stop. MarkuprPlus writes a local report and opens the review surface.
7. Edit or reorder findings, preview the Markdown, and export or copy the report path.

## AI and network behavior

Local Rules is always available and requires no model or network connection. On-device Whisper transcription runs locally after a model is installed. Ollama and LM Studio use fixed loopback endpoints. Anthropic API analysis is optional, requires the reviewer's own API key, and sends content only when that provider is explicitly selected. The key is stored in macOS Keychain.

The sandboxed Mac App Store build does not execute external coding-agent command-line tools and does not contain an in-app updater. App updates are delivered by the Mac App Store.

## Files and permissions

Capture artifacts are stored locally in the app's sandbox or a user-selected export location. Screen Recording and Microphone usage strings explain their purpose before macOS presents permission controls. The app does not request camera, contacts, calendar, location, Photos, or advertising permissions.

## Paid and open-source editions

This $9.99 App Store edition is sold for convenient Apple-managed installation and updates and to support development. A free MIT-licensed direct-download edition remains available at https://github.com/hashfunction/MarkuprPlus. The two distributions are clearly disclosed in the listing.
