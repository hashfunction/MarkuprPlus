# Hacker News: Show HN Post

## Title Options

1. **Show HN: markuprx -- Give your AI coding agent eyes and ears (open source)** (recommended)
2. Show HN: I built an MCP server that lets Claude Code see my screen and hear my voice
3. Show HN: markuprx -- Screen recording to AI-ready Markdown with intelligent frame extraction

---

## Post Body

I built markuprx because describing visual bugs to AI coding agents is lossy. You see a broken layout, but all you can give the agent is "the sidebar overlaps the content on mobile." Half the context is lost in translation.

markuprx fixes this. It records your screen and microphone, runs the audio through Whisper for transcription, then does something I haven't seen elsewhere: it correlates transcript timestamps with the video to extract frames at the exact moments you were describing something. The output is a structured Markdown document with screenshots placed where they belong -- not at arbitrary intervals, but at the moments that matter.

**The pipeline:**

1. Audio transcription (local Whisper, no API key needed)
2. Transcript analysis -- heuristic key-moment detection (topic changes, emphasis, issue descriptions)
3. Frame extraction via ffmpeg at those precise timestamps
4. Structured Markdown generation (inspired by llms.txt)

There are three ways to use it:

**Desktop app** -- macOS menu bar app. Press Cmd+Shift+F to start recording, press it again to stop. The file path to your Markdown report is copied to clipboard. Paste it into Claude Code or Cursor and the agent reads the structured feedback with screenshots.

**CLI** -- `npx markuprx analyze ./recording.mov` processes any screen recording into a Markdown report with extracted frames. No Electron, no desktop app needed.

**MCP server** -- Add 3 lines of JSON to your Claude Code or Cursor config and your agent gets 6 tools: screenshot capture, screen+voice recording, video analysis, and interactive recording sessions. The agent can see your screen mid-conversation.

```json
{
  "mcpServers": {
    "markuprx": { "command": "npx", "args": ["--yes", "--package", "markuprx", "markuprx-mcp"] }
  }
}
```

After setup, you can say "the sidebar is broken on mobile, can you see it?" and the agent captures a screenshot, sees the issue, and fixes it. No copy-pasting.

**New in v2.5.0: markuprx now delivers feedback to your issue tracker.**

- **Output Templates** -- `--template github-issue` or `--template linear` formats your feedback as structured issues, not just markdown. Also supports JSON and Jira formats.
- **Push to GitHub Issues** -- `markuprx push github --repo owner/repo` creates a GitHub issue directly from a session. Screenshots are uploaded and embedded.
- **Push to Linear** -- `markuprx push linear --team KEY` creates a Linear issue with full context. Record the bug, push to the backlog, done.
- **Watch Mode** -- `markuprx watch ./dir` monitors a directory and auto-processes any new recording that appears. Drop a screen recording in a folder, get a structured report back.
- **GitHub Action** -- `eddiesanjuan/markuprx-action@v1` runs markuprx in CI. Push a commit, the action analyzes visual changes, and posts structured feedback as a PR comment. Teams get automated visual QA without manual recording.

The pipeline went from "record and structure" to "record, structure, and deliver." You record the bug, markuprx writes it up, and pushes it to your issue tracker. The feedback loop is closed.

Everything runs locally by default. Whisper transcription happens on your machine. No telemetry, no tracking, no accounts. The only external calls happen if you explicitly configure an OpenAI key for cloud transcription or an Anthropic key for AI-enhanced analysis.

Open source, MIT licensed. 860 tests.

Website: https://markuprplus.com
npm: `npx --package markuprx markuprx-mcp` (MCP server) / `npx markuprx analyze` (CLI)
GitHub Action: `eddiesanjuan/markuprx-action@v1`
