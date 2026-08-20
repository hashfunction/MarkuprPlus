# MCP Directory Submissions -- markuprx-mcp

**Date:** 2026-02-15
**Submitter:** Eddie San Juan
**Goal:** Submit to all 11 MCP directories in one sitting (~2-3 hours)

---

## Quick Reference

| # | Directory | Submission Method | Status |
|---|-----------|------------------|--------|
| a | mcpservers.org | Web form | Ready to submit |
| b | mcp.so | Web form | Ready to submit |
| c | PulseMCP | Web form | Ready to submit |
| d | MCP Market | Web form | Ready to submit |
| e | Cline Marketplace | GitHub issue | Ready to submit |
| f | cursor.directory | Web form | Ready to submit |
| g | Gradually.ai | Web form | Ready to submit |
| h | punkpeye/awesome-mcp-servers | GitHub PR | Ready to submit |
| i | appcypher/awesome-mcp-servers | GitHub PR | Ready to submit |
| j | MCP Server Finder | Web form | Ready to submit |
| k | Portkey | Web form | Ready to submit |

---

## Shared Copy

Use these across all submissions. Tailor per directory as noted.

**Name:** markuprx-mcp

**One-liner (under 60 chars):**
> Give your AI coding agent eyes and ears.

**Short description (1-2 sentences):**
> MCP server that lets AI coding agents capture screenshots, describe what's on screen with vision AI, record screen+voice sessions, and push structured feedback to GitHub and Linear. Your agent sees your screen and acts on what it sees.

**Install command:**
```
npx markuprx-mcp
```

**Website:** https://markuprplus.com
**npm:** https://www.npmjs.com/package/markuprx-mcp
**Website:** https://markuprplus.com
**License:** MIT
**Author:** Eddie San Juan

**Tools (9 total):**

| Tool | Description |
|------|-------------|
| `capture_screenshot` | Take a screenshot of the current screen, optimize it, save to session directory |
| `describe_screen` | Capture screenshot + use Claude vision to return structured text description of what's on screen |
| `analyze_screenshot` | Take a screenshot and return it as image data for the AI to analyze visually |
| `analyze_video` | Process a video file through the markuprx pipeline into structured Markdown with transcript and frames |
| `capture_with_voice` | Record screen+voice for a set duration, run full pipeline, return structured report |
| `start_recording` | Begin a long-form screen+voice recording session |
| `stop_recording` | Stop active recording and run the full pipeline |
| `push_to_github` | Create GitHub issues from a feedback report (one issue per feedback item) |
| `push_to_linear` | Push feedback report to Linear as structured issues with priority mapping |

**Tags/Keywords:** mcp, mcp-server, screenshot, screen-recording, developer-tools, ai-agents, claude-code, cursor, windsurf, feedback, bug-reporting, vision, whisper, markdown, github, linear

---

## a. mcpservers.org

**Submission URL:** https://mcpservers.org/submit

**Title:** markuprx-mcp

**Category:** Developer Tools

**Description:**
MCP server that gives AI coding agents the ability to see your screen. Capture screenshots, describe what's on screen with Claude vision, record screen+voice sessions, analyze video recordings, and push structured feedback to GitHub and Linear. 9 tools total. Works with Claude Code, Cursor, and Windsurf.

Install: `npx markuprx-mcp`

**Tools to list:**
- capture_screenshot -- Take a screenshot of the current screen
- describe_screen -- Use Claude vision to describe what's visible on screen
- analyze_screenshot -- Return screenshot as image data for AI visual analysis
- analyze_video -- Process video files into structured Markdown reports
- capture_with_voice -- Record screen+voice, produce structured feedback report
- start_recording -- Begin a long-form recording session
- stop_recording -- End recording and run the full analysis pipeline
- push_to_github -- Create GitHub issues from feedback reports
- push_to_linear -- Push feedback to Linear as structured issues

**Website URL:** https://markuprplus.com

**npm install:** `npx markuprx-mcp`

**Status:** Ready to submit

---

## b. mcp.so

**Submission URL:** https://mcp.so (look for "Submit" or "Add Server" button)

**Title:** markuprx-mcp

**Description:**
MCP server that lets AI coding agents capture screenshots, describe what's on screen using vision AI, record screen+voice sessions, and push structured feedback to GitHub and Linear. Your agent sees your screen and acts on what it sees. 9 tools. Local-first -- all processing happens on your machine. MIT licensed.

**Website URL:** https://markuprplus.com

**Install command:** `npx markuprx-mcp`

**Category:** Developer Tools

**Status:** Ready to submit

---

## c. PulseMCP

**Submission URL:** https://www.pulsemcp.com/submit (or https://www.pulsemcp.com/use-cases/submit)

**Server Name:** markuprx-mcp

**Description:**
Give your AI coding agent eyes and ears. markuprx-mcp is an MCP server that lets Claude Code, Cursor, and Windsurf capture screenshots, describe what's on screen with Claude vision, record screen+voice sessions, analyze video recordings, and push structured feedback directly to GitHub issues and Linear. 9 tools. Local-first. Open source (MIT).

**Website URL:** https://markuprplus.com

