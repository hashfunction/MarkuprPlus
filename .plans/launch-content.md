# markuprx Launch Content

**Prepared:** 2026-02-15
**Version:** 2.5.0
**Website:** https://markuprx.com

---

## 1. Hacker News -- Show HN

### Title Options

1. `Show HN: markuprx -- MCP server that lets AI coding agents see your screen`
2. `Show HN: markuprx -- Record your screen, narrate bugs, get structured Markdown for AI agents`
3. `Show HN: markuprx -- Open-source tool that turns screen recordings into AI-consumable Markdown`

### Body Text (link post to GitHub repo)

Post the website link: https://markuprx.com

### Maker's First Comment

Hey HN -- I built markuprx because I kept losing context when reporting bugs to AI coding agents.

The core problem: I find a UI bug, switch to my editor, try to describe what I see in text, manually screenshot, crop, paste, and hope the agent understands the layout. I speak at 150 wpm but type at 60. By the time I've written the bug report, I've lost half the details.

markuprx records your screen while you narrate what's wrong. When you stop, it runs a pipeline that correlates your transcript timestamps with the video to extract the right frames at the right moments. The output is structured Markdown with screenshots placed exactly where you were describing them.

The pipeline: local Whisper transcribes the audio, a heuristic analyzer identifies key moments from the transcript (topic shifts, issue descriptions, pauses), ffmpeg extracts the video frames at those exact timestamps, and a generator stitches it all into categorized Markdown with severity levels.

It ships four ways:

- Desktop app (Electron, macOS/Windows) -- press a hotkey, talk, press again, paste the file path into your agent
- CLI -- `npx markuprx analyze ./recording.mov` for headless processing
- MCP server -- `npx markuprx-mcp` gives Claude Code, Cursor, or Windsurf the ability to capture your screen mid-conversation
- GitHub Action -- visual feedback on PRs in CI/CD

The MCP server is the part I'm most interested in feedback on. You add 3 lines to your Claude Code config, and the agent can call `capture_screenshot` to see what you see. No copy-pasting. The agent looks at your screen and acts.

Everything runs locally by default. No accounts, no telemetry, no cloud dependency. Whisper runs on-device. The Markdown output stays on your filesystem. MIT licensed.

Technical details: Electron + React + TypeScript for the desktop app. The CLI and MCP server are standalone Node.js builds (esbuild). Whisper models download from HuggingFace on first use (~75MB for tiny, ~500MB for base). ffmpeg is the only system dependency for the CLI.

Would love feedback on the timestamp correlation approach -- the heuristic key-moment detection is the piece I've iterated on the most. Source is at src/main/pipeline/TranscriptAnalyzer.ts if anyone wants to dig in.

https://markuprx.com

---

## 2. Product Hunt

### Tagline (60 chars max)

`Your AI coding agent can finally see your screen` (50 chars)

### Description

AI coding agents are blind. When you find a bug, you context-switch into writing mode -- describing the layout, manually screenshotting, hoping the agent understands. markuprx records your screen while you narrate what's wrong, then runs an intelligent pipeline that correlates your voice with the video to produce structured Markdown with screenshots placed exactly where they belong. Ships as a desktop app, CLI, MCP server for Claude Code/Cursor/Windsurf, and a GitHub Action. Everything runs locally, no account required, MIT licensed.

### 5 Key Features

1. **One-hotkey capture** -- Press Cmd+Shift+F, talk through what you see, press again. Structured Markdown with screenshots appears automatically.
2. **MCP server for AI agents** -- Add 3 lines to your Claude Code config. Your agent can now capture your screen mid-conversation and fix bugs it can see.
3. **Intelligent frame extraction** -- Whisper transcribes your voice, the pipeline identifies key moments, ffmpeg extracts frames at the exact timestamps you described issues. No random timer screenshots.
4. **Four interfaces, one pipeline** -- Desktop app for daily use. CLI (`npx markuprx analyze`) for scripts. MCP server for agent integration. GitHub Action for PR feedback.
5. **Local-first, zero config** -- Whisper runs on your device. No API keys, no accounts, no cloud dependency. Your recordings never leave your machine.

