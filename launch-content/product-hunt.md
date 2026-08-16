# markuprx -- Product Hunt Launch Kit

Everything needed to launch markuprx on Product Hunt. Copy-paste ready.

---

## 1. Core Listing

**Name:** markuprx

**Tagline Options** (60 char max):

| # | Tagline | Chars | Notes |
|---|---------|-------|-------|
| 1 | Record your screen, narrate bugs, AI fixes them | 49 | **Recommended.** Full loop in one line. Active voice. |
| 2 | Give your AI coding agent eyes and ears | 39 | MCP-forward. Provocative. |
| 3 | Voice-driven feedback docs for AI coding agents | 49 | Explains the output format. |
| 4 | Turn screen recordings into AI-ready Markdown | 47 | Focuses on the transformation. |
| 5 | One hotkey from bug to structured AI context | 45 | Emphasizes friction reduction. |

**Recommended:** Option 1 -- it communicates the full workflow (record, narrate, fix) in one breath. Option 2 is a strong runner-up if you want to lead with the MCP angle.

**Description** (260 chars max):

> markuprx records your screen, structures feedback with screenshots at the moments that matter, and pushes it to GitHub Issues or Linear. CLI, MCP server, GitHub Action. Open source. Free. Works with Claude Code, Cursor, and any MCP client.

(240 chars)

**Topics:**
- Developer Tools
- Artificial Intelligence
- Open Source
- Productivity
- Mac

**Pricing:** Free

**Website:** https://markuprx.com

**GitHub:** https://github.com/eddiesanjuan/markuprx

---

## 2. Maker Comment (post immediately after launch goes live)

> Hey Product Hunt -- Eddie here, maker of markuprx.
>
> I built this because I kept running into the same wall with AI coding agents: I could *see* the bug, but I couldn't describe it precisely enough for Claude or Cursor to fix it. I'd spend ten minutes writing a paragraph about a visual issue that I could have pointed at and explained in thirty seconds.
>
> So I built markuprx. You press a hotkey, narrate what you see, press the hotkey again, and you get a structured Markdown document with screenshots placed exactly where they belong -- at the moments in the video that match what you were saying. It's not a screen recorder that dumps a transcript next to random screenshots. It's an intelligent pipeline: Whisper transcribes your voice, ffmpeg extracts frames at the exact timestamps from your narration, and optionally Claude analyzes the whole thing into a structured report.
>
> The output is purpose-built for AI coding agents. Paste the file path into Claude Code, Cursor, or Windsurf and the agent has everything it needs to start fixing.
>
> The **MCP server** gives your AI agent eyes and ears. Three lines of JSON config, zero install (`npx --package markuprx markuprx-mcp`), and your agent has `capture_screenshot`, `capture_with_voice`, `start_recording`, and `stop_recording` tools. The agent looks at your screen and acts.
>
> What I'm most excited about in **v2.5.0** is the delivery pipeline. markuprx now pushes feedback directly to your issue tracker:
> - `markuprx push github --repo owner/repo` -- creates a GitHub issue with embedded screenshots
> - `markuprx push linear --team KEY` -- creates a Linear issue with full context
> - `markuprx watch ./dir` -- auto-process recordings from a directory
> - `--template github-issue/linear/jira/json` -- output in the format your tools consume
> - **GitHub Action** (`eddiesanjuan/markuprx-action@v1`) -- automated visual QA in CI/CD
>
> The pipeline went from "record and structure" to "record, structure, and deliver." You see a bug, record it, and it lands in your backlog. The feedback loop is closed.
>
> markuprx is fully open source and MIT licensed. No telemetry, no tracking, no analytics. Local Whisper transcription runs entirely on your machine -- no API key needed to start. If you want cloud transcription or AI-enhanced analysis, bring your own OpenAI or Anthropic keys.
>
> Five ways to use it:
> 1. **Desktop app** -- menu bar on macOS, system tray on Windows
> 2. **CLI** -- `npx markuprx analyze ./recording.mov`
> 3. **MCP server** -- `npx --package markuprx markuprx-mcp` in your IDE config
> 4. **Watch Mode** -- `markuprx watch ./dir` auto-processes recordings
> 5. **GitHub Action** -- `eddiesanjuan/markuprx-action@v1` in CI/CD
>
> I'd love your honest feedback. What would make this more useful in your workflow? What's missing? I'm shipping fast and building in public.
>
> Star the repo if you want to follow along: https://github.com/eddiesanjuan/markuprx

---

## 3. First Comment (post 5-10 minutes after maker comment)

