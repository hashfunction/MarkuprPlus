# markuprx Launch Status

**Date:** 2026-02-15
**Version:** 2.6.1 (npm) / 2.6.0 (desktop release)
**Local package.json:** 2.6.1

---

## What's Done

### Code and Build
- All 1,175 tests passing across 59 test files
- TypeScript compiles cleanly (zero errors)
- Desktop app built and released for macOS (arm64 + x64 DMG) and Windows (EXE)
- CLI published to npm as `markuprx@2.6.1`
- MCP server ships as part of `markuprx` npm package (run via `npx markuprx-mcp`)
- `markuprx-mcp` is NOT published as a separate npm package (MCP is accessed via `npx markuprx-mcp` from the main package)

### GitHub Release (v2.6.0)
- Release workflow completed successfully
- All desktop artifacts uploaded:
  - `markuprx-2.6.0-arm64.dmg` (macOS Apple Silicon)
  - `markuprx-2.6.0-x64.dmg` (macOS Intel)
  - `markuprx-Setup-2.6.0.exe` (Windows)
  - `markuprx-2.6.0-arm64-mac.zip`, `markuprx-2.6.0-mac.zip` (auto-updater zips)
  - `latest-mac.yml`, `latest.yml` (auto-updater manifests)
  - SHA256 checksums included in release notes

### GitHub Repo
- Branch: `main` is clean and up to date with `origin/main`
- Open PRs: zero
- Open issues: zero
- GitHub Topics set (20 topics including mcp, mcp-server, model-context-protocol, developer-tools, ai-agents, cli, electron, typescript, whisper, etc.)
- `llms-install.md` committed to repo root (required for Cline Marketplace submission)
- GitHub Discussions: not yet enabled

### CI/CD
- CI workflow: passing (latest run successful)
- Release workflow: completed successfully for v2.6.0
- All workflows healthy: CI, Release, Deploy Landing Page, Nightly, Test Action

### npm
- `markuprx@2.6.1` published and live on npm registry
- `markuprx-mcp` is NOT a separate package (confirmed: returns 404 on npm)
- Package includes CLI (`npx markuprx analyze`) and MCP server (`npx markuprx-mcp`)

### Launch Content Prepared
- All 7 content files committed to `.plans/` directory
- Blog posts ready for Hashnode and Dev.to (with frontmatter, copy-paste ready)
- MCP directory submissions written for 11 directories
- Social media content written for Twitter/X, Reddit, LinkedIn, Product Hunt, Hacker News
- Full 3-week distribution plan with daily breakdown
- Launch checklist with ordered tasks and dependencies

---

## What Eddie Needs To Do Today

### Blocking (do first -- everything else depends on these)
- [ ] Record 90s desktop workflow demo video (hotkey -> narrate -> markdown -> paste into Claude Code -> agent fixes bug)
- [ ] Record 60s MCP + Claude Code demo video (Claude Code calling `capture_screenshot` and fixing a bug)
- [ ] Create GIFs from demo videos (800px wide, first 15s for hero GIF)
- [ ] Export 400x400 PNG logo for Cline Marketplace (from `src/renderer/assets/logo.svg`)
- [ ] Add demo GIF to top of README (replace placeholder)

### Publishing (can start after demos are done)
- [ ] Publish blog post on Hashnode (copy from `.plans/launch-blog-post-hashnode.md`)
- [ ] Cross-post to Dev.to (copy from `.plans/launch-blog-post-devto.md`, add `canonical_url` pointing to Hashnode post)
- [ ] Submit to MCP directories (follow `.plans/mcp-submissions.md` -- 11 directories, sections a-k)
- [ ] Post first social content -- Twitter/X launch thread (follow `.plans/launch-content.md` section 4)

### Optional Today
- [ ] Create Twitter/X header card (1200x675)
- [ ] Enable GitHub Discussions (categories: General, Ideas, Show & Tell, Q&A)