### Maker's Comment

Hey Product Hunt -- I'm Eddie, and I built markuprx because the feedback loop between developers and AI coding agents is broken.

I was using Claude Code daily and kept running into the same friction: I'd find a visual bug, then spend 2-3 minutes writing a text description, screenshotting, cropping, and dragging images into the right order. I realized I could just talk through what I see in 30 seconds and have a tool do the rest.

The breakthrough was timestamp correlation. Instead of capturing screenshots on a timer (like every screen recorder does), markuprx uses Whisper to transcribe your voice, analyzes the transcript for key moments, then extracts video frames at those exact timestamps. Every screenshot in the output shows what you were looking at when you described the issue.

Then I built the MCP server and everything changed. Instead of me capturing and pasting, my AI agent captures screenshots itself, mid-conversation. "Can you see the sidebar overlapping the content?" It calls capture_screenshot, sees the bug, and fixes it. Zero copy-paste.

It's fully open source (MIT), runs locally by default, and I'd love your feedback on what to build next.

### Categories

- Developer Tools
- Artificial Intelligence
- Open Source
- Productivity
- Design Tools

---

## 3. Reddit Posts

### r/programming -- Technical Angle

**Title:** I built an open-source tool that correlates voice transcription timestamps with screen recordings to produce structured Markdown for AI agents

**Body:**

I've been working on markuprx, an open-source tool (MIT) that solves a specific problem: getting visual context from your screen into a format that AI coding agents can actually act on.

The core technical challenge was timestamp correlation. When you narrate a bug while recording your screen, the interesting frames aren't evenly distributed -- they cluster around the moments you're describing something specific. Random timer-based screenshots miss the point entirely.

Here's how the pipeline works:

1. Record screen + microphone simultaneously
2. Run local Whisper on the audio to get word-level timestamps
3. A heuristic analyzer processes the transcript to identify key moments -- topic boundaries, issue descriptions, emphasis patterns, pauses that indicate visual inspection
4. ffmpeg seeks to those exact timestamps and extracts frames
5. A generator stitches the transcript segments with their corresponding frames into categorized Markdown

The result is a document where every screenshot shows exactly what you were looking at when you said the words next to it. Not a raw transcript with random images.

The pipeline degrades gracefully. No ffmpeg? Transcript-only output. No Whisper model? Timer-based fallback. No API keys? Everything runs locally.

It ships as four interfaces on the same pipeline: an Electron desktop app (macOS/Windows), a CLI tool (`npx markuprx analyze ./recording.mov`), an MCP server that lets AI agents like Claude Code capture your screen mid-conversation, and a GitHub Action for visual PR feedback.

The timestamp correlation logic is the part I've iterated on the most -- the heuristic key-moment detector is at `src/main/pipeline/TranscriptAnalyzer.ts` if anyone wants to look at the approach. I'd welcome feedback on the algorithm.

Stack: Electron + React + TypeScript (desktop), esbuild (CLI/MCP), Whisper (transcription), ffmpeg (frame extraction).

https://markuprx.com

---

### r/webdev -- Practical Angle

**Title:** I built a tool that turns "the button is too small on mobile" into structured Markdown with the exact screenshot your AI agent needs

**Body:**

If you use AI coding agents (Claude Code, Cursor, Windsurf, etc.) for frontend work, you've probably hit this wall: you find a CSS bug, and then you spend more time describing it in text than it would take to just fix it yourself.

I built markuprx to shortcut that entirely. Press a hotkey, talk through what you see ("the submit button is way too small on mobile, I keep hitting the cancel link underneath"), press the hotkey again. markuprx produces structured Markdown with screenshots extracted from the exact moments you were describing each issue.

The output looks like this:

```
## FB-001: Button sizing issue
The submit button is way too small on mobile. I'm trying to tap
it and keep hitting the cancel link underneath.

![Screenshot at 0:34](screenshots/fb-001.png)
```

Each screenshot is the actual video frame from the moment you were talking about that specific issue. Not a random timer capture.

