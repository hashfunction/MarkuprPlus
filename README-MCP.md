# MarkuprPlus MCP Server

Give your AI coding agent eyes and ears. The MarkuprPlus MCP server lets GitHub Copilot CLI, the Claude Mac app, Codex, Claude Code, Cursor, and Windsurf capture screenshots and screen recordings with voice narration, plus context metadata (cursor, active app/window, focused element hints when available), then processes everything into structured, AI-ready Markdown reports.

**Version:** 3.1.2 | **Platform:** macOS/Windows/Linux | **Protocol:** MCP (Model Context Protocol) over stdio

---

## Prerequisites

- **Node.js 20.9+**
- **ffmpeg** -- required for screen recording and frame extraction
  ```bash
  brew install ffmpeg
  ```
- **macOS permissions:**
  - **Screen Recording** -- System Settings > Privacy & Security > Screen Recording
  - **Microphone** -- System Settings > Privacy & Security > Microphone

> The server checks permissions on first use and returns actionable error messages if anything is missing.

---

## Installation

### Zero-install (recommended)

Use `npx` -- no global install needed. Your IDE configuration handles the rest:

```bash
npx --yes --package markuprplus markuprplus-mcp
```

### Global install

```bash
npm install -g markuprplus
```

This installs both the `markuprplus` CLI and the `markuprplus-mcp` server binary.

> The MCP server is the agent-facing interface. For day-to-day manual capture, the desktop app is the primary workflow.

---

## Client Configuration

Install a persistent copy of the CLI and MCP server, then configure the clients you use:

```bash
npm install -g markuprplus
markuprplus integrate copilot
markuprplus integrate claude-desktop
markuprplus integrate codex
```

The setup command uses absolute paths to Node.js and the installed MCP server so Mac apps launched from Finder can start it. It also supplies a PATH for dependencies such as ffmpeg. Prefer a global installation to running setup through a temporary npm cache. Re-run setup with `--force` if you move the installation or Node.js runtime.

| Client | Configuration updated | Available workflow |
|---|---|---|
| GitHub Copilot CLI | `~/.copilot/mcp-config.json` (honors `COPILOT_HOME`) | Capture, record, analyze, and read session resources in Copilot |
| Claude Mac app | `~/Library/Application Support/Claude/claude_desktop_config.json` and `~/.claude.json` | MCP access in Chat and local Code sessions |
| Codex Mac app and CLI | `~/.codex/config.toml` (honors `CODEX_HOME`) | MCP access in local Codex sessions |

