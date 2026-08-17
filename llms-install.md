# Install MarkuprPlus for an AI coding agent

MarkuprPlus provides a source-built MCP server for visual feedback workflows.

> The retained commands `markuprx` and `markuprx-mcp` are compatibility identifiers reserved for publication. The npm package is not currently published, so install from source.

## Requirements

- Node.js 20.9 or newer
- npm
- ffmpeg on `PATH` for audio and video workflows
- screen-recording and microphone permission for live capture

## Build

```bash
git clone https://github.com/hashfunction/MarkuprPlus.git
cd MarkuprPlus
npm install
npm run build:mcp
```

## Configure the client

Add an entry like this to the MCP configuration used by your client. Replace the path with the absolute repository path.

```json
{
  "mcpServers": {
    "MarkuprPlus": {
      "command": "node",
      "args": ["/absolute/path/to/MarkuprPlus/dist/mcp/index.mjs"]
    }
  }
}
```

Restart the client, then ask it to list MCP tools. MarkuprPlus should expose:

1. `capture_screenshot`
2. `describe_screen`
3. `capture_with_voice`
4. `analyze_video`
5. `analyze_screenshot`
6. `start_recording`
7. `stop_recording`
8. `push_to_github`
9. `push_to_linear`

## First check

Ask the agent:

> Use MarkuprPlus to capture my screen. Do not deliver anything externally.

Review the capture result before asking for description, analysis, or delivery. Screen-description and analysis providers may transmit the selected image or report input depending on configuration. GitHub and Linear tools transmit reviewed report content only when invoked.

Local Whisper, Local Rules, Ollama, and LM Studio can keep processing local when configured locally. Codex CLI, Claude Code CLI, Anthropic API, OpenAI transcription, GitHub, and Linear follow their respective account and data-handling behavior.

## Reserved package form

After package publication, the compatible configuration will use:

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

Do not use that form until the package is published. See [README-MCP.md](README-MCP.md) for tool behavior and troubleshooting.
