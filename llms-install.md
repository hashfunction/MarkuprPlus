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

Review the capture result before asking for description, analysis, or delivery. `describe_screen` sends its selected image to Anthropic; `analyze_screenshot` returns image bytes to the connected client; GitHub and Linear tools transmit reviewed report content only when invoked.

`describe_screen` sends the selected image to Anthropic. It requires an Anthropic key passed as the tool's `apiKey` argument or through `ANTHROPIC_API_KEY` in the server environment.

`analyze_screenshot` returns the image bytes to the MCP client/agent. The connected client—not this tool—decides whether and where those bytes are sent for model analysis.

`capture_with_voice`, `analyze_video`, and `stop_recording` use local Whisper with the deterministic `TranscriptAnalyzer` and CLI templates; they do not use the desktop provider selection. Install a local Whisper model and ffmpeg before relying on these media workflows.

GitHub and Linear tools transmit reviewed report content only when invoked. The MCP server does not add telemetry.

### Provision local transcription

The source MCP tools discover models only in `~/.markuprx/whisper-models`, in this order: `ggml-medium.bin`, `ggml-small.bin`, `ggml-base.bin`, `ggml-tiny.bin`, `ggml-large-v3.bin`. They do not expose the desktop model downloader or a per-tool model path.

Obtain a compatible model from the official [whisper.cpp model repository](https://huggingface.co/ggerganov/whisper.cpp), verify it using the publisher's current instructions, and place the trusted nonempty file under one exact name. On macOS/Linux:

```bash
install -d -m 700 "$HOME/.markuprx/whisper-models"
install -m 600 /absolute/path/to/trusted/ggml-base.bin \
  "$HOME/.markuprx/whisper-models/ggml-base.bin"
node dist/cli/index.mjs doctor
```

Windows uses `%USERPROFILE%\.markuprx\whisper-models`; restrict it to the current user and run `node dist/cli/index.mjs doctor`. Until a model is discovered, voice/video reports are transcriptless.

### Configure only the credentials a tool needs

- `describe_screen`: pass `apiKey` or set `ANTHROPIC_API_KEY`; it sends the selected image to Anthropic.
- `push_to_github`: pass `token`, set `GITHUB_TOKEN`, or authenticate `gh`.
- `push_to_linear`: pass `token` or set `LINEAR_API_KEY`.

Do not commit tokens in the MCP JSON. Desktop-saved keys and `OPENAI_API_KEY` are not used by the MCP media pipeline.

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
