# MarkuprPlus and OriginPlayer Launch Completion Design

## Objective

Complete the remaining launch brief after MarkuprPlus repository hygiene, MCP metadata, npm publication, MCP Registry publication, support routing, crawlable product pages, and production website deployment have landed.

## Operating principles

- Public mutations follow their prerequisites. A listing is submitted only after its destination is live; a launch post waits for release artifacts and promo codes; OriginPlayer paid acquisition waits for the requested indexing hold.
- Account credentials, passwords, one-time codes, and CAPTCHA responses are entered by the user in the browser. They are never copied into repository files or chat.
- Existing user work is preserved. In particular, `harmony/android/app/src/main/kotlin/com/originplayer/android/MainActivity.kt` remains untouched unless its current diff is proven necessary for the requested 1.0.8 release.
- Release state is proved from downstream systems: GitHub release assets, Apple/Google console state, public HTTP responses, directory search results, and sent-message receipts.
- Time-sensitive public posts obey the brief: Show HN runs Tuesday through Thursday, 8–10 a.m. Eastern, and Reddit communities receive distinct posts on different days.
- No Apple Search Ads spend begins before OriginPlayer 1.0.8 has been live for three to five weeks. The initial campaign may use only the stated $100 credit and stated CPT ceilings.

## Track 1: MCP directory distribution

1. Claim or submit MarkuprPlus to Glama using the GitHub repository and verify the claimed state.
2. Publish to Smithery using the official current CLI or submission UI, using `hashfunction/markuprplus` and the public npm/MCP Registry package.
3. Submit MarkuprPlus to `punkpeye/awesome-mcp-servers` in the repository's established alphabetical/category format, with a concise screen-recording and structured-visual-feedback description.
4. Check PulseMCP's current submission state. Submit if open; otherwise capture the current pause and its official follow-up route.

## Track 2: MarkuprPlus 3.1.2 and Mac distribution

1. Tag the verified release commit `4c9dd4d` as `v3.1.2` and let the repository's release workflow build signed Windows installers plus universal, notarized, stapled macOS artifacts.
2. Verify every published asset and Gatekeeper/notarization state before using the release in outreach.
3. Build or locate the signed Mac App Store package, upload it through the checksum-gated workflow, attach the prepared metadata and five existing 2880×1800 screenshots, and fill additional slots only with truthful product views.
4. Generate App Store promo codes before Show HN.
5. Submit the notarized universal desktop build to Setapp, using the existing support and privacy materials.

## Track 3: MarkuprPlus launch outreach

1. Post Show HN in the required weekday/time window and immediately add the supplied first comment.
2. Reply to the specified live r/ClaudeAI thread with a useful implementation-focused answer and repository link.
3. Schedule distinct posts for r/ClaudeCode, r/cursor, r/ClaudeWorkflows, r/QualityAssurance, r/webdev, and r/macapps on different days, preserving each community-specific framing.
4. Send targeted newsletter pitches to the named AI/developer newsletters and Mac publications. Each message uses verified recipient data, a publication-specific relevance paragraph, the GitHub link, and an App Store promo code where appropriate.

## Track 4: OriginPlayer technical and release work

1. Verify the production crawler symptom with raw HTTP and JavaScript-disabled browser checks before changing code.
2. If the symptom is real, implement the smallest Next.js-native static/SSR fix for the root page, `robots.txt`, sitemap, and any route whose raw response lacks useful content.
3. Reconcile committed iOS/Android versions and console drafts into one verified 1.0.8 release, without overwriting the user's unrelated Android activity change.
4. Fill available App Store screenshot slots with truthful keyword-bearing captions and add an app preview only if a real, reviewable preview asset exists.
5. Deploy the verified web change through `ssh harmony`, with backups and live rollback checks.

## Track 5: OriginPlayer pricing and delayed acquisition

1. Compare the $11.99/month Pro tier against current Doppler, Evermusic, and iBroadcast pricing and feature scope using first-party sources.
2. Recommend a price decision before paid acquisition; do not silently mutate existing subscriptions.
3. Create a dated follow-up three to five weeks after 1.0.8 goes live. At that point, inspect impressions and product-page conversion before creating Brand, Exact, and Discovery Apple Search Ads groups within the requested limits.

## Completion evidence

- Public URLs or API responses for every accepted directory submission.
- Green GitHub release workflow and verified 3.1.2 assets.
- App Store Connect delivery/build state, screenshot count, and promo-code inventory.
- Public post/message URLs or sent-message receipts.
- OriginPlayer raw-HTML, robots, sitemap, tests, deployment commit, and live container health.
- A dated indexing-hold follow-up and pricing recommendation with primary-source links.