**npm package:** markuprx-mcp

**Install:** `npx markuprx-mcp`

**Use cases:**
- Bug reporting: agent captures screenshot, sees the bug, fixes it
- UI review: agent describes what's on screen, identifies layout issues
- Feedback sessions: record screen+voice, get structured Markdown report
- Issue creation: push feedback directly to GitHub or Linear

**Tags:** developer-tools, screenshot, screen-recording, vision, feedback, github, linear

**Status:** Ready to submit

---

## d. MCP Market

**Submission URL:** https://mcpmarket.com/submit

**Title:** markuprx-mcp

**Description:**
MCP server for visual developer feedback. Capture screenshots, describe your screen with Claude vision, record screen+voice sessions, analyze videos, and push structured feedback to GitHub and Linear. 9 tools that give AI coding agents the ability to see your screen.

**Website URL:** https://markuprplus.com

**Install:** `npx markuprx-mcp`

**Category:** Developer Tools

**Status:** Ready to submit

---

## e. Cline MCP Marketplace

**Submission URL:** https://github.com/cline/mcp-marketplace/issues/new?template=mcp-server-submission.yml

### Issue fields:

**Server Name:** markuprx-mcp

**Website URL:** https://markuprplus.com

**Logo:** Upload the 400x400 PNG logo (create from `src/renderer/assets/logo.svg` if not yet exported)

**Reason for Addition:**

markuprx-mcp gives Cline users the ability to visually inspect their screen during coding sessions. 9 tools including:

- **capture_screenshot** -- grab the current screen
- **describe_screen** -- use Claude vision to describe what's visible (UI elements, errors, layout, text content)
- **analyze_screenshot** -- return screenshot as image for AI visual analysis
- **capture_with_voice** -- record screen+voice and get a structured Markdown report
- **analyze_video** -- process any .mov/.mp4 into structured feedback
- **start_recording / stop_recording** -- long-form recording sessions
- **push_to_github / push_to_linear** -- create issues directly from feedback reports

Local-first: all processing happens on the user's machine. No cloud dependency for core features. MIT licensed.

Install: `npx markuprx-mcp`

**Testing confirmation:** Tested Cline successfully setting up the server using README.md and llms-install.md.

### Pre-requisites before submitting:
1. Export 400x400 PNG logo from SVG
2. Ensure `llms-install.md` exists in repo root (see separate file)
3. Test Cline installation end-to-end

**Status:** Ready to submit (after logo export and llms-install.md)

---

## f. cursor.directory

**Submission URL:** https://cursor.directory/mcp (look for submission form or "Add" button)

**Title:** markuprx-mcp

**Description:**
MCP server that lets your AI coding agent see your screen. Capture screenshots, describe what's on screen with Claude vision, record screen+voice sessions, analyze video recordings, and push feedback to GitHub/Linear. 9 tools. Local-first, open source.

**Install config (Cursor format):**

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

**Website URL:** https://markuprplus.com

**Category:** Developer Tools

**Tags:** screenshot, screen-recording, feedback, vision, github, linear

**Status:** Ready to submit

---

## g. Gradually.ai

**Submission URL:** https://www.gradually.ai/en/mcp-servers/ (look for submission form)

**Title:** markuprx-mcp

**Description:**
MCP server for AI coding agents to capture screenshots, describe screen content with vision AI, record screen+voice, analyze video recordings, and push structured feedback to GitHub and Linear. 9 tools. Install: `npx markuprx-mcp`. Open source (MIT).

**Website URL:** https://markuprplus.com

**Category:** Developer Tools

**Status:** Ready to submit

---

## h. punkpeye/awesome-mcp-servers (GitHub PR)

**Repository:** https://github.com/punkpeye/awesome-mcp-servers
**Action:** Fork, add entry, open PR

### Entry format (matches their existing style):

Add under the **Developer Tools** category, in alphabetical order:

```markdown
- [markuprx](https://markuprplus.com) 📇 🏠 🍎 - MCP server that lets AI coding agents capture screenshots, describe screen content with vision AI, record screen+voice, and push structured feedback to GitHub and Linear
```

Badge explanation:
- `📇` = TypeScript/JavaScript
- `🏠` = Local
- `🍎` = macOS

### PR title:
```
Add markuprx-mcp -- visual feedback MCP server for AI coding agents
```

### PR description:

```markdown
## Add markuprx-mcp

**Project URL:** https://markuprplus.com
**npm:** [markuprx-mcp](https://www.npmjs.com/package/markuprx-mcp)
**Install:** `npx markuprx-mcp`
**License:** MIT

### What it does

markuprx-mcp is an MCP server that gives AI coding agents the ability to see your screen. It provides 9 tools:

| Tool | Description |
|------|-------------|
| `capture_screenshot` | Take a screenshot of the current screen |
| `describe_screen` | Use Claude vision to describe what's visible on screen |
| `analyze_screenshot` | Return screenshot as image data for AI visual analysis |
| `analyze_video` | Process video files into structured Markdown reports |
| `capture_with_voice` | Record screen+voice, produce structured feedback report |
| `start_recording` | Begin a long-form recording session |
| `stop_recording` | End recording and run the full analysis pipeline |
| `push_to_github` | Create GitHub issues from feedback reports |
| `push_to_linear` | Push feedback to Linear as structured issues |

### Why it belongs here

No other MCP server combines screenshot capture, vision-based screen description, screen+voice recording with Whisper transcription, and direct issue creation in GitHub/Linear. markuprx-mcp is the complete visual feedback pipeline for AI coding agents.

### Category

Added under **Developer Tools**, alphabetically ordered.

### Checklist

- [x] Entry follows the existing format
- [x] Description is concise and informative
- [x] Link is valid and working
- [x] Server is published on npm
- [x] MIT licensed
```

