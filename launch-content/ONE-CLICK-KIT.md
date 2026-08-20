# markuprx Launch Day: One-Click Posting Kit

> **Open this document on launch day. Every post is copy-paste ready.**
> All URLs verified. All flairs noted. All compliance rules included.
> Just Cmd+C the code blocks and Cmd+V into the target.

---

## Pre-Launch Reminders

- **Space posts apart.** Reddit flags accounts that post similar content across subs rapidly. Minimum 4-6 hours between Reddit posts, ideally across different days.
- **Eddie's account needs prior engagement** on r/webdev and r/programming before posting there. Comment on a few threads in those subs in the days before launch.
- **All links use markuprplus.com** (not markuprx.dev).
- **Don't cross-link posts.** Each platform post should stand alone.

---

## Day 1: Launch Day

---

### 1. Hacker News -- Post Immediately

**Open:** https://news.ycombinator.com/submit

**Title field:**
```
Show HN: markuprx -- Give your AI coding agent eyes and ears (open source)
```

**URL field:**
```
https://markuprplus.com
```

> **Do NOT put anything in the "text" field.** HN only allows URL or text, not both. Post as a URL submission, then immediately add your body as the first comment.

**First comment** (post immediately after submission -- go to your post and click "add comment"):

```
I built markuprx because describing visual bugs to AI coding agents is lossy. You see a broken layout, but all you can give the agent is "the sidebar overlaps the content on mobile." Half the context is lost in translation.

markuprx fixes this. It records your screen and microphone, runs the audio through Whisper for transcription, then does something I haven't seen elsewhere: it correlates transcript timestamps with the video to extract frames at the exact moments you were describing something. The output is a structured Markdown document with screenshots placed where they belong -- not at arbitrary intervals, but at the moments that matter.

The pipeline:

1. Audio transcription (local Whisper, no API key needed)
2. Transcript analysis -- heuristic key-moment detection (topic changes, emphasis, issue descriptions)
3. Frame extraction via ffmpeg at those precise timestamps
4. Structured Markdown generation (inspired by llms.txt)

There are three ways to use it:

Desktop app -- macOS menu bar app. Press Cmd+Shift+F to start recording, press it again to stop. The file path to your Markdown report is copied to clipboard. Paste it into Claude Code or Cursor and the agent reads the structured feedback with screenshots.

CLI -- `npx markuprx analyze ./recording.mov` processes any screen recording into a Markdown report with extracted frames. No Electron, no desktop app needed.

MCP server -- Add 3 lines of JSON to your Claude Code or Cursor config and your agent gets 6 tools: screenshot capture, screen+voice recording, video analysis, and interactive recording sessions. The agent can see your screen mid-conversation.

  {
    "mcpServers": {
      "markuprx": { "command": "npx", "args": ["--yes", "--package", "markuprx", "markuprx-mcp"] }
    }
  }

After setup, you can say "the sidebar is broken on mobile, can you see it?" and the agent captures a screenshot, sees the issue, and fixes it. No copy-pasting.

New in v2.5.0: markuprx now delivers feedback to your issue tracker.

- Output Templates -- `--template github-issue` or `--template linear` formats feedback as structured issues. Also supports JSON and Jira.
- Push to GitHub Issues -- `markuprx push github --repo owner/repo` creates an issue with embedded screenshots.
- Push to Linear -- `markuprx push linear --team KEY` creates a Linear issue with full context.
- Watch Mode -- `markuprx watch ./dir` monitors a directory and auto-processes new recordings.
- GitHub Action -- `eddiesanjuan/markuprx-action@v1` runs markuprx in CI. Posts structured visual feedback as PR comments.

The pipeline went from "record and structure" to "record, structure, and deliver."

Everything runs locally by default. Whisper transcription happens on your machine. No telemetry, no tracking, no accounts. The only external calls happen if you explicitly configure an OpenAI key for cloud transcription or an Anthropic key for AI-enhanced analysis.

Open source, MIT licensed. 860 tests.

Website: https://markuprplus.com
npm: `npx --package markuprx markuprx-mcp` (MCP server) / `npx markuprx analyze` (CLI)
GitHub Action: `eddiesanjuan/markuprx-action@v1`
```

---

### 2. Twitter/X Thread -- Post 30 Minutes After HN

**Open:** https://x.com/compose/post

Post each tweet as a reply to the previous one. After posting Tweet 1, click it, then reply with Tweet 2, etc.

**Tweet 1 (Hook):**
```
Your AI coding agent can't see your screen. And even when it can, it can't file the bug for you. Both change today.

markuprx v2.5: record your screen, narrate bugs, get structured reports pushed directly to GitHub Issues or Linear.

Open source. Free. Zero config.

https://markuprplus.com
```

> Attach: hero screenshot or demo GIF showing the workflow.

**Tweet 2 (MCP Config):**
```
Add this to your Claude Code settings and your agent gets 6 tools -- screenshot capture, screen+voice recording, video analysis:

{
  "mcpServers": {
    "markuprx": {
      "command": "npx",
      "args": ["--yes", "--package", "markuprx", "markuprx-mcp"]
    }
  }
}

Zero install. npx handles everything.
```

> Attach: screenshot of the JSON config in an editor.

**Tweet 3 (The Output):**
```
What the output looks like -- not random screenshots, but frames extracted at the exact timestamp you described each issue:

### FB-001: Login button not visible
**Timestamp**: 00:15 | **Type**: Bug

> The login button is hidden behind
> the header on mobile viewport...

![Screenshot](./screenshots/fb-001.png)

Structured for LLM consumption.
```

