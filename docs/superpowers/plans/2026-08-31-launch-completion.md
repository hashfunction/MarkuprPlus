# MarkuprPlus and OriginPlayer Launch Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining directory, release, outreach, OriginPlayer rendering, store, pricing, and delayed acquisition work from the launch brief.

**Architecture:** Execute five tracks behind explicit proof gates: distribution listings, MarkuprPlus release, MarkuprPlus outreach, OriginPlayer release/rendering, and delayed OriginPlayer acquisition. Account-gated browser steps keep secrets human-entered; code changes use isolated worktrees and TDD; public state is verified downstream.

**Tech Stack:** GitHub CLI and Actions, npm, MCP Registry publisher, Next.js 15, Docker Compose/Traefik over `ssh harmony`, App Store Connect, Google Play Console, public submission UIs, and browser automation.

**Spec:** `docs/superpowers/specs/2026-08-31-launch-completion-design.md`

## Global Constraints

- Preserve the existing uncommitted `harmony/android/app/src/main/kotlin/com/originplayer/android/MainActivity.kt` change.
- Never store credentials, passwords, one-time codes, or CAPTCHA answers in repository files or chat.
- Show HN runs Tuesday through Thursday, 8–10 a.m. Eastern, only after promo codes exist.
- Reddit communities receive distinct posts on different days.
- OriginPlayer Search Ads wait three to five weeks after 1.0.8 and stay within the $100 credit and supplied CPT ceilings.
- Public claims require fresh downstream verification.

---

### Task 1: Publish MCP directory listings

**Files:**
- Read: `server.json`
- Read: `package.json`

**Interfaces:**
- Consumes: public `markuprplus@3.1.2`, MCP name `io.github.hashfunction/markuprplus`, and `https://github.com/hashfunction/MarkuprPlus`.
- Produces: accepted Glama, Smithery, awesome-mcp-servers, and PulseMCP submission evidence.

- [ ] **Step 1: Verify public package and registry identity**

Run:

```bash
npm view markuprplus@3.1.2 name version mcpName --json --prefer-online
curl -fsS 'https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.hashfunction%2Fmarkuprplus&limit=10' | jq .
```

Expected: package and registry both report `io.github.hashfunction/markuprplus` version `3.1.2`.

- [ ] **Step 2: Claim Glama**

Open Glama's Add Server flow, submit the GitHub repository, complete GitHub ownership verification, and capture the resulting public listing URL.

- [ ] **Step 3: Publish to Smithery**

Use the current official Smithery CLI or submission UI discovered from Smithery's own documentation. Submit namespace `hashfunction/markuprplus`, verify its install command points at `markuprplus@3.1.2`, and capture the listing URL.

- [ ] **Step 4: Submit awesome-mcp-servers PR**

Fork `punkpeye/awesome-mcp-servers`, add MarkuprPlus in the repository's current format, run its documented checks, push the branch, and open a PR explaining that MarkuprPlus adds structured screen/voice bug reports with one annotated image per finding.

- [ ] **Step 5: Check PulseMCP**

Open the official submission page. Submit the MCP Registry/GitHub entry if enabled; otherwise record the official paused state and follow-up route.

### Task 2: Ship MarkuprPlus 3.1.2 desktop artifacts

**Files:**
- Read: `.github/workflows/release.yml`
- Read: `package.json`
- Read: `electron-builder.yml`

**Interfaces:**
- Consumes: verified commit `4c9dd4d`, package version `3.1.2`, and configured GitHub signing/notarization secrets.
- Produces: immutable tag `v3.1.2`, public GitHub Release, signed Windows assets, and notarized/stapled universal macOS assets.

- [ ] **Step 1: Re-run release preflight**

Run:

```bash
git show --no-patch --oneline 4c9dd4d
git show 4c9dd4d:package.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{if(JSON.parse(s).version!=='3.1.2')process.exit(1)})"
gh secret list --repo hashfunction/MarkuprPlus
```

Expected: the release commit is version 3.1.2 and Apple signing/notarization secrets are present.

- [ ] **Step 2: Create and push the release tag**

Run:

```bash
git tag -a v3.1.2 4c9dd4d -m 'MarkuprPlus v3.1.2'
git push origin v3.1.2
```

Expected: GitHub starts the `Release` workflow for `v3.1.2`.

- [ ] **Step 3: Monitor the release workflow**

Run `gh run watch <run-id> --repo hashfunction/MarkuprPlus --exit-status`. If a job fails, use `superpowers:systematic-debugging`, fix the root cause on a new patch version instead of moving the immutable tag, and verify again.

