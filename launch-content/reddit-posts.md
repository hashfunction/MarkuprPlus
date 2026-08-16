# Reddit Launch Posts

## Subreddit Compliance Summary

### r/ClaudeAI (483K members) -- GO
- **Flair:** "Built with Claude" (required for project showcases)
- **Format:** Text post (self-post). Must include: 1) what you built, 2) how you built it, 3) screenshots or demos, 4) at least one prompt you used
- **Self-promotion:** Allowed with "Built with Claude" flair. Community is receptive to "I built" project showcases related to Claude tools
- **Post type:** Text post with inline links (not link post)
- **Restrictions:** Focus on demonstrating genuine use of Claude. Avoid purely promotional tone
- **Account requirements:** Standard Reddit minimums (~25 karma suggested)
- **Verdict:** SAFE TO POST. Our post fits perfectly -- MCP server for Claude Code. Added prompt example per flair requirements

### r/cursor (77K members) -- GO
- **Flair:** Use relevant flair if available (e.g., "Tool", "MCP", or general discussion)
- **Format:** Text post. MCP server and tool sharing posts are common and welcomed in this community
- **Self-promotion:** Allowed when providing genuine value/utility. Community actively shares MCP servers and extensions
- **Post type:** Text post with setup instructions
- **Restrictions:** Keep focus on practical utility for Cursor users. No hard self-promo ratio documented, but value-first approach recommended
- **Account requirements:** Standard Reddit minimums
- **Verdict:** SAFE TO POST. MCP tool posts are common here. Our post is practical and setup-focused

### r/webdev (2M members) -- SATURDAY ONLY
- **Flair:** "Showoff Saturday" (REQUIRED for project showcases)
- **Format:** Text post. Must use "Showoff Saturday" flair
- **Self-promotion:** Strictly limited to Saturdays. 9:1 ratio rule (9 non-promotional interactions per 1 promotional post). Posts showcasing projects on other days will be removed
- **Post type:** Text post
- **Restrictions:** Project showcases ONLY on Saturdays. Career questions go in monthly pinned thread. No blog spam
- **Account requirements:** Standard Reddit minimums + established participation history recommended
- **Verdict:** POST ON SATURDAY ONLY. Good fit for "Showoff Saturday" -- our post frames the problem/solution well for webdev audience. Ensure Eddie's account has some r/webdev participation history first

### r/programming (5.8M members) -- PROCEED WITH CAUTION
- **Flair:** None required (may not have project-specific flairs)
- **Format:** Historically link-post oriented (linking to blog posts, GitHub repos, articles). Text posts about technical implementation are also accepted
- **Self-promotion:** STRICT. Heavily scrutinized. Enforces 90/10 rule. Content must be primarily technical/educational, not promotional. Posts that read as product announcements get removed
- **Post type:** Link post to GitHub repo OR technical text post. No "I built an app" product pitches
- **Restrictions:** No questions ("how do I" posts). No low-effort showcases. Technical substance required. Moderators are aggressive about removing self-promo
- **Account requirements:** Standard Reddit minimums + active programming discussion history strongly recommended
- **Verdict:** SAFE TO POST -- our post is already heavily technical (pipeline architecture, state machine, design decisions). Frame as technical writeup, not product announcement. Consider posting as link to GitHub repo instead of text post

## Recommended Posting Order and Timing

1. **r/ClaudeAI** -- Post first (any day). Most receptive audience, highest conversion potential
2. **r/cursor** -- Post same day as r/ClaudeAI or next day. Second most targeted audience
3. **r/webdev** -- Post on the NEXT SATURDAY after r/ClaudeAI and r/cursor. Must use Showoff Saturday flair
4. **r/programming** -- Post 1-2 days after r/webdev. Wait to build some engagement/karma on the other posts first. This is the riskiest sub but has the largest audience

**Spacing tip:** Don't post all on the same day. Reddit's spam detection flags accounts that post similar content across multiple subs rapidly. Space posts at least 4-6 hours apart, ideally across different days.

---

## r/ClaudeAI

> **Flair:** Built with Claude
> **Post type:** Text post
> **Compliance notes:** Added "prompt I use" section per "Built with Claude" flair requirements. Includes what I built, how I built it, and usage examples

**Title:** I built an MCP server that lets Claude Code see your screen and hear your voice

**Body:**

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

### How I built it

The MCP server is a headless Node.js process (no Electron dependency) that exposes 6 tools via the Model Context Protocol. Screen capture uses the native macOS screenshot API. Voice recording captures audio + screen simultaneously, then pipes the audio through local Whisper for transcription. A heuristic analyzer finds key moments in the transcript and ffmpeg extracts video frames at those timestamps. Everything is stitched into structured Markdown.

The desktop app, CLI, and MCP server all share the same post-processing pipeline -- I just built different interfaces on top of it.

### Privacy

Everything runs locally. Whisper transcription is on your machine. No telemetry, no data collection. External calls only happen if you explicitly add API keys for cloud transcription.

Open source, MIT: https://markuprx.com

---

## r/cursor

> **Flair:** Use "Tool" or "MCP" flair if available, otherwise general
> **Post type:** Text post
> **Compliance notes:** MCP server posts are common and well-received on r/cursor. Post is practical and setup-focused. No changes needed

**Title:** MCP server that gives Cursor screenshot and screen recording capabilities

**Body:**

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

Open source, MIT licensed, 860 tests: https://markuprx.com

Full MCP docs: https://markuprx.com

---

## r/webdev

> **Flair:** Showoff Saturday (MANDATORY -- post will be removed without this flair)
> **Post type:** Text post
> **Post day:** SATURDAY ONLY
> **Compliance notes:** Must be posted on Saturday with Showoff Saturday flair. No changes to content needed -- the post frames a genuine problem/solution for frontend developers and isn't purely promotional. Ensure 9:1 engagement ratio is met (participate in r/webdev discussions before posting)

**Title:** How I closed the feedback loop between what I see and what my AI agent fixes

**Body:**

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

**Watch Mode** -- `markuprx watch ./dir` -- monitors a directory and auto-processes any new recording that appears. Drop a screen recording in a folder, get a structured report back.

**GitHub Action** -- `eddiesanjuan/markuprx-action@v1` -- automated visual QA in CI/CD. Push a commit, the action analyzes visual changes, posts structured feedback as a PR comment.

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

Website: https://markuprx.com
GitHub Action: https://github.com/marketplace/actions/markuprx-action

---

## r/programming

> **Flair:** None required
> **Post type:** Text post OR link post to GitHub repo
> **Compliance notes:** This is the strictest sub. Our post is already heavily technical (pipeline architecture, state machine, design tradeoffs) which is exactly what r/programming values. The post reads as a technical writeup, not a product pitch. Keep it as-is. Alternatively, can be posted as a link to the GitHub repo with a comment containing the technical breakdown. If posting as text, the technical depth should pass moderation. Avoid any "check out my app" framing -- lead with the engineering

**Title:** Building a timestamp-correlated frame extraction pipeline for screen recordings

**Body:**

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

Open source, MIT, 860 tests: https://markuprx.com
