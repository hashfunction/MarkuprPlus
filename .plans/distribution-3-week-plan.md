# markuprx 3-Week Distribution Plan

**Author:** Eddie San Juan | **Date:** 2026-02-14
**Goal:** Maximum developer reach in 21 days on a $0 budget
**Current state:** v2.5.0 shipped (desktop + CLI + MCP + GitHub Action). Product works. Nobody knows about it.

---

## The Narrative Hook

Every channel below should hammer the same message:

> **"Your AI coding agent can't see your screen. markuprx fixes that."**

The MCP angle is the unique differentiator. Every other screen recorder produces video files. markuprx produces structured Markdown that Claude Code, Cursor, and Windsurf can consume directly -- and the MCP server lets agents capture screenshots and recordings mid-conversation. No other tool does this. Lead with the MCP story everywhere.

Secondary hook for non-MCP channels:

> **"One hotkey to start. One hotkey to stop. AI-ready Markdown with screenshots, automatically."**

---

## Pre-Launch Checklist (Do Before Week 1)

These are zero-effort prerequisites. Do them all in one sitting (2-3 hours).

### 1. Record the Demo Video (Critical Path)
- **What:** 90-second screen recording showing the full loop: hotkey -> narrate bug -> hotkey -> markdown with screenshots appears -> paste path into Claude Code -> agent fixes the bug.
- **Why:** Every channel below needs this video. It is the single highest-leverage asset. Without it, you are describing a workflow that needs to be seen.
- **Format:** Record with Screen Studio or QuickTime. No editing needed -- the raw workflow IS the demo. Export as MP4 and GIF (first 15 seconds).
- **Who:** Eddie, 30 minutes.

### 2. Record the MCP Demo (Critical Path)
- **What:** 60-second recording showing Claude Code using `capture_screenshot` to see a bug, then fixing it. Zero copy-paste. Zero manual screenshots.
- **Why:** This is the "holy shit" moment. Every developer who sees an AI agent literally look at their screen and fix a bug will want this.
- **Format:** MP4 + GIF. Can be a terminal recording (asciinema) if Claude Code's terminal output is clearer.
- **Who:** Eddie, 20 minutes.

### 3. Create a `llms-install.md` for the MCP Server
- **What:** A file in the repo root that guides AI agents through markuprx-mcp installation. Required for the Cline MCP Marketplace submission.
- **Why:** Cline's marketplace uses this file when installing MCP servers. Without it, installation may fail and your submission will be deprioritized.
- **Who:** Eddie, 15 minutes.

### 4. Prepare Social Assets
- **What:** OG image already exists. Create 3 additional assets:
  1. Twitter/X header card (1200x675) showing the workflow: Screen -> Voice -> Markdown
  2. A 400x400 PNG logo for MCP marketplace submissions
  3. The demo GIF (from step 1) cropped to 800px wide for embedding in articles
- **Who:** Eddie, 30 minutes.

---

## Week 1: Foundation (Feb 17-23)

**Theme:** Get listed everywhere developers search for tools. Optimize discoverability. Plant seeds.

### Day 1 (Monday): npm + GitHub Optimization

#### 1a. Optimize npm Package Metadata
- **Action:** Update `package.json` description and keywords. Current description is good but can be sharper. Add keywords that match how developers actually search:
  ```
  "description": "Turn screen recordings into AI-ready Markdown. MCP server for Claude Code, Cursor, Windsurf. CLI tool for headless video analysis."
  ```
  Add missing keywords: `"cli"`, `"video-analysis"`, `"bug-report"`, `"feedback"`, `"llm"`, `"markdown-generator"`, `"devtools"`, `"automation"`, `"npx"`
- **Why:** 82% of developers find npm packages through search. The description appears in search results. Keywords drive npm search ranking.
- **Who:** Eddie, 15 minutes.
- **Expected impact:** Ongoing long-tail npm discovery. Compounds over time.
- **Dependencies:** None.

#### 1b. Optimize GitHub Repository
- **Action:**
  - Add repository topics on GitHub: `mcp`, `mcp-server`, `model-context-protocol`, `screen-recording`, `developer-tools`, `ai-agents`, `claude-code`, `cursor`, `electron`, `typescript`, `whisper`, `markdown`, `cli`, `npx`, `feedback`, `bug-reporting`
  - Add the demo GIF to the top of the README (replace the "Demo video coming soon" placeholder at line 83)
  - Ensure the "About" section on GitHub has the website URL (markuprplus.com), topics, and a concise description
  - Add `good first issue` and `help wanted` labels to 3-5 existing issues (or create them)