**Status:** Ready to submit

---

## i. appcypher/awesome-mcp-servers (GitHub PR)

**Repository:** https://github.com/appcypher/awesome-mcp-servers
**Action:** Fork, add entry, open PR

### Entry format (matches their existing style with icon):

Add under the **Development Tools** section (or nearest equivalent), in alphabetical order:

```markdown
- <img src="https://markuprplus.com/favicon.ico" height="14"/> [markuprx-mcp](https://markuprplus.com) - MCP server for AI coding agents to capture screenshots, describe screen content with vision AI, record screen+voice sessions, and push feedback to GitHub/Linear
```

> Note: If the favicon does not work at that URL, upload an icon with the directory submission.

### PR title:
```
Add markuprx-mcp -- visual feedback and screen capture MCP server
```

### PR description:

```markdown
## Add markuprx-mcp

**Project URL:** https://markuprplus.com
**npm:** [markuprx-mcp](https://www.npmjs.com/package/markuprx-mcp)
**Install:** `npx markuprx-mcp`
**License:** MIT

### Description

markuprx-mcp is an MCP server that gives AI coding agents the ability to see your screen. 9 tools:

- **capture_screenshot** -- grab the current screen
- **describe_screen** -- use Claude vision to return a structured description of what's visible
- **analyze_screenshot** -- return screenshot as image data for AI analysis
- **analyze_video** -- process .mov/.mp4 files into structured Markdown with transcript and frames
- **capture_with_voice** -- record screen+voice for a duration, produce a structured feedback report
- **start_recording / stop_recording** -- long-form recording sessions with pipeline processing
- **push_to_github** -- create GitHub issues from feedback reports
- **push_to_linear** -- push feedback to Linear with priority mapping

### Category

Development Tools (or Developer Tools -- whichever exists in the current list).

### Checklist

- [x] Follows existing entry format
- [x] Description is concise
- [x] Link works
- [x] Published on npm as `markuprx-mcp`
- [x] Open source (MIT)
```

**Status:** Ready to submit

---

## j. MCP Server Finder

**Submission URL:** https://www.mcpserverfinder.com/ (look for submission form or "Submit Server")

**Title:** markuprx-mcp

**Description:**
MCP server for visual developer feedback. Lets AI coding agents capture screenshots, describe screen content with Claude vision, record screen+voice, analyze video recordings, and push structured feedback to GitHub and Linear. 9 tools. Local-first, open source.

**Website URL:** https://markuprplus.com

**npm:** markuprx-mcp

**Install:** `npx markuprx-mcp`

**Category:** Developer Tools

**Tags:** screenshot, screen-recording, vision, feedback, developer-tools, github, linear, whisper, markdown

**Status:** Ready to submit

---

## k. Portkey

**Submission URL:** https://portkey.ai/mcp-servers (look for submission form or "Add Server")

**Title:** markuprx-mcp

**Description:**
Give your AI coding agent eyes and ears. markuprx-mcp captures screenshots, describes screen content with vision AI, records screen+voice sessions with Whisper transcription, and pushes structured feedback to GitHub and Linear. 9 tools for complete visual feedback.

**Website URL:** https://markuprplus.com

**npm:** markuprx-mcp

**Install:** `npx markuprx-mcp`

**Category:** Developer Tools

**Tags:** screenshot, vision, screen-recording, feedback, developer-tools

**Status:** Ready to submit

---

## Submission Checklist

Before starting the submission blitz:

- [ ] `llms-install.md` committed to repo root
- [ ] 400x400 PNG logo exported and ready to upload
- [ ] Demo GIF recorded and in README (helps conversion on every directory)
- [ ] All 9 tools verified working in latest npm publish
- [ ] README-MCP.md updated to include `describe_screen`, `push_to_github`, `push_to_linear` tools

After submitting:

- [ ] a. mcpservers.org -- submitted
- [ ] b. mcp.so -- submitted
- [ ] c. PulseMCP -- submitted
- [ ] d. MCP Market -- submitted
- [ ] e. Cline Marketplace -- issue opened
- [ ] f. cursor.directory -- submitted
- [ ] g. Gradually.ai -- submitted
- [ ] h. punkpeye/awesome-mcp-servers -- PR opened
- [ ] i. appcypher/awesome-mcp-servers -- PR opened
- [ ] j. MCP Server Finder -- submitted
- [ ] k. Portkey -- submitted

Track approval status in this document. Update the table at the top as each directory confirms listing.
