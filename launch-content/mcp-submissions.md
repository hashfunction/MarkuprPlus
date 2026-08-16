# MCP Registry & Directory Submissions for markuprx

> **Package:** `markuprx` on npm (includes `markuprx-mcp` binary)
> **Repo:** https://github.com/eddiesanjuan/markuprx
> **Version:** 2.5.0
> **Transport:** stdio
> **Tools:** capture_screenshot, capture_with_voice, analyze_video, analyze_screenshot, start_recording, stop_recording

---

## 1. Official MCP Registry (registry.modelcontextprotocol.io)

**Priority:** HIGHEST - this is the authoritative registry; other directories auto-ingest from here.
**URL:** https://registry.modelcontextprotocol.io/
**Source:** https://github.com/modelcontextprotocol/registry

### Prerequisites
- npm package `markuprx` must be published (already done)
- Add `mcpName` field to `package.json`
- Install `mcp-publisher` CLI
- GitHub authentication

### Steps

1. **Add `mcpName` to `package.json`:**
```json
"mcpName": "io.github.eddiesanjuan/markuprx"
```

2. **Publish updated package to npm:**
```bash
npm publish
```

3. **Install mcp-publisher:**
```bash
brew install mcp-publisher
# OR
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher && sudo mv mcp-publisher /usr/local/bin/
```

4. **Create `server.json` in project root:**
```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.eddiesanjuan/markuprx",
  "description": "Screen capture and voice recording MCP server for AI coding agents. Capture screenshots, record voice narration, analyze video, generate structured feedback, and push to GitHub Issues or Linear.",
  "repository": {
    "url": "https://github.com/eddiesanjuan/markuprx",
    "source": "github"
  },
  "version": "2.5.0",
  "packages": [
    {
      "registryType": "npm",
      "identifier": "markuprx",
      "version": "2.5.0",
      "transport": {
        "type": "stdio"
      },
      "runtime": "node",
      "runtimeArgs": []
    }
  ]
}
```

5. **Authenticate and publish:**
```bash
mcp-publisher login github
mcp-publisher publish
```

6. **Verify:**
```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.eddiesanjuan/markuprx"
```

---

## 2. punkpeye/awesome-mcp-servers (GitHub)

**Priority:** HIGH - 30k+ stars, synced with glama.ai/mcp/servers
**URL:** https://github.com/punkpeye/awesome-mcp-servers
**Submission:** Pull Request to README.md

### Entry Format
Add under the **Developer Tools** section, maintaining alphabetical order:

```markdown
- [markuprx](https://github.com/eddiesanjuan/markuprx) 📇 🏠 🍎 🪟 - Screen capture and voice recording MCP server for AI coding agents. Capture screenshots with voice narration, analyze video, generate structured Markdown feedback, and push to GitHub Issues or Linear. Includes output templates, watch mode, and GitHub Action.
```

### PR Instructions
1. Fork `punkpeye/awesome-mcp-servers`
2. Edit `README.md` — add entry under `### 🛠️ Developer Tools` in alphabetical order
3. Commit: `Add markuprx MCP server`
4. Open PR with title: `Add markuprx - Screen capture & voice recording for AI agents`
5. PR body:
```
## New Server: markuprx

- **Name:** markuprx
- **URL:** https://github.com/eddiesanjuan/markuprx
- **npm:** `npx --package markuprx markuprx-mcp`
- **Language:** TypeScript
- **Scope:** Local (runs on device)
- **OS:** macOS, Windows
- **Description:** Screen capture and voice recording MCP server for AI coding agents. 6 tools: capture_screenshot, capture_with_voice, analyze_video, analyze_screenshot, start_recording, stop_recording. v2.5.0 adds push to GitHub Issues/Linear, output templates, watch mode, and a GitHub Action.
- **Category:** Developer Tools
```

---

## 3. appcypher/awesome-mcp-servers (GitHub)

**Priority:** MEDIUM - another popular awesome list
**URL:** https://github.com/appcypher/awesome-mcp-servers
**Submission:** Pull Request to README.md

### Entry Format
Add under the **Development Tools** section:

```markdown
- **[markuprx](https://github.com/eddiesanjuan/markuprx)** - Screen capture and voice recording MCP server for AI coding agents. Capture screenshots, record voice, analyze video, generate structured feedback, and push to GitHub Issues or Linear.
```

---

## 4. wong2/awesome-mcp-servers (GitHub)

