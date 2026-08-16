# MarkuprX Product Vision

**Version 1.2** | February 2026
**Author**: Eddie San Juan
**License**: MIT (Open Source)
**Status**: Public Release

---

## The Problem Nobody Talks About

Developers using AI coding assistants have a broken feedback loop.

You spend 30 minutes working with Claude Code or Cursor to build a feature. You deploy. You test. You find problems. Now you need to communicate what you found -- but your AI session context is gone. Re-explaining everything takes as long as the original work.

The existing tools don't solve this:

- **Loom** caps at 5 minutes and produces video files AI tools can't read.
- **Jam.dev** is browser-only and assumes something is broken. Development feedback isn't just bugs -- it's reasoning, preferences, and context.
- **Screen Studio** produces beautiful recordings with zero structured output.
- **Screenshots + typing** interrupts your thought process. By the time you switch apps and type, you've lost the nuance.

Bug reporting tools assume something is *broken*. Development feedback captures *reasoning*. No existing tool bridges this gap.

---

## What MarkuprX Does

MarkuprX is a menu bar app that intelligently captures your development feedback. Press a hotkey, talk through what you see, and MarkuprX records your screen while transcribing your voice in real time. When you stop, an intelligent post-processing pipeline correlates your transcript timestamps with the screen recording to extract the right frames at the right moments -- then stitches everything into a structured, AI-ready markdown document.

One hotkey to start. One hotkey to stop. A markdown file with your words, contextually-placed screenshots, and intelligent structure -- ready to hand to your AI coding agent, paste into a GitHub issue, or drop in a Slack thread. The output isn't a transcript with screenshots attached. It's a document that understands the relationship between what you said and what was on screen.

---

## The User Journey

### Starting a Session

You're testing a feature you just deployed. Something feels off about the layout. A button is in the wrong place. The loading state is confusing.

You press `Cmd+Shift+F`.

The menu bar icon shifts from a gray outline to a pulsing red dot. Recording has started. No window pops up. No app switcher. No interruption. You stay exactly where you are.

### During a Session

You talk naturally:

*"This button is way too small on mobile. And it's competing with the header -- look, they're practically overlapping."*

You pause for a beat. MarkuprX detects the silence -- about 1.2 seconds of quiet -- and captures a screenshot of exactly what you're looking at.

You scroll down.

*"The loading spinner here feels sluggish. It shows up but then the content pops in with no transition. Feels janky."*

Another natural pause. Another screenshot.

You click through to a different page.

*"Actually, I love how this card animation works. We should use this pattern on the dashboard too."*

Screenshot.

You don't switch apps. You don't break your train of thought. You don't reach for your phone to take a photo of your screen. You just talk and navigate like you normally would.

If you need a screenshot at a specific moment -- mid-sentence, before you pause -- hit `Cmd+Shift+S` for a manual capture.

### Ending a Session

Press `Cmd+Shift+F` again. The menu bar icon spins briefly while the session processes. A few seconds later, a notification tells you the session is complete.

### What You Get

Everything is saved to an organized folder on your machine:

```
~/markuprx/sessions/2026-02-05_14-23-41/
  feedback.md
  screenshots/
    fb-001.png
    fb-002.png
    fb-003.png
```

The markdown file is the core output. The post-processing pipeline:

1. Analyzes your transcript timestamps against the screen recording
2. Extracts the most relevant frames at the exact moments you described each issue
3. Places screenshots inline with the corresponding narration
4. Structures the document with clear sections, timestamps, and context
5. Produces a summary with item counts and session duration

The result is a document purpose-built for AI consumption -- your coding agent can read it and immediately understand every issue, see exactly what you saw, and act on it.

On the premium tier, Claude AI reads your transcript alongside your screenshots and produces an even more intelligent document -- grouping related feedback, identifying patterns across items, surfacing what matters most, and writing actionable summaries.

### The Clipboard Bridge

When the session ends, the **file path** to your markdown document is copied to your clipboard. Not the content. The path.

This is deliberate:

- If your clipboard gets overwritten, your feedback isn't gone. The file lives on disk permanently.
- AI coding tools like Claude Code can read a file path and process the full document, including the screenshots.
- You paste the path into your AI tool, your IDE, a Slack message, an issue tracker -- wherever it needs to go.
- The file is yours. Local. Private. No cloud dependency.

