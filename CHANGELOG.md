# Changelog

All notable changes to MarkuprPlus will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased — MarkuprPlus

- Rebranded the public desktop experience and documentation as MarkuprPlus.
- Preserved existing `markuprx` CLI, MCP, IPC, storage, and package compatibility.
- Added a portrait-first taskbar popover experience and new README screenshot gallery.
- Removed the Ko-fi donation surface: in-app donate button, tray menu entry, generated report and HTML footers, funding metadata, and all sponsor copy across the docs and site.
- Updated the documentation and website branding from MarkuprX to MarkuprPlus, including the site wordmark and the markuprplus.com domain.
- Windows publisher identity is derived from the signing certificate; signed releases must verify the actual certificate subject.
- macOS releases are now signed with a Developer ID Application certificate, notarized by Apple, and stapled, so they open without a Gatekeeper warning and validate offline.
- Added `npm run release:mac`, which builds, signs, notarizes, staples, and verifies a macOS release in one step.
- Added `npm run verify:signing`, which fails a release whose artifacts Gatekeeper would block.
- Added `npm run notarize:dmg`, which notarizes and staples the disk images that are assembled after the app bundle is signed.

### Fixed

- Removed the unconfigured repository update feed and its dead update/support entry points.
- The release pipeline no longer falls back to an unsigned macOS build when signing secrets are absent; it now fails with the list of missing secrets instead of publishing an app macOS refuses to open.
- Notarization no longer skips silently: missing credentials, a non-Developer ID certificate, or a failed submission now fail the release build.
- Release notes now list the real `markuprplus-*` artifact names and no longer overwrite the curated changelog.

## 3.1.0 - 2026-08-30

### Added

- Restored Codex CLI, Claude Code CLI, OpenCode, Cursor Agent CLI, Qwen Code, Goose, Amp, Kiro CLI, and Aider report providers in the Mac App Store app through an optional local companion.
- Added `markuprx bridge` lifecycle commands for secure per-user installation, status, pairing-token rotation, restart, and removal.
- Added a Store-only setup panel with copyable commands, Keychain-backed pairing, connection diagnostics, and live provider readiness.

### Security

- The companion accepts only a versioned, path-free report protocol on authenticated IPv4 loopback and never accepts arbitrary executables, arguments, shell text, environment variables, working directories, or filesystem paths.
- Bridge requests have strict body, screenshot, transcript, timeout, and concurrency limits. Pairing tokens are generated from 32 random bytes and stored with owner-only permissions and in macOS Keychain.

### Changed

- Bumped the Mac App Store bundle to version 3.1.0, build 3, with updated privacy disclosures and App Review instructions.

## 3.0.0 - 2026-08-15

### Added

- Added a protected QuickTime-style capture selector with exact Window capture by default, arbitrary Region capture, and explicit Full Screen capture across multiple displays.
- Added Command-drag on macOS and Control-drag on Windows for temporary live markup without blocking normal mouse use.
- Added separately captured marked issues, each with its own annotated PNG, timestamp, tools, colors, and matching transcript comment across Markdown, HTML, JSON, GitHub, Linear, and Jira output.
- Added one-way migration for existing local settings, recovery state, models, keychain credentials, and saved sessions.
- Added repository-wide brand enforcement and multi-issue integration coverage.

### Changed

- Capture selection now fails closed when monitor/source identity or native window geometry is ambiguous instead of widening to another screen.
- Recording startup, pause, source-close, encoder-error, overlay-crash, and rapid teardown paths now release capture, audio, annotation, and persistence state together.
- Rebranded the desktop app, CLI, MCP server, packages, IPC namespace, context bridge, installers, action, site, documentation, and storage defaults to MarkuprX / `markuprx`.

## 2.6.8 - 2026-02-17

- fix: resolve macOS DMG mount collision during parallel builds (arm64/x64 volumes now use unique names)
- chore: bump version to 2.6.8

## 2.6.7 - 2026-02-16

- feat: context-aware capture with cue-time alignment across app and MCP
- fix: stabilize BYOK dark mode and readiness sync
- docs: desktop-first launch messaging updates
- docs: add CLI demo GIF and logo PNG to README
- release: v2.6.7 stability and launch polish

## 2.6.6 - 2026-02-15

### Fixed
- Removed duplicate renderer `ThemeProvider` nesting that could apply conflicting theme variables and cause low-contrast/dark text in BYOK settings under dark mode.
- Fixed BYOK key readiness sync in Settings > Advanced by recalculating both OpenAI and Anthropic key presence after each successful key save.
- Fixed main capture card readiness state so successful OpenAI key setup is reflected immediately instead of getting stuck on `Add OpenAI Key`.

