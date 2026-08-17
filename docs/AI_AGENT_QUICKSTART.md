# AI agent quick start

MarkuprPlus turns recordings, narration, screenshots, and marked evidence into reports an AI coding agent can consume.

## Choose an interface

- **Desktop:** record interactively, draw over the target, review multiple findings, and export Markdown/PDF/HTML/JSON.
- **CLI:** analyze existing media and render `markdown`, `json`, `github-issue`, `linear`, or `jira` templates.
- **MCP:** let a compatible agent invoke nine capture, analysis, recording, and delivery tools.

## Source setup

```bash
git clone https://github.com/hashfunction/MarkuprPlus.git
cd MarkuprPlus
npm install
npm run build
```

Run the desktop app with `npm run dev`, inspect the CLI with `node dist/cli/index.mjs --help`, or configure the MCP entry point at `dist/mcp/index.mjs` as described in [README-MCP.md](../README-MCP.md).

The lower-case package/command names remain compatibility identifiers, but no npm package is published today.

## Provider choices

No API key is required for every workflow.

- Local Whisper requires a downloaded model and performs post-session transcription locally.
- Local Rules requires no model service.
- Ollama and LM Studio require a local service and compatible model.
- Codex CLI and Claude Code CLI require their installed, authenticated command-line tools.
- Anthropic API analysis and OpenAI transcription require their respective keys and transmit selected content.

Start with Local Rules, then select another analysis provider in Settings if its data flow and capabilities fit the task.

## A useful first workflow

1. Start a desktop recording.
2. Select the exact window or region.
3. Narrate one issue at a time and commit marked evidence when useful.
4. Stop and wait for post-session processing.
5. Review every finding, category, severity, and screenshot.
6. Export a local file or explicitly deliver the reviewed content to GitHub/Linear.

Never include credentials in narration or reports. Treat screen contents as sensitive before invoking a cloud/CLI provider or external delivery tool.