The path is the bridge between "I captured feedback" and "something acts on it."

---

## Who This Is For

**Primary users**: Individual developers and small teams (2-10 people) who use AI coding assistants daily. They deploy frequently, prefer keyboard-driven workflows, and care more about structured output than polished video.

**Secondary users**: Senior developers and tech leads who review AI-assisted work, need visibility into development decisions, and want to build team knowledge bases over time.

The common thread: these are people who think faster than they type, test their own code regularly, and want their feedback to be immediately actionable by both humans and AI tools.

---

## How Pricing Works

### Free Tier (Open Source, MIT License)

MarkuprX is free and fully functional with no feature gates:

- **Local Whisper transcription** runs entirely on your machine. No API key. No internet required after the initial model download (~500MB).
- **BYOK (Bring Your Own Key)** for AI analysis. Plug in any API key you want -- Anthropic, OpenAI, whatever you prefer.
- **All features unlocked.** Screenshots, transcription, markdown output, crash recovery, silence detection, manual capture -- everything works.
- **Offline capable.** Once the Whisper model is downloaded, MarkuprX works without a network connection.

A donate button rotates through messages like "Buy Eddie a Taco" and "Fund Eddie's Caffeine Addiction" -- a single link to Ko-fi. It never blocks your workflow. It never nags. It's there if you feel like it.

### Premium Tier (~$12/month)

Everything in Free, plus:

- **Built-in Claude AI analysis.** No API key setup. No configuration. Press stop, and Anthropic's Claude reads your transcript alongside your screenshots to produce an intelligent, contextualized feedback document.
- **Smart summaries.** Claude identifies patterns across your feedback items, groups related observations, flags the most critical issues, and writes concise action items.
- **Zero setup.** Eddie's API key is proxied through a Cloudflare Worker. You sign up, you pay, it works.
- **Stripe billing.** Standard monthly subscription. Cancel anytime.

The premium value is Claude's intelligence applied to your feedback -- not better transcription. Transcription is always local Whisper, always free. The AI analysis layer is what you pay for.

This is not an OpenAI integration. The analysis is powered by Anthropic's Claude because it produces better structured reasoning about visual and textual content.

---

## Design Principles

**Zero-config first run.** MarkuprX works the moment you open it. No API keys. No account creation. No onboarding wizard with seven steps. You click the menu bar icon, press the hotkey, and start talking.

**Menu bar native.** No dock icon. No window chrome. MarkuprX lives in your menu bar like a system utility. It's there when you need it and invisible when you don't. Inspired by how the Claude Status app behaves -- minimal, professional, out of the way.

**Never lose work.** Session state is written to disk every 5 seconds. If the app crashes, your data is recovered on restart. If your clipboard gets overwritten, the file is still on disk. If processing hangs, a watchdog timer forces recovery within 10 seconds. You will never lose a feedback session.

**AI is the luxury, not the baseline.** The free tier is a complete, production-quality tool. AI analysis makes the output smarter and more structured, but MarkuprX is useful without it. This is not a demo that upsells you.

**Open source first.** MIT license. Fork it, improve it, ship it. Contributions welcome. The codebase is designed to be readable and well-documented. Community-driven development, not SaaS-driven.

**Ship fast, polish later.** The core loop -- record, capture, generate, copy -- matters more than animation polish or pixel-perfect design. Functionality first. Always.

---

## How It Works Under the Hood

MarkuprX is an Electron app with a React frontend. The recording session is governed by a 7-state finite state machine:

**idle** -- ready to record
**starting** -- initializing microphone and transcription (5-second timeout)
**recording** -- capturing audio and screenshots (30-minute max)
**stopping** -- finalizing audio capture (3-second timeout)
**processing** -- generating the output document (10-second timeout)
**complete** -- session saved, path copied (auto-returns to idle after 30 seconds)
**error** -- something went wrong (auto-recovers to idle after 5 seconds)

Every state has a maximum duration. A watchdog timer monitors state age in the background and forces recovery if anything gets stuck. There is no state the app can enter and not exit. This is the "bulletproof" guarantee.

### Three-Tier Transcription

Transcription degrades gracefully:

1. **OpenAI** (optional, best quality) -- cloud-based, 95%+ accuracy, ~300ms latency. Requires an API key and internet.
2. **Local Whisper** (default) -- runs on your machine, 90%+ accuracy, 1-2 second latency. No API key. No internet.
3. **macOS Dictation** (emergency fallback) -- real-time, ~85% accuracy. Uses the system's built-in speech recognition.

If OpenAI fails mid-session, MarkuprX falls back to Whisper. If Whisper isn't available, it falls back to macOS Dictation. If nothing works, it continues capturing screenshots on a timer and saves whatever audio it has.

### Intelligent Screen Recording & Frame Extraction

During a session, MarkuprX continuously records your screen (up to 4K@30fps, VP9/VP8 encoded). Simultaneously, silence detection monitors audio input using RMS amplitude analysis -- when you pause for ~1.2 seconds, the system notes a capture point. You can also trigger a manual capture at any time with `Cmd+Shift+S`.

The real intelligence happens in post-processing. When you end a session, the pipeline:

1. Walks through the transcript with timestamps
2. Correlates each narration segment with the screen recording timeline
3. Extracts frames at the exact moments that correspond to what you were describing
4. Stitches the frames and transcript into a structured markdown document

This means the output isn't just "screenshots taken during pauses" -- it's contextually-aware frame extraction that ensures every image in the document shows exactly what you were talking about.

### Crash Recovery

Session state persists to disk every 5 seconds. If the app is force-quit or crashes during a recording:

1. On next launch, MarkuprX detects the incomplete session.
2. It presents a recovery dialog with the partial data.
3. You can resume or discard the session.

This means even a power failure mid-session doesn't lose your work.

---

## What Makes MarkuprX Different

| | MarkuprX | Loom | Jam.dev | Screenshots + Notes |
|---|---|---|---|---|
| Voice + Screen Recording | Yes | Video only | Browser only | Manual |
| AI-Ready Output | Structured markdown | No | Partial | No |
| Intelligent Frame Extraction | Timestamp-correlated | No | Auto (browser) | No |
| Works Offline | Yes (local Whisper) | No | No | Yes |
| Works with Any App | Yes (desktop-wide) | Yes | No (browser) | Yes |
| Free | Fully functional | Limited | Limited | Yes |
| Open Source | MIT | No | No | N/A |
| Output format | Markdown + images | MP4 | Web report | Scattered files |

The core differentiator: MarkuprX's intelligent pipeline understands the relationship between what you said and what was on screen, then produces a structured document optimized for AI consumption. Video files can't do that -- AI tools can't read them. Browser-only tools miss everything outside the browser. Manual note-taking breaks your flow. MarkuprX captures everything, then intelligently assembles the output.

---

## Roadmap

### Shipped (v1.0 - v1.2)

- Bulletproof state machine with watchdog timer
- Menu bar native interface (no dock icon)
- Three-tier transcription (OpenAI, Whisper, macOS Dictation)
- Silence-triggered screenshot capture
- Crash recovery with 5-second auto-save
- Multiple export formats (Markdown, PDF, HTML, JSON)
- Session history browser
- Annotation tools (arrows, circles, rectangles, freehand, text)
- Audio waveform visualization
- Auto-updater
- Cross-platform support (macOS primary, Windows secondary)
- Donate button with rotating messages

### Next

- Premium tier with Claude AI analysis (Stripe billing, Cloudflare Worker proxy)
- Improved AI-powered document structuring and pattern detection
- Team sharing via file system or git integration
- Custom vocabulary for technical domain terms
- Session tagging and search across history
- Integration hooks for issue trackers (GitHub Issues, Linear)

### Future

- Linux support (full parity)
- Browser extension companion for web-specific capture
- Multi-language transcription
- Voice commands during recording ("mark this as critical", "new section")
- API for automation and CI/CD integration

---

## The Vision in One Sentence

MarkuprX turns the way you naturally think about software -- talking through what you see -- into intelligently structured documents where every screenshot is placed exactly where it belongs, ready for humans and AI tools to act on immediately.

---

*Built by Eddie San Juan. Open source. MIT licensed.*
*[github.com/eddiesanjuan/markuprx](https://github.com/eddiesanjuan/markuprx)*
*[ko-fi.com/eddiesanjuan](https://ko-fi.com/eddiesanjuan)*