## 2.6.5 - 2026-02-15

### Added
- Added cue-time capture context snapshots for marked screenshots:
  - cursor position
  - active window/app hints
  - focused element hints (renderer DOM + macOS accessibility best-effort)
- Added context-aware frame/report enrichment:
  - extracted frames can carry nearest capture context metadata
  - markdown and template outputs now include context hints when available
  - JSON template now includes `captureContext` per frame
- Added MCP context metadata capture and persistence:
  - `capture_screenshot` now stores cursor/app/focus hints in session metadata
  - recording tools persist start/stop context snapshots

### Changed
- Expanded session metadata schemas (desktop + MCP) to include capture context history.
- Manual screenshot IPC now accepts optional focused-element context from renderer.

## 2.6.4 - 2026-02-15

### Fixed
- Added Anthropic API key setup directly into onboarding (OpenAI step followed by Anthropic step).
- Fixed stale BYOK/transcription readiness state after saving keys by broadcasting and listening for `markuprx:settings-updated` events.
- Fixed renderer crash risk when `window.markuprx.processing` is unavailable by guarding progress subscriptions.
- Improved Settings panel contrast in dark mode by replacing hardcoded dark colors with theme tokens.
- Cleaned landing page premium section copy to remove internal launch-plan phrasing.

### Changed
- Standardized user-facing branding text to `MarkuprX` across updated onboarding/settings/landing surfaces.

## 2.3.0 - 2026-02-14

### Security
- Removed `dangerouslySetInnerHTML` XSS vector from UpdateNotification (React component rendering)
- Enabled `sandbox: true` on all BrowserWindow instances
- Added IPC input validation across all handler files (type checks, range checks, whitelists)
- Added prototype pollution prevention on settings import
- Added API key service whitelist (openai, anthropic only)
- Added path containment checks on session deletion and folder opening
- Added Whisper model name whitelist
- Restricted child process environment variables (no API key leakage)
- Added `window.open` protocol validation (https/http only)
- Tightened CSP with explicit `connect-src`, `img-src`, `media-src`, `frame-ancestors`
- Set `chmod 0600` on temp audio files and plaintext API key fallback

### Robustness
- Added double-start race condition guard on recording toggle
- Fixed watchdog timer to only run during active sessions (saves 86,400 CPU wake-ups/day)
- Added `isDestroyed()` checks on all BrowserWindow access (12 instances)
- Added `safeSendToRenderer()` helper for crash-safe IPC sends
- Added 200MB audio memory cap to prevent OOM on long sessions
- Added synchronous crash logging for reliable persistence
- Added per-chunk Whisper timeout (60s) to prevent infinite hangs
- Added error boundaries on all IPC session handlers
- Added write chain error resilience in capture handlers
- Fixed `forceRecovery` re-entry guard
- Fixed session state consistency after forced transitions
- Added recovery buffer cleanup on normal app quit

### CLI
- Added proper signal handling (SIGINT/SIGTERM kill child processes, clean up temp files)
- Added video file validation (exists, is file, non-empty, contains video stream via ffprobe)
- Added ffmpeg availability check at startup with platform-specific install hints
- Added temp file cleanup in `finally` block (no more leaked WAV files)
- Added machine-parseable `OUTPUT:` prefix line for AI agent consumption
- Added meaningful exit codes (0=success, 1=user error, 2=system error)
- Added `OPENAI_API_KEY` env var support (primary) with CLI flag as override with security warning
- Added progress indicators visible in non-verbose mode

### Output Quality
- Fixed timestamp unit mismatch in AI-enhanced documents (seconds vs milliseconds)
- Restored FB-XXX IDs in AI-enhanced markdown (consistent with free tier)
- Fixed `wrapTranscription` malformed blockquotes for 2-sentence transcripts
- Fixed PDF export for image-heavy sessions (temp file approach vs data: URL limit)
- Added buffer-to-base64 fallback in HTML export for missing screenshot data
- Added short-circuit for Claude API on empty sessions (saves API calls)
- Fixed `inferCategory` over-matching ("address" no longer matches "add")
- Added deterministic date formatting (consistent across platforms)
- Added rich metadata to markdown output (segment count, frame count, duration, platform)
- Improved error messages across the codebase (actionable guidance, no stack trace leaks)

