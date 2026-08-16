<p align="center">
  <img src="src/renderer/assets/logo.svg" alt="MarkuprX" width="80" height="80">
</p>

<h1 align="center">MarkuprX</h1>

<p align="center">
  <strong>Record your screen. Say what's wrong. Your AI agent fixes it.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/markuprx"><img src="https://img.shields.io/npm/v/markuprx?style=flat-square" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/markuprx"><img src="https://img.shields.io/npm/dm/markuprx?style=flat-square" alt="npm downloads"></a>
  <a href="https://github.com/eddiesanjuan/markuprx/actions/workflows/ci.yml"><img src="https://github.com/eddiesanjuan/markuprx/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
  <a href="https://github.com/eddiesanjuan/markuprx/stargazers"><img src="https://img.shields.io/github/stars/eddiesanjuan/markuprx?style=flat-square" alt="GitHub stars"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#context-aware-capture-what-your-agent-actually-gets">Context-Aware Capture</a> &middot;
  <a href="#why-markuprx">Why MarkuprX</a> &middot;
  <a href="#mcp-server">MCP Server</a> &middot;
  <a href="#cli">CLI</a> &middot;
  <a href="#integrations">Integrations</a> &middot;
  <a href="#contributing">Contributing</a>
</p>

---

<p align="center">
  <img src="assets/demo-cli.gif" alt="MarkuprX desktop-to-report workflow demo" width="800">
</p>

Desktop app workflow is the default: record + narrate + stop, then ship context-rich markdown (frames + cursor/window/focus hints when available) directly to your agent.

## The Problem

AI coding agents can't see your screen. When you find a bug, you context-switch into writing mode -- describing the layout issue in text, manually screenshotting, cropping, and dragging images into the right spot. You speak at 150 words per minute but type at 60. The context is lost in translation.

## The Solution

MarkuprX is a desktop capture app first. You hit a hotkey, narrate what you see, and stop. Then it runs a post-session pipeline that aligns transcript timestamps with the recording, extracts the right frames, and outputs structured Markdown your agent can execute against immediately.

- **Record** -- press a hotkey, talk through what you see
- **Process** -- Whisper transcribes, ffmpeg extracts frames at the exact moments you described
- **Enrich** -- capture context is attached to shot markers (cursor position, active window/app, focused element hints when available)
- **Output** -- structured Markdown with screenshots and context your agent can trust

```
Cmd+Shift+F  -->  talk  -->  Cmd+Shift+F  -->  Cmd+V into your agent
```

## Quick Start

### Desktop App (recommended)

Download from [markuprx.com](https://markuprx.com) or [GitHub Releases](https://github.com/eddiesanjuan/markuprx/releases).

> **macOS install note:** Apple notarization is currently rolling out. If macOS warns on first launch, use **Right-click -> Open** once to trust the app. If needed, run: `xattr -dr com.apple.quarantine /Applications/MarkuprX.app`

1. Press `Cmd+Shift+F` (macOS) or `Ctrl+Shift+F` (Windows) to start
2. Narrate what you see. Hold `Command` on macOS or `Control` on Windows and drag to mark the live screen.
3. Release the key, then click normally to save and clear that issue while the click still reaches the app. Repeat for every finding.
4. Press the recording hotkey again to stop.
5. Paste the generated report path into Claude Code, Cursor, Windsurf, or any coding agent. Every marked issue includes its own screenshot and matching narration.

### MCP Server (for AI coding agents)

```bash
npx --package markuprx markuprx-mcp
```

### CLI (for existing recordings / CI / automation)

```bash
npx markuprx analyze ./recording.mov
```

Use this when you already have a video file. The desktop app remains the primary capture workflow.

## Context-Aware Capture: What Your Agent Actually Gets

Every important frame can carry extra machine-usable context, not just pixels.

- **Cursor coordinates** at capture time
- **Active app + window title** (best-effort from OS context)
- **Focused element hints** (role/text/title hints when available)
- **Trigger metadata** (`manual`, `pause`, or `voice-command`)

This makes the report a high-signal liaison between you and your agent: what you said, what you saw, and where your attention was.

## Why MarkuprX?

**Local-first.** Whisper runs on your device. Your recordings, transcripts, and screenshots never leave your machine. No cloud dependency, no account required.

**AI-native output.** The Markdown output is structured for LLM consumption -- headings, categories, severity levels, inline screenshots, and capture-context hints. Not a raw transcript with random images.

**Works everywhere.** Desktop app for daily flow. CLI for scripts and CI/CD. MCP server for agent integration. GitHub Action for PR feedback. Same pipeline, four interfaces.

**Open source.** MIT licensed. No telemetry, no tracking, no analytics. Read the source, fork it, ship it.

## What the Output Looks Like

```markdown
# Feedback Session -- Feb 5, 2026

## FB-001: Button sizing issue
The submit button is way too small on mobile. I'm trying to tap it
and keep hitting the cancel link underneath. Needs more vertical
padding, maybe 12px minimum tap target.

![Screenshot at 0:34](screenshots/fb-001.png)

## FB-002: Loading state feels janky
After the spinner disappears, the content pops in with no transition.
There's a visible layout shift -- the sidebar jumps left by about
20 pixels.

![Screenshot at 1:12](screenshots/fb-002.png)
```

Each screenshot is extracted from the exact video frame matching your narration timestamp, with context hints attached when available. See full examples in [`examples/`](examples/).

## MCP Server

Give your AI coding agent eyes and ears. Add MarkuprX as an MCP server and it can capture screenshots, record your screen with voice, and receive structured reports -- all mid-conversation.

### Setup

**Claude Code** (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "MarkuprX": {
      "command": "npx",
      "args": ["--yes", "--package", "markuprx", "markuprx-mcp"]
    }
  }
}
```

**Cursor / Windsurf** -- same config in your MCP settings.

### Tools

| Tool | Description |
|------|-------------|
| `capture_screenshot` | Grab the current screen and attach context metadata (cursor + active app/window + focus hints when available). |
| `capture_with_voice` | Record screen + mic for a set duration. Returns a structured report. |
| `analyze_video` | Process any existing `.mov` or `.mp4` into Markdown with extracted frames (fallback path for externally captured recordings). |
| `analyze_screenshot` | Run a screenshot through the AI analysis pipeline. |
| `start_recording` | Begin an interactive recording session. |
| `stop_recording` | End the session and run the full pipeline. |

### Example

```
You: "The sidebar is overlapping the main content on mobile. Can you see it?"

