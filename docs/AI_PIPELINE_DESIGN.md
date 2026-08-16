# AI Analysis Pipeline Design Document

**Author**: AI Pipeline Architect
**Date**: February 2026
**Status**: Design Complete - Ready for Implementation

---

## 1. Architecture Overview

### Data Flow

```
Session End (Cmd+Shift+F)
         |
         v
+-------------------+
| SessionController |  Produces: Session object
| stop() returns    |  - feedbackItems[] (text + screenshots w/ buffers)
|                   |  - transcriptBuffer[] (all transcript events)
|                   |  - screenshotBuffer[] (all screenshots)
|                   |  - metadata (sourceId, sourceName, recordingPath)
+-------------------+
         |
         v
+-------------------+
| AIPipelineManager |  NEW MODULE - Orchestrates the pipeline
| (main process)    |
+-------------------+
         |
    +----+----+
    |         |
    v         v
 [FREE]    [PREMIUM / BYOK]
    |         |
    v         v
+----------+ +------------------+
| Current  | | ClaudeAnalyzer   |  NEW MODULE
| Pipeline | | - Builds prompt  |
| (as-is)  | | - Sends to API   |
| Adapter  | | - Parses result  |
| + MD Gen | +------------------+
+----------+         |
    |                 v
    |         +------------------+
    |         | Structured       |
    |         | MarkdownBuilder  |  NEW MODULE
    |         | Assembles final  |
    |         | output from AI   |
    |         | analysis result  |
    |         +------------------+
    |                 |
    v                 v
+-------------------+
| FileManager       |  Saves to disk (existing)
| saveSession()     |  ~/markuprx/sessions/
+-------------------+
         |
         v
  Clipboard: file path
  Notification: "Session complete"
```

### Where Processing Happens

**Main process.** The AI pipeline runs in the Electron main process, not a separate worker or cloud function. Rationale:

1. **Simplicity** - No IPC overhead between workers. The main process already has full access to session data including screenshot buffers.
2. **Access to Node.js APIs** - Direct file system access for reading screenshot buffers, no serialization cost.
3. **Non-blocking** - The API call is async/await. The main process UI (tray icon) simply shows "processing" state while waiting. Electron's event loop is not blocked.
4. **Consistency** - Same process that handles all other session lifecycle stages.

The Claude API call is the only network operation and is inherently async. Processing time is dominated by the API round-trip, not local compute.

---

## 2. Claude API Integration

### Model Selection

**Model**: `claude-sonnet-4-5-20250929` (Claude Sonnet 4.5)

Rationale:
- Vision capability (required for screenshot analysis)
- Fast enough for interactive use (5-15s response time)
- Significantly cheaper than Opus for a consumer product
- Excellent at structured output and following formatting instructions
- Smart enough to identify patterns, group feedback, and write concise summaries

Opus is overkill for this use case. Sonnet 4.5 provides the right quality/cost/speed balance for a ~$12/month consumer product.

### System Prompt Design

```
You are markuprx's AI analysis engine. You receive a developer's voice-narrated feedback session: a transcript of everything they said while reviewing software, paired with screenshots captured at natural pause points.

Your job is to transform this raw narration into a structured, actionable feedback document.

## Rules

1. **Preserve the user's voice.** Quote their exact words in blockquotes. Never rephrase their observations.
2. **Group related feedback.** If the user mentions the same area multiple times, combine those into one item.
3. **Match screenshots to feedback.** Each screenshot was captured during or after the text segment it accompanies. Reference screenshots by their index (e.g., [Screenshot 1]).
4. **Extract action items.** For each feedback item, write a concrete 1-sentence action item a developer could act on immediately.
5. **Assign priority.** Use Critical/High/Medium/Low based on the severity of the issue described.
6. **Categorize.** Use exactly one of: Bug, UX Issue, Performance, Suggestion, Question, Positive Note.
7. **Write a summary.** 2-3 sentences capturing the most important findings.
8. **Be concise.** Developers will paste this into AI coding tools. Every word must earn its place.

## Output Format

Respond with ONLY valid JSON matching this schema:

{
  "summary": "2-3 sentence overview of key findings",
  "items": [
    {
      "title": "Short descriptive title (5-10 words)",
      "category": "Bug|UX Issue|Performance|Suggestion|Question|Positive Note",
      "priority": "Critical|High|Medium|Low",
      "quote": "User's exact words (the relevant excerpt)",
      "screenshotIndices": [0, 1],
      "actionItem": "Concrete 1-sentence action for a developer",
      "area": "Component or area of the app this relates to (e.g., 'Navigation', 'Login Form', 'Dashboard')"
    }
  ],
  "themes": ["theme1", "theme2"],
  "positiveNotes": ["Things the user explicitly praised"],
  "metadata": {
    "totalItems": 5,
    "criticalCount": 1,
    "highCount": 2
  }
}
```

