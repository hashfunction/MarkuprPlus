# MarkuprPlus MCP server

MarkuprPlus includes a Model Context Protocol server that lets a compatible coding agent capture, describe, analyze, record, and deliver visual feedback. The server is built from this repository and communicates over standard input/output.

> The retained command names `markuprx` and `markuprx-mcp` are compatibility identifiers. They remain reserved for package publication; the npm package is not published today. Use the source-built entry point below.

## Build and run from source

Requirements are Node.js 20.9 or newer, npm, and ffmpeg on `PATH` for video/audio workflows.

```bash
git clone https://github.com/hashfunction/MarkuprPlus.git
cd MarkuprPlus
npm install
npm run build:mcp
node dist/mcp/index.mjs
```

For an MCP client, use an absolute path:

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

Restart the client after changing its configuration. The server writes protocol messages to stdout and diagnostics to stderr.

## Tools

The current server registers nine tools:

| Tool | Purpose | Possible external data flow |
|---|---|---|
| `capture_screenshot` | Capture a display or window | None until another tool consumes the image |
| `describe_screen` | Capture and describe the current screen | Sends the selected image to the configured description provider |
| `capture_with_voice` | Capture a screenshot with recorded narration | Provider-dependent transcription |
| `analyze_video` | Transcribe and analyze an existing video | Provider-dependent transcription and analysis |
| `analyze_screenshot` | Analyze an existing image | Provider-dependent analysis |
| `start_recording` | Begin a recording session | Local capture while recording |
| `stop_recording` | Stop and process the active session | Provider-dependent post-session processing |
| `push_to_github` | Create a GitHub issue from a report | Sends selected report content to GitHub |
| `push_to_linear` | Create a Linear issue from a report | Sends selected report content to Linear |

Run the source-built server with your MCP inspector or client to see each tool's current JSON schema. Tool arguments are validated by the server.

## Example prompts

- “Use MarkuprPlus to capture the current screen and describe the layout problem.”
- “Start a recording while I reproduce this bug, then stop it and summarize the findings.”
- “Analyze `/absolute/path/to/recording.mov` as a GitHub issue draft.”
- “Push the reviewed report to GitHub.”

Delivery tools should be invoked only after reviewing their destination and report body.

## Configuration and privacy

MarkuprPlus can combine local capture with different processing providers:

- Local Whisper transcribes on the machine after a model is downloaded.
- Local Rules constructs a deterministic report without a model service.
- Ollama and LM Studio use fixed local-loopback services.
- Codex CLI and Claude Code CLI use each installed CLI's authentication and service behavior.
- Anthropic API analysis and OpenAI transcription send selected content to those cloud providers when configured.
- GitHub and Linear delivery send the reviewed report to the chosen project when explicitly invoked.

Captured media and generated files remain in the configured output directory unless a selected tool/provider transmits them. MarkuprPlus does not add application telemetry.

Credentials are supplied through the relevant provider or integration configuration. Do not put secrets directly in prompts, reports, or checked-in MCP configuration.

## Reserved package commands

After publication, the compatibility command will remain:

```bash
npx --package markuprx markuprx-mcp
```

This is a compatibility promise, not a claim that the package is currently available.

## Troubleshooting

1. Confirm `node --version` is at least 20.9.
2. Run `npm run build:mcp` again after a source update.
3. Run `node dist/mcp/index.mjs` from a terminal and inspect stderr.
4. Confirm the client configuration uses an absolute path and valid JSON.
5. Confirm ffmpeg is on `PATH` before using audio/video tools.
6. Confirm any selected local model service is running, or that the chosen cloud/CLI provider is configured.

For bugs and requests, use [MarkuprPlus Issues](https://github.com/hashfunction/MarkuprPlus/issues). The canonical product home is [markuprplus.com](https://markuprplus.com), which is forthcoming and is not currently a download channel.
