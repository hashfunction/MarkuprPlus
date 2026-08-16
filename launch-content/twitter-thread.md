# Twitter/X Launch Thread

---

## Tweet 1 (Hook)
> Your AI coding agent can't see your screen. And even when it can, it can't file the bug for you. Both change today.
>
> markuprx v2.5: record your screen, narrate bugs, get structured reports pushed directly to GitHub Issues or Linear.
>
> Open source. Free. Zero config.
>
> https://markuprx.com

**Characters:** ~280

---

## Tweet 2 (MCP Config)
> Add this to your Claude Code settings and your agent gets 6 tools -- screenshot capture, screen+voice recording, video analysis:
>
> ```json
> {
>   "mcpServers": {
>     "markuprx": {
>       "command": "npx",
>       "args": ["--yes", "--package", "markuprx", "markuprx-mcp"]
>     }
>   }
> }
> ```
>
> Zero install. npx handles everything.

**Characters:** 247

---

## Tweet 3 (The Output)
> What the output looks like -- not random screenshots, but frames extracted at the exact timestamp you described each issue:
>
> ```markdown
> ### FB-001: Login button not visible
> **Timestamp**: 00:15 | **Type**: Bug
>
> > The login button is hidden behind
> > the header on mobile viewport...
>
> ![Screenshot](./screenshots/fb-001.png)
> ```
>
> Structured for LLM consumption.

**Characters:** 283

---

## Tweet 4 (Technical Pipeline)
> The pipeline that makes this work:
>
> 1. Record screen + mic
> 2. Transcribe with local Whisper (no API key)
> 3. Analyze transcript for key moments
> 4. Extract video frames via ffmpeg at those timestamps
> 5. Generate structured Markdown with screenshots placed where they belong
>
> All local. All automatic.

**Characters:** 271

---

## Tweet 5 (Open Source)
> markuprx is MIT licensed, fully open source.
>
> - No telemetry
> - No tracking
> - No accounts
> - Whisper runs on your machine
> - Your recordings never leave your disk
>
> The only external calls happen if you explicitly add an API key for cloud transcription or AI analysis. You control when data leaves.

**Characters:** 267

---

## Tweet 6 (Integrations -- NEW)
> v2.5 closes the loop. markuprx now pushes feedback directly to your issue tracker:
>
> `markuprx push github --repo owner/repo`
> `markuprx push linear --team KEY`
>
> Record the bug. Structure it. Push it to your backlog. One pipeline, zero copy-paste.
>
> Also: `--template github-issue` / `--template jira` for custom output formats.

**Characters:** ~280

---

## Tweet 7 (GitHub Action)
> markuprx now has a GitHub Action: `eddiesanjuan/markuprx-action@v1`
>
> Push a commit. The action captures and analyzes visual changes. Posts structured feedback as a PR comment with screenshots.
>
> Automated visual QA in your CI/CD. Free. Open source.

**Characters:** ~240

---

## Tweet 8 (Five Ways + Watch Mode)
> Five ways to use it now:
>
> Desktop app -- menu bar, one hotkey
> CLI -- `npx markuprx analyze ./video.mov`
> MCP server -- `npx --package markuprx markuprx-mcp`
> Watch mode -- `markuprx watch ./dir` (auto-process recordings)
> GitHub Action -- CI/CD visual feedback
>
> Same pipeline. Pick whatever fits your workflow.

**Characters:** ~270

---

## Tweet 9 (CTA)
> If you're tired of describing visual bugs in text, give it a try.
>
> Website: https://markuprx.com
> npm: `npx --package markuprx markuprx-mcp`
> Action: `eddiesanjuan/markuprx-action@v1`
>
> 860 tests. MIT licensed. Contributions welcome.

**Characters:** ~230