> Attach: screenshot of actual Markdown output in VS Code / preview.

**Tweet 4 (Technical Pipeline):**
```
The pipeline that makes this work:

1. Record screen + mic
2. Transcribe with local Whisper (no API key)
3. Analyze transcript for key moments
4. Extract video frames via ffmpeg at those timestamps
5. Generate structured Markdown with screenshots placed where they belong

All local. All automatic.
```

**Tweet 5 (Open Source):**
```
markuprx is MIT licensed, fully open source.

- No telemetry
- No tracking
- No accounts
- Whisper runs on your machine
- Your recordings never leave your disk

The only external calls happen if you explicitly add an API key for cloud transcription or AI analysis. You control when data leaves.
```

**Tweet 6 (Integrations -- NEW):**
```
v2.5 closes the loop. markuprx now pushes feedback directly to your issue tracker:

`markuprx push github --repo owner/repo`
`markuprx push linear --team KEY`

Record the bug. Structure it. Push it to your backlog. One pipeline, zero copy-paste.

Also: `--template github-issue` / `--template jira` for custom output formats.
```

**Tweet 7 (GitHub Action):**
```
markuprx now has a GitHub Action: `eddiesanjuan/markuprx-action@v1`

Push a commit. The action captures and analyzes visual changes. Posts structured feedback as a PR comment with screenshots.

Automated visual QA in your CI/CD. Free. Open source.
```

**Tweet 8 (Five Ways + Watch Mode):**
```
Five ways to use it now:

Desktop app -- menu bar, one hotkey
CLI -- `npx markuprx analyze ./video.mov`
MCP server -- `npx --package markuprx markuprx-mcp`
Watch mode -- `markuprx watch ./dir` (auto-process recordings)
GitHub Action -- CI/CD visual feedback

Same pipeline. Pick whatever fits your workflow.
```

**Tweet 9 (CTA):**
```
If you're tired of describing visual bugs in text, give it a try.

Website: https://markuprplus.com
npm: `npx --package markuprx markuprx-mcp`
Action: `eddiesanjuan/markuprx-action@v1`

860 tests. MIT licensed. Contributions welcome.
```

---

### 3. r/ClaudeAI -- Post 2-4 Hours After HN

**Open:** https://www.reddit.com/r/ClaudeAI/submit

**Flair:** Select `Built with Claude` (REQUIRED -- post will be removed without it)

**Post type:** Text post (not link post)

**Title:**
```
I built an MCP server that lets Claude Code see your screen and hear your voice
```

**Body:**
```
I've been using Claude Code daily and the biggest friction point for me was context about visual issues. Describing what I see in text loses half the information. So I built markuprx -- an MCP server that gives Claude Code direct access to screen capture and voice recording.

### Setup

Add this to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "markuprx": {
      "command": "npx",
      "args": ["--yes", "--package", "markuprx", "markuprx-mcp"]
    }
  }
}
```

That's it. Restart Claude Code and you get 6 new tools.

### What the agent can do

- **capture_screenshot** -- grab the current screen. The agent sees what you see.
- **capture_with_voice** -- record screen + mic for a set duration. Returns a structured Markdown report with transcript and extracted frames.
- **analyze_screenshot** -- take a screenshot and return the image data directly for vision analysis.
- **analyze_video** -- process any .mov or .mp4 through the pipeline.
- **start_recording / stop_recording** -- interactive recording sessions.

### How I actually use it

I'll be reviewing a feature and spot something off. Instead of typing out what's wrong, I just say: "The sidebar is overlapping on mobile, can you see it?" Claude calls `capture_screenshot`, sees the layout issue, and starts fixing the CSS. No copy-pasting screenshots, no describing pixel positions.

For bigger reviews, I use `capture_with_voice` -- record for 30 seconds while narrating what I see. The pipeline transcribes with Whisper, finds the key moments in my narration, extracts video frames at those timestamps, and returns a structured report. Claude reads the whole thing and addresses each issue.

### A prompt I use

When I want Claude Code to do a visual review of what I'm working on, I say:

> Take a screenshot of my screen and tell me if you see any layout or spacing issues on the page I have open.

Claude calls `capture_screenshot`, gets the image, and responds with specific observations about what it sees. From there I can say "fix it" and it starts writing code.

### New in v2.5.0: Push feedback to your issue tracker

The latest update closes the feedback loop. After capturing and structuring your feedback, you can push it directly to GitHub Issues or Linear:

- `markuprx push github --repo owner/repo` -- creates a GitHub issue with embedded screenshots
- `markuprx push linear --team KEY` -- creates a Linear issue with full context
- `--template github-issue` / `--template linear` / `--template jira` -- format output for your tracker
- `markuprx watch ./dir` -- auto-process any new recording that lands in a directory
- **GitHub Action** (`eddiesanjuan/markuprx-action@v1`) -- automated visual QA in CI/CD

Record the bug, push it to the backlog. The agent doesn't just see the problem -- it files the ticket.

### How I built it

The MCP server is a headless Node.js process (no Electron dependency) that exposes 6 tools via the Model Context Protocol. Screen capture uses the native macOS screenshot API. Voice recording captures audio + screen simultaneously, then pipes the audio through local Whisper for transcription. A heuristic analyzer finds key moments in the transcript and ffmpeg extracts video frames at those timestamps. Everything is stitched into structured Markdown.

