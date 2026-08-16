---
title: I Built an MCP Server That Gives AI Agents Eyes and Ears
published: false
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

I built [markuprx](https://github.com/eddiesanjuan/markuprx). It records your screen and microphone, then runs a post-processing pipeline that:

1. Transcribes your voice with local Whisper
2. Analyzes the transcript to find key moments
3. Extracts video frames at those exact timestamps
4. Stitches everything into structured Markdown

The key difference from "record screen + take periodic screenshots": markuprx extracts frames that correspond to what you were describing. When you say "this button is hidden on mobile," the extracted frame shows exactly what was on screen at that moment.

The output is structured for AI consumption -- not a wall of text with random images, but a document where each feedback item has a timestamp, a transcript excerpt, and the corresponding screenshot.

## Architecture

Here's the pipeline:

```
┌─────────────────────────────────────────────────────┐
│                    Recording                         │
│  Screen (video) ──────────────────┐                  │
│  Microphone (audio) ──────────────┤                  │
└───────────────────────────────────┼──────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────┐
│               Post-Processing Pipeline               │
│                                                      │
│  1. Transcribe ──→ Whisper (local) ──→ timestamps    │
│                                           │          │
│  2. Analyze ────→ Key-moment detection    │          │
│                    (heuristic)            │          │
│                         │                 │          │
│  3. Extract ────→ ffmpeg frame pull ◄─────┘          │
│                         │                            │
│  4. Generate ───→ Structured Markdown                │
│                    with inline screenshots            │
└─────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────┐
│                      Output                          │
│  feedback-report.md    screenshots/fb-001.png        │
│  metadata.json         screenshots/fb-002.png        │
└─────────────────────────────────────────────────────┘
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

Creates a GitHub issue directly from your session. Screenshots are uploaded and embedded inline. The issue body is structured Markdown that humans and AI agents can both parse.

### Push to Linear

```bash
markuprx push linear --team KEY
```

Creates a Linear issue with full context -- transcript, screenshots, severity labels. Record the bug, push to the backlog, done.

### Output Templates

```bash
# Format output for your issue tracker
npx markuprx analyze ./recording.mov --template github-issue
npx markuprx analyze ./recording.mov --template linear
npx markuprx analyze ./recording.mov --template jira
npx markuprx analyze ./recording.mov --template json
```

Five template formats: standard Markdown (default), GitHub Issue, Linear, Jira, and JSON. Pick the format your tools consume.

### Watch Mode

```bash
markuprx watch ./recordings
```

Monitors a directory and auto-processes any new recording that appears. Drop a `.mov` in the folder, get a structured report back. Pairs well with automated screen recording tools.

### GitHub Action

```yaml
- uses: eddiesanjuan/markuprx-action@v1
```

Runs markuprx in CI/CD. Push a commit, the action analyzes visual changes and posts structured feedback as a PR comment with screenshots. Teams get automated visual QA without manual recording.

The pipeline went from "record and structure" to "record, structure, and deliver." The feedback loop is closed.

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

### FB-003: Mobile sidebar overlap
**Timestamp**: 00:48 | **Type**: Bug

> On this viewport the sidebar is sitting on top of the main
> content. No way to dismiss it. Probably needs a breakpoint.

![Screenshot at 00:48](./screenshots/fb-003.png)

### FB-004: Good -- header animation is smooth
**Timestamp**: 01:15 | **Type**: Positive

> Actually, this header animation looks nice. The transition
> is smooth and the timing feels right.

![Screenshot at 01:15](./screenshots/fb-004.png)
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

- **GitHub**: [github.com/eddiesanjuan/markuprx](https://github.com/eddiesanjuan/markuprx)
- **Site**: [markuprx.com](https://markuprx.com)
- **MCP server**: `npx --package markuprx markuprx-mcp` (zero install)
- **CLI**: `npx markuprx analyze ./video.mov`
- **GitHub Action**: `eddiesanjuan/markuprx-action@v1`
- **npm**: [npmjs.com/package/markuprx](https://www.npmjs.com/package/markuprx)

Open source, MIT licensed. 860 tests across 44 files. Contributions welcome.

If markuprx saves you time, consider [supporting development on Ko-fi](https://ko-fi.com/eddiesanjuan).