- **Why:** GitHub topics drive discoverability in GitHub search and "Explore" recommendations. The demo GIF is the single most important README element -- it shows the product working in 5 seconds without reading a word.
- **Who:** Eddie, 30 minutes.
- **Expected impact:** 10-20% increase in organic GitHub discovery.
- **Dependencies:** Demo GIF from pre-launch.

### Day 2 (Tuesday): MCP Directory Blitz

Submit to every MCP directory in a single session. These are the primary discovery channels for developers looking for MCP servers.

#### 2a. mcpservers.org (wong2/awesome-mcp-servers)
- **Action:** Submit at https://mcpservers.org/submit. Category: "Developer Tools". Include the 6 tools, npm install command, and link to GitHub.
- **Expected impact:** This is THE canonical MCP list. Thousands of developers browse it weekly.
- **Dependencies:** None.

#### 2b. mcp.so
- **Action:** Submit via the "Submit" button on mcp.so. Provide GitHub URL, description, and tool list.
- **Expected impact:** Second-largest MCP directory.
- **Dependencies:** None.

#### 2c. PulseMCP
- **Action:** Submit at https://www.pulsemcp.com/use-cases/submit. PulseMCP has 8,000+ servers and adds metadata like popularity and security analysis.
- **Expected impact:** Growing directory with good SEO.
- **Dependencies:** None.

#### 2d. MCP Market
- **Action:** Submit GitHub repo URL at https://mcpmarket.com/submit. They review and add listings.
- **Expected impact:** Moderate -- newer directory but growing.
- **Dependencies:** None.

#### 2e. Cline MCP Marketplace
- **Action:** Open an issue at https://github.com/cline/mcp-marketplace with:
  - GitHub repo URL
  - 400x400 PNG logo
  - Ensure `llms-install.md` exists in repo root
- **Why:** Cline has millions of active users. Being in their marketplace means one-click install.
- **Expected impact:** HIGH. Direct installation path for Cline users.
- **Dependencies:** `llms-install.md` and logo from pre-launch.

#### 2f. cursor.directory
- **Action:** Submit markuprx-mcp to https://cursor.directory/mcp. 250,000+ monthly active developers browse this.
- **Expected impact:** HIGH. Cursor is the most popular AI IDE.
- **Dependencies:** None.

#### 2g. Gradually.ai
- **Action:** Submit at https://www.gradually.ai/en/mcp-servers/. Directory of 1,000+ MCP servers.
- **Expected impact:** Moderate.
- **Dependencies:** None.

#### 2h. punkpeye/awesome-mcp-servers (GitHub)
- **Action:** Open a PR adding markuprx-mcp to the appropriate category.
- **Expected impact:** Popular GitHub awesome list. PR itself gets visibility.
- **Dependencies:** None.

#### 2i. appcypher/awesome-mcp-servers (GitHub)
- **Action:** Open a PR. Different maintainer, different audience.
- **Expected impact:** Additional coverage.
- **Dependencies:** None.

#### 2j. MCP Server Finder
- **Action:** Submit at https://www.mcpserverfinder.com/
- **Expected impact:** SEO-optimized directory.
- **Dependencies:** None.

#### 2k. Portkey MCP Servers List
- **Action:** Submit at https://portkey.ai/mcp-servers
- **Expected impact:** Portkey users tend to be AI-forward developers.
- **Dependencies:** None.

**Total time for Day 2:** 2-3 hours for all submissions.
**Expected combined impact:** 50-200 npm installs/week from MCP directory traffic alone.

### Day 3 (Wednesday): Write the Launch Blog Post

#### 3a. Write the Canonical Blog Post on Hashnode
- **Action:** Write "I built an MCP server that lets Claude Code see your screen" on Hashnode (custom domain if possible, otherwise markuprx.hashnode.dev).
- **Structure:**
  1. **The problem** (2 paragraphs): AI coding agents are blind. You describe bugs in text, they hallucinate the UI. The feedback loop is broken.
  2. **The solution** (show the demo GIF): One hotkey, structured Markdown, AI reads it directly.
  3. **The MCP server** (show the MCP demo GIF): Your agent can now capture your screen mid-conversation. Show the actual Claude Code conversation.
  4. **How it works** (technical): Pipeline architecture -- Whisper transcription, timestamp correlation, ffmpeg frame extraction, Markdown generation. Developers respect technical depth.
  5. **Try it now** (3 commands): `npx markuprx analyze ./recording.mov`, MCP config JSON for Claude Code, desktop app download link.
  6. **Open source** (MIT): Link to GitHub, mention contributions welcome.