The desktop app, CLI, and MCP server all share the same post-processing pipeline -- I just built different interfaces on top of it.

### Privacy

Everything runs locally. Whisper transcription is on your machine. No telemetry, no data collection. External calls only happen if you explicitly add API keys for cloud transcription.

Open source, MIT, 860 tests: https://markuprplus.com
```

> **Compliance notes:**
> - "Built with Claude" flair is required for project showcases
> - Post includes the required elements: what you built, how you built it, and a prompt example
> - Keep tone conversational, not salesy

---

### 4. r/cursor -- Post 4-6 Hours After r/ClaudeAI

**Open:** https://www.reddit.com/r/cursor/submit

**Flair:** Select `Tool` or `MCP` if available, otherwise general discussion

**Post type:** Text post

**Title:**
```
MCP server that gives Cursor screenshot and screen recording capabilities
```

**Body:**
```
Sharing an MCP server I built for capturing screen context during Cursor sessions. It lets the agent take screenshots, record your screen with voice narration, and process everything into structured Markdown.

### Quick Setup

Add to `.cursor/mcp.json` (project-level) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "markuprx": {
      "command": "npx",
      "args": ["--yes", "--package", "markuprx", "markuprx-mcp"]
    }
  }
}
```

Restart Cursor. You now have 6 tools available.

### Tools

| Tool | What it does |
|------|-------------|
| `capture_screenshot` | Grab current screen |
| `capture_with_voice` | Record screen + mic, get structured report |
| `analyze_video` | Process any video file into Markdown |
| `analyze_screenshot` | Screenshot with vision analysis |
| `start_recording` | Begin interactive session |
| `stop_recording` | End session, get report |

### Practical example

You're reviewing a page and the layout breaks on resize. Instead of screenshotting, uploading, and explaining, ask Cursor to capture a screenshot. It sees the issue and can act on it.

For more complex feedback, `capture_with_voice({ duration: 30 })` records your screen while you talk through issues. It transcribes your voice with local Whisper, extracts frames at the moments you described each issue, and returns a structured Markdown report.

### Requirements

- macOS (screen recording + mic permissions required)
- ffmpeg (`brew install ffmpeg`) for recording tools
- Screenshot tools work without ffmpeg

### New in v2.5.0: Push to your issue tracker

markuprx now delivers feedback directly to GitHub Issues and Linear:

- `markuprx push github --repo owner/repo` -- creates a GitHub issue from your session
- `markuprx push linear --team KEY` -- creates a Linear issue with full context
- `markuprx watch ./dir` -- auto-process recordings as they appear
- Output templates: `--template github-issue`, `--template linear`, `--template jira`, `--template json`
- **GitHub Action** (`eddiesanjuan/markuprx-action@v1`) -- visual QA in CI/CD

Record it, structure it, push it. No more manual bug filing.

### Requirements

- macOS (screen recording + mic permissions required)
- ffmpeg (`brew install ffmpeg`) for recording tools
- Screenshot tools work without ffmpeg

Open source, MIT licensed, 860 tests: https://markuprplus.com

Full MCP docs: https://markuprplus.com
```

> **Compliance notes:**
> - MCP tool posts are common and well-received here
> - Keep tone practical and utility-focused
> - No prior engagement requirements for this sub

---

### 5. Dev.to -- Post Same Day as Launch

**Open:** https://dev.to/new

Paste the full article below. The frontmatter goes at the very top of the editor (Dev.to uses YAML frontmatter).

**Full article (paste everything below into the editor):**
```
---
title: I Built an MCP Server That Gives AI Agents Eyes and Ears
published: true
description: markuprx records your screen and voice, structures feedback with screenshots, and pushes it directly to GitHub Issues or Linear. Your AI coding agent sees what you see -- and files the ticket.
tags: ai, opensource, webdev, productivity
cover_image:
---

# I Built an MCP Server That Gives AI Agents Eyes and Ears

## The Problem

I use AI coding agents for most of my development work. Claude Code, Cursor -- they're good at writing code when they have the right context. But there's one type of context that's surprisingly hard to communicate: what you see on screen.

You spot a layout bug. The sidebar overlaps the main content on mobile. A dropdown is clipped by overflow:hidden. The spacing between cards is inconsistent.

You try to describe it:

> "The sidebar is overlapping the main content when the viewport is narrow, and there's some clipping on the dropdown in the nav."

The agent gets a rough idea, but it's working from a lossy description. It doesn't know exactly which sidebar. It can't see the clipping. It doesn't know if the issue is padding, margin, z-index, or a flex container.

Screenshot? Better. But now you're screenshotting, uploading, switching context, writing a description alongside it. For one issue that's fine. For a 5-minute review session where you spot a dozen things? The friction kills the flow.

## The Solution

I built [markuprx](https://markuprplus.com). It records your screen and microphone, then runs a post-processing pipeline that:

1. Transcribes your voice with local Whisper
2. Analyzes the transcript to find key moments
3. Extracts video frames at those exact timestamps
4. Stitches everything into structured Markdown

The key difference from "record screen + take periodic screenshots": markuprx extracts frames that correspond to what you were describing. When you say "this button is hidden on mobile," the extracted frame shows exactly what was on screen at that moment.

The output is structured for AI consumption -- not a wall of text with random images, but a document where each feedback item has a timestamp, a transcript excerpt, and the corresponding screenshot.

## Architecture

Here's the pipeline:

```
Audio --> Whisper (local) --> Timestamped transcript
                                      |
                                      v
                              Transcript Analyzer
                              (key-moment detection)
                                      |
                                      v
                              Timestamp list --> ffmpeg --> Extracted frames
                                                               |
                                                               v
                              Transcript + frames --> Structured Markdown