### Accessibility (Landing Page)
- Added skip-to-content link
- Added `<main>` landmark element
- Added focus trap on donate modal with focus return
- Fixed ARIA radiogroup pattern (role="radio" + aria-checked)
- Added screen reader text for external links
- Added focus-visible styles with amber outline
- Fixed color contrast ratios (dark mode tertiary, light mode tertiary, light mode accent)
- Fixed donate modal light mode (text was invisible on dark background)
- Added noscript fallback for scroll-reveal content

### Platform Compatibility
- Added Windows environment variables (USERPROFILE, TEMP) to child process environments
- Fixed WhisperService models directory fallback (os.homedir() instead of /tmp)
- Made tooltip shortcuts platform-aware (Cmd on macOS, Ctrl on Windows/Linux)
- Made permission error messages reference correct OS settings panels
- Added platform-specific ffmpeg install hints (brew/winget/apt/dnf)

### Documentation
- Rewrote CONTRIBUTING.md with pipeline explanation, architecture reference, testing guide
- Added "Why MarkuprX?" positioning section to README
- Fixed AI_AGENT_QUICKSTART.md critical broken commands
- Fixed stale version references across docs and templates
- Removed documented-but-unimplemented --openai-key flag from README

### Testing
- Added 126 new tests across 5 new test files (389 to 515 total)
  - CrashRecovery (31 tests): serialization, crash detection, log sanitization, session detection
  - ErrorHandler (31 tests): categorization, rotation, buffering, rate limiting
  - MarkdownGenerator (21 tests): output format, heading structure, input combinations
  - FrameExtractor (24 tests): command building, timestamp distribution, normalization
  - ExportService (19 tests): all formats, error handling, filename generation

## 2.2.0 - 2026-02-13

### Highlights
**Standalone CLI mode and npm distribution.** MarkuprX can now be installed via `npm install -g markuprx` or run with `npx markuprx analyze` -- no Electron or desktop app required.

