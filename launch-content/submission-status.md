# MCP Directory Submission Status

> Last updated: 2026-02-14

## Automated Submissions

| # | Directory | Status | Link | Notes |
|---|-----------|--------|------|-------|
| 1 | **Official MCP Registry** | `ready to publish` | — | `server.json` created and validated. Eddie must run: `mcp-publisher login github && mcp-publisher publish` |
| 2 | **punkpeye/awesome-mcp-servers** | `PR created` | [PR #2014](https://github.com/punkpeye/awesome-mcp-servers/pull/2014) | Added under Developer Tools, alphabetical order |
| 3 | **appcypher/awesome-mcp-servers** | `PR created` | [PR #321](https://github.com/appcypher/awesome-mcp-servers/pull/321) | Added under Development Tools |
| 4 | **mcp.so** | `submitted` | [Issue comment](https://github.com/chatmcp/mcpso/issues/1#issuecomment-3902502841) | Submitted via GitHub issue comment |

## Manual Submissions Required

| # | Directory | Status | URL | What to Do |
|---|-----------|--------|-----|------------|
| 5 | **Smithery.ai** | `manual required` | https://smithery.ai | Run: `npx @smithery/cli auth login` then `npx @smithery/cli mcp publish --name markuprx` from project root. Or use web UI at https://smithery.ai/new |
| 6 | **mcpservers.org** | `manual required` | https://mcpservers.org/submit | Web form. Fields: Name=markuprx, Description="Screen capture and voice recording MCP server for AI coding agents", Link=https://markuprplus.com, Category=development |
| 7 | **PulseMCP** | `auto-ingest pending` | https://www.pulsemcp.com/submit | Will auto-ingest from official registry once published. If not listed after 1 week, submit URL at https://www.pulsemcp.com/submit |

## Auto-Ingest (No Action Needed)

| # | Directory | Status | Notes |
|---|-----------|--------|-------|
| 8 | **Glama.ai** | `waiting` | Auto-syncs from punkpeye/awesome-mcp-servers after PR merge |
| 9 | **mcp-get.com** | `waiting` | Auto-discovers from npm once official registry publish completes |
| 10 | **wong2/awesome-mcp-servers** | `skipped` | Redirects to mcpservers.org (covered above) |

## Setup Completed

- `server.json` created and validated for official MCP registry
- `mcp-publisher` CLI installed via Homebrew
- `mcpName` field already present in `package.json`

## Eddie's Quick-Run Commands

### Official MCP Registry (highest priority)
```bash
cd ~/Projects/markuprx
mcp-publisher login github
mcp-publisher publish
```

### Smithery.ai
```bash
npx @smithery/cli auth login
npx @smithery/cli mcp publish --name markuprx
```
