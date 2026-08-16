# markuprx Demo Video Script

**Duration:** 75 seconds (target)
**Resolution:** 2560x1440 (record at retina, export at 1080p)
**Format:** Screen recording with voiceover
**Output:** MP4 (full), GIF (15-30s highlight for README)

---

## Pre-Recording Checklist

- [ ] Clean desktop -- remove personal files, hide dock if cluttered
- [ ] Disable notifications (Focus mode on macOS)
- [ ] Close Slack, Messages, Mail -- anything that might pop up
- [ ] Open a realistic web app with a pre-staged UI bug (layout issue, overlapping elements, broken mobile view)
- [ ] Have markuprx installed and running in the menu bar
- [ ] Open a terminal with Claude Code ready (for Scene 6)
- [ ] Use a good mic (AirPods Pro or external) -- test levels first
- [ ] Natural afternoon light, no harsh overhead
- [ ] OBS or macOS screen recording (Cmd+Shift+5) ready
- [ ] Have MCP config JSON visible in a file or ready to show

---

## Scene-by-Scene Script

### Scene 1: The Problem (0:00 - 0:12)

**Show:** A web app with an obvious UI bug -- a sidebar overlapping main content, or a button hidden behind another element on a narrow viewport.

**Narration:**
> "You're staring at a bug. You can see it. But try describing it to your AI agent in text -- 'the sidebar is overlapping the content below the fold when the viewport is under 768 pixels' -- and you've already lost two minutes."

**Camera/screen notes:**
- Start zoomed in on the bug
- Cursor hovers around the broken area to draw attention
- Brief, natural pause after "two minutes"

---

### Scene 2: Start Recording (0:12 - 0:22)

**Show:** Mouse moves to the menu bar, clicks the markuprx icon. Then press Cmd+Shift+F.

**Narration:**
> "With markuprx, I just hit Cmd+Shift+F and start talking."

**Camera/screen notes:**
- Show the menu bar icon clearly
- The hotkey press should feel fast and confident
- Recording indicator appears -- audio waveform starts animating
- Keep the pace brisk. This is the "zero friction" moment.

---

### Scene 3: Narrate the Bug (0:22 - 0:42)

**Show:** The buggy web app is visible. Eddie talks naturally while navigating the UI. markuprx's audio waveform pulses in the menu bar.

**Narration (natural developer-speak, not rehearsed):**
> "Okay so this sidebar -- it's supposed to collapse on mobile but it's sitting on top of the main content. And down here, the submit button is completely hidden. You can't even click it. Also the spacing between these cards is way off -- it's like 40px on the left and nothing on the right."

**Camera/screen notes:**
- Move the mouse to each problem area as you describe it
- Pause briefly between issues (this is when markuprx captures screenshots)
- Don't rush -- the pauses are the point. markuprx uses them to trigger captures.
- The waveform in the menu bar shows audio activity in real time

---

### Scene 4: Stop + Pipeline (0:42 - 0:52)

**Show:** Press Cmd+Shift+F to stop. The markuprx processing animation appears.

**Narration:**
> "I stop recording, and markuprx runs the pipeline -- transcribes the audio, finds the key moments, pulls the exact frames from the video, and builds a Markdown document."

**Camera/screen notes:**
- Show the processing state briefly (the pipeline animation)
- This should feel fast. If actual processing takes longer, cut/speed up the middle.
- The "complete" state appears with the file path notification

---

### Scene 5: The Output (0:52 - 1:05)

**Show:** Open the generated Markdown file. Scroll through it slowly enough to read the structure.

**Narration:**
> "Every screenshot is placed at the exact moment I was describing it. Not random intervals -- the actual frames that match my words. Structured, categorized, ready to paste into Claude Code or drop in a GitHub issue."

**Camera/screen notes:**
- Show the Markdown file in VS Code or a Markdown previewer
- Scroll to reveal: heading structure, transcript segments, inline screenshots
- Pause on a screenshot that clearly shows the bug being described
- This is the money shot. Give it time. Let the viewer read.

---

### Scene 6: MCP Server (1:05 - 1:15)

**Show:** A terminal or Claude Code session. Show the MCP config JSON, then a quick tool call.

**Narration:**
> "Or skip the app entirely. Add markuprx as an MCP server -- three lines of config -- and your agent can capture your screen mid-conversation."

**Camera/screen notes:**
- Flash the JSON config (keep it on screen for ~3 seconds):
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
- Then show a quick `capture_screenshot` tool call in Claude Code
- This should feel like a power move. Fast, clean.

---

### Scene 7: CTA (1:15 - 1:20)

**Show:** markuprx.com landing page, then the GitHub repo.

**Narration:**
> "Open source. No telemetry. Your data stays on your machine. markuprx.com."

**Camera/screen notes:**
- Hold on the landing page hero for 2 seconds
- End on a clean frame showing the URL: markuprx.com
- Fade to black or cut to logo

---

## Timing Summary