For web dev specifically, this is useful for: responsive layout bugs (you can narrate while resizing), animation/transition issues (the exact frame of the jank gets captured), and any visual problem that's easier to show than describe.

It works as a desktop app (macOS/Windows), a CLI tool (`npx markuprx analyze ./recording.mov` if you already have recordings), and an MCP server that lets your AI agent capture screenshots of your screen during a conversation.

The MCP server angle changed my workflow the most. I added 3 lines to my Claude Code config, and now when I say "the sidebar is overlapping on mobile, can you see it?" the agent calls capture_screenshot, sees the actual layout, and fixes the CSS. No screenshotting, no cropping, no pasting.

Open source, MIT licensed, no accounts or API keys required.

https://markuprx.com

---

### r/ClaudeAI -- MCP Angle

**Title:** I built an MCP server that gives Claude Code the ability to see your screen and capture screenshots mid-conversation

**Body:**

I've been using Claude Code heavily and the one thing that kept slowing me down was visual context. I'd find a UI bug, then spend time screenshotting, cropping, and pasting into the conversation. It felt wrong -- the agent should be able to just look at my screen.

So I built markuprx-mcp, an MCP server that does exactly that. Setup is 3 lines in your Claude Code config:

```json
{
  "mcpServers": {
    "markuprx": {
      "command": "npx",
      "args": ["-y", "markuprx-mcp"]
    }
  }
}
```

Once configured, Claude Code gets these tools:

- `capture_screenshot` -- grabs your current screen
- `capture_with_voice` -- records screen + mic for a set duration, returns a structured Markdown report
- `analyze_video` -- processes any .mov or .mp4 into Markdown with extracted frames
- `analyze_screenshot` -- runs a screenshot through analysis
- `start_recording` / `stop_recording` -- interactive recording sessions

The workflow that changed everything for me: I find a visual bug, say "the sidebar is overlapping the content on mobile, can you see it?" Claude calls capture_screenshot, sees the actual layout problem, identifies the CSS issue, and fixes it. Zero copy-paste. Zero manual screenshots.

For more complex feedback, I use capture_with_voice to record a 30-second walkthrough of an issue. The tool transcribes my narration with Whisper, correlates timestamps with the video, extracts frames at the moments I was describing each problem, and returns structured Markdown. Claude gets a full report with screenshots placed exactly where they belong.

Everything runs locally. Whisper transcription is on-device. No cloud processing for your screen content. MIT licensed.

Also works with Cursor and Windsurf -- same MCP config format.

https://markuprx.com

---

### r/SideProject -- Builder Angle

**Title:** 6 months building an open-source tool that turns screen recordings into AI-ready Markdown -- just shipped v2.5.0

**Body:**

I want to share what I've been building for the past 6 months: markuprx, an open-source tool that records your screen while you narrate bugs, then produces structured Markdown with screenshots that AI coding agents can act on.

The origin story: I was using Claude Code for a client project and found myself spending 3-4 minutes per bug just getting visual context into the conversation. Screenshot, crop, paste, describe. Repeat. One day I timed it and realized I was spending more time describing bugs than the AI spent fixing them. That felt backwards.

The core insight was that when you talk through a visual problem, the important moments are embedded in your speech patterns. You pause when looking at something, you emphasize when describing an issue, you shift topics when moving to a new area. If I could correlate those speech patterns with the screen recording, I could extract exactly the right frames without the developer doing anything.

That became the technical challenge: Whisper for transcription, heuristic analysis for key-moment detection, ffmpeg for frame extraction, all stitched into one pipeline.

v2.5.0 shipped with four interfaces: desktop app (Electron), CLI (`npx markuprx analyze`), MCP server for AI agents (`npx markuprx-mcp`), and a GitHub Action. MIT licensed.

Some numbers from the build:

- ~15,000 lines of TypeScript
- 644 tests across 39 test files
- Ships on macOS and Windows
- Published to npm as two packages (markuprx and markuprx-mcp)
- Zero revenue, fully open source

The MCP server is the piece I'm most excited about. Instead of me capturing context for my AI agent, the agent captures it itself. "Can you see this bug?" becomes a real question with a real answer.