- [ ] **Step 4: Verify public assets**

Download the published macOS DMG and Windows installers into a temporary directory. Validate macOS staples, deep/strict code signing, Gatekeeper acceptance, architecture coverage, expected version, and release checksums before treating 3.1.2 as launched.

### Task 3: Complete MarkuprPlus App Store and Setapp state

**Files:**
- Read: `app-store/metadata/en-US.md`
- Read: `app-store/review-notes.md`
- Read: `app-store/screenshots/2880x1800/*.png`
- Read: `.github/workflows/app-store-upload.yml`

**Interfaces:**
- Consumes: signed 3.1.2 Store package, five prepared screenshots, first-party support URL, and notarized universal release proof.
- Produces: App Store Connect build/draft state, up to ten truthful screenshots, promo codes, and a Setapp application receipt.

- [ ] **Step 1: Audit Store package prerequisites**

Check local signing identities and provisioning profiles without exposing secrets. Locate or build exactly one signed universal `.pkg`; verify its SHA-256 and `3rd Party Mac Developer Installer` signature.

- [ ] **Step 2: Upload the Store package**

Dispatch `App Store Upload` with the package's draft release tag and SHA-256. Watch the run to completion and confirm build 3.1.2 appears in App Store Connect.

- [ ] **Step 3: Update listing assets**

Upload the five prepared 2880×1800 screenshots. Fill additional slots only from verified product screens and use full-sentence keyword captions. Do not create an app preview from fake UI or still-image animation.

- [ ] **Step 4: Generate promo codes**

Generate App Store promo codes for the current approved or review-ready build and save only the inventory count and redemption instructions; individual codes stay out of git and public logs.

- [ ] **Step 5: Submit Setapp application**

Use the notarized universal build, product/support URLs, MIT repository, privacy explanation, and current pricing. Capture the submission confirmation.

### Task 4: Verify and fix OriginPlayer crawler rendering

**Files:**
- Modify if needed: `harmony/frontend/src/app/robots.ts`
- Modify if needed: `harmony/frontend/src/app/sitemap.ts`
- Modify if needed: `harmony/frontend/src/app/page.tsx`
- Test: `harmony/frontend/tests/seo.spec.ts`
- Modify if needed: `harmony/compose.production.yml`

**Interfaces:**
- Consumes: production `https://www.originplayer.com`, Next.js 15 standalone server, and current Traefik routing.
- Produces: useful raw HTML, 200 responses for robots/sitemap, passing JavaScript-disabled browser checks, and a deployed healthy container.

- [ ] **Step 1: Reproduce the crawler symptom**

Run raw `curl` requests for `/`, `/robots.txt`, and `/sitemap.xml`; inspect status, title, H1, body text, canonical URL, and content type. Repeat with JavaScript disabled in the browser.

- [ ] **Step 2: Write the failing test**

Add a Playwright or Node integration assertion for whichever observable production behavior is missing. Run only that test and confirm it fails for the reproduced reason.

- [ ] **Step 3: Implement the minimum Next.js-native fix**

Add metadata routes or server-rendered page content only where the failing test proves it is absent. Avoid replacing the existing Next.js runtime with a separate prerender system.

- [ ] **Step 4: Verify locally**

Run frontend lint, typecheck, build, relevant Playwright tests, and the JavaScript-disabled crawler test.

- [ ] **Step 5: Commit without touching user work**

Stage only crawler-related files. Confirm `MainActivity.kt` is absent from the staged diff before committing.

- [ ] **Step 6: Deploy through harmony**

Push the verified commit, back up production configuration/artifacts, fast-forward `/home/ubuntu/workspace/harmony`, rebuild only affected services with `compose.production.yml`, and verify container health plus raw public responses. Roll back on failure.

### Task 5: Reconcile and ship OriginPlayer 1.0.8

**Files:**
- Modify: `harmony/android/app/build.gradle.kts`
- Modify: `harmony/ios/project.yml`
- Modify generated Xcode project only through the repository's documented generator.
- Modify: `harmony/release/catalog.json`
- Modify: `harmony/docs/release/*` only where the release contract requires evidence.

**Interfaces:**
- Consumes: current App Store/Play Console version/build state and signed release workflows.
- Produces: coherent 1.0.8 source version, signed iOS/Android artifacts, console delivery evidence, and truthful screenshots.

- [ ] **Step 1: Read console state before editing versions**

Use App Store Connect and Google Play Console to record the highest uploaded build/version codes and current draft/review states. Select the next valid build numbers while keeping marketing version 1.0.8.

- [ ] **Step 2: Write version-contract tests**