> For the technical crowd: here's what's under the hood.
>
> **The pipeline:**
> When you stop recording, markuprx runs a 4-stage pipeline: (1) transcribe audio via local Whisper or OpenAI API, (2) analyze the transcript to detect key moments and topic changes, (3) extract video frames at the exact timestamps using ffmpeg, (4) stitch everything into structured Markdown with screenshots placed where they belong.
>
> The recording session is governed by a 7-state finite state machine with watchdog timers. Every state has a maximum duration -- nothing can get stuck. Crash recovery auto-saves every 5 seconds, so you never lose a session.
>
> **Three distribution channels, same pipeline:**
> - Desktop app (Electron + React, ~30 UI components)
> - CLI (`npx markuprx analyze ./video.mov` -- no Electron, no desktop)
> - MCP server (`npx --package markuprx markuprx-mcp` -- gives AI agents 6 tools including `capture_screenshot` and `capture_with_voice`)
>
> The MCP server is the one I think will surprise people. Zero install -- npx handles everything. Add 3 lines to your Claude Code or Cursor config and your agent can look at your screen mid-conversation. It's the bridge between "I can see the bug" and "my agent can fix it."
>
> v2.5.0 adds a delivery layer: push structured feedback directly to GitHub Issues (`markuprx push github --repo owner/repo`) or Linear (`markuprx push linear --team KEY`). There's a template system (`--template github-issue`, `--template linear`, `--template jira`, `--template json`), a watch mode for auto-processing recordings, and a GitHub Action (`eddiesanjuan/markuprx-action@v1`) for visual QA in CI/CD.
>
> **860 tests** across 44 files. MIT licensed. No vendor lock-in. The whole codebase is on GitHub.

---

## 4. Gallery Image Guide

Product Hunt gallery supports up to 8 images. Recommended: 5 images, optionally 1 GIF.

| Slot | Content | Dimensions | Notes |
|------|---------|-----------|-------|
| **Image 1 (Hero)** | The full workflow: hotkey -> narrate -> structured output. Show the menu bar app recording state with waveform visible, overlaid on a code editor. This is the thumbnail -- it must tell the story alone. | 1270x760px | Use a clean desktop background. Show the recording indicator dot. Consider a split-screen: left = app recording, right = markdown output. |
| **Image 2** | The generated Markdown output -- an actual feedback report with screenshots inline. Show the structured sections, timestamps, and embedded images. | 1270x760px | Open the .md file in VS Code or a Markdown preview. Real content, not placeholder text. |
| **Image 3** | MCP server setup + agent conversation. Left: the 3-line JSON config. Right: a Claude Code conversation where the agent calls `capture_screenshot` and responds to what it sees. | 1270x760px | This is the "wow" image. Show the agent actually seeing the screen. |
| **Image 4** | CLI in terminal. Show `npx markuprx analyze ./recording.mov` with real output -- progress indicators, frame extraction, final report path. | 1270x760px | Dark terminal, clean font. Show the full pipeline running. |
| **Image 5** | Feature grid or comparison. 3-4 key features with icons: Local Whisper, Timestamp-Correlated Frames, MCP Server, Crash Recovery. Or a before/after: "describing bugs in text" vs "markuprx output." | 1270x760px | Keep this clean and scannable. No walls of text. |
| **GIF (optional)** | 15-second recording of the full workflow: press hotkey, narrate a bug, press hotkey, show the output appearing. | 1270x760px, <3MB | Keep it tight. Speed up the processing step. Show the clipboard bridge (file path copied). |

**Image production tips:**
- Use CleanShot X or Screenshot.app for captures
- Add a subtle drop shadow or device frame (not mandatory -- PH community prefers authenticity)
- Text in images should be readable at 50% size (PH thumbnail view)
- Dark mode screenshots tend to perform better on PH
- The first image is the thumbnail everywhere -- invest the most time here

---

## 5. Launch Strategy

### Timing

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| **Day** | Tuesday or Wednesday | Highest traffic + engagement on PH. Tuesday is slightly better for developer tools because the PH audience skews technical early in the week. |
| **Time** | 12:01 AM PT (3:01 AM ET) | Launches reset at midnight PT. Going first means maximum time in the daily queue. PH's algorithm rewards early velocity -- the first 1-2 hours matter most. |
| **Recommended date** | Next available Tuesday | Check the PH upcoming page to avoid competing with major product launches on the same day. |

### Pre-Launch (7 days before)

- [ ] Create the Product Hunt upcoming page and share the link
- [ ] Ask 20-50 people to **follow the upcoming page** (followers get notified on launch day)
- [ ] Post in relevant communities: Indie Hackers, Dev.to, relevant Discord servers, X/Twitter
- [ ] Prep all gallery images and have them reviewed by 2-3 people
- [ ] Write and rehearse the maker comment -- don't wing it on launch day
- [ ] Set up a Product Hunt hunter (optional -- having a known hunter can boost visibility, but self-hunting is fine for dev tools)

### Pre-Launch (48 hours before)

- [ ] Send personal messages to friends/colleagues with the upcoming page link
- [ ] Schedule social media posts for launch morning (Twitter, LinkedIn)
- [ ] Test all links: website, GitHub, download URLs, MCP npm package
- [ ] Prepare 3-4 reply templates for common questions (pricing, platform support, privacy, comparison to alternatives)

### Launch Day

