# CLAUDE.md - MarkuprX

## Project Overview

MarkuprX is a macOS/Windows menu bar app and CLI/MCP tool that intelligently captures developer feedback. It records your screen and voice simultaneously, then uses an intelligent post-processing pipeline to correlate transcript timestamps with the screen recording -- extracting the right frames at the right moments and stitching everything into a structured, AI-ready Markdown document. The output is purpose-built for AI coding agents: every screenshot placed exactly where it belongs, every issue clearly documented.

As of v2.5.0, MarkuprX also ships as:
- **CLI tool** (`npx markuprx analyze ./recording.mov`) -- headless video analysis pipeline
- **MCP server** (`npx --package markuprx markuprx-mcp`) -- Model Context Protocol server for AI coding agents (capture screenshots, analyze video, start/stop recordings)
- **GitHub Action** (`eddiesanjuan/markuprx-action@v1`) -- CI/CD visual feedback on PRs

**Version:** 2.6.0
**License:** MIT (Open Source)

## Tech Stack

- **Framework:** Electron + React + TypeScript
- **Build:** electron-vite + Vite (desktop), esbuild (CLI/MCP)
- **Transcription:** Local Whisper (default), OpenAI Whisper-1 API (optional cloud)
- **AI Analysis:** Anthropic Claude API (BYOK or premium tier)
- **Testing:** Vitest (unit, integration, e2e)
- **Package:** electron-builder (DMG, NSIS, AppImage)
- **Styling:** Tailwind CSS
- **Schema Validation:** Zod
- **MCP:** @modelcontextprotocol/sdk

## Architecture

