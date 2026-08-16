---
title: I Built an MCP Server That Lets Claude Code See Your Screen
published: false
description: markuprx records your screen while you narrate bugs, then produces structured Markdown with screenshots for AI coding agents.
tags: mcp, ai, devtools, opensource
cover_image: https://markuprx.com/og-image.png
---

You know that thing where you find a CSS bug, open your AI coding agent, and then spend three minutes *describing* the bug in text? The sidebar is overlapping the content, but only on mobile, and only when the nav is expanded, and there's this weird 20-pixel gap...

Your agent can read every file in your codebase. It can grep, diff, and refactor. But it cannot look at your screen. You are the bottleneck, translating a visual problem into words so a language model can turn those words back into a fix.

I built [markuprx](https://markuprx.com) to close that gap.

## The Problem

Bug reports are hard to write well. We all know this. The current options:

**Text descriptions** lose spatial context. "The button is too small" -- where? What button? How small? The agent guesses, hallucinates a layout it has never seen, and writes a fix for a UI that does not exist.

**Screenshots** are better but static. A single frame cannot capture "the layout shifts after the spinner disappears." And manually screenshotting, cropping, and dragging images into the right place in a document is the kind of tedious work that tools should eliminate.

**Screen recordings** capture everything but are too long for anyone (human or AI) to sit through. A 90-second recording of you finding a bug contains maybe 10 seconds of useful information scattered across the timeline.

**What's missing** is a tool that watches what you do, listens to what you say, and produces a structured document with the right screenshots at the right moments -- ready for an AI agent to consume and act on.

## The Solution

markuprx records your screen while you narrate what's wrong. When you stop, it runs a pipeline:

1. **Whisper** transcribes your voice locally (nothing leaves your machine by default)
2. **Transcript analysis** identifies key moments -- the timestamps where you described specific issues
3. **ffmpeg** extracts the exact video frames at those timestamps
4. **A generator** stitches transcript + screenshots into structured Markdown

The output looks like this:

```markdown
# Feedback Session -- Feb 15, 2026

## FB-001: Button sizing issue on mobile
The submit button is way too small on mobile. I'm trying to tap it
and keep hitting the cancel link underneath. Needs more vertical
padding, maybe 12px minimum tap target.

![Screenshot at 0:34](screenshots/fb-001.png)

## FB-002: Loading state causes layout shift
After the spinner disappears, the content pops in with no transition.
There's a visible layout shift -- the sidebar jumps left by about
20 pixels.

![Screenshot at 1:12](screenshots/fb-002.png)
```

Every screenshot is placed at exactly the point in the document where you were describing that issue. No manual cropping. No dragging images around. The AI agent that reads this document sees the bug *and* the description together.

## Three Ways to Use It

### 1. CLI: Zero-Install Video Analysis

Already have a screen recording? Process it from your terminal:

```bash
npx markuprx analyze ./recording.mov
```

That's it. No install, no config. It transcribes the audio, identifies key moments, extracts frames, and writes a Markdown report to disk. Works with `.mov`, `.mp4`, and any format ffmpeg supports.

```bash
# Output to a specific directory
markuprx analyze ./recording.mov --output ./reports

# Use a GitHub Issues template
markuprx analyze ./recording.mov --template github-issue

# Watch a folder and auto-process new recordings
markuprx watch ~/Desktop --output ./reports

# Push feedback items directly to GitHub Issues
markuprx push github ./report.md --repo myorg/myapp
```

Requirements: Node.js 18+ and ffmpeg on your PATH.

### 2. MCP Server: Give Your AI Agent Eyes

This is the part that changes the workflow entirely.

Add three lines to your Claude Code config:

```json
// ~/.claude/settings.json
{
  "mcpServers": {
    "markuprx": {
      "command": "npx",
      "args": ["-y", "markuprx-mcp"]
    }
  }
}
```

Same config works in Cursor (`.cursor/mcp.json`) and Windsurf (`~/.codeium/windsurf/mcp_config.json`).

Now your AI agent has access to these tools:

| Tool | What It Does |
|------|--------------|
| `capture_screenshot` | Grab the current screen and save to session |
| `analyze_screenshot` | Take a screenshot and return the image data for the AI to see directly |
| `describe_screen` | Capture the screen and return a structured text description of everything visible (UI elements, text, errors, layout) |
| `capture_with_voice` | Record screen + mic for N seconds, then run the full pipeline |
| `analyze_video` | Process any video file into a Markdown report |
| `start_recording` / `stop_recording` | Interactive recording sessions |
| `push_to_github` | Create GitHub issues from a feedback report |
| `push_to_linear` | Create Linear issues from a feedback report |

### 3. Desktop App: Hotkey-Driven Recording

Desktop distribution information is available at [markuprx.com](https://markuprx.com). Builds target macOS and Windows.

The workflow is four keystrokes:

```
Cmd+Shift+F  -->  talk  -->  Cmd+Shift+F  -->  Cmd+V into your agent
```

Start recording, describe what you see, stop recording, paste the file path into Claude Code or Cursor. The file path is copied to your clipboard automatically -- not the content, the *path*. Your agent reads the full document with screenshots directly from disk.

## The MCP Angle: Why This Changes Everything

The CLI and desktop app are useful. But the MCP server is the reason I am writing this post.

Here is what a conversation looks like when your agent can see your screen:

```
You: "The sidebar is overlapping the main content on mobile.
      Can you see it?"

Agent: [calls capture_screenshot]
       "I can see the issue -- the sidebar has position: fixed
        but no z-index, and it's 280px wide with no responsive
        breakpoint. Let me fix the CSS..."

       [fixes the code]
```

No copy-pasting screenshots. No describing the bug in text. The agent *looks at your screen and acts*.

The `describe_screen` tool takes this further. It captures your screen and sends it through Claude's vision API with a specialized prompt that extracts structured information: what application is focused, what UI elements are visible, what text is on screen, what errors are showing, how the layout is organized. The agent gets a complete picture of your screen state without you typing a single word.

```
You: "Something looks off on this page but I can't pin it down."

Agent: [calls describe_screen]
       "I can see the page. The header nav links are misaligned --
        they're vertically offset by ~4px from the logo. Also,
        the footer is rendering behind the cookie banner. The
        console shows a React hydration mismatch warning. Let me
        address these issues..."
```

The `capture_with_voice` tool goes even further -- it records your screen and microphone for a specified duration, runs the full Whisper-to-Markdown pipeline, and returns a structured report. Your agent can ask you to narrate a bug, then process the recording and fix everything you mentioned.

All of this happens mid-conversation. No context switching. No alt-tabbing to a screenshot tool. No "let me describe what I see." The agent is no longer blind.

## How the Pipeline Works

For those who want the technical details:

```
Screen + Voice --> Whisper (local) --> Timestamped transcript
                                            |
                                     TranscriptAnalyzer
                                            |
                                     Key moments identified
                                     (heuristic + NLP)
                                            |
                                     ffmpeg frame extraction
                                     (exact timestamps)
                                            |
                                     MarkdownGenerator
                                            |
                                     Structured output with
                                     inline screenshots
```

**Whisper** runs locally by default using `whisper.cpp`. The first run downloads a model (~75MB for tiny, ~500MB for base). Your audio never leaves your machine. If you want better transcription quality, you can optionally use the OpenAI Whisper-1 API with your own key.

**TranscriptAnalyzer** identifies key moments using a combination of heuristics: sentence boundary detection, pause duration, topic shifts, and severity keywords. It is not perfect, but it gets the important frames 80-90% of the time.

**ffmpeg** extracts frames at the exact millisecond timestamps identified by the analyzer. No timer-based screenshots at fixed intervals -- every frame corresponds to something you actually said.

**The pipeline degrades gracefully.** No ffmpeg installed? You get transcript-only output. No Whisper model downloaded? Timer-based screenshots instead. No API keys? Everything runs locally. The tool always produces *something* useful.

## Open Source

markuprx is MIT licensed. No telemetry, no tracking, no analytics, no account required. Read the source, fork it, build on it.

The codebase is TypeScript end-to-end: Electron + React for the desktop app, esbuild bundles for the CLI and MCP server. Tests run on Vitest. The source checkout includes a full architecture guide in `CLAUDE.md`.

What's next: more output templates, better key-moment detection, and deeper IDE integrations. But I am not going to overpromise a roadmap. The tool works now, and I ship updates fast.

## Try It

**CLI** (zero install):
```bash
npx markuprx analyze ./recording.mov
```

**MCP Server** (for Claude Code, Cursor, Windsurf):
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

**Desktop App:**
[markuprx.com](https://markuprx.com)

**Website:**
[markuprx.com](https://markuprx.com)

If markuprx saves you a debugging session, visit the website and share feedback through the current project contact channel.

---

*Built by [Eddie San Juan](https://github.com/eddiesanjuan). Open source. MIT license.*