| Scene | Duration | Cumulative |
|-------|----------|------------|
| 1. The Problem | 12s | 0:12 |
| 2. Start Recording | 10s | 0:22 |
| 3. Narrate the Bug | 20s | 0:42 |
| 4. Stop + Pipeline | 10s | 0:52 |
| 5. The Output | 13s | 1:05 |
| 6. MCP Server | 10s | 1:15 |
| 7. CTA | 5s | 1:20 |
| **Total** | **~80s** | |

---

## Technical Setup

### Recording Software
- **OBS Studio** (free, best control) or **macOS screen recording** (Cmd+Shift+5)
- Record at 2x retina resolution, export at 1920x1080
- 30fps is fine for screen recordings. 60fps if you want buttery scrolling.

### Audio
- AirPods Pro work. A desk mic (Blue Yeti, Elgato Wave) is better.
- Record in a quiet room. Close windows.
- Speak at normal volume, ~12 inches from the mic.
- Do a 10-second test recording and listen back before the real take.

### The Demo App
Stage a realistic bug before recording. Suggestions:
- A Next.js or React app with a responsive layout issue
- Sidebar that doesn't collapse on narrow viewport
- A button hidden behind another element (z-index issue)
- Inconsistent spacing (easy to point at, visually obvious)

Don't use a toy app. It should look like a real project someone is working on.

### Desktop Prep
- Hide the Dock (System Settings > Desktop & Dock > Automatically hide)
- Set desktop wallpaper to solid dark gray or black
- Close all apps except: the demo web app, markuprx, and your code editor
- Resize the browser to ~1280x800 so the content is readable at 1080p

---

## GIF Extraction (for README)

Extract Scenes 2-4 (the core workflow: hotkey, narrate, stop) as a 20-second GIF:

```bash
# Extract 20 seconds starting at 0:12 (Scene 2 start)
ffmpeg -i demo.mp4 -ss 12 -t 20 -vf "fps=12,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" -loop 0 demo.gif
```

If the GIF is too large (>5MB), reduce duration or fps:
```bash
# Shorter, smaller GIF
ffmpeg -i demo.mp4 -ss 12 -t 15 -vf "fps=10,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer" -loop 0 demo-small.gif
```

---

## Product Hunt Gallery Stills

Capture 5 key frames from the video for the Product Hunt gallery (1270x760px each):

| # | Frame | Timestamp | What it shows |
|---|-------|-----------|---------------|
| 1 | The problem | ~0:05 | The UI bug, zoomed in |
| 2 | Recording active | ~0:25 | markuprx capturing, waveform visible |
| 3 | The output | ~0:58 | Markdown document with inline screenshots |
| 4 | MCP config | ~1:08 | The 3-line JSON config |
| 5 | Landing page | ~1:17 | markuprx.com hero section |

Extract stills with ffmpeg:
```bash
# Extract a frame at a specific timestamp
ffmpeg -i demo.mp4 -ss 5 -vframes 1 -vf "scale=1270:760:force_original_aspect_ratio=decrease,pad=1270:760:(ow-iw)/2:(oh-ih)/2" gallery-1-problem.png
ffmpeg -i demo.mp4 -ss 25 -vframes 1 -vf "scale=1270:760:force_original_aspect_ratio=decrease,pad=1270:760:(ow-iw)/2:(oh-ih)/2" gallery-2-recording.png
ffmpeg -i demo.mp4 -ss 58 -vframes 1 -vf "scale=1270:760:force_original_aspect_ratio=decrease,pad=1270:760:(ow-iw)/2:(oh-ih)/2" gallery-3-output.png
ffmpeg -i demo.mp4 -ss 68 -vframes 1 -vf "scale=1270:760:force_original_aspect_ratio=decrease,pad=1270:760:(ow-iw)/2:(oh-ih)/2" gallery-4-mcp.png
ffmpeg -i demo.mp4 -ss 77 -vframes 1 -vf "scale=1270:760:force_original_aspect_ratio=decrease,pad=1270:760:(ow-iw)/2:(oh-ih)/2" gallery-5-landing.png
```

---

## Platform-Specific Edits

### Twitter (30-60s max for engagement)
Cut Scenes 1-5 only. Drop the MCP scene. End with the markdown output and a text overlay: "markuprx.com -- open source".

### GitHub README (GIF)
Scenes 2-4 only (hotkey, narrate, output). 15-20 seconds. No audio needed -- the GIF speaks for itself.

### Product Hunt (full video)
Use the complete 80-second cut. Add a 2-second title card at the start: "markuprx -- you see it, you say it, your AI fixes it."

### Landing Page
Full video or Scenes 1-5 (skip MCP for non-technical visitors). Consider autoplay muted with a play button overlay.

---

## Recording Tips

1. **Do 2-3 takes.** First take is warmup. Second is usually best.
2. **Don't read the script verbatim.** Know the beats, speak naturally.
3. **Speak slightly slower than normal.** Screen recordings compress time perception.
4. **Pause between scenes.** Makes editing easier.
5. **If you mess up, pause 3 seconds, then restart that scene.** Edit out the mistake later.
6. **Watch it back before exporting.** Check for: notification popups, personal info visible, audio sync, mouse jitter.