```
src/
├── main/                   # Electron main process
│   ├── index.ts            # Entry point, window management, IPC orchestration
│   ├── SessionController.ts # 7-state FSM with watchdog timer
│   ├── CrashRecovery.ts    # Auto-save every 5s, crash detection, recovery dialog
│   ├── ErrorHandler.ts     # Centralized error handling
│   ├── HotkeyManager.ts    # Global hotkey registration
│   ├── MenuManager.ts      # Application menu
│   ├── TrayManager.ts      # Menu bar tray icon and status
│   ├── PermissionManager.ts # macOS permission checks
│   ├── AutoUpdater.ts      # Auto-update via electron-updater
│   ├── ai/                 # AI analysis pipeline (Claude)
│   │   ├── AIPipelineManager.ts  # Orchestrates AI analysis (free/byok/premium tiers)
│   │   ├── ClaudeAnalyzer.ts     # Claude API integration
│   │   ├── ImageOptimizer.ts     # Screenshot optimization for API
│   │   ├── StructuredMarkdownBuilder.ts # AI-enhanced markdown output
│   │   └── types.ts              # AI pipeline types
│   ├── analysis/           # Feedback analysis and categorization
│   ├── audio/              # Microphone capture, VAD
│   ├── capture/            # Screen capture via desktopCapturer
│   ├── ipc/                # IPC handler registration and routing
│   ├── output/             # Document generation and export
│   │   ├── MarkdownGenerator.ts  # llms.txt-inspired markdown output
│   │   ├── ExportService.ts      # Multi-format export (MD, PDF, HTML, JSON)
│   │   ├── ClipboardService.ts   # Clipboard bridge (copies file path)
│   │   ├── FileManager.ts        # Session file management
│   │   └── sessionAdapter.ts     # Type conversion utilities
│   ├── pipeline/           # Post-processing pipeline
│   │   ├── PostProcessor.ts      # Pipeline orchestrator (transcribe -> analyze -> extract -> generate)
│   │   ├── TranscriptAnalyzer.ts # Heuristic key-moment detection
│   │   └── FrameExtractor.ts     # ffmpeg-based video frame extraction
│   ├── platform/           # Platform-specific code (Windows taskbar)
│   ├── settings/           # Persistent settings with secure API key storage
│   ├── transcription/      # Transcription tier management
│   │   ├── TierManager.ts       # Tier selection (Whisper, timer-only)
│   │   ├── WhisperService.ts     # Local Whisper integration
│   │   └── ModelDownloadManager.ts # Whisper model download from HuggingFace
│   └── windows/            # Window management (popover, taskbar)
├── cli/                    # Headless CLI tool
│   ├── index.ts            # CLI entry point (commander-based)
│   ├── CLIPipeline.ts      # Video analysis pipeline (ffmpeg + Whisper + markdown)
│   ├── WatchMode.ts        # Watch directory for new recordings
│   ├── doctor.ts           # System dependency checker (ffmpeg, Whisper, etc.)
│   └── init.ts             # Project config scaffolding (.markuprx.json)
├── mcp/                    # MCP server for AI coding agents
│   ├── index.ts            # MCP entry point
│   ├── server.ts           # MCP server setup
│   ├── tools/              # MCP tool implementations
│   │   ├── analyzeScreenshot.ts  # Analyze a screenshot with Claude
│   │   ├── analyzeVideo.ts       # Analyze a video recording
│   │   ├── captureScreenshot.ts  # Capture a screenshot
│   │   ├── captureWithVoice.ts   # Capture with voice narration
│   │   ├── describeScreen.ts     # AI agents can see the user's screen
│   │   ├── pushToGitHub.ts       # Push feedback to GitHub Issues
│   │   ├── pushToLinear.ts       # Push feedback to Linear
│   │   ├── startRecording.ts     # Start a recording session
│   │   └── stopRecording.ts      # Stop a recording session
│   ├── session/            # MCP session management
│   ├── capture/            # MCP capture utilities
│   ├── utils/              # MCP utilities
│   ├── resources/          # MCP resource definitions
│   └── types.ts            # MCP type definitions
├── renderer/               # React UI
│   ├── App.tsx             # Main component with state machine UI
│   ├── AppWrapper.tsx      # Root wrapper with providers
│   ├── components/         # UI components
│   │   ├── AnnotationOverlay.tsx    # Drawing tools (arrow, circle, rect, freehand, text)
│   │   ├── AudioWaveform.tsx        # Real-time audio level visualization
│   │   ├── CrashRecoveryDialog.tsx  # Crash recovery UI
│   │   ├── DonateButton.tsx         # Rotating donate messages
│   │   ├── Onboarding.tsx           # First-run experience
│   │   ├── SessionHistory.tsx       # Session browser
│   │   ├── SessionReview.tsx        # Post-recording review/edit
│   │   ├── SettingsPanel.tsx        # Settings configuration
│   │   └── ...                      # Other UI components
│   ├── audio/              # Renderer-side audio capture bridge
│   ├── capture/            # Renderer-side screen recording (MediaRecorder)
│   └── hooks/              # React hooks (theme, animation)
├── preload/                # Context bridge (secure IPC)
└── shared/                 # Types shared between processes
    ├── types.ts            # IPC channels, payload types, state types
    └── hotkeys.ts          # Hotkey configuration types
```

## Commands

```bash
# Development
npm run dev              # Development mode with hot reload
npm run build            # Build everything (desktop + CLI + MCP)
npm run build:desktop    # Build desktop app only
npm run build:cli        # Build CLI tool only
npm run build:mcp        # Build MCP server only

# Testing
npm test                 # Run all tests
npm run test:unit        # Run unit tests only
npm run test:integration # Run integration tests
npm run test:e2e         # Run end-to-end tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage report
npm run test:ci          # Run tests for CI (with coverage)

# Code Quality
npm run lint             # Lint code
npm run lint:fix         # Auto-fix lint issues
npm run typecheck        # TypeScript type checking

# Packaging
npm run package          # Package for current platform
npm run package:mac      # Package for macOS
npm run package:win      # Package for Windows
npm run dist:mac         # Build + package for macOS
npm run release          # Build + publish release to GitHub
```

## Testing

Tests live in `tests/` and use Vitest with the `node` environment.