Update release catalog tests first so they fail while committed Android/iOS versions disagree with 1.0.8.

- [ ] **Step 3: Update version sources minimally**

Change Android and iOS version sources plus the release catalog, regenerate project files through documented tooling, and keep `MainActivity.kt` unstaged.

- [ ] **Step 4: Verify signed artifacts**

Run repository release verification scripts for Android AAB and iOS archive/export. Confirm production API URL, upload certificates, architectures, bundle IDs, and embedded versions.

- [ ] **Step 5: Upload and verify console state**

Dispatch or run the documented iOS/Android release pipelines, verify 1.0.8 appears in each console, attach release notes/screenshots, and record review state.

### Task 6: Research OriginPlayer Pro pricing

**Files:**
- Create: `harmony/docs/release/2026-08-31-pro-pricing-review.md`

**Interfaces:**
- Consumes: first-party current prices/features for Doppler, Evermusic, and iBroadcast plus OriginPlayer's $11.99/month tier.
- Produces: cited recommendation before Search Ads.

- [ ] **Step 1: Capture primary-source prices and plan scope**

Record current monthly/annual/lifetime prices and storage, platform, sync, and offline-playback limits from each vendor's own website or store listing.

- [ ] **Step 2: Write the recommendation**

Compare equivalent value, identify whether $11.99 suppresses conversion, and recommend keep/lower/repackage without changing live subscriptions automatically.

- [ ] **Step 3: Commit the cited review**

Run a link check, stage only the pricing review, and commit it independently.

### Task 7: Execute MarkuprPlus community launch

**Files:**
- No repository mutation required.

**Interfaces:**
- Consumes: public 3.1.2 release, MCP listings, promo-code inventory, supplied Show HN copy, and community-specific framing.
- Produces: public post/comment URLs and scheduled distinct Reddit posts.

- [ ] **Step 1: Reply to the existing r/ClaudeAI thread**

Post a useful, non-promotional answer describing one-mark/one-finding alignment, local Whisper, OS-level content protection, and the general lessons learned, then link the repository once.

- [ ] **Step 2: Schedule community-specific Reddit posts**

Schedule r/ClaudeCode and r/cursor first on separate days; then r/ClaudeWorkflows; then QA/webdev framed as bug reporting; then r/macapps framed by price, privacy, and platform. Verify each community's current self-promotion rules before scheduling.

- [ ] **Step 3: Post Show HN in the allowed window**

At Tuesday–Thursday 8–10 a.m. Eastern, submit the supplied title and GitHub URL, then immediately add the supplied first comment. Do not request upvotes.

- [ ] **Step 4: Monitor and reply**

Keep the first three hours available for substantive replies. Use promo codes only in direct replies where appropriate and never expose the full inventory publicly.

### Task 8: Send newsletter and Mac-press outreach

**Files:**
- Create outside git: a private outreach tracker containing recipient, verified address/form, send date, subject, promo-code assignment, status, and reply.

**Interfaces:**
- Consumes: named publication list, verified contact routes, GitHub/release links, and private promo codes.
- Produces: sent-message receipts and a reusable private tracker.

- [ ] **Step 1: Verify recipient routes**

Use each publication's official contact, tips, or submission page. Do not guess email addresses.

- [ ] **Step 2: Draft publication-specific messages**

Keep the required subject, two problem sentences, one mechanism sentence, GitHub link, one publication-specific relevance paragraph, and promo-code offer. Mac-publication messages include one unique code when available.

- [ ] **Step 3: Send and record**

Send only after previewing recipient, subject, body, link, and assigned code. Record confirmation and never reuse a redeemed/assigned code.

### Task 9: Schedule OriginPlayer indexing hold and Search Ads follow-up

**Files:**
- No repository mutation required.

**Interfaces:**
- Consumes: actual 1.0.8 live date and pricing recommendation.
- Produces: a dated follow-up and, only after review, capped Brand/Exact/Discovery campaigns.

- [ ] **Step 1: Create the indexing-hold follow-up**

Schedule the review for 28 days after 1.0.8 goes live, within the requested three-to-five-week window.

- [ ] **Step 2: Review organic evidence**

At the follow-up, record impressions, product-page views, conversion, and indexed metadata before changing keywords or starting ads.

- [ ] **Step 3: Configure capped campaigns**

Use the $100 credit only: Brand at $1–2 max CPT, Exact with 10–15 terms at $0.50–1, and Discovery broad at $0.30–0.50. Do not exceed those limits without new authorization.

- [ ] **Step 4: Establish weekly query hygiene**

Move converting Discovery terms into Exact and add them as Discovery negatives each week.