```

### Transcription

Audio goes through local Whisper with word-level timestamps. This is critical -- segment-level timestamps (every 5-10 seconds) aren't precise enough for frame extraction. Word-level timing lets us extract the frame that was on screen when you said a specific word.

The default is the Whisper tiny model (~75MB). It's fast, runs on any machine, and is accurate enough for the key-moment detection to work. You can optionally point it at OpenAI's Whisper-1 API for higher accuracy.

### Key-Moment Detection

A heuristic analyzer (not an LLM) scans the transcript for:

- **Topic changes** -- when you start describing a different part of the UI
- **Emphasis markers** -- words like "notice," "look at," "here," "this is broken"
- **Issue descriptions** -- patterns that indicate bug reports or visual observations
- **Natural pauses** -- when you stop talking to point at something

This runs in under 100ms on any transcript length. No API call, no model loading.

### Frame Extraction

ffmpeg pulls frames from the screen recording at the timestamps identified by the analyzer. Since we have word-level timing from Whisper, the frames correspond to specific moments in the narration -- not arbitrary intervals.

### Document Generation

The transcript and frames are assembled into structured Markdown. Each feedback item gets:

- A sequential ID (FB-001, FB-002, ...)
- A timestamp
- The relevant transcript excerpt
- The corresponding screenshot, inline

The format is inspired by [llms.txt](https://llmstxt.org/) -- designed so LLMs can parse it without any preprocessing.

## Three Ways to Use It

### 1. Desktop App

A macOS menu bar app. Press `Cmd+Shift+F` to start recording, press it again to stop. The pipeline runs automatically and copies the file path to your clipboard.

Paste the path into Claude Code: "Read the feedback at /Users/me/markuprx/sessions/.../feedback-report.md"

The agent reads the structured document with screenshots and starts fixing issues.

### 2. CLI

```bash
# Process any screen recording
npx markuprx analyze ./recording.mov

# With options
npx markuprx analyze ./recording.mov --output ./reports --verbose
```

No Electron, no desktop app. Works in CI/CD pipelines. An AI agent can run this command to process a recording programmatically.

### 3. MCP Server

MCP (Model Context Protocol) lets AI coding agents call tools. The markuprx MCP server gives your agent 6 tools for screen capture and recording.

#### Setup

Add to your IDE config -- Claude Code, Cursor, or Windsurf:

```json
{
  "mcpServers": {
    "markuprx": {
      "command": "npx",
      "args": ["--yes", "--package", "markuprx", "markuprx-mcp"]
    }
  }
}
```

That's it. `npx` handles installation. No global install needed.

#### The 6 Tools

| Tool | What it does |
|------|-------------|
| `capture_screenshot` | Grab the current screen. Agent sees what you see. |
| `capture_with_voice` | Record screen + mic for N seconds. Full pipeline runs, returns structured report. |
| `analyze_video` | Process any .mov or .mp4 through the pipeline. |
| `analyze_screenshot` | Screenshot returned as image data for vision analysis. |
| `start_recording` | Begin an interactive recording session. |
| `stop_recording` | End session. Full pipeline runs, report returned. |

#### What This Looks Like in Practice

```
You: "The sidebar is overlapping the main content on mobile.
      Can you see it?"

Agent: [calls capture_screenshot]
       "I can see the issue -- the sidebar has position: fixed
        but no z-index, and it's 280px wide with no responsive
        breakpoint. Let me fix the CSS..."

       [edits sidebar.css]
       [calls capture_screenshot]
       "Fixed. The sidebar now collapses below 768px. Screenshot
        confirms the layout is correct."
```

No screenshotting. No uploading. No describing pixel positions. The agent looks at your screen and acts.

For longer reviews, the agent can call `capture_with_voice({ duration: 60 })` while you narrate issues for a minute. It gets back a full structured report with every issue you described, each with the corresponding screenshot.

## New in v2.5.0: Feedback Delivery Pipeline

v2.5.0 closes the loop. markuprx doesn't just capture and structure feedback -- it delivers it to your issue tracker.

### Push to GitHub Issues

```bash
markuprx push github --repo owner/repo
```

Creates a GitHub issue directly from your session. Screenshots are uploaded and embedded inline.

### Push to Linear

```bash
markuprx push linear --team KEY
```

Creates a Linear issue with full context -- transcript, screenshots, severity labels.

### Output Templates

```bash
npx markuprx analyze ./recording.mov --template github-issue
npx markuprx analyze ./recording.mov --template linear
npx markuprx analyze ./recording.mov --template jira
npx markuprx analyze ./recording.mov --template json
```

Five template formats: standard Markdown (default), GitHub Issue, Linear, Jira, and JSON.

### Watch Mode

```bash
markuprx watch ./recordings
```

Monitors a directory and auto-processes any new recording that appears.

### GitHub Action

```yaml
- uses: eddiesanjuan/markuprx-action@v1
```

Runs markuprx in CI/CD. Posts structured visual feedback as PR comments with screenshots.

## Sample Output

Here's what a processed session looks like:

```markdown
# Feedback Report: Dashboard Redesign