```
tests/
├── setup.ts                    # Global test setup
├── unit/                       # Unit tests
│   ├── sessionController.test.ts
│   ├── crashRecovery.test.ts
│   ├── errorHandler.test.ts
│   ├── tierManager.test.ts
│   ├── exportService.test.ts
│   ├── frameExtractor.test.ts
│   ├── permissionManager.test.ts
│   ├── cli.test.ts
│   ├── mcp/                   # MCP server tests
│   └── ...
├── integration/               # Integration tests
│   └── sessionFlow.test.ts
├── e2e/                       # End-to-end tests
│   └── criticalPaths.test.ts
└── manual/                    # Manual test scripts
```

**Configuration:** `vitest.config.ts` at project root. Tests run in forked processes (`pool: 'forks'`) for isolation. Test timeout is 10 seconds.

**Coverage thresholds:** lines 8%, functions 30%, branches 55%, statements 8%. Reports to `./coverage/`.

**Writing tests:** Follow existing patterns -- mock Electron APIs and IPC channels. See `tests/setup.ts` for global mocks. Test files are co-located by module name (e.g., `sessionController.test.ts` tests `src/main/SessionController.ts`).

## Key Architecture Decisions

### State Machine
The recording session is governed by a 7-state FSM: `idle -> starting -> recording -> stopping -> processing -> complete -> error`. Every state has a maximum duration enforced by a watchdog timer that forces recovery if anything gets stuck.

### Post-Processing Pipeline
When recording stops, the pipeline runs: audio transcription (Whisper) -> transcript analysis (key-moment detection) -> video frame extraction (ffmpeg) -> markdown generation. Each step degrades gracefully if a dependency is missing.

### Three-Tier Transcription
1. **OpenAI Whisper-1 API** (optional, best quality) -- cloud-based, requires API key
2. **Local Whisper** (default) -- runs on device, no API key needed
3. **Timer-only** (fallback) -- captures screenshots on a timer when no transcription is available

### Crash Recovery
Session state auto-saves to disk every 5 seconds. On restart after a crash, the app detects the incomplete session and offers recovery.

### Clipboard Bridge
When a session completes, the **file path** to the markdown document is copied to clipboard -- not the content. This is deliberate: the file persists on disk, and AI tools can read the full document including screenshots.

### MCP Server
The MCP server (`src/mcp/`) exposes MarkuprX capabilities as tools for AI coding agents. Tools include screenshot capture, video analysis, and recording session control. Built on `@modelcontextprotocol/sdk`.

## IPC Communication

All main/renderer communication goes through the preload script. See `src/shared/types.ts` for IPC channel names. IPC handlers are registered in `src/main/ipc/`.

## CI/CD

GitHub Actions workflows in `.github/workflows/`:
- **ci.yml** -- Runs on every push/PR: lint, typecheck, tests
- **release.yml** -- Triggered on version tags: builds and publishes desktop app to GitHub Releases
- **deploy-landing.yml** -- Deploys the landing page (markuprx.com)
- **nightly.yml** -- Nightly builds for testing

Releases are published to GitHub Releases via electron-builder. The app is code-signed and notarized for macOS (see `scripts/notarize.cjs`).

## Configuration

No configuration required for first run. Local Whisper transcription works out of the box after downloading a model (~75MB for tiny, ~500MB for base).

Optional API keys (stored securely in OS keychain):
- **OpenAI** -- for cloud post-session transcription
- **Anthropic** -- for AI-enhanced document analysis (BYOK mode)

## Development Notes

- Menu bar popover window, frameless, always-on-top
- Screenshots saved as PNG files in session directories
- Voice activity detection uses RMS amplitude analysis
- All settings validated against JSON schema
- Secure API key storage via keytar (macOS Keychain, Windows Credential Manager) with encrypted fallback
- Native module rebuilds handled by `electron-rebuild` (keytar, sharp)
- CLI and MCP builds use esbuild (see `scripts/build-cli.mjs` and `scripts/build-mcp.mjs`)
- Published to npm as `markuprx` (includes both `MarkuprX` CLI and `markuprx-mcp` binary)