### Added
- **Standalone CLI mode** (`MarkuprX analyze <video>`) for npm/bun install -- no Electron required (#21)
- **Platform-aware download buttons** on website for Mac ARM, Mac Intel, and Windows
- **Visual walkthrough animation** on homepage

### Changed
- **npm package trimmed from 509KB to 86KB** by removing Electron bloat from the published package
- Landing page repositioned with new tagline: "You see it. You say it. Your AI fixes it." (#23)

### Fixed
- Restored Electron main entry point removed by CLI feature addition (#25)
- Windows NSIS installer: resolved macro collision, simplified custom hooks
- Windows release packaging: fixed unsigned builds, limited to x64
- Release workflow conditionals for tag-based builds
- Windows postinstall script and CI coverage
- Landing page download links now always point to latest release
- Download CTA no longer points to old v0.4.0 FeedbackFlow release
- Direct DMG download link instead of releases page redirect

### Dependencies
- Bumped `@electron/notarize` from 2.2.1 to 3.1.1 (#18)
- Bumped npm minor/patch dependencies (#22)

## 2.1.0 - 2026-02-08

### Highlights
**Architecture refactor.** Decomposed god components, adopted a unified theme system, and improved accessibility across the entire UI.

### Changed
- Comprehensive architecture refactor: decomposed monolithic components into focused modules
- Adopted unified theme system with CSS variables
- Improved accessibility (a11y) across all components
- Removed internal planning docs for public launch
- CI dependency updates (GitHub Actions group bump)

### Fixed
- Shell styling regression

## 2.0.0 - 2026-02-05

### Highlights
**Public launch release.** MarkuprX goes open source under MIT license.

### Added
- **Post-processing pipeline**: transcribe -> analyze -> extract frames -> generate structured Markdown
- **AI analysis pipeline** with Claude vision and video timestamp alignment
- **Key-moment detection** correlates transcript timestamps with screen recording
- **ffmpeg-based frame extraction** pulls precise frames from video at key moments
- **Intelligent Markdown output** optimized for LLM consumption (llms.txt inspired)
- **Clipboard bridge** copies file path (not content) to clipboard after session

### Changed
- Complete rebrand from FeedbackFlow to MarkuprX
- Replaced real-time capture with post-processing pipeline architecture
- Removed Deepgram tier; transcription is now OpenAI API or local Whisper
- Mic capture replaced with MediaRecorder pipeline

### Removed
- Deepgram transcription integration
- Real-time screenshot capture (replaced by post-processing frame extraction)

## 1.0.0 - 2026-02-04

### Highlights
**MarkuprX Initial Public Release** - Voice-to-AI feedback for developers. Free and open source.

### Added
- **Bulletproof State Machine**: 7-state finite state machine with watchdog timer - can never get stuck
- **Menu Bar Native**: Runs entirely from the menu bar (no dock icon)
- **Three-Tier Transcription**: OpenAI (premium) -> Whisper (default) -> Timer fallback
- **Crash Recovery**: 5-second auto-save ensures no work is lost
- **Offline Mode**: Local Whisper transcription works without internet
- **Platform-Aware Hotkeys**: Cmd on Mac, Ctrl on Windows - just works
- **Donate Button**: Rotating messages for supporting the developer
- **Windows Taskbar Integration**: Overlay icons and toolbar buttons

### Changed
- Default transcription now uses local Whisper (no API key required)
- Improved documentation with comprehensive guides
- Enhanced stability across all platforms

### Technical
- State machine: IDLE -> STARTING -> RECORDING -> STOPPING -> PROCESSING -> REVIEWING -> EXPORTING
- Watchdog monitors state transitions with configurable timeouts
- Recovery manager handles unexpected exits gracefully

## 0.4.0 - 2026-02-02

### Added
- **Export Options**: PDF, HTML, and JSON export formats
- **AI-Powered Categorization**: Automatic feedback categorization (Bug, Feature, UX)
- **Crash Recovery**: Automatic session recovery after unexpected crashes
- **Auto-Updater**: Seamless application updates with release notes
- **Keyboard Shortcuts Panel**: In-app cheatsheet with customization
- **Session History Browser**: View and manage past recording sessions
- **Multi-Monitor Support**: Full support for multiple displays with source preview
- **Screenshot Annotations**: Arrow, circle, rectangle, freehand, and text tools
- **Audio Waveform Visualization**: Real-time audio level display
- **Countdown Timer**: Optional countdown before recording starts
- **Clarification Questions**: AI-generated follow-up questions for unclear feedback
- **Native macOS Menu Bar**: Full menu bar integration

### Changed
- Improved Settings panel with live preview
- Enhanced onboarding wizard with better guidance
- Better error messages and user feedback
- Upgraded to Electron 28

### Fixed
- Fixed screenshot timing during rapid speech
- Fixed hotkey registration on Windows
- Fixed memory leak during long sessions
- Fixed clipboard copy on some macOS versions

## 0.3.0 - 2026-01-15

### Added
- **Real-time Transcription Preview**: See transcription as you speak
- **Intelligent Screenshot Timing**: Voice activity detection triggers captures
- **Tray Icon States**: Visual feedback for idle/recording/processing/error
- **Settings Panel**: Comprehensive configuration UI
- **Session Review**: Edit, reorder, and delete feedback items before export
- **Theme System**: Dark, light, and system theme options

### Changed
- Improved OpenAI integration with better error handling
- Enhanced Markdown output format for AI consumption
- Better screenshot compression

### Fixed
- Fixed audio capture on Windows
- Fixed window selector thumbnail generation
- Fixed crash when OpenAI connection drops

## 0.2.0 - 2026-01-01

### Added
- **Window Selector**: Choose specific windows or screens to capture
- **Manual Screenshot**: Hotkey to capture screenshots on demand
- **Output Directory Setting**: Choose where sessions are saved
- **Clipboard Integration**: Auto-copy summary to clipboard

### Changed
- Improved UI responsiveness
- Better error messages

### Fixed
- Fixed hotkey conflicts with system shortcuts
- Fixed screenshot resolution on Retina displays

## 0.1.0 - 2025-12-15

### Added
- Initial release
- Voice narration capture with OpenAI transcription
- Automatic screenshot capture on voice pauses
- Markdown document generation
- Global hotkey to start/stop recording (`Cmd+Shift+F`)
- System tray icon
- Basic settings (API key configuration)

---

## Version History Summary

| Version | Date | Highlights |
|---------|------|------------|
| 2.3.0 | 2026-02-14 | **Hardening** - security, robustness, a11y, 126 new tests |
| 2.2.0 | 2026-02-13 | **CLI mode**, npm distribution, package size reduction |
| 2.1.0 | 2026-02-08 | Architecture refactor, theme system, a11y |
| 2.0.0 | 2026-02-05 | **Public launch** - post-processing pipeline, MarkuprX rebrand |
| 1.0.0 | 2026-02-04 | **Initial Public Release** - Bulletproof state machine, offline Whisper |
| 0.4.0 | 2026-02-02 | Export formats, crash recovery, auto-updater |
| 0.3.0 | 2026-01-15 | Transcription preview, intelligent capture, settings |
| 0.2.0 | 2026-01-01 | Window selector, manual screenshots |
| 0.1.0 | 2025-12-15 | Initial scaffold |