| Time (PT) | Action |
|-----------|--------|
| 12:00 AM | Launch goes live |
| 12:01 AM | Post maker comment immediately |
| 12:05 AM | Post first technical comment |
| 12:15 AM | Send the upvote request message (Section 6) to your network |
| 6:00 AM | Cross-post to Twitter with PH link |
| 7:00 AM | Post to Reddit (r/programming, r/webdev, r/SideProject) -- **don't ask for upvotes**, share genuinely |
| 8:00 AM | Post to Hacker News (Show HN) |
| All day | Respond to **every** PH comment within 1 hour. Thoughtful replies, not "thanks!" Generic thank-you replies hurt more than they help. |
| 6:00 PM | Post a progress update comment ("We hit X upvotes, here's what we're hearing...") |
| 11:59 PM | Final thank-you comment with a link to something concrete (a new feature, a fix based on feedback, the roadmap) |

### Post-Launch (days 2-7)

- [ ] Thank everyone who commented or upvoted -- DM the most engaged ones
- [ ] Write a launch retrospective for Twitter/blog ("What I learned launching markuprx on PH")
- [ ] Update the README and website with the PH badge if results are strong
- [ ] Follow up on any feature requests or bug reports from PH comments
- [ ] Add "Featured on Product Hunt" badge to the landing page if applicable

---

## 6. Upvote Request Template

Send this via DM, email, or group chat. Keep it personal -- never mass-blast.

### Short version (for close contacts):

> Hey! I'm launching markuprx on Product Hunt today -- it's a free, open-source tool that records your screen while you narrate bugs, then produces structured Markdown with screenshots that AI coding agents can act on directly. The newest feature lets your agent see your screen mid-conversation via MCP.
>
> Would love your honest take if you have 2 minutes: [PH link]
>
> If it's useful to you, an upvote would mean a lot. But more than anything I'd appreciate real feedback -- what's confusing, what's missing, what would make you actually use this.

### Longer version (for developer communities):

> I just launched markuprx on Product Hunt. It's an open-source dev tool I've been building to solve a specific problem: describing visual bugs to AI coding agents.
>
> The workflow: press a hotkey, narrate what you see on screen, press the hotkey again. markuprx transcribes your voice, extracts video frames at the exact timestamps from your narration, and produces structured Markdown your AI agent can consume directly. New in v2.5.0: push feedback straight to GitHub Issues or Linear, output templates for different trackers, watch mode for auto-processing, and a GitHub Action for CI/CD visual QA.
>
> Free, MIT licensed, no telemetry. Desktop app + CLI + MCP server + GitHub Action.
>
> Check it out: [PH link]
> GitHub: https://github.com/eddiesanjuan/markuprx

### Anti-patterns to avoid:
- Don't say "please upvote" -- say "check it out" or "would love your feedback"
- Don't send to people who have no context on what you're building
- Don't send the same message to multiple PH community members -- PH detects coordinated voting
- Don't ask people to upvote at a specific time -- organic engagement only
- Never use upvote exchange groups or paid services -- PH will penalize or ban your listing

---

## 7. Reply Templates (for common PH comments)

**"How is this different from Loom?"**
> Great question! Loom is for recording videos to share with people. markuprx is purpose-built for AI coding agents -- the output is structured Markdown with screenshots placed at the exact moments from your narration, optimized for LLM consumption. The pipeline (Whisper + ffmpeg + Claude) produces documents that AI agents can read and act on directly. Loom gives you a video link; markuprx gives your AI agent structured context to start fixing code.

**"Does it work with [specific AI tool]?"**
> markuprx's output is standard Markdown with inline images, so it works with any AI tool that can read files. The MCP server specifically integrates with Claude Code, Cursor, Windsurf, and any MCP-compatible client. The CLI works anywhere Node.js runs.

**"Privacy concerns with screen recording?"**
> Local-first by default. Whisper transcription runs entirely on your machine -- no data leaves your device. Screen recordings stay in local session directories. If you opt into cloud transcription (OpenAI API) or AI analysis (Anthropic API), you bring your own keys and data goes directly to those APIs. No markuprx servers in the middle. No telemetry, no tracking, no analytics. Full source is on GitHub for anyone to audit.

**"Will there be a paid version?"**
> The core tool is free and MIT licensed forever. We're exploring a premium tier that hosts API keys for you (so you skip the OpenAI/Anthropic setup), but it's the exact same pipeline and output. Convenience, not extra capability. BYOK works today with full functionality.

---

## 8. Checklist -- Ready to Launch?

- [ ] Product Hunt listing created with all fields filled
- [ ] Gallery images produced and uploaded (5 images minimum)
- [ ] Maker comment written and reviewed
- [ ] First technical comment written and reviewed
- [ ] 20+ followers on the upcoming page
- [ ] Website live and all links working (https://markuprx.com)
- [ ] GitHub repo public with clean README
- [ ] npm packages published and working (`npx markuprx`, `npx --package markuprx markuprx-mcp`)
- [ ] Download links working for macOS and Windows
- [ ] Reply templates ready for common questions
- [ ] Social media posts scheduled
- [ ] Network notified (upvote request sent 48h before to close contacts)
- [ ] Calendar blocked for launch day (respond to every comment within 1 hour)
