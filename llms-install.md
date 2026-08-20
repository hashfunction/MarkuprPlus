# MarkuprPlus MCP Installation Guide

This file provides step-by-step instructions for AI agents (like Cline) to install and configure the MarkuprPlus MCP server.

## What is MarkuprPlus MCP?

The MarkuprPlus MCP server (run as `markuprx-mcp`) gives AI coding agents the ability to see the user's screen. It provides 9 tools: screenshot capture, screen description via Claude vision, screen+voice recording with Whisper transcription, video analysis, and direct issue creation in GitHub and Linear.

## Prerequisites

Before installing, verify the following:

1. **Node.js 20.9+** must be installed. Check with:
   ```bash
   node --version
   ```
   If not installed or version is below 18, the user needs to install Node.js first.

2. **ffmpeg** must be on PATH (required for recording and video analysis tools; screenshot tools work without it):
   ```bash
   ffmpeg -version
   ```
   If not installed:
   - macOS: `brew install ffmpeg`
   - Linux: `apt install ffmpeg` or `dnf install ffmpeg`
   - Windows: `choco install ffmpeg` or `winget install ffmpeg`

3. **macOS permissions** (macOS only -- the server will return actionable error messages if these are missing):
   - **Screen Recording**: System Settings > Privacy & Security > Screen Recording > enable the terminal app (Terminal, iTerm2, VS Code, Cursor, etc.)
   - **Microphone**: System Settings > Privacy & Security > Microphone > enable the terminal app (only needed for voice recording tools)

## Installation

The MarkuprPlus MCP server requires zero global installation. It runs via `npx`:

```bash
npx --package markuprx markuprx-mcp
```

No additional setup, build steps, or configuration files are needed beyond the MCP server config shown below.

## MCP Server Configuration

Add the following to the appropriate MCP configuration file for your IDE:

### Claude Code

File: `~/.claude/settings.json`

```json
{
  "mcpServers": {
    "MarkuprPlus": {
      "command": "npx",
      "args": ["--yes", "--package", "markuprx", "markuprx-mcp"]
    }
  }
}
```

### Cline (VS Code)

Add to your Cline MCP settings (Settings > Cline > MCP Servers, or in `cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "MarkuprPlus": {
      "command": "npx",
      "args": ["--yes", "--package", "markuprx", "markuprx-mcp"]
    }
  }
}
```

### Cursor

File: `.cursor/mcp.json` (project-level) or `~/.cursor/mcp.json` (global)

```json
{
  "mcpServers": {
    "MarkuprPlus": {
      "command": "npx",
      "args": ["--yes", "--package", "markuprx", "markuprx-mcp"]
    }
  }
}
```

### Windsurf

File: `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "MarkuprPlus": {
      "command": "npx",
      "args": ["--yes", "--package", "markuprx", "markuprx-mcp"]
    }
  }
}
```

## Optional Environment Variables

These are NOT required for basic operation. Set them only if the user wants specific features:

| Variable | Purpose | Required? |
|----------|---------|-----------|
| `ANTHROPIC_API_KEY` | Enables the `describe_screen` tool (Claude vision) | Only for `describe_screen` |
| `GITHUB_TOKEN` | Enables `push_to_github` without passing token each call | Only for `push_to_github` |
| `LINEAR_API_KEY` | Enables `push_to_linear` without passing token each call | Only for `push_to_linear` |

To set environment variables in the MCP config, add an `env` field:

```json
{
  "mcpServers": {
    "MarkuprPlus": {
      "command": "npx",
      "args": ["--yes", "--package", "markuprx", "markuprx-mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

## Available Tools

After installation, the following 9 tools are available:

| Tool | Description | Requires ffmpeg? |
|------|-------------|-----------------|
| `capture_screenshot` | Take a screenshot of the current screen | No |
| `describe_screen` | Capture screenshot + describe with Claude vision | No (needs ANTHROPIC_API_KEY) |
| `analyze_screenshot` | Take screenshot, return as image for AI analysis | No |
| `analyze_video` | Process a video file into structured Markdown | Yes |
| `capture_with_voice` | Record screen+voice, produce structured report | Yes |
| `start_recording` | Begin a long-form recording session | Yes |
| `stop_recording` | Stop recording, run pipeline | Yes |
| `push_to_github` | Create GitHub issues from a feedback report | No (needs GITHUB_TOKEN) |
| `push_to_linear` | Push feedback to Linear as issues | No (needs LINEAR_API_KEY) |

## Verifying Installation

After adding the MCP config and restarting your IDE:

1. The MarkuprPlus MCP server should appear in your IDE's MCP server list
2. Test by asking your AI agent to run `capture_screenshot` -- it should take a screenshot and return a file path
3. If you see permission errors on macOS, grant Screen Recording permission to your terminal/IDE app and restart

## Troubleshooting

**"Cannot find module" or "markuprx-mcp not found":**
- Ensure Node.js 20.9+ is installed
- Try running `npx --package markuprx markuprx-mcp` manually in a terminal to see the error output
- The server outputs logs to stderr; stdout is reserved for MCP protocol communication

**"Screen Recording permission not granted":**
- macOS: System Settings > Privacy & Security > Screen Recording > enable your terminal app
- Restart your terminal/IDE after granting permission

**"ffmpeg not found on PATH":**
- Install ffmpeg: `brew install ffmpeg` (macOS)
- Screenshot tools work without ffmpeg; only recording/video tools need it

**Server appears but tools are not listed:**
- Restart your IDE
- Check that `npx --package markuprx markuprx-mcp` runs without errors in a terminal
- Ensure you're using the `-y` flag in the args to auto-confirm npx installation
