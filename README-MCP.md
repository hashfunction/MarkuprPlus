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
| `capture_screenshot` | Capture a display and save a session screenshot/reference | Local file creation; a later client/tool may consume the file |
| `describe_screen` | Capture/read an image and produce a structured description | Always sends the selected image to Anthropic |
| `capture_with_voice` | Record screen/voice for a fixed duration and build a report | Local Whisper plus the deterministic CLI analysis/template pipeline |
| `analyze_video` | Transcribe and analyze an existing video | Local Whisper plus the deterministic CLI analysis/template pipeline |
| `analyze_screenshot` | Return a fresh screenshot as MCP image content | Returns image bytes to the MCP client/agent; the client decides later egress |
| `start_recording` | Begin a recording session | Local capture while recording |
| `stop_recording` | Stop and process the active session | Local Whisper plus the deterministic CLI analysis/template pipeline |
| `push_to_github` | Create a GitHub issue from a report | Sends selected report content to GitHub |
| `push_to_linear` | Create a Linear issue from a report | Sends selected report content to Linear |

Run the source-built server with your MCP inspector or client to see each tool's current JSON schema. Tool arguments are validated by the server.

`describe_screen` sends the selected image to Anthropic and requires an Anthropic key supplied through its `apiKey` argument or the `ANTHROPIC_API_KEY` environment variable. It does not use the desktop provider selector.

`analyze_screenshot` returns the image bytes to the MCP client/agent; MarkuprPlus does not choose the model that the client may use to inspect that returned content.

`capture_with_voice`, `analyze_video`, and `stop_recording` use local Whisper plus the deterministic `TranscriptAnalyzer` and selected CLI template. They do not use the desktop provider selection. A local Whisper model and ffmpeg must be available for the relevant media workflow.

### Provision the MCP/CLI Whisper model

Source-built MCP media tools auto-discover a nonempty regular model file only in `~/.markuprx/whisper-models`. They do not expose the desktop downloader or the CLI's `--whisper-model` override.

Discovery checks these exact filenames in order: `ggml-medium.bin`, `ggml-small.bin`, `ggml-base.bin`, `ggml-tiny.bin`, `ggml-large-v3.bin`.

Obtain a compatible ggml model from the official [whisper.cpp model repository](https://huggingface.co/ggerganov/whisper.cpp), verify it according to that publisher's current instructions, then install a trusted local copy without printing its contents. For example on macOS/Linux:

```bash
install -d -m 700 "$HOME/.markuprx/whisper-models"
install -m 600 /absolute/path/to/trusted/ggml-base.bin \
  "$HOME/.markuprx/whisper-models/ggml-base.bin"
node dist/cli/index.mjs doctor
```

On Windows, create `%USERPROFILE%\.markuprx\whisper-models`, copy one exact filename there, and restrict the directory/file to the current user. Run `node dist/cli/index.mjs doctor` afterward. Without a discovered model, voice/video processing continues but its report is transcriptless.

### Tool credentials

- `describe_screen`: pass its `apiKey` argument or set `ANTHROPIC_API_KEY`; the selected image and prompt go to Anthropic.
- `push_to_github`: pass `token`, set `GITHUB_TOKEN`, or authenticate the `gh` CLI.
- `push_to_linear`: pass `token` or set `LINEAR_API_KEY`.

The MCP media pipeline does not use `OPENAI_API_KEY`, and desktop-saved provider keys are not imported into the source MCP server. Supply environment variables through your MCP client's secret-aware environment configuration, not a committed file.

## Example prompts

- “Use MarkuprPlus to capture the current screen and describe the layout problem.”
- “Start a recording while I reproduce this bug, then stop it and summarize the findings.”
- “Analyze `/absolute/path/to/recording.mov` as a GitHub issue draft.”
- “Push the reviewed report to GitHub.”

Delivery tools should be invoked only after reviewing their destination and report body.

## Configuration and privacy

The MCP server has its own tool wiring; selecting an analysis provider in the desktop Settings window does not reconfigure it.

- `describe_screen` directly calls Anthropic with the selected image and focus prompt.
- `analyze_screenshot` returns image content over MCP to the connected client; that client controls any later model request.
- Recording/video pipeline tools use local Whisper and deterministic TypeScript analysis/templates.
- GitHub and Linear delivery send the reviewed report to the chosen project when explicitly invoked.

Captured media and generated files remain in the session/output directory except for the explicit image return or external operations above. MarkuprPlus does not add application telemetry.

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
6. For the failing tool, confirm the exact prerequisite above: local Whisper model/ffmpeg, Anthropic key, or GitHub/Linear credentials.

For bugs and requests, use [MarkuprPlus Issues](https://github.com/hashfunction/MarkuprPlus/issues). The canonical product home is [markuprplus.com](https://markuprplus.com), which is forthcoming and is not currently a download channel.