## Summary
- **Duration**: 1m 42s
- **Items**: 4 feedback points
- **Screenshots**: 4 captured

## Feedback Items

### FB-001: Navigation dropdown clipped
**Timestamp**: 00:15 | **Type**: Bug

> The dropdown menu is being clipped by the parent container's
> overflow hidden. You can see it cuts off after the third item.

![Screenshot at 00:15](./screenshots/fb-001.png)

### FB-002: Card spacing inconsistent
**Timestamp**: 00:32 | **Type**: UI Issue

> These cards have different padding -- the first row is 16px
> and the second row looks like 24px. Should be consistent.

![Screenshot at 00:32](./screenshots/fb-002.png)
```

An AI agent can read this and know exactly what to fix (and what not to touch).

## Privacy

Everything runs locally by default:

- Whisper transcription happens on your machine
- Recordings are stored on your disk
- No telemetry, no tracking, no accounts
- No data leaves your machine

The only external calls happen if you explicitly configure:
- An OpenAI API key for cloud transcription (higher accuracy)
- An Anthropic API key for AI-enhanced document analysis

You control when and whether data leaves your machine.

## What's Next

- Linux support for the desktop app
- Browser extension for capturing web app sessions
- Collaborative sessions (multiple narrators, one recording)
- Jira Cloud push integration (currently template-only)
- Slack/Discord notification hooks

## Links

- **Website**: [markuprplus.com](https://markuprplus.com)
- **MCP server**: `npx --package markuprx markuprx-mcp` (zero install)
- **CLI**: `npx markuprx analyze ./video.mov`
- **GitHub Action**: `eddiesanjuan/markuprx-action@v1`
- **npm**: [npmjs.com/package/markuprx](https://www.npmjs.com/package/markuprx)

Open source, MIT licensed. 860 tests across 44 files. Contributions welcome.
```

> **Notes:**
> - Change `published: false` to `published: true` when ready to go live
> - Add a `cover_image:` URL if you have a hero image hosted somewhere
> - Dev.to supports markdown natively -- paste the whole thing

---

## Day 2-3: After Launch

---

### 6. r/programming -- Post 1-2 Days After Launch

**Open:** https://www.reddit.com/r/programming/submit

**Flair:** None required (may not have project-specific flairs)

**Post type:** Text post

> **WARNING: This is the strictest sub.** r/programming enforces a 90/10 self-promotion rule aggressively. Eddie's account MUST have active programming discussion history. Lead with engineering, not product. If in doubt, post this as a link post to the GitHub repo instead.

**Title:**
```
Building a timestamp-correlated frame extraction pipeline for screen recordings
```

**Body:**
```
I built an open source tool called markuprx that processes screen recordings with voice narration into structured documents. The interesting technical bit is the pipeline that correlates transcript timestamps with video frames.

### The problem

Most screen-to-document tools either capture at fixed intervals (every N seconds) or on manual trigger. Both are noisy -- you get frames that don't correspond to anything meaningful.

### The approach

markuprx records screen and microphone simultaneously, then runs a post-processing pipeline:

```
Audio --> Whisper (local) --> Timestamped transcript
                                      |
                                      v
                              Transcript Analyzer
                              (key-moment detection)
                                      |
                                      v
                              Timestamp list --> ffmpeg --> Extracted frames
                                                               |
                                                               v
                              Transcript + frames --> Structured Markdown
```

**Step 1: Transcription.** Audio goes through local Whisper. The key detail is preserving word-level timestamps, not just segment-level. This gives us sub-second precision for frame extraction.

**Step 2: Key-moment detection.** A heuristic analyzer scans the transcript for:
- Topic changes (semantic shifts in what the speaker is describing)
- Emphasis markers (words like "notice," "look at," "this is broken")
- Issue descriptions (bug reports, visual observations)
- Natural pauses that indicate the speaker is pointing at something

This is heuristic, not ML -- it runs instantly and doesn't need a model.

**Step 3: Frame extraction.** ffmpeg pulls frames at the exact timestamps from step 2. Since we have word-level timing from Whisper, the extracted frame shows what was on screen when the speaker said "this button is hidden."

**Step 4: Document generation.** The transcript segments and corresponding frames are stitched into Markdown, with each screenshot placed inline at the point in the narrative where it was referenced. Format is inspired by llms.txt -- structured for LLM consumption.

### Architecture decisions

**Why local Whisper by default?** Privacy. Screen recordings often contain sensitive content (emails, code, credentials visible on screen). Sending audio to a cloud API is a non-starter for many developers. Local Whisper (tiny model, ~75MB) is good enough for the key-moment detection to work.

**Why heuristic analysis instead of an LLM?** Speed and reliability. The analyzer runs in <100ms on any transcript length. An LLM call would add seconds of latency and require an API key. The heuristics work well enough because spoken narration during screen recording follows predictable patterns.

**Why Markdown output?** It's the most portable format for both humans and AI tools. The structured format (with headers, timestamps, inline images) is directly consumable by LLMs without any parsing step.

### The state machine

The recording session is a 7-state FSM with a watchdog timer:

```
idle -> starting (5s) -> recording (30min max) -> stopping (3s)
                                                     |
                                                     v
                                                processing (10s) -> complete (30s auto-idle)
                                                     |
                                                     v
                                                   error (5s auto-recover)
