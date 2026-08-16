# markuprx Launch Checklist

**Date:** 2026-02-15 | **Version:** 2.5.0

All content files are in `.plans/` and are copy-paste ready. Open the file, select all, paste into the platform.

---

## Pre-Launch (do first -- blocks everything else)

- [ ] Record demo video (90s desktop workflow: hotkey -> narrate -> markdown output -> paste into Claude Code -> agent fixes bug)
- [ ] Record MCP demo video (60s Claude Code calling `capture_screenshot` and fixing a bug)
- [ ] Create demo GIFs from both videos (800px wide, first 15s for hero GIF)
- [ ] Export 400x400 PNG logo for Cline Marketplace (from `src/renderer/assets/logo.svg`)
- [ ] Create Twitter/X header card (1200x675)
- [ ] Create `llms-install.md` in repo root (required for Cline Marketplace)
- [ ] Add demo GIF to top of README (replace placeholder)

---

## Week 1: Foundation (Feb 17-23)

### Day 1 -- npm + GitHub Optimization

- [ ] Update `package.json` description and keywords (see `.plans/distribution-3-week-plan.md`, Day 1)
- [ ] Add GitHub repository topics: `mcp`, `mcp-server`, `model-context-protocol`, `screen-recording`, `developer-tools`, `ai-agents`, `claude-code`, `cursor`, `electron`, `typescript`, `whisper`, `markdown`, `cli`, `npx`, `feedback`, `bug-reporting`
- [ ] Add `good first issue` and `help wanted` labels to 3-5 issues

### Day 2 -- MCP Directory Blitz

All submission copy is in `.plans/mcp-submissions.md`. Each directory has its own section with pre-written descriptions.

- [ ] a. mcpservers.org -- submit (`.plans/mcp-submissions.md` section a)
- [ ] b. mcp.so -- submit (`.plans/mcp-submissions.md` section b)
- [ ] c. PulseMCP -- submit (`.plans/mcp-submissions.md` section c)
- [ ] d. MCP Market -- submit (`.plans/mcp-submissions.md` section d)
- [ ] e. Cline Marketplace -- open GitHub issue (`.plans/mcp-submissions.md` section e) -- requires 400x400 logo + `llms-install.md`
- [ ] f. cursor.directory -- submit (`.plans/mcp-submissions.md` section f)
- [ ] g. Gradually.ai -- submit (`.plans/mcp-submissions.md` section g)
- [ ] h. punkpeye/awesome-mcp-servers -- open PR (`.plans/mcp-submissions.md` section h, includes PR title + description)
- [ ] i. appcypher/awesome-mcp-servers -- open PR (`.plans/mcp-submissions.md` section i, includes PR title + description)
- [ ] j. MCP Server Finder -- submit (`.plans/mcp-submissions.md` section j)
- [ ] k. Portkey -- submit (`.plans/mcp-submissions.md` section k)

### Day 3 -- Publish Blog Post (Hashnode, canonical)

- [ ] Publish blog post on Hashnode -- copy from `.plans/launch-blog-post-hashnode.md`
  - Set `saveAsDraft: false` when ready to publish
  - Replace `cover` URL with actual cover image if different
  - Replace `markuprx.hashnode.dev` with custom domain if available

### Day 4 -- Cross-Post + Social

- [ ] Cross-post blog to Dev.to -- copy from `.plans/launch-blog-post-devto.md`
  - Set `published: true` when ready
  - Add `canonical_url: [your Hashnode URL]` to frontmatter
  - Replace `cover_image` URL with actual cover image if different
- [ ] Twitter/X launch thread -- copy from `.plans/launch-content.md` section 4 (7 tweets)
  - Post between 9-11am PST
  - Attach demo GIF to tweet 3, MCP config screenshot to tweet 4
- [ ] Bluesky -- cross-post same thread content
- [ ] LinkedIn post -- copy from `.plans/launch-content.md` section 5

### Day 5 -- GitHub Awesome Lists

- [ ] PR to sindresorhus/awesome-electron
- [ ] PR to agarrharr/awesome-cli-apps
- [ ] PR to other relevant awesome-developer-tools lists
- [ ] Verify markuprx-action appears in GitHub Actions Marketplace with proper branding

---

## Week 2: Launch (Feb 24 - Mar 2)

### Day 8 (Monday) -- Hacker News

- [ ] Post Show HN -- link to GitHub repo, use title option 1 from `.plans/launch-content.md` section 1
  - Title: `Show HN: markuprx -- MCP server that lets AI coding agents see your screen`
  - Post at 8:00am PST (Tue-Thu is better, Mon acceptable)
- [ ] Post maker's first comment -- copy from `.plans/launch-content.md` section 1 "Maker's First Comment"
- [ ] Stay online 3-4 hours responding to every comment with technical depth

### Day 9 (Tuesday) -- Reddit Blitz

Space posts 2-3 hours apart. All copy is in `.plans/launch-content.md` section 3.

- [ ] r/programming -- copy from `.plans/launch-content.md` section 3 "r/programming"
- [ ] r/webdev -- copy from `.plans/launch-content.md` section 3 "r/webdev"
- [ ] r/ClaudeAI -- copy from `.plans/launch-content.md` section 3 "r/ClaudeAI"
- [ ] r/SideProject -- copy from `.plans/launch-content.md` section 3 "r/SideProject"
- [ ] r/commandline -- CLI-focused post (adapt from blog post CLI section)
- [ ] r/MachineLearning -- Whisper + MCP technical angle