Use `markuprplus integrate claude-code` to configure only Claude Code. The Mac app command configures Chat and Code separately because they use different MCP settings; it does not configure Cowork or cloud sessions. See [Claude's shared configuration documentation](https://code.claude.com/docs/en/desktop#shared-configuration).

Add `--dry-run` to print the target paths and server entry without writing files. Setup preserves other servers and settings, creates a uniquely named `.bak` copy before changing an existing file, and rejects malformed JSON. Repeating setup is a no-op when the entry matches. Use `--force` to replace a conflicting `markuprplus` entry. Codex setup uses `codex mcp add` to preserve its TOML settings and comments; it requires Codex CLI or a discoverable Codex Mac app, but does not require login to write configuration.

After setup, fully quit and restart the client. Ask it to use MarkuprPlus to capture a screenshot, or record narrated feedback with `capture_with_voice`. Approve macOS Screen Recording and Microphone access for the client when prompted. The clients retain their normal tool approval controls. [Copilot MCP setup](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers), [Claude local MCP setup](https://modelcontextprotocol.io/docs/develop/connect-local-servers), [Codex MCP configuration](https://developers.openai.com/codex/mcp).

### Analysis inside MarkuprPlus

MCP lets the client operate MarkuprPlus. To have MarkuprPlus generate a report with one of these providers, select it in **Settings > Advanced**:

- **GitHub Copilot CLI:** requires standalone `copilot` 1.0.83 or newer and `copilot login`. Supports narration and screenshot attachments, including screenshot-only sessions. Each run uses a temporary report agent and isolated configuration that retains authentication and model preferences, with hooks and tools disabled. Unrelated MCP servers and plugins are not loaded. Only report events are collected from its JSON stream, then validated. Choose the CLI default model or enter a model ID available to your account.
- **Codex CLI / Mac app:** uses the existing Codex provider and ChatGPT login. Discovery checks PATH and common CLI locations, then the bundled `Contents/Resources/codex` executable in `Codex.app` or `ChatGPT.app` under `/Applications` and `~/Applications`. The bundled executable must support the same report flags as the CLI.
- **Claude Mac app:** supports MCP access in the app. Automatic report generation inside MarkuprPlus requires the separately installed Claude Code CLI; the desktop app does not expose scripting and automation. See [Claude's desktop/CLI comparison](https://code.claude.com/docs/en/desktop#feature-comparison).

Mac App Store builds run analysis providers through the optional MarkuprPlus CLI Bridge. Update the companion along with the app to use Copilot. If an analysis provider fails, MarkuprPlus preserves the capture and generates the Local Rules report with the failure reason recorded.

### Development checkout

```bash
npm run build:cli
npm run build:mcp
node dist/cli/index.mjs integrate claude-desktop --dry-run
```

Remove `--dry-run` to register the local build. Use `copilot` or `codex` instead of `claude-desktop` for those clients. Keep this checkout in place while clients use it.

### Claude Code

For manual setup, merge into `~/.claude.json` (user scope) or `.mcp.json` in your project:

```json
{
  "mcpServers": {
    "MarkuprPlus": {
      "command": "npx",
      "args": ["--yes", "--package", "markuprplus", "markuprplus-mcp"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` globally):

```json
{
  "mcpServers": {
    "MarkuprPlus": {
      "command": "npx",
      "args": ["--yes", "--package", "markuprplus", "markuprplus-mcp"]
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "MarkuprPlus": {
      "command": "npx",
      "args": ["--yes", "--package", "markuprplus", "markuprplus-mcp"]
    }
  }
}
```

> A copy-paste config file is available at [`docs/mcp-config-example.json`](docs/mcp-config-example.json).

---

## Tools

The MCP server exposes 9 tools. Your AI agent can call these directly during a conversation.

### `capture_screenshot`

Take a screenshot of the current screen. Returns a markdown image reference saved to the session directory, plus context summary when available.

**Input:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `label` | string | -- | Optional label for the screenshot |
| `display` | number | `1` | Display number (1-indexed) |
| `optimize` | boolean | `true` | Optimize image size with sharp |

**Example:**
```
capture_screenshot({ label: "broken navbar", display: 1 })
```

**Returns:**
```
Screenshot saved: /Users/you/Documents/markuprx/mcp/session-20260214-143022/screenshot-001.png
![broken navbar](screenshots/screenshot-001.png)
Context: Cursor: 914, 622 | App: Arc | Focus: Submit button
```

---

### `capture_with_voice`

Record screen and voice for a fixed duration, then run the full MarkuprPlus pipeline. Produces a structured Markdown report with transcript, key moments, extracted frames, and capture context metadata.

**Input:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `duration` | number | -- | Recording duration in seconds (3-300) |
| `outputDir` | string | `~/Documents/markuprx/mcp/` | Output directory |
| `skipFrames` | boolean | `false` | Skip frame extraction |

**Example:**
```
capture_with_voice({ duration: 30 })
```

**Returns:**
```
Recording complete: 30 seconds captured
Pipeline results:
  Transcript segments: 12
  Extracted frames: 4
  Processing time: 8.2s

Report: /Users/you/Documents/markuprx/mcp/session-20260214-143022/feedback-report.md
```

---

### `analyze_video`

Process an existing video file through the MarkuprPlus pipeline. Useful for recordings made outside MarkuprPlus (fallback flow; capture tools are the primary flow).

**Input:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `videoPath` | string | -- | Absolute path to the video file |
| `audioPath` | string | -- | Separate audio file (if not embedded) |
| `outputDir` | string | `~/Documents/markuprx/mcp/` | Output directory |
| `skipFrames` | boolean | `false` | Skip frame extraction |

**Example:**
```
analyze_video({ videoPath: "/Users/you/Desktop/bug-demo.mov" })
```

**Returns:** Same format as `capture_with_voice` -- report path and summary.

---

### `analyze_screenshot`

Take a screenshot and return it as image data for the AI to analyze visually. Unlike `capture_screenshot`, this returns the image directly for vision analysis rather than saving a reference.

**Input:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `display` | number | `1` | Display number (1-indexed) |
| `question` | string | -- | What to look for in the screenshot |

**Example:**
```
analyze_screenshot({ question: "Is the sidebar overlapping the main content?" })
```

**Returns:** Image data (base64 PNG) that the AI can see and analyze, plus a text description with the capture timestamp.

---

### `start_recording`

Begin a long-form screen and voice recording session. Returns a session ID for use with `stop_recording`. Only one recording can be active at a time.

**Input:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `label` | string | -- | Session label for organization |

**Example:**
```
start_recording({ label: "onboarding review" })
```

**Returns:**
```
Recording started.
Session ID: mcp-20260214-143022
Status: recording
Use stop_recording to end and process the recording.
```

---

### `stop_recording`

Stop an active recording and run the full MarkuprPlus pipeline on the captured video.

**Input:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sessionId` | string | current | Session ID (defaults to the active recording) |
| `skipFrames` | boolean | `false` | Skip frame extraction |

**Example:**
```
stop_recording({})
```

**Returns:** Same format as `capture_with_voice` -- report path and summary.

---

### `describe_screen`

Capture the current display, or read an existing image, and return a structured visual description. Requires an Anthropic API key through `ANTHROPIC_API_KEY` or the `apiKey` parameter.

**Input:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `imagePath` | string | fresh capture | Absolute path to an existing image |
| `display` | number | `1` | Display number for a fresh capture |
| `focus` | string | -- | Optional area for the description to emphasize |
| `apiKey` | string | environment | Anthropic API key |

---

### `push_to_github`

Create one GitHub issue per feedback item, or preview the result with `dryRun: true`.

**Input:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `reportPath` | string | -- | Absolute path to a MarkuprPlus Markdown report |
| `repo` | string | -- | Target repository in `owner/repo` format |
| `items` | string[] | all | Optional feedback item IDs |
| `token` | string | environment or `gh` | GitHub token |
| `dryRun` | boolean | `false` | Preview without creating issues |

---

### `push_to_linear`

Create one Linear issue per feedback item, or preview the result with `dryRun: true`.

**Input:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `reportPath` | string | -- | Absolute path to a MarkuprPlus Markdown report |
| `teamKey` | string | -- | Linear team key such as `ENG` |
| `projectName` | string | -- | Optional project name |
| `token` | string | `LINEAR_API_KEY` | Linear API key |
| `dryRun` | boolean | `false` | Preview without creating issues |

---

## Resources

The server also exposes MCP resources for querying session data:

| URI | Description |
|-----|-------------|
| `session://latest` | Metadata for the most recent session |
| `session://{id}` | Metadata for a specific session by ID |

Session metadata now includes capture-context snapshots (for example: cursor coordinates, active window/app, focused element hints when available).

---

## How It Works

1. **Your AI agent calls a tool** -- e.g., `capture_with_voice({ duration: 30 })`
2. **MarkuprPlus captures** -- records screen and microphone via ffmpeg
3. **The pipeline runs** -- transcribes audio (Whisper), detects key moments, extracts frames at those timestamps
4. **Structured output** -- produces a Markdown report with screenshots placed at the exact moments you described them, enriched with capture context metadata
5. **Agent reads the report** -- the tool returns the file path; the agent reads and acts on the structured feedback

All processing happens locally. No data leaves your machine unless you configure an OpenAI API key for cloud transcription.

---

## Session Output

Sessions are saved to `~/Documents/markuprx/mcp/`:

```
~/Documents/markuprx/mcp/mcp-20260214-143022/
  feedback-report.md     # Structured Markdown report
  metadata.json          # Session metadata
  screenshots/
    screenshot-001.png   # Extracted frames from key moments
    screenshot-002.png
  recording.mp4          # Screen recording (if applicable)
```

---

## Troubleshooting

### Permission errors

**Screen Recording denied:**
```
Error: Screen Recording permission not granted
```
Fix: System Settings > Privacy & Security > Screen Recording > enable your terminal app (Terminal, iTerm2, VS Code, etc.)

**Microphone denied:**
```
Error: Microphone permission not granted
```
Fix: System Settings > Privacy & Security > Microphone > enable your terminal app

> After granting permissions, restart your terminal or IDE for changes to take effect.

### ffmpeg not found

```
Error: ffmpeg not found on PATH
```
Fix:
```bash
brew install ffmpeg
```

Verify installation:
```bash
ffmpeg -version
```

> Screenshot tools (`capture_screenshot`, `analyze_screenshot`) work without ffmpeg. Only recording and video analysis tools require it.

### No audio device detected

```
Error: No audio input device found
```
Fix:
- Check System Settings > Sound > Input -- ensure a microphone is selected
- If using an external mic, verify it's connected and recognized
- Try selecting a specific device in System Settings

### Server not connecting

If your IDE can't connect to the MCP server:

1. **Verify the config** -- check that `"command": "npx"` and `"args": ["--yes", "--package", "markuprplus", "markuprplus-mcp"]` are correct
2. **Test manually** -- run `npx --yes --package markuprplus markuprplus-mcp` in a terminal. It should start silently (output goes to stderr)
3. **Check Node.js version** -- `node --version` should be 20.9+
4. **Restart your IDE** after adding or changing MCP configuration

### stdout corruption

The MCP protocol uses stdout for JSON-RPC communication. If you see garbled output:
- Ensure no other tools are writing to stdout in the same process
- All MarkuprPlus logging goes to stderr by design

---

## Development

To develop the MCP server locally:

```bash
# From an existing MarkuprPlus source checkout
npm install

# Build the MCP server
npm run build:mcp

# Test locally
node dist/mcp/index.mjs
```

For Claude Code, point to your local build:

```json
{
  "mcpServers": {
    "MarkuprPlus": {
      "command": "node",
      "args": ["/path/to/markuprx/dist/mcp/index.mjs"]
    }
  }
}
```

---

## License

MIT -- see [LICENSE](LICENSE) for details.