---

## Content Files Reference

| File | Purpose | Platform | Status |
|------|---------|----------|--------|
| `.plans/distribution-3-week-plan.md` | Full 3-week launch strategy with daily tasks | Strategy reference | Committed |
| `.plans/launch-blog-post.md` | Source blog post (raw content) | Reference | Committed |
| `.plans/launch-blog-post-hashnode.md` | Blog post with Hashnode frontmatter | Hashnode (canonical) | Committed |
| `.plans/launch-blog-post-devto.md` | Blog post with Dev.to frontmatter | Dev.to (cross-post) | Committed |
| `.plans/launch-content.md` | Social copy: HN, Product Hunt, Reddit (4 subs), Twitter/X (7 tweets), LinkedIn | Multiple platforms | Committed |
| `.plans/mcp-submissions.md` | Pre-written submissions for 11 MCP directories | MCP directories | Committed |
| `.plans/LAUNCH-CHECKLIST.md` | Ordered launch checklist with all tasks and dependencies | Task tracking | Committed |
| `.plans/LAUNCH-STATUS.md` | This file -- overall launch status for agent handoff | Status reference | Committed |
| `llms-install.md` | Cline Marketplace installation guide | Cline Marketplace | Committed (repo root) |

---

## Repo Health

| Check | Status |
|-------|--------|
| Tests | 1,175 passing (59 files) |
| TypeScript | Clean (zero errors) |
| npm `markuprx` | 2.6.1 published |
| npm `markuprx-mcp` | Not a separate package (ships with `markuprx`) |
| GitHub Release v2.6.0 | Published with all artifacts (DMG x2, EXE, ZIPs, auto-updater manifests) |
| CI workflow | Passing |
| Release workflow | Completed successfully |
| Open PRs | 0 |
| Open issues | 0 |
| Git status | Clean (all files committed and pushed) |
| GitHub Topics | 20 topics set |
| Branch protection | main branch |

---

## Week 1 Schedule (Feb 17-23)

Refer to `.plans/LAUNCH-CHECKLIST.md` for the full ordered checklist. Summary:

| Day | Focus | Key Actions |
|-----|-------|-------------|
| Day 1 (Mon) | npm + GitHub optimization | Add `good first issue` labels, verify topics |
| Day 2 (Tue) | MCP Directory Blitz | Submit to all 11 MCP directories |
| Day 3 (Wed) | Blog post | Publish on Hashnode |
| Day 4 (Thu) | Cross-post + Social | Dev.to cross-post, Twitter/X thread, LinkedIn |
| Day 5 (Fri) | Awesome Lists | PRs to awesome-electron, awesome-cli-apps |

## Week 2 Schedule (Feb 24 - Mar 2)

| Day | Focus | Key Actions |
|-----|-------|-------------|
| Day 8 (Mon) | Hacker News | Show HN post at 8am PST |
| Day 9 (Tue) | Reddit Blitz | 6 subreddits, spaced 2-3 hours apart |
| Day 10 (Wed) | Product Hunt | Launch at 12:01 AM PST |
| Day 11 (Thu) | Newsletter submissions | TLDR, JS Weekly, Node Weekly, Console.dev, Changelog, Bytes.dev |
| Day 12 (Fri) | Launch recap | Social threads with real numbers |

---

## Notes for Agents

- The `.plans/` files are copy-paste ready. Open the file, select the relevant section, paste into the platform.
- Blog post frontmatter is included -- just paste the whole file into Hashnode/Dev.to editor.
- MCP submissions each have their own section (a through k) with pre-written descriptions tailored to each directory's format.
- The launch-content.md file is organized by platform with section numbers (1=HN, 2=PH, 3=Reddit, 4=Twitter, 5=LinkedIn).
- `markuprx-mcp` does NOT exist as a separate npm package. The MCP server is accessed via `npx markuprx-mcp` which is a bin entry in the main `markuprx` package.