### Day 10 (Wednesday) -- Product Hunt

- [ ] Create Product Hunt page the evening before (Day 9)
  - Tagline: copy from `.plans/launch-content.md` section 2 "Tagline"
  - Description: copy from `.plans/launch-content.md` section 2 "Description"
  - 5 Key Features: copy from `.plans/launch-content.md` section 2 "5 Key Features"
  - Categories: Developer Tools, Artificial Intelligence, Open Source, Productivity, Design Tools
  - Gallery: demo GIF, MCP demo, CLI output, landing page screenshot, Markdown output
- [ ] Go live at 12:01 AM PST
- [ ] Post maker's comment -- copy from `.plans/launch-content.md` section 2 "Maker's Comment"
- [ ] Share PH link on Twitter/X, Bluesky, LinkedIn at 8am PST
- [ ] Reply to every PH comment within 30 minutes all day

### Day 11 (Thursday) -- Newsletter Submissions

- [ ] TLDR Newsletter (submissions@tldr.tech) -- reference HN/PH traction
- [ ] JavaScript Weekly (javascriptweekly.com) -- npm/CLI angle
- [ ] Node Weekly (nodeweekly.com) -- CLI + MCP server angle
- [ ] Console.dev (console.dev) -- open source tool review
- [ ] Changelog (changelog.com/news/submit) -- open source + developer tooling
- [ ] Bytes.dev (bytes.dev) -- JavaScript project angle

### Day 12 (Friday) -- Launch Recap Social

- [ ] Twitter/X "How I launched markuprx" thread with real numbers (HN upvotes, PH rank, GitHub stars, npm downloads)
- [ ] Bluesky recap cross-post
- [ ] LinkedIn recap cross-post

---

## Week 3: Amplify (Mar 3-9)

### Day 15 (Monday) -- Integration Tutorials

- [ ] Write "How to Give Claude Code Eyes" tutorial on Hashnode (step-by-step MCP setup)
- [ ] Write "How to Add Visual Feedback to Your PR Pipeline" tutorial (GitHub Action guide)
- [ ] Cross-post both to Dev.to with canonical URLs

### Day 16 (Tuesday) -- YouTube

- [ ] Record full demo video (3-5 min: hook -> problem -> desktop demo -> MCP demo -> CLI demo -> install)
- [ ] Upload to YouTube with optimized title/description/tags
- [ ] Cut 3-4 YouTube Shorts (30-60s each): MCP demo, desktop app demo, CLI demo
- [ ] Upload Shorts

### Day 17 (Wednesday) -- Community Setup

- [ ] Enable GitHub Discussions (categories: General, Ideas, Show & Tell, Q&A)
- [ ] Pin "Welcome" discussion post
- [ ] Post "Contributing" guide discussion with starter tasks

### Day 18 (Thursday) -- Respond + Second Wave Social

- [ ] Respond to every unanswered HN comment, Reddit comment, PH comment, Twitter reply, and GitHub issue
- [ ] Twitter/X "Things I learned launching an open source developer tool" thread with real numbers

### Day 19 (Friday) -- Metrics Review

- [ ] Collect all metrics: GitHub stars, npm downloads, GitHub traffic, landing page analytics, social impressions, MCP directory listing status
- [ ] Plan Week 4 content based on which channels performed best

---

## Content File Quick Reference

| Content | File | Platform |
|---------|------|----------|
| Blog post (Hashnode) | `.plans/launch-blog-post-hashnode.md` | Hashnode (canonical) |
| Blog post (Dev.to) | `.plans/launch-blog-post-devto.md` | Dev.to (cross-post) |
| Blog post (source) | `.plans/launch-blog-post.md` | Reference / raw content |
| HN title + first comment | `.plans/launch-content.md` section 1 | Hacker News |
| Product Hunt copy | `.plans/launch-content.md` section 2 | Product Hunt |
| Reddit posts (4 subreddits) | `.plans/launch-content.md` section 3 | Reddit |
| Twitter/X thread (7 tweets) | `.plans/launch-content.md` section 4 | Twitter/X + Bluesky |
| LinkedIn post | `.plans/launch-content.md` section 5 | LinkedIn |
| MCP directory submissions (11) | `.plans/mcp-submissions.md` sections a-k | MCP directories |
| 3-week distribution plan | `.plans/distribution-3-week-plan.md` | Strategy reference |

---

## Success Metrics (3-Week Targets)

| Metric | Conservative | Target | Stretch |
|--------|-------------|--------|---------|
| GitHub stars | 200 | 500 | 1,500 |
| npm installs (markuprx) | 300 | 1,000 | 3,000 |
| npm installs (markuprx-mcp) | 200 | 750 | 2,000 |
| MCP directory listings confirmed | 5 | 8 | 12 |
| HN upvotes | 30 | 100 | 300 |
| Product Hunt upvotes | 50 | 200 | 500 |
| Blog post total views | 2,000 | 5,000 | 15,000 |
| YouTube video views | 200 | 1,000 | 5,000 |
| Newsletter features | 1 | 3 | 6 |
| GitHub contributors (new) | 1 | 3 | 10 |
