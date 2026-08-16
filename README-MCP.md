# MarkuprX MCP Server

Give your AI coding agent eyes and ears. The MarkuprX MCP server lets Claude Code, Cursor, and Windsurf capture screenshots and screen recordings with voice narration, plus context metadata (cursor, active app/window, focused element hints when available), then processes everything into structured, AI-ready Markdown reports.

**Version:** 3.0.0 | **Platform:** macOS/Windows/Linux | **Protocol:** MCP (Model Context Protocol) over stdio

---

## Prerequisites

- **Node.js 18+**
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
npx --package markuprx markuprx-mcp
```

### Global install

```bash
npm install -g markuprx
```

This installs both the `MarkuprX` CLI and the `markuprx-mcp` server binary.

> The MCP server is the agent-facing interface. For day-to-day manual capture, the desktop app is the primary workflow.

---

## IDE Configuration

### Claude Code

Add to `~/.claude/settings.json`:

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

### Cursor

Add to `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` globally):

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

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

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

> A copy-paste config file is available at [`docs/mcp-config-example.json`](docs/mcp-config-example.json).

---

## Tools

The MCP server exposes 6 tools. Your AI agent can call these directly during a conversation.

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

Record screen and voice for a fixed duration, then run the full MarkuprX pipeline. Produces a structured Markdown report with transcript, key moments, extracted frames, and capture context metadata.

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

Process an existing video file through the MarkuprX pipeline. Useful for recordings made outside MarkuprX (fallback flow; capture tools are the primary flow).

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

Stop an active recording and run the full MarkuprX pipeline on the captured video.

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
2. **MarkuprX captures** -- records screen and microphone via ffmpeg
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

1. **Verify the config** -- check that `"command": "npx"` and `"args": ["--yes", "--package", "markuprx", "markuprx-mcp"]` are correct
2. **Test manually** -- run `npx --package markuprx markuprx-mcp` in a terminal. It should start silently (output goes to stderr)
3. **Check Node.js version** -- `node --version` should be 18+
4. **Restart your IDE** after adding or changing MCP configuration

### stdout corruption

The MCP protocol uses stdout for JSON-RPC communication. If you see garbled output:
- Ensure no other tools are writing to stdout in the same process
- All MarkuprX logging goes to stderr by design

---

## Development

To develop the MCP server locally:

```bash
# Clone and install
git clone https://github.com/eddiesanjuan/markuprx.git
cd MarkuprX
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
    "MarkuprX": {
      "command": "node",
      "args": ["/path/to/markuprx/dist/mcp/index.mjs"]
    }
  }
}
```

---

## License

MIT -- see [LICENSE](LICENSE) for details.