- **Tags:** `mcp`, `ai`, `developer-tools`, `open-source`, `claude`, `typescript`
- **Why Hashnode first:** You own the content, it has good SEO, and you can crosspost to Dev.to later without duplicate content penalties.
- **Who:** Eddie, 2-3 hours for a quality post.
- **Expected impact:** 1,000-5,000 views in first week (if picked up by Hashnode's feed algorithm). Serves as the canonical reference for all other distribution.
- **Dependencies:** Demo GIFs.

### Day 4 (Thursday): Cross-Post and Seed Social

#### 4a. Cross-Post to Dev.to
- **Action:** Cross-post the Hashnode article to Dev.to with canonical URL pointing to Hashnode. Use Dev.to-optimized tags: `webdev`, `ai`, `opensource`, `typescript`.
- **Expected impact:** Dev.to has higher built-in distribution than Hashnode. The algorithm surfaces new posts to relevant feeds.
- **Dependencies:** Blog post from Day 3.

#### 4b. First Twitter/X Thread
- **Action:** Post a thread (not a single tweet):
  1. "I built a tool that lets Claude Code see your screen. [MCP demo GIF]"
  2. "The problem: AI coding agents are blind. You describe a bug in 50 words. The agent hallucinates the layout."
  3. "The fix: markuprx records your screen while you narrate. When you stop, it produces structured Markdown with screenshots placed at the exact moments you were talking about them."
  4. "But the real unlock is the MCP server. Add 3 lines to your Claude Code config, and your agent can capture screenshots mid-conversation. [MCP config JSON screenshot]"
  5. "Try it: `npx markuprx analyze ./recording.mov` -- open source, MIT license. [GitHub link]"
- **Timing:** Post between 9-11am PST (peak developer Twitter activity).
- **Who:** Eddie, 30 minutes.
- **Expected impact:** 5,000-20,000 impressions if the GIF lands. Twitter threads with visual demos perform 3-5x better than text-only.
- **Dependencies:** Demo GIFs and MCP demo.

#### 4c. First Bluesky Post
- **Action:** Post the same thread on Bluesky. The developer community on Bluesky is highly active (42M+ users as of Feb 2026) and more receptive to open source tooling than Twitter/X.
- **Expected impact:** Bluesky's developer community is smaller but more engaged. Higher signal-to-noise ratio.
- **Dependencies:** Same as Twitter thread.

#### 4d. LinkedIn Post
- **Action:** Write a professional-toned post about the MCP server angle. LinkedIn is where engineering managers and DevRel people hang out. Frame it as "the developer feedback loop is broken, here's how AI agents fix it."
- **Expected impact:** Different audience -- more managers and team leads who might adopt markuprx for their team.
- **Dependencies:** Blog post link.

### Day 5 (Friday): GitHub Awesome Lists + Additional Directories

#### 5a. awesome-electron
- **Action:** Open a PR to https://github.com/sindresorhus/awesome-electron adding markuprx under "Tools" or "Productivity".
- **Expected impact:** sindresorhus awesome lists have massive reach. Even if the PR takes weeks to merge, people browsing open PRs will see it.
- **Dependencies:** None.

#### 5b. awesome-cli-apps
- **Action:** PR to https://github.com/agarrharr/awesome-cli-apps under "Developer" or "Productivity" category.
- **Expected impact:** CLI users are power users who share tools.
- **Dependencies:** None.

#### 5c. awesome-developer-tools
- **Action:** Find and PR to relevant "awesome" lists for developer tools, screen recording, and AI tools.
- **Expected impact:** Long-tail discovery. Each list adds a permanent backlink.
- **Dependencies:** None.

#### 5d. GitHub Marketplace (Action)
- **Action:** If not already listed, ensure `eddiesanjuan/markuprx-action@v1` appears in the GitHub Actions Marketplace with proper branding, description, and examples.
- **Expected impact:** GitHub Marketplace is how teams discover Actions. Organic discovery for CI/CD use case.
- **Dependencies:** None.

**End of Week 1 Expected Results:**
- Listed on 10+ MCP directories
- Blog post live on Hashnode + Dev.to
- Social presence established on Twitter/X, Bluesky, LinkedIn
- GitHub repo optimized for discovery
- npm package optimized for search
- 3-5 awesome list PRs pending
- Estimated: 50-100 GitHub stars, 100-300 npm installs

---

## Week 2: Launch (Feb 24 - Mar 2)

**Theme:** Hit every major launch channel in a coordinated 5-day window. Concentrate attention.

### Day 8 (Monday): Hacker News Show HN

#### 8a. Post Show HN
- **Action:** Post to Hacker News with title format:
  ```
  Show HN: markuprx -- MCP server that lets AI coding agents see your screen
  ```
  Link to the GitHub repo (not the website -- HN developers prefer repos). Write a top-level comment explaining:
  - What it does (2 sentences)
  - Why you built it (the feedback loop problem)
  - Technical architecture (Whisper + ffmpeg + timestamp correlation)
  - What makes it different from Loom/screenshots (structured Markdown output + MCP server)
  - How to try it (`npx markuprx analyze ./recording.mov`)
- **Timing:** Tuesday-Thursday, 8-10am PST. Monday is acceptable but Tuesday/Wednesday historically perform better. Post at exactly 8:00am PST.
- **Early engagement:** You need 8-10 genuine upvotes and 2-3 comments in the first 30 minutes to reach page 1. Before posting, alert:
  - Anyone you know who has an HN account older than 1 year
  - Any dev communities (Discord, Slack) where members naturally browse HN
  - Do NOT share the direct HN link asking for upvotes (HN's ring detection will kill the post). Instead say "I just posted markuprx on HN, check out the Show section."
- **Comment engagement:** Stay online for 3-4 hours after posting. Answer every question with technical depth. HN rewards genuine engagement. Be transparent about limitations.
- **Who:** Eddie, 3-4 hours of active engagement.
- **Expected impact:** 50-200 upvotes if it hits page 1. 500-2,000 GitHub visitors in 24 hours. 100-500 stars if the post resonates. HN is the single highest-impact launch channel for developer tools.
- **Dependencies:** Demo GIF in README, repo fully polished.

**IMPORTANT: Do NOT post HN and Product Hunt on the same day. Spread the attention.**

### Day 9 (Tuesday): Reddit Blitz

#### 9a. r/programming
- **Action:** Post with title: "Show r/programming: I built an open-source MCP server that lets AI coding agents see your screen and fix bugs"
- **Content:** Self-post with the blog article content (adapted for Reddit). Include demo GIF. Be conversational, not promotional.
- **Rules:** r/programming requires substantial content. This cannot be a link-only post. Write 3-4 paragraphs explaining the technical problem and solution.
- **Expected impact:** r/programming has 6.8M members. A well-received post can drive 10,000+ views to GitHub.
- **Dependencies:** Blog post content.

#### 9b. r/webdev
- **Action:** Post with title: "I built a tool that turns screen recordings into AI-ready Markdown with intelligent screenshots"
- **Angle:** Focus on the web development workflow -- reviewing UI bugs, responsive issues, CSS problems.
- **Expected impact:** r/webdev (3.1M members) is more receptive to tool announcements than r/programming.
- **Dependencies:** None.

#### 9c. r/MachineLearning
- **Action:** Post focused on the MCP server and Whisper integration. Title: "Open source MCP server for visual feedback -- uses local Whisper + Claude for AI-agent-consumable bug reports"
- **Angle:** Technical -- the ML pipeline (Whisper transcription, timestamp correlation, frame extraction). r/MachineLearning respects novel application of ML models.
- **Expected impact:** Smaller but highly influential audience.
- **Dependencies:** None.

#### 9d. r/SideProject
- **Action:** Post the building story -- why you built markuprx, the technical decisions, the open source journey.
- **Angle:** Indie developer building in public. r/SideProject loves personal narratives.
- **Expected impact:** Supportive community, moderate traffic but high conversion to stars.
- **Dependencies:** None.

#### 9e. r/commandline
- **Action:** Focus on the CLI tool: `npx markuprx analyze ./recording.mov`. Show the terminal output.
- **Expected impact:** CLI power users who share tools they like.
- **Dependencies:** None.

#### 9f. r/ClaudeAI and r/cursor
- **Action:** Post the MCP setup guide as a helpful tutorial, not a product announcement. "How to give Claude Code the ability to see your screen using MCP" with step-by-step config.
- **Angle:** Genuinely helpful content that happens to feature markuprx.
- **Expected impact:** Highly targeted audience already using the tools markuprx integrates with.
- **Dependencies:** None.

**Reddit posting rules:**
- Space posts 2-3 hours apart (do NOT post to all subreddits simultaneously)
- Each post must be tailored to the subreddit's culture and rules
- Be active in comments for 2-3 hours after each post
- Never be defensive about criticism -- thank people and take notes
- If a post gets removed, do not repost. Move on.

**Total time for Day 9:** Full day of posting and engaging.

### Day 10 (Wednesday): Product Hunt Launch

#### 10a. Product Hunt Submission
- **Preparation (do this Day 9 evening):**
  - Create the Product Hunt page: https://www.producthunt.com/products/new
  - Tagline: "Your AI coding agent can finally see your screen" (under 60 characters)
  - Description: The problem -> solution -> try it now flow from the blog post
  - Gallery: 4-5 images/GIFs:
    1. Hero: The demo GIF showing full workflow
    2. MCP server in action with Claude Code
    3. CLI output showing structured Markdown
    4. The landing page (markuprplus.com) screenshot
    5. The annotated Markdown output with screenshots
  - First comment: Write a maker's comment explaining why you built this and asking for feedback
  - Topics: Developer Tools, Artificial Intelligence, Open Source, Productivity
- **Launch timing:** Go live at 12:01 AM PST (Wednesday). This maximizes your time on the front page.
- **Day of launch:**
  - Post the PH link on Twitter/X, Bluesky, LinkedIn at 8am PST
  - Reply to every comment on PH within 30 minutes
  - Do NOT ask for upvotes directly (PH penalizes this). Instead say "we launched on Product Hunt today" with the link
- **Day selection rationale:** Wednesday has high traffic but slightly less competition than Tuesday. Avoid Monday (post-weekend catchup) and Friday (weekend dropoff).
- **Who:** Eddie, available all day.
- **Expected impact:** Top 10 finish = 200-500 upvotes = 2,000-5,000 visitors. Product of the Day = 500-1,000 upvotes = 5,000-10,000 visitors. Even a moderate showing (100 upvotes) drives lasting traffic from PH's SEO.
- **Dependencies:** All assets from pre-launch. Polished landing page.

### Day 11 (Thursday): Newsletter Submissions

#### 11a. TLDR Newsletter
- **Action:** Email submissions@tldr.tech with:
  - Subject: "Open source MCP server that lets AI coding agents see your screen"
  - Body: 2-paragraph pitch + GitHub link + demo GIF (attached or linked)
  - Reference any HN/PH traction from earlier in the week
- **Expected impact:** TLDR has 1.25M+ readers. A feature drives thousands of GitHub visitors.
- **Dependencies:** Traction from HN/PH to reference.

#### 11b. JavaScript Weekly (Cooperpress)
- **Action:** Submit via the contact form on https://javascriptweekly.com/ or email the editor directly. markuprx is a TypeScript/Node.js tool with Electron -- it fits squarely in JS Weekly's editorial focus.
- **Pitch angle:** "New open-source CLI tool: npx markuprx analyze ./recording.mov -- turns screen recordings into Markdown with Whisper transcription. Ships as npm package with MCP server."
- **Expected impact:** JS Weekly reaches 200,000+ developers. A feature is worth 500-2,000 GitHub visitors.
- **Dependencies:** Published npm package + blog post.

#### 11c. Node Weekly (Cooperpress)
- **Action:** Submit separately to https://nodeweekly.com/. Different newsletter, same publisher.
- **Pitch angle:** Focus on the CLI and MCP server (both Node.js tools). The ffmpeg + Whisper pipeline running in Node.
- **Expected impact:** Overlapping but distinct audience from JS Weekly.
- **Dependencies:** Same as above.

#### 11d. Console.dev
- **Action:** Submit to https://console.dev/. Console reviews open source dev tools weekly. They do deep-dive reviews.
- **Pitch angle:** markuprx as a novel open source tool in the MCP ecosystem.
- **Expected impact:** Smaller but highly engaged audience. A Console.dev review is a quality signal.
- **Dependencies:** None.

#### 11e. Changelog
- **Action:** Submit to https://changelog.com/news/submit. The Changelog covers open source and developer tooling.
- **Pitch angle:** The AI-native developer feedback workflow.
- **Expected impact:** Changelog has a loyal developer audience.
- **Dependencies:** None.

#### 11f. Bytes.dev
- **Action:** Submit to https://bytes.dev/ (JavaScript newsletter with personality). They feature interesting JS projects.
- **Expected impact:** Popular newsletter with engaged audience.
- **Dependencies:** None.

### Day 12 (Friday): Twitter Thread + Recap

#### 12a. "How I launched markuprx" Thread
- **Action:** Post a thread documenting the launch week:
  - Day 1: HN stats (upvotes, comments, traffic)
  - Day 2: Reddit reception
  - Day 3: Product Hunt results
  - Share actual numbers -- transparency builds trust
  - What worked, what didn't
  - Tag relevant people who engaged
- **Why:** Building in public threads perform extremely well on Twitter/X. Developers love seeing real launch data.
- **Expected impact:** Often outperforms the original launch thread.
- **Dependencies:** Actual launch data from the week.

#### 12b. Bluesky + LinkedIn Recap
- **Action:** Cross-post the recap content to Bluesky and LinkedIn.
- **Expected impact:** Reaches audiences who missed the original launch.
- **Dependencies:** Same as above.

**End of Week 2 Expected Results:**
- HN Show HN post (50-200+ upvotes if it lands)
- Product Hunt launch (100-500+ upvotes)
- Reddit posts across 6+ subreddits
- Newsletter submissions to 6+ publications
- Building-in-public social content
- Estimated cumulative: 200-1,000 GitHub stars, 500-2,000 npm installs

---

## Week 3: Amplify (Mar 3-9)

**Theme:** Compound the momentum. Deepen content. Build community. Set up recurring growth.

### Day 15 (Monday): Integration Tutorials

#### 15a. "How to Give Claude Code Eyes" Tutorial
- **Action:** Write a focused tutorial on Hashnode: "How to Set Up markuprx MCP Server with Claude Code in 2 Minutes." Step-by-step with screenshots of `~/.claude/settings.json`, the MCP server output, and a real bug-fix conversation.
- **Why:** Search-optimized content. Developers search "Claude Code MCP setup" and find this. Evergreen traffic.
- **Expected impact:** Long-tail SEO. 100-500 monthly views ongoing.
- **Dependencies:** None.

#### 15b. "How to Add Visual Feedback to Your PR Pipeline" Tutorial
- **Action:** Write a tutorial on using `eddiesanjuan/markuprx-action@v1` in GitHub Actions. Show real PR with visual feedback comments.
- **Why:** GitHub Actions usage drives recurring impressions.
- **Expected impact:** CI/CD audience is a distinct segment. Every team that adopts the Action becomes a distribution channel (their PRs show markuprx output).
- **Dependencies:** None.

#### 15c. Cross-post Both to Dev.to
- **Action:** Cross-post with canonical URLs.
- **Expected impact:** Dev.to surfaces tutorials well.
- **Dependencies:** Tutorials from 15a and 15b.

### Day 16 (Tuesday): YouTube Demo Video

#### 16a. Full Demo Video (3-5 minutes)
- **Action:** Record and upload a YouTube video titled "markuprx: Give Your AI Coding Agent the Ability to See Your Screen"
- **Structure:**
  1. 0:00-0:15 -- Hook: "What if Claude Code could see your screen?"
  2. 0:15-1:00 -- The problem (show the painful workflow of describing a bug in text)
  3. 1:00-2:30 -- The desktop app demo (full loop: hotkey -> narrate -> markdown)
  4. 2:30-3:30 -- The MCP server demo (Claude Code captures screenshot -> fixes bug)
  5. 3:30-4:00 -- The CLI demo (`npx markuprx analyze`)
  6. 4:00-4:30 -- How to install (3 methods) + GitHub link
- **Optimization:** Title, description, and tags optimized for "MCP server", "Claude Code", "AI coding agent", "developer tools", "screen recording developer"
- **Thumbnail:** Split screen -- left side is a bug on screen, right side is structured Markdown with screenshots
- **Who:** Eddie, 2-3 hours (record, light edit, upload).
- **Expected impact:** YouTube is a long-tail engine. 500-5,000 views in the first month. The video becomes the canonical demo that can be embedded everywhere.
- **Dependencies:** None.

#### 16b. YouTube Shorts / Clips (3-4 clips)
- **Action:** Cut the full demo into 30-60 second Shorts:
  1. "Claude Code can see your screen now" (MCP demo)
  2. "One hotkey to structured Markdown" (desktop app demo)
  3. "npx markuprx analyze in 30 seconds" (CLI demo)
- **Why:** YouTube Shorts hit 90 billion daily views. Shorts -> discovery -> long-form video -> GitHub.
- **Expected impact:** Shorts are unpredictable but have massive upside. One viral Short = 10,000+ views.
- **Dependencies:** Full demo video.

### Day 17 (Wednesday): Community Setup

#### 17a. Enable GitHub Discussions
- **Action:** Enable GitHub Discussions on the repo. Create categories: General, Ideas, Show & Tell, Q&A.
- **Why:** GitHub Discussions is where your technical community already lives (they found you on GitHub). No need to fragment attention to Discord/Slack yet. Keep everything in the repo.
- **Rationale for NOT creating a Discord:** You are one person. A dead Discord is worse than no Discord. GitHub Discussions scales with async contributions. Revisit Discord at 500+ stars when there's actual community activity to moderate.
- **Who:** Eddie, 10 minutes.
- **Expected impact:** Reduces friction for feedback. Contributors feel heard.
- **Dependencies:** None.

#### 17b. Create a "Welcome" Discussion Post
- **Action:** Pin a discussion: "Welcome to markuprx! What are you building with it?" Ask people to share their use cases, what IDE they use markuprx with, and what features they want.
- **Why:** Seeding initial engagement. Gives social proof to future visitors.
- **Who:** Eddie, 15 minutes.
- **Dependencies:** Discussions enabled.

#### 17c. Create a "Contributing" Guide Discussion
- **Action:** Post a discussion linking to CONTRIBUTING.md with 3-5 specific starter tasks. Tag issues with `good first issue`.
- **Why:** Contributors become evangelists. Every PR author tells their network about the project.
- **Expected impact:** 2-5 contributors in the first month.
- **Dependencies:** None.

### Day 18 (Thursday): Respond to Everything + Second Wave Social

#### 18a. Respond to All Feedback
- **Action:** Go through every HN comment, Reddit comment, Product Hunt comment, Twitter reply, and GitHub issue from the past 2 weeks. Respond to every single one that hasn't been answered. Thank people. Address feature requests. Fix bugs that were reported.
- **Why:** Responsiveness is the #1 signal for open source project health. People check if the maintainer is active before starring. One thoughtful response can convert a casual visitor into a contributor.
- **Who:** Eddie, 2-3 hours.
- **Expected impact:** Retention and word-of-mouth. People who get a personal response share the tool.
- **Dependencies:** Previous launch activity.

#### 18b. Second Twitter/X Thread
- **Action:** Post a "Things I learned launching an open source developer tool" thread with real numbers:
  - GitHub stars gained
  - npm downloads
  - Which channels drove the most traffic
  - The comments that surprised you
  - What you'd do differently
- **Why:** "Building in public" threads have their own distribution loop. Indie hackers, DevRel people, and OSS maintainers amplify these.
- **Expected impact:** 5,000-15,000 impressions.
- **Dependencies:** Real data from Weeks 1-2.

### Day 19 (Friday): Metrics Review + Week 4 Planning

#### 19a. Collect and Analyze Metrics
- **Action:** Document all metrics in a spreadsheet:
  - GitHub stars (total + per day)
  - npm downloads (total + per day, broken down by markuprx and markuprx-mcp)
  - GitHub traffic (visitors, clones, referring sites)
  - Landing page traffic (markuprplus.com analytics)
  - Newsletter feature confirmations
  - Social media impressions + engagement
  - MCP directory listing status (approved/pending)
- **Why:** Data tells you which channels to double down on in Week 4+.
- **Who:** Eddie, 1 hour.
- **Dependencies:** Access to GitHub Insights, npm stats, analytics.

#### 19b. Plan Week 4 Content
- **Action:** Based on metrics, plan the next week:
  - If HN was the top channel: write a technical deep-dive post for HN (not Show HN, a standalone article about timestamp-correlated frame extraction)
  - If Reddit was top: write more subreddit-specific content
  - If MCP directories drove the most installs: create more MCP-specific tutorials
  - If Twitter/Bluesky had the most engagement: increase posting frequency
- **Who:** Eddie, 30 minutes.
- **Dependencies:** Metrics from 19a.

**End of Week 3 Expected Results:**
- YouTube demo video live (long-form + 3-4 Shorts)
- 2 additional technical tutorials published
- GitHub Discussions active
- All feedback responded to
- Metrics documented
- Estimated cumulative: 300-2,000 GitHub stars, 1,000-5,000 npm installs

---

## Full Channel Summary

| Channel | Timing | Expected Impact | Effort | Priority |
|---------|--------|----------------|--------|----------|
| MCP Directories (10+ sites) | Week 1, Day 2 | 50-200 installs/week ongoing | 3 hours one-time | CRITICAL |
| GitHub repo optimization | Week 1, Day 1 | 10-20% discovery uplift | 30 min one-time | HIGH |
| npm metadata optimization | Week 1, Day 1 | Long-tail search discovery | 15 min one-time | HIGH |
| Hashnode blog post | Week 1, Day 3 | 1,000-5,000 views | 3 hours | HIGH |
| Dev.to cross-post | Week 1, Day 4 | 500-2,000 views | 15 min | HIGH |
| Twitter/X threads (3) | Weeks 1-3 | 15,000-50,000 impressions total | 2 hours total | HIGH |
| Bluesky posts (3) | Weeks 1-3 | 2,000-10,000 impressions | 1 hour total | MEDIUM |
| Hacker News Show HN | Week 2, Day 8 | 500-2,000 GitHub visitors | 4 hours (day of) | CRITICAL |
| Reddit (6 subreddits) | Week 2, Day 9 | 2,000-10,000 views total | Full day | HIGH |
| Product Hunt | Week 2, Day 10 | 2,000-10,000 visitors | Full day | HIGH |
| Newsletter submissions (6) | Week 2, Day 11 | 1,000-5,000 visitors if featured | 2 hours | HIGH |
| YouTube demo video | Week 3, Day 16 | 500-5,000 views in month 1 | 3 hours | MEDIUM |
| YouTube Shorts (3-4) | Week 3, Day 16 | Unpredictable, high ceiling | 1 hour | MEDIUM |
| Integration tutorials (2) | Week 3, Day 15 | 100-500 monthly views (SEO) | 3 hours | MEDIUM |
| GitHub Discussions | Week 3, Day 17 | Community retention | 30 min | MEDIUM |
| Awesome lists (3-5 PRs) | Week 1, Day 5 | Long-tail backlinks | 1 hour | MEDIUM |
| LinkedIn posts (3) | Weeks 1-3 | Engineering manager audience | 1 hour total | LOW |

---

## What NOT to Do

1. **Do not pay for ads.** $0 budget means organic only, and organic is more authentic for dev tools anyway.
2. **Do not create a Discord server yet.** A dead Discord hurts more than no Discord. Wait until there are 500+ stars and people asking for a community space.
3. **Do not post to all Reddit subreddits simultaneously.** Space them out. Moderators notice cross-posting and will remove your posts.
4. **Do not ask for upvotes on HN or PH.** Both platforms detect and penalize vote manipulation. Ask people to "check out Show HN" or "we launched on PH today."
5. **Do not write generic "I built a screen recorder" content.** The MCP server angle is the unique hook. Every piece of content should lead with "AI agents can now see your screen."
6. **Do not neglect comment replies.** A launch with zero maintainer engagement in comments is a wasted launch.
7. **Do not launch HN and PH on the same day.** Spread the attention across separate days.
8. **Do not over-optimize the README for SEO at the expense of readability.** The README is for developers, not search engines. The demo GIF does more work than any keyword.

---

## Dependency Chain

```
Demo GIF (pre-launch)
  ├── README update (Day 1)
  ├── Blog post (Day 3)
  │     ├── Dev.to cross-post (Day 4)
  │     ├── Twitter thread (Day 4)
  │     └── Newsletter submissions (Day 11)
  ├── HN Show HN (Day 8)
  ├── Reddit posts (Day 9)
  └── Product Hunt (Day 10)

MCP Demo GIF (pre-launch)
  ├── Blog post (Day 3)
  ├── MCP directory submissions (Day 2)
  └── YouTube demo (Day 16)

llms-install.md (pre-launch)
  └── Cline Marketplace submission (Day 2)

400x400 logo (pre-launch)
  └── Cline Marketplace submission (Day 2)
```

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

---

## Eddie's Daily Time Commitment

| Week | Avg Hours/Day | Peak Day |
|------|--------------|----------|
| Week 1 | 3-4 hours | Day 3 (blog post): 4-5 hours |
| Week 2 | 5-6 hours | Day 8 (HN) or Day 10 (PH): 8+ hours |
| Week 3 | 2-3 hours | Day 16 (YouTube): 4-5 hours |

**Total estimated time:** 65-85 hours over 3 weeks. This is essentially a half-time job for 3 weeks alongside normal development.

---

## After Week 3: Sustaining Growth

The 3-week blitz creates initial momentum. To sustain it:

1. **Weekly Twitter/Bluesky post** showing a new feature, fix, or user story (30 min/week)
2. **Monthly blog post** on a technical topic related to markuprx (3 hours/month)
3. **Respond to every GitHub issue within 24 hours** (15 min/day)
4. **Track which MCP directories drive the most traffic** and optimize those listings
5. **When a newsletter features markuprx, thank them publicly** (builds relationship for future features)
6. **Ship markuprx Pro** (from the Product Roadmap) -- paid users become the most vocal evangelists because they have skin in the game
7. **Re-launch on Product Hunt** when v3.0 ships (6-month minimum gap between PH launches)

The first 3 weeks build the foundation. The next 3 months compound it.