### User Message Construction

The user message is constructed dynamically from session data:

```
## Transcript

The user narrated the following while reviewing the application "{sourceName}":

{segments}

---

## Screenshots

{screenshotCount} screenshots were captured at natural pause points during narration.
They are provided as images below in chronological order.

Screenshot 1 (captured at 00:12):
[image]

Screenshot 2 (captured at 00:34):
[image]

...
```

### Vision Usage

Screenshots are sent as base64 PNG images using Claude's vision API. Each screenshot is included as a content block with `type: "image"` and `media_type: "image/png"`.

**Image optimization before sending:**
- Resize to max 1568px on the longest edge (Claude's recommended limit)
- Convert to JPEG at 80% quality if the PNG exceeds 500KB (reduces tokens significantly)
- Strip EXIF/metadata

This is done locally in the main process using Electron's `nativeImage` before the API call.

### Screenshot Selection Strategy

**Send all silence-triggered screenshots** (up to 20). Rationale:
- A typical 5-minute session captures 5-10 screenshots
- Even a 15-minute session rarely exceeds 20 screenshots
- Claude's vision pricing makes 10-20 images affordable per session
- Sending all screenshots lets Claude make the best grouping decisions

**If > 20 screenshots:**
1. Always include manual/voice-command triggered screenshots (user explicitly wanted these)
2. From the remaining pause-triggered ones, select evenly spaced screenshots to stay under 20
3. Include a note in the prompt: "Note: {totalCount} screenshots were captured. The {selectedCount} most representative are shown."

**Video frames:** Not extracted. The video file (.webm) is referenced in the output for the user to review, but frames are not extracted for AI analysis in v1. Rationale:
- Adding ffmpeg dependency is a significant build complexity increase
- Silence-triggered screenshots already capture the relevant moments
- Video is a "nice to have" reference, not primary AI input

---

## 3. Token Cost Estimation

### Typical Session (5 minutes, ~500 words spoken, 7 screenshots)

| Component | Tokens (est.) | Cost (Sonnet 4.5) |
|-----------|---------------|-------------------|
| System prompt | ~500 | $0.0015 |
| Transcript text (~500 words) | ~700 | $0.0021 |
| Screenshots (7 x ~1000 tokens each for 1080p JPEG) | ~7,000 | $0.021 |
| Output (~800 tokens structured JSON) | ~800 | $0.008 |
| **Total** | **~9,000** | **~$0.032** |

**Claude Sonnet 4.5 pricing** (as of Feb 2026):
- Input: $3/1M tokens
- Output: $15/1M tokens (with extended thinking disabled)

### Cost by Session Length

| Session | Transcript | Screenshots | Est. Cost |
|---------|-----------|-------------|-----------|
| 2 min, 200 words, 3 screenshots | ~280 | ~3,000 | ~$0.015 |
| 5 min, 500 words, 7 screenshots | ~700 | ~7,000 | ~$0.032 |
| 10 min, 1000 words, 12 screenshots | ~1,400 | ~12,000 | ~$0.055 |
| 15 min, 1500 words, 18 screenshots | ~2,100 | ~18,000 | ~$0.078 |
| 30 min, 3000 words, 20 screenshots (capped) | ~4,200 | ~20,000 | ~$0.095 |

### Business Model Viability

At $12/month per user:
- Break-even at ~375 sessions/month per user (~12/day, far above expected usage)
- Expected usage: 2-5 sessions/day = $0.06-$0.16/day = $1.80-$4.80/month
- **Healthy margin of 60-85%** at typical usage levels

### Handling Large Sessions

For sessions exceeding 200K context window (extremely unlikely with voice sessions):
1. Truncate transcript to last 3000 words (keep most recent context)
2. Cap screenshots at 20
3. Add a note: "This session was very long. Analysis covers the most recent portion."

This scenario is practically impossible with the 30-minute recording limit and natural speech rate.

---

## 4. Processing Time Estimation

| Phase | Time (est.) |
|-------|-------------|
| Image optimization (resize/compress 7 images) | 200-500ms |
| Prompt construction | <50ms |
| Claude API round-trip (Sonnet 4.5 with 7 images) | 3-8 seconds |
| JSON parsing + markdown assembly | <50ms |
| File system write | <100ms |
| **Total** | **4-9 seconds** |

This fits within the product vision's "A few seconds later, a notification tells you the session is complete." The processing state timeout is 10 seconds, which provides adequate headroom.

**Optimization opportunities for future:**
- Stream the response to show progressive output
- Pre-optimize images while the session is still recording (on each screenshot capture)
- Use prompt caching for the system prompt (saves ~$0.001 per session)

---

## 5. Free vs Premium Tier Differences

### Free Tier (Current Behavior - No Changes)

The existing pipeline remains untouched:

1. `SessionController.stop()` returns `Session`
2. `sessionAdapter.adaptSessionForMarkdown()` converts types
3. `FeedbackAnalyzer.analyze()` does rule-based categorization
4. `MarkdownGenerator.generateFullDocument()` produces output
5. `FileManager.saveSession()` writes to disk

Output: Well-structured markdown with rule-based categories, keyword-derived titles, and template-driven action items. Functional but mechanical.

### Premium / BYOK Tier (New Pipeline)

1. `SessionController.stop()` returns `Session` (same)
2. **NEW**: `AIPipelineManager.analyze(session)` is called
3. **NEW**: `ClaudeAnalyzer` sends transcript + screenshots to Claude API
4. **NEW**: `StructuredMarkdownBuilder` assembles AI-analyzed output
5. `FileManager.saveSession()` writes to disk (same)

Output: Intelligent markdown with Claude-analyzed groupings, context-aware titles, nuanced priorities, pattern detection, and natural-language action items. The "wow factor."

### BYOK Flow

Users who bring their own Anthropic API key get the same analysis pipeline. The only difference is the API key source:
- **Premium**: Key is proxied through a Cloudflare Worker (Eddie's key, metered per subscription)
- **BYOK**: Key is stored locally in the OS keychain via `SettingsManager.getApiKey('anthropic')`

The `ClaudeAnalyzer` accepts an API key parameter and doesn't care where it comes from.

### Decision Logic

```typescript
async function processSession(session: Session): Promise<OutputResult> {
  const tier = await determineTier();

  if (tier === 'premium' || tier === 'byok') {
    try {
      const analysis = await claudeAnalyzer.analyze(session, {
        apiKey: tier === 'byok'
          ? await settingsManager.getApiKey('anthropic')
          : await getPremiumProxyKey(),
        baseUrl: tier === 'premium'
          ? 'https://api.markuprx.com/v1'  // Cloudflare Worker proxy
          : 'https://api.anthropic.com',
      });
      return structuredMarkdownBuilder.build(session, analysis);
    } catch (error) {
      // FALLBACK: If AI analysis fails, fall back to free tier output
      console.warn('[AIPipeline] Claude analysis failed, falling back to basic output:', error);
      return generateFreeOutput(session);
    }
  }

  return generateFreeOutput(session);
}

function determineTier(): 'premium' | 'byok' | 'free' {
  if (premiumSubscription.isActive()) return 'premium';
  if (settingsManager.hasApiKey('anthropic')) return 'byok';
  return 'free';
}
```

---

## 6. Error Handling Strategy

### Failure Modes and Recovery

| Failure | Impact | Recovery |
|---------|--------|----------|
| Claude API timeout (>10s) | No AI analysis | Fall back to free tier output. User gets basic markdown. |
| Claude API rate limit (429) | No AI analysis | Fall back to free tier output. Retry on next session. |
| Claude API auth error (401) | API key invalid | Fall back to free tier. Show settings notification. |
| Claude API server error (5xx) | Temporary outage | Fall back to free tier output. |
| Malformed JSON response | Can't parse AI output | Fall back to free tier output. Log for debugging. |
| Image optimization fails | Can't resize screenshot | Send original image (may be larger). If still fails, skip that screenshot. |
| Network offline | No API access | Fall back to free tier output immediately (no timeout wait). |
| Premium proxy down | Proxy unavailable | Fall back to free tier. Show "Premium service temporarily unavailable." |

### Key Principle: Never Lose the Session

The AI analysis is an **enhancement layer**. The session data (transcript + screenshots) is always saved regardless of whether AI analysis succeeds. The free tier pipeline is the safety net.

```typescript
async function processSessionSafely(session: Session): Promise<void> {
  // ALWAYS save the basic output first
  const basicDocument = generateFreeOutput(session);
  const saveResult = await fileManager.saveSession(session, basicDocument);

  // THEN attempt AI enhancement (if eligible)
  const tier = determineTier();
  if (tier !== 'free') {
    try {
      const aiDocument = await runAIPipeline(session);
      // Overwrite the basic output with the AI-enhanced version
      await fileManager.overwriteReport(saveResult.sessionDir, aiDocument);
    } catch (error) {
      // Basic output is already saved - user still gets value
      console.warn('[AIPipeline] Enhancement failed, basic output preserved');
    }
  }
}
```

### User-Facing Error Messages

- **Timeout**: "AI analysis is taking longer than expected. Your feedback was saved with basic formatting."
- **Auth error**: "Your API key appears to be invalid. Check Settings > API Keys. Your feedback was saved with basic formatting."
- **Offline**: "No internet connection. Your feedback was saved with basic formatting. AI analysis requires a network connection."
- **Rate limit**: "AI service is temporarily busy. Your feedback was saved with basic formatting."

All messages end with the reassurance that the session was saved. Users should never feel like they lost work.

---

## 7. Output Markdown Format

### AI-Enhanced Output (Premium / BYOK)

```markdown
# Feedback Report: MyApp - Feb 5, 2026

> AI-analyzed by Claude | Duration: 5:23 | 7 screenshots | 5 items identified

## Summary

The user identified a critical layout overlap between the action button and header on mobile viewports, a janky loading transition on the dashboard, and noted that the card animation pattern on the detail page should be reused elsewhere. Overall, the UI needs attention on mobile responsiveness and transition polish.

---

## Critical Issues

### 1. Mobile button overlaps header
> "This button is way too small on mobile. And it's competing with the header -- look, they're practically overlapping."

![Screenshot](./screenshots/fb-001.png)

- **Priority:** High
- **Category:** Bug
- **Area:** Mobile Layout
- **Action:** Fix button/header z-index and spacing in the mobile breakpoint. The button needs larger tap target (min 44px) and sufficient margin from the header.

---

## Improvements Needed

### 2. Dashboard loading transition feels janky
> "The loading spinner here feels sluggish. It shows up but then the content pops in with no transition. Feels janky."

![Screenshot](./screenshots/fb-002.png)

- **Priority:** Medium
- **Category:** Performance
- **Area:** Dashboard
- **Action:** Add a fade-in transition (200-300ms ease) when content replaces the loading spinner. Consider a skeleton loader instead of a spinner.

---

## Suggestions

### 3. Reuse card animation pattern on dashboard
> "Actually, I love how this card animation works. We should use this pattern on the dashboard too."

![Screenshot](./screenshots/fb-003.png)

- **Priority:** Low
- **Category:** Suggestion
- **Area:** Dashboard, Detail Page
- **Action:** Extract the card animation from the detail page into a shared component/utility and apply it to dashboard cards.

---

## Positive Notes

- The card animation on the detail page was praised as a good interaction pattern worth reusing.

---

## Themes

- Mobile responsiveness
- Transition polish
- Component reusability

## Session Info

- **Session ID:** `a1b2c3d4-...`
- **Source:** MyApp (screen)
- **Duration:** 5:23
- **Screenshots:** 7
- **Recording:** [session-recording.webm](./session-recording.webm)
- **Analysis:** Claude Sonnet 4.5 (AI-enhanced)

---
*Generated by [markuprx](https://github.com/eddiesanjuan/markuprx) with AI analysis*
```

### Key Differences from Free Tier Output

| Aspect | Free Tier | Premium/BYOK |
|--------|-----------|-------------|
| Summary | Counts-based ("5 items, 2 high priority") | Natural language insight |
| Grouping | Chronological order | Grouped by priority, then theme |
| Titles | First sentence of transcript, truncated | AI-generated descriptive title |
| Action items | Template-based ("Reproduce and patch...") | Context-specific ("Fix button/header z-index...") |
| Categories | Keyword-matching heuristic | AI-judged with context from screenshots |
| Positive notes | Not extracted | Explicitly identified section |
| Themes | Keyword frequency count | AI-identified cross-cutting themes |
| Cross-references | None | Items linked by shared area/theme |

---

## 8. Implementation Plan

### New Files to Create

```
src/main/ai/
  AIPipelineManager.ts       # Orchestrator - decides tier, runs pipeline
  ClaudeAnalyzer.ts          # Claude API integration with vision
  StructuredMarkdownBuilder.ts # Converts AI JSON output to formatted markdown
  ImageOptimizer.ts          # Resize/compress screenshots for API
  types.ts                   # AI pipeline types (AnalysisResult, etc.)
```

### Files to Modify

```
src/main/index.ts            # Wire AIPipelineManager into session completion flow
src/main/output/index.ts     # Re-export AI pipeline for convenience
src/shared/types.ts          # Add AI tier types, BYOK settings
src/preload/index.ts         # Expose AI tier status to renderer
src/renderer/components/     # UI for AI status indicator, BYOK key entry
```

### Implementation Order

1. **`src/main/ai/types.ts`** - Define `AIAnalysisResult`, `AITier`, pipeline options
2. **`src/main/ai/ImageOptimizer.ts`** - Screenshot resize/compress using `nativeImage`
3. **`src/main/ai/ClaudeAnalyzer.ts`** - Core Claude API integration
   - Build the multi-modal message (text + images)
   - Send request, parse JSON response
   - Handle all error cases with typed errors
4. **`src/main/ai/StructuredMarkdownBuilder.ts`** - Convert `AIAnalysisResult` to markdown
   - Group items by priority section (Critical, Improvements, Suggestions, Positive)
   - Link screenshots to items using the AI's `screenshotIndices`
   - Generate the final formatted markdown string
5. **`src/main/ai/AIPipelineManager.ts`** - Orchestrator
   - Determine tier (premium/byok/free)
   - Run the appropriate pipeline
   - Handle fallback on failure
   - Emit progress events to renderer
6. **`src/main/index.ts`** - Integration
   - Replace direct `generateDocumentForFileManager()` call with `AIPipelineManager.process()`
   - Add IPC handlers for AI tier status
7. **UI updates** - Settings panel for BYOK Anthropic key, AI status indicator during processing

### Dependencies

- `@anthropic-ai/sdk` - Official Anthropic TypeScript SDK (already well-maintained, handles retries, streaming)
- No other new dependencies required. Image optimization uses Electron's built-in `nativeImage`.

### Testing Strategy

- **Unit tests for `ClaudeAnalyzer`**: Mock the Anthropic SDK, verify prompt construction and JSON parsing
- **Unit tests for `StructuredMarkdownBuilder`**: Given a known `AIAnalysisResult`, verify markdown output matches expected format
- **Unit tests for `ImageOptimizer`**: Verify resize behavior, format conversion, error handling
- **Integration test for `AIPipelineManager`**: Mock `ClaudeAnalyzer`, verify tier selection and fallback logic
- **Manual test**: Record a real session, verify end-to-end AI output quality

---

## 9. API Key Management

### Premium Tier (Cloudflare Worker Proxy)

```
User App  -->  https://api.markuprx.com/v1/messages
                      |
                Cloudflare Worker
                      |
                  Validates subscription (Stripe customer ID)
                  Adds Eddie's API key to request headers
                  Forwards to https://api.anthropic.com/v1/messages
                      |
                Claude API
```

The Cloudflare Worker:
1. Receives the request with the user's subscription token
2. Validates against Stripe that the subscription is active
3. Adds the real Anthropic API key (stored as a Worker secret)
4. Proxies the request to Claude
5. Returns the response to the user

This means Eddie's API key never touches the user's machine.

### BYOK (Bring Your Own Key)

The user enters their Anthropic API key in Settings. It's stored in the OS keychain via `keytar` (already used for OpenAI keys via `SettingsManager`).

```typescript
// Store
await settingsManager.setApiKey('anthropic', userKey);

// Retrieve
const key = await settingsManager.getApiKey('anthropic');

// Delete
await settingsManager.deleteApiKey('anthropic');
```

The key is never written to disk in plaintext, never logged, and never sent anywhere except directly to `api.anthropic.com`.

---

## 10. Future Considerations (Out of Scope for v1)

1. **Streaming responses** - Show AI analysis progressively in a session review view
2. **Video frame extraction** - Use ffmpeg to extract key frames from the .webm recording
3. **Multi-session analysis** - "What patterns do you see across my last 10 sessions?"
4. **Custom system prompts** - Let power users modify the analysis instructions
5. **Prompt caching** - Cache the system prompt to reduce cost by ~40% on input tokens
6. **Batch processing** - Re-analyze old sessions with AI after upgrading to premium
7. **Claude 4 Opus** - Offer as a "deep analysis" option for longer sessions (higher cost, better reasoning)

---

## Summary

The AI pipeline is a clean enhancement layer that sits between `SessionController.stop()` and `FileManager.saveSession()`. It transforms raw session data into an intelligent document using Claude's vision capabilities. The free tier is unaffected. Failures gracefully degrade to the existing output. The architecture is simple: one new module (`src/main/ai/`) with 5 files, integrated via a single function call in `src/main/index.ts`.

Cost is approximately $0.03 per typical session, making the $12/month subscription profitable at any reasonable usage level. Processing time is 4-9 seconds, fitting the product vision's "a few seconds" promise.