```

Every state has a maximum duration. The watchdog forces recovery if anything gets stuck. Crash recovery auto-saves state every 5 seconds, so an interrupted recording session can be recovered on restart.

### MCP server

The MCP server is a stdio-based JSON-RPC server that exposes 6 tools (screenshot, screen+voice recording, video analysis, etc.) so an AI agent can trigger the pipeline mid-conversation.

### Issue tracker integration (v2.5.0)

The latest version adds a delivery step to the pipeline. After structuring the feedback, markuprx can push it directly to GitHub Issues or Linear:

```
markuprx push github --repo owner/repo    # Creates GitHub issue with screenshots
markuprx push linear --team KEY           # Creates Linear issue with full context
```

There's also a template system (`--template github-issue`, `--template linear`, `--template jira`, `--template json`) that formats the structured output for different consumers.

Other additions: a watch mode (`markuprx watch ./dir`) that auto-processes recordings from a directory, and a GitHub Action (`eddiesanjuan/markuprx-action@v1`) that runs the pipeline in CI and posts visual feedback as PR comments.

Open source, MIT, 860 tests: https://markuprplus.com
```

> **Compliance notes:**
> - This post is framed as a technical writeup, NOT a product pitch
> - r/programming values engineering substance -- the architecture decisions and state machine details are what make this appropriate
> - Eddie's account should have recent r/programming comment history before posting
> - Alternative: post as a link post with URL `https://markuprplus.com` and add the technical breakdown as a comment

---

## Next Saturday: Showoff Saturday

---

### 7. r/webdev -- SATURDAY ONLY

**Open:** https://www.reddit.com/r/webdev/submit

**Flair:** Select `Showoff Saturday` (MANDATORY -- post removed without it)

**Post type:** Text post

**Post day:** SATURDAY ONLY. Do NOT post on any other day.

> **Compliance:** 9:1 engagement ratio required. Eddie must have at least 9 non-promotional interactions on r/webdev before this post. Comment on threads throughout the week before posting.

**Title:**
```
How I closed the feedback loop between what I see and what my AI agent fixes
```

**Body:**
```
The hardest part of using AI coding agents for frontend work isn't the code generation -- it's the context. You see a broken layout, a misaligned button, a color that's off. You try to describe it in text and half the information is lost.

I built markuprx to fix this. It records your screen and microphone, produces a structured Markdown document with screenshots at the exact moments that matter, and now in v2.5.0 -- pushes the feedback directly to your issue tracker.

### How it works

1. Start recording (hotkey, CLI command, or AI agent triggers it via MCP)
2. Talk through what you see: "This button is hidden on mobile, and the spacing is off here..."
3. Stop recording
4. The pipeline runs:
   - Transcribes your voice with local Whisper
   - Analyzes the transcript for key moments (topic changes, issue descriptions)
   - Extracts video frames via ffmpeg at those exact timestamps
   - Generates structured Markdown with screenshots placed where they belong
5. **New:** Push to your issue tracker:
   - `markuprx push github --repo owner/repo` -- creates a GitHub issue with embedded screenshots
   - `markuprx push linear --team KEY` -- creates a Linear issue with full context

The result isn't "screenshots taken every 5 seconds." It's contextually-aware frame extraction -- each image shows what you were talking about at that moment. And now it goes straight to your backlog.

### Five ways to use it

**Desktop app** -- macOS menu bar. One hotkey to start, one to stop. File path copied to clipboard. Paste into whatever AI tool you use.

**CLI** -- `npx markuprx analyze ./recording.mov` -- process any screen recording. Supports output templates: `--template github-issue`, `--template linear`, `--template jira`, `--template json`.

**MCP server** -- `npx --package markuprx markuprx-mcp` -- your AI coding agent (Claude Code, Cursor, Windsurf) gets direct access to screen capture and recording. The agent can see what you see mid-conversation.

**Watch Mode** -- `markuprx watch ./dir` -- monitors a directory and auto-processes any new recording that appears.

**GitHub Action** -- `eddiesanjuan/markuprx-action@v1` -- automated visual QA in CI/CD. Posts structured feedback as PR comments.

### Example output

```markdown
# Feedback Report: Dashboard Redesign

## FB-001: Navigation dropdown clipped
**Timestamp**: 00:15 | **Type**: Bug

> The dropdown menu is being clipped by the parent container's
> overflow hidden. You can see it cuts off after the third item.

![Screenshot at 00:15](./screenshots/fb-001.png)

## FB-002: Card spacing inconsistent
**Timestamp**: 00:32 | **Type**: UI Issue

> These cards have different padding -- the first row is 16px
> and the second row looks like 24px.

![Screenshot at 00:32](./screenshots/fb-002.png)
```

Everything runs locally. Open source, MIT licensed. 860 tests.

Website: https://markuprplus.com
GitHub Action: https://github.com/marketplace/actions/markuprx-action
```

---

## When Ready: Product Hunt

---

### 8. Product Hunt -- Schedule for Tuesday or Wednesday

**Open:** https://www.producthunt.com/posts/new

> **Product Hunt is a bigger production.** Gallery images (5 minimum) must be prepared. See `launch-content/product-hunt.md` for full image guide. Do NOT launch until images are ready.

**Name:**
```
markuprx
```

**Tagline** (60 char max):
```
Record your screen, narrate bugs, AI fixes them
```

**Description** (260 char max):
```
markuprx records your screen, structures feedback with screenshots at the moments that matter, and pushes it to GitHub Issues or Linear. CLI, MCP server, GitHub Action. Open source. Free. Works with Claude Code, Cursor, and any MCP client.
```