**Priority:** LOW - this repo now redirects to https://mcpservers.org/submit
**URL:** https://github.com/wong2/awesome-mcp-servers
**Note:** They no longer accept PRs. Submit via mcpservers.org instead (see #7 below).

---

## 5. Smithery.ai

**Priority:** HIGH - major MCP marketplace, 2800+ servers
**URL:** https://smithery.ai
**Submission:** CLI or web UI

### Via CLI (stdio transport)
```bash
npx @anthropic-ai/smithery-cli mcp publish --name @eddiesanjuan/markuprx --transport stdio
```

### Via Web UI
1. Go to https://smithery.ai/new
2. Enter npm package name: `markuprx`
3. Select transport: stdio
4. Complete publishing workflow

---

## 6. Glama.ai

**Priority:** HIGH - auto-syncs with punkpeye/awesome-mcp-servers
**URL:** https://glama.ai/mcp/servers
**Submission:** Automatic after punkpeye/awesome-mcp-servers PR is merged

Glama indexes from the punkpeye repo. Once the PR in step #2 is merged, markuprx should appear automatically on glama.ai/mcp/servers.

If not indexed within a week, join their Discord to request manual addition.

---

## 7. mcpservers.org (wong2's directory)

**Priority:** MEDIUM
**URL:** https://mcpservers.org/submit
**Submission:** Web form

### Form Fields
- **Server Name:** markuprx
- **Short Description:** Screen capture and voice recording MCP server for AI coding agents. Capture screenshots, record voice narration, analyze video, generate structured Markdown feedback, and push to GitHub Issues or Linear.
- **Link:** https://github.com/eddiesanjuan/markuprx
- **Category:** development
- **Contact Email:** eddie@markuprx.com

---

## 8. PulseMCP

**Priority:** MEDIUM - 8000+ servers listed, auto-ingests from official registry
**URL:** https://www.pulsemcp.com/submit
**Submission:** Web form (single URL field) OR auto-ingest from official registry

### Steps
1. Publish to official MCP Registry first (#1 above)
2. PulseMCP ingests from the official registry daily and processes weekly
3. If not listed after a week, submit manually at https://www.pulsemcp.com/submit with URL: `https://github.com/eddiesanjuan/markuprx`
4. Or email hello@pulsemcp.com

---

## 9. mcp.so

**Priority:** MEDIUM - community-driven directory
**URL:** https://mcp.so
**Submission:** GitHub Issue at https://github.com/chatmcp/mcp-directory/issues/1

### Issue Comment Format
```
**Server Name:** markuprx
**GitHub:** https://github.com/eddiesanjuan/markuprx
**npm:** markuprx (run via `npx --package markuprx markuprx-mcp`)
**Description:** Screen capture and voice recording MCP server for AI coding agents. Capture screenshots with voice narration, analyze video, generate structured Markdown feedback, and push to GitHub Issues or Linear. v2.5.0 includes output templates, watch mode, and GitHub Action.
**Tools:** capture_screenshot, capture_with_voice, analyze_video, analyze_screenshot, start_recording, stop_recording
**Category:** Developer Tools
```

---

## 10. mcp-get.com

**Priority:** LOW - smaller directory, auto-discovers from npm/registry
**URL:** https://mcp-get.com
**Submission:** Should auto-discover from npm once `mcpName` is added to package.json

---

## 11. mcpserverfinder.com

**Priority:** LOW
**URL:** https://www.mcpserverfinder.com
**Submission:** Check if they have a submit page, or email for listing

---

## 12. mcpserver.directory

**Priority:** LOW
**URL:** https://www.mcpserver.directory
**Submission:** Check if they have a submit page

---

## Recommended Submission Order

1. **Official MCP Registry** (triggers auto-ingest by PulseMCP, mcp-get, and others)
2. **punkpeye/awesome-mcp-servers** PR (triggers Glama.ai sync)
3. **Smithery.ai** (major marketplace)
4. **mcpservers.org** form
5. **mcp.so** GitHub issue
6. **appcypher/awesome-mcp-servers** PR
7. Wait for auto-ingest: PulseMCP, mcp-get, Glama

---

## package.json Changes Required

Add `mcpName` field for official registry:
```json
"mcpName": "io.github.eddiesanjuan/markuprx"
```

Add MCP-relevant keywords:
```json
"keywords": [
  "markuprx",
  "feedback",
  "voice",
  "transcription",
  "screenshot",
  "electron",
  "ai",
  "developer-tools",
  "menu-bar",
  "macos",
  "windows",
  "whisper",
  "mcp",
  "mcp-server",
  "model-context-protocol",
  "claude-code",
  "cursor",
  "windsurf",
  "ai-agent",
  "screen-recording",
  "voice-recording"
]
```

---

## GitHub Topics (already applied)
Current topics on the repo:
- mcp, model-context-protocol (already present)
- developer-tools, electron, macos (already present)
- cli, npx, voice-feedback, ai-agents, ai-tools (already present)

Topics to add:
- mcp-server
- screen-recording
- cursor
- windsurf