Would love to hear what other side project builders think. What would you add?

https://markuprx.com

---

## 4. Twitter/X Launch Thread

### Tweet 1 (Hook -- the problem)

AI coding agents can't see your screen.

You find a bug. You screenshot it. You crop it. You paste it. You describe it in text. You pray the agent understands.

There's a better way.

### Tweet 2 (The solution)

markuprx records your screen while you narrate what's wrong.

When you stop, it correlates your transcript timestamps with the video, extracts frames at the exact moments you described issues, and produces structured Markdown with screenshots placed where they belong.

### Tweet 3 (Demo + CLI)

The CLI works on any recording you already have:

npx markuprx analyze ./recording.mov

No install. One command. Whisper transcription + intelligent frame extraction + structured Markdown output.

[DEMO GIF PLACEHOLDER]

### Tweet 4 (MCP server)

The real unlock: an MCP server for Claude Code, Cursor, and Windsurf.

3 lines in your config. Now your agent can call capture_screenshot mid-conversation.

"The sidebar is overlapping on mobile, can you see it?"

The agent looks. Sees the bug. Fixes it. Zero copy-paste.

### Tweet 5 (Open source)

Fully open source. MIT licensed.

- Local Whisper transcription (no cloud)
- No accounts or API keys required
- No telemetry, no tracking
- Your recordings never leave your machine

### Tweet 6 (GitHub Action)

It also ships as a GitHub Action for visual feedback on PRs:

```yaml
- uses: eddiesanjuan/markuprx-action@v1
  with:
    video-path: ./recordings/
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

Visual bug reports in your CI/CD pipeline.

### Tweet 7 (CTA)

Four interfaces, one pipeline:

- Desktop app (macOS/Windows)
- CLI: npx markuprx analyze
- MCP server: npx markuprx-mcp
- GitHub Action

Try it. Break it. Tell me what to build next.

https://markuprx.com

---

## 5. LinkedIn Post

AI coding agents are powerful, but they have a blind spot: they can't see your screen.

When a developer finds a visual bug -- a layout shift, a responsive breakpoint issue, a component rendering incorrectly -- the workflow breaks down. They switch from building to describing. Screenshots get manually captured, cropped, and pasted. Context gets lost in translation. The feedback loop that should take 30 seconds takes 3-4 minutes.

I built markuprx to fix this. It records your screen while you narrate what you see, then runs a pipeline that correlates your speech timestamps with the video to extract the right frames at the right moments. The output is structured Markdown with screenshots placed exactly where they belong -- ready for AI agents to consume and act on immediately.

With v2.5.0, it ships as a desktop app, a CLI tool (npx markuprx analyze), an MCP server that gives AI agents like Claude Code the ability to capture your screen mid-conversation, and a GitHub Action for visual feedback on pull requests.

The MCP server has changed how I work with AI coding assistants. Instead of describing what I see, I ask the agent to look. It captures a screenshot, identifies the issue, and fixes the code. Zero manual context transfer.

Open source, MIT licensed, no accounts required. Everything runs locally.

https://markuprx.com

---

## Quick Reference: Platform Norms

| Platform | Tone | Avoid | Lead With |
|----------|------|-------|-----------|
| Hacker News | Technical, factual, humble | Hype, marketing language, superlatives | Architecture, how it works |
| Product Hunt | Personal, enthusiastic, story-driven | Technical jargon | Problem/solution, maker story |
| r/programming | Technical depth, show the code | Self-promotion language, "check out my tool" | The algorithm, the pipeline |
| r/webdev | Practical, workflow-focused | Over-engineering language | Time saved, real workflow |
| r/ClaudeAI | Tutorial-style, helpful | Product announcement tone | MCP setup guide, practical value |
| r/SideProject | Personal narrative, transparent | Polished marketing | Build journey, real numbers |
| Twitter/X | Punchy, visual, threaded | Walls of text | Hook with the problem |
| LinkedIn | Professional, productivity-focused | Casual language, technical depth | Developer productivity, team value |