**Topics:** Developer Tools, Artificial Intelligence, Open Source, Productivity, Mac

**Pricing:** Free

**Website:**
```
https://markuprplus.com
```

**GitHub:**
```
https://markuprplus.com
```

**Maker Comment** (post IMMEDIATELY after launch goes live):
```
Hey Product Hunt -- Eddie here, maker of markuprx.

I built this because I kept running into the same wall with AI coding agents: I could *see* the bug, but I couldn't describe it precisely enough for Claude or Cursor to fix it. I'd spend ten minutes writing a paragraph about a visual issue that I could have pointed at and explained in thirty seconds.

So I built markuprx. You press a hotkey, narrate what you see, press the hotkey again, and you get a structured Markdown document with screenshots placed exactly where they belong -- at the moments in the video that match what you were saying. It's not a screen recorder that dumps a transcript next to random screenshots. It's an intelligent pipeline: Whisper transcribes your voice, ffmpeg extracts frames at the exact timestamps from your narration, and optionally Claude analyzes the whole thing into a structured report.

The output is purpose-built for AI coding agents. Paste the file path into Claude Code, Cursor, or Windsurf and the agent has everything it needs to start fixing.

The **MCP server** gives your AI agent eyes and ears. Three lines of JSON config, zero install (`npx --package markuprx markuprx-mcp`), and your agent has `capture_screenshot`, `capture_with_voice`, `start_recording`, and `stop_recording` tools. The agent looks at your screen and acts.

What I'm most excited about in **v2.5.0** is the delivery pipeline. markuprx now pushes feedback directly to your issue tracker:
- `markuprx push github --repo owner/repo` -- creates a GitHub issue with embedded screenshots
- `markuprx push linear --team KEY` -- creates a Linear issue with full context
- `markuprx watch ./dir` -- auto-process recordings from a directory
- `--template github-issue/linear/jira/json` -- output in the format your tools consume
- **GitHub Action** (`eddiesanjuan/markuprx-action@v1`) -- automated visual QA in CI/CD

The pipeline went from "record and structure" to "record, structure, and deliver." You see a bug, record it, and it lands in your backlog. The feedback loop is closed.

markuprx is fully open source and MIT licensed. No telemetry, no tracking, no analytics. Local Whisper transcription runs entirely on your machine -- no API key needed to start. If you want cloud transcription or AI-enhanced analysis, bring your own OpenAI or Anthropic keys.

Five ways to use it:
1. **Desktop app** -- menu bar on macOS, system tray on Windows
2. **CLI** -- `npx markuprx analyze ./recording.mov`
3. **MCP server** -- `npx --package markuprx markuprx-mcp` in your IDE config
4. **Watch Mode** -- `markuprx watch ./dir` auto-processes recordings
5. **GitHub Action** -- `eddiesanjuan/markuprx-action@v1` in CI/CD

I'd love your honest feedback. What would make this more useful in your workflow? What's missing? I'm shipping fast and building in public.

Follow the project at https://markuprplus.com
```

**Technical Comment** (post 5-10 minutes after maker comment):
```
For the technical crowd: here's what's under the hood.

**The pipeline:**
When you stop recording, markuprx runs a 4-stage pipeline: (1) transcribe audio via local Whisper or OpenAI API, (2) analyze the transcript to detect key moments and topic changes, (3) extract video frames at the exact timestamps using ffmpeg, (4) stitch everything into structured Markdown with screenshots placed where they belong.

The recording session is governed by a 7-state finite state machine with watchdog timers. Every state has a maximum duration -- nothing can get stuck. Crash recovery auto-saves every 5 seconds, so you never lose a session.

**Three distribution channels, same pipeline:**
- Desktop app (Electron + React, ~30 UI components)
- CLI (`npx markuprx analyze ./video.mov` -- no Electron, no desktop)
- MCP server (`npx --package markuprx markuprx-mcp` -- gives AI agents 6 tools including `capture_screenshot` and `capture_with_voice`)

The MCP server is the one I think will surprise people. Zero install -- npx handles everything. Add 3 lines to your Claude Code or Cursor config and your agent can look at your screen mid-conversation. It's the bridge between "I can see the bug" and "my agent can fix it."

v2.5.0 adds a delivery layer: push structured feedback directly to GitHub Issues (`markuprx push github --repo owner/repo`) or Linear (`markuprx push linear --team KEY`). There's a template system (`--template github-issue`, `--template linear`, `--template jira`, `--template json`), a watch mode for auto-processing recordings, and a GitHub Action (`eddiesanjuan/markuprx-action@v1`) for visual QA in CI/CD.

**860 tests** across 44 files. MIT licensed. No vendor lock-in. The whole codebase is on GitHub.
```

> **Product Hunt launch day checklist:**
> - [ ] Gallery images (5 minimum) uploaded
> - [ ] Launch at 12:01 AM PT for max queue time
> - [ ] Post maker comment immediately
> - [ ] Post technical comment 5-10 min later
> - [ ] Respond to EVERY comment within 1 hour (thoughtful replies, not "thanks!")
> - [ ] Cross-post to Twitter with PH link at 6 AM PT
> - [ ] Post progress update at 6 PM PT

---

## When Ready: MCP Directory Submissions

---

### 9. MCP Directory Submissions

These are not time-sensitive. Submit anytime after launch.

#### 9a. Official MCP Registry (HIGHEST PRIORITY)