Agent: [calls capture_screenshot]
       "I can see the issue -- the sidebar has position: fixed but no z-index,
        and it's 280px wide with no responsive breakpoint. Let me fix the CSS..."

       [fixes the code]
```

No copy-pasting screenshots. No rewriting what you already know. The agent gets structured report context and acts.

Full MCP documentation: [README-MCP.md](README-MCP.md)

## CLI

### Installation

```bash
# Run without installing
npx markuprx analyze ./recording.mov

# Or install globally
npm install -g markuprx
```

### Commands

**`markuprx analyze <video>`** -- Process an existing screen recording into structured Markdown.

```bash
markuprx analyze ./bug-demo.mov
markuprx analyze ./recording.mov --output ./reports
markuprx analyze ./recording.mov --template github-issue
markuprx analyze ./recording.mov --no-frames  # transcript only
```

**`markuprx watch [directory]`** -- Watch for new recordings and auto-process them.

```bash
markuprx watch ~/Desktop --output ./reports
```

**`markuprx push github <report>`** -- Create GitHub issues from a feedback report.

```bash
markuprx push github ./report.md --repo myorg/myapp
markuprx push github ./report.md --repo myorg/myapp --dry-run
```

**`markuprx push linear <report>`** -- Create Linear issues from a feedback report.

```bash
markuprx push linear ./report.md --team ENG
```

### Output Templates

`markdown` (default) | `json` | `github-issue` | `linear` | `jira` | `html`

### Requirements

- Node.js 20.9+
- [ffmpeg](https://ffmpeg.org/) on your PATH (`brew install ffmpeg` / `apt install ffmpeg` / `choco install ffmpeg`)

## Integrations

### GitHub Action

Run MarkuprX in CI to get visual feedback on pull requests:

```yaml
- uses: eddiesanjuan/markuprx-action@v1
  with:
    video-path: ./recordings/
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Desktop App Workflow (Primary)

1. Press `Cmd+Shift+F` (macOS) or `Ctrl+Shift+F` (Windows)
2. Narrate what you see and mark shots as needed
3. Press the hotkey again to stop
4. Paste the file path from your clipboard into Claude Code, Cursor, or any AI agent

## How It Works

```
                    +-----------+
  Screen + Voice -> | Whisper   | -> Timestamped transcript
                    +-----------+
                         |
                    +-----------+
                    | Analyzer  | -> Key moments identified
                    +-----------+
                         |
                    +-----------+
                    | ffmpeg    | -> Frames extracted at exact timestamps
                    +-----------+
                         |
                    +-----------+
                    | Generator | -> Structured Markdown with inline screenshots
                    +-----------+
```

The pipeline degrades gracefully. No ffmpeg? Transcript-only output. No Whisper model? Timer-based screenshots. No API keys? Everything runs locally.

Desktop app capture remains the default path. CLI/MCP `analyze_video` remains available when you need to process an existing recording.

For architecture details, see [CLAUDE.md](CLAUDE.md).

## Development

```bash
git clone https://github.com/eddiesanjuan/markuprx.git
cd MarkuprX
npm install
npm run dev
```

| Command | Description |
|---------|-------------|
| `npm run dev` | Development mode with hot reload |
| `npm run build` | Build everything (desktop + CLI + MCP) |
| `npm test` | Run all tests |
| `npm run lint` | Lint |
| `npm run typecheck` | Type check |

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Run tests: `npm test && npm run lint && npm run typecheck`
4. Open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines.

## License

MIT -- see [LICENSE](LICENSE).

---

<p align="center">
  Built by <a href="https://github.com/eddiesanjuan">Eddie San Juan</a><br>
  <a href="https://markuprx.com">markuprx.com</a>
</p>