> This triggers auto-ingest by PulseMCP, mcp-get, and others. Do this first.

**Prerequisites:** `mcpName` field must be in `package.json` and npm package republished.

```bash
# Install mcp-publisher
brew install mcp-publisher

# Authenticate
mcp-publisher login github

# Publish (run from project root -- uses server.json)
mcp-publisher publish
```

**Verify:**
```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=com.markuprx/markuprx"
```

---

#### 9b. punkpeye/awesome-mcp-servers (HIGH PRIORITY)

> 30k+ stars. Triggers Glama.ai auto-sync.

**Open:** https://github.com/punkpeye/awesome-mcp-servers/fork

1. Fork the repo
2. Edit `README.md` -- add under `### Developer Tools` section (alphabetical order)
3. Add this line:

```markdown
- [markuprx](https://markuprplus.com) - Screen capture and voice recording MCP server for AI coding agents. Capture screenshots with voice narration, analyze video, and generate structured Markdown feedback documents.
```

4. Commit message: `Add markuprx MCP server`
5. Open PR with:

**PR title:**
```
Add markuprx - Screen capture & voice recording for AI agents
```

**PR body:**
```
## New Server: markuprx

- **Name:** markuprx
- **URL:** https://markuprplus.com
- **npm:** `npx --package markuprx markuprx-mcp`
- **Language:** TypeScript
- **Scope:** Local (runs on device)
- **OS:** macOS, Windows
- **Description:** Screen capture and voice recording MCP server for AI coding agents. 6 tools: capture_screenshot, capture_with_voice, analyze_video, analyze_screenshot, start_recording, stop_recording.
- **Category:** Developer Tools
```

---

#### 9c. Smithery.ai (HIGH PRIORITY)

**Open:** https://smithery.ai/new

**Option A -- Web UI:**
1. Enter npm package name: `markuprx`
2. Select transport: stdio
3. Complete publishing workflow

**Option B -- CLI:**
```bash
npx @anthropic-ai/smithery-cli mcp publish --name markuprx --transport stdio
```

---

#### 9d. mcpservers.org (MEDIUM)

**Open:** https://mcpservers.org/submit

**Form fields:**

| Field | Value |
|-------|-------|
| Server Name | `markuprx` |
| Short Description | `Screen capture and voice recording MCP server for AI coding agents. Capture screenshots, record voice narration, analyze video, and generate structured Markdown feedback documents.` |
| Link | `https://markuprplus.com` |
| Category | `development` |
| Contact Email | `eddie@markuprplus.com` |

---

#### 9e. mcp.so (MEDIUM)

**Open:** https://github.com/chatmcp/mcp-directory/issues/1

Add a comment with:

```
**Server Name:** markuprx
**Website:** https://markuprplus.com
**npm:** markuprx (run via `npx --package markuprx markuprx-mcp`)
**Description:** Screen capture and voice recording MCP server for AI coding agents. Capture screenshots with voice narration, analyze video, and generate structured Markdown feedback documents for code review.
**Tools:** capture_screenshot, capture_with_voice, analyze_video, analyze_screenshot, start_recording, stop_recording
**Category:** Developer Tools
```

---

#### 9f. appcypher/awesome-mcp-servers (LOW)

**Open:** https://github.com/appcypher/awesome-mcp-servers/fork

Same process as 9b. Add under **Development Tools** section:

```markdown
- **[markuprx](https://markuprplus.com)** - Screen capture and voice recording MCP server for AI coding agents. Capture screenshots, record voice, analyze video, and generate structured feedback.
```

---

#### 9g. Auto-Ingest (NO ACTION NEEDED)

These directories auto-ingest after the Official MCP Registry (#9a) and punkpeye PR (#9b) are done:

| Directory | Source | Timing |
|-----------|--------|--------|
| **Glama.ai** | Auto-syncs from punkpeye/awesome-mcp-servers | After PR merge |
| **PulseMCP** | Auto-ingests from Official MCP Registry | Daily/weekly |
| **mcp-get.com** | Auto-discovers from npm | After `mcpName` in package.json |

If not listed after 1 week, submit manually:
- PulseMCP: https://www.pulsemcp.com/submit (paste GitHub URL)
- PulseMCP email: hello@pulsemcp.com

---

## Quick Reference: Posting Timeline

| When | Platform | URL | Key Notes |
|------|----------|-----|-----------|
| **Day 1, 0:00** | Hacker News | https://news.ycombinator.com/submit | Post URL, add body as 1st comment |
| **Day 1, 0:30** | Twitter/X | https://x.com/compose/post | 7-tweet thread, attach images |
| **Day 1, +2-4h** | r/ClaudeAI | https://www.reddit.com/r/ClaudeAI/submit | Flair: "Built with Claude" |
| **Day 1, +6-10h** | r/cursor | https://www.reddit.com/r/cursor/submit | Flair: "Tool" or "MCP" |
| **Day 1, anytime** | Dev.to | https://dev.to/new | Full article with frontmatter |
| **Day 2-3** | r/programming | https://www.reddit.com/r/programming/submit | Technical tone ONLY |
| **Next Saturday** | r/webdev | https://www.reddit.com/r/webdev/submit | Flair: "Showoff Saturday" ONLY |
| **Tue/Wed** | Product Hunt | https://www.producthunt.com/posts/new | Need 5 gallery images first |
| **Anytime** | MCP Directories | Various (see section 9) | Official registry first |
