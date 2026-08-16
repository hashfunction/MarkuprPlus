# Perf -- Performance Optimization Audit

Analyze markuprx's performance characteristics across its three runtimes: Electron desktop app, CLI tool, and MCP server. Identify bottlenecks, heavy dependencies, and anti-patterns with prioritized recommendations.

## Instructions

### 1. Bundle Size Analysis

Build all targets and measure output sizes:

```bash
cd ~/Projects/markuprx && npm run build 2>&1

# Measure each build output
du -sh dist/main/
du -sh dist/renderer/
du -sh dist/cli/
du -sh dist/mcp/
du -sh dist/preload/

# Find the largest individual files
find dist/ -type f -name "*.mjs" -o -name "*.js" -o -name "*.css" | xargs ls -lhS | head -20
```

Report the size of each build target. For the renderer bundle specifically, check if source maps are included in production (they should not be).

### 2. Dependency Weight Analysis

Assess the heaviest dependencies and whether lighter alternatives exist:

| Dependency | Purpose | Risk Area |
|---|---|---|
| `sharp` | Image optimization for AI pipeline (`src/main/ai/ImageOptimizer.ts`) | Native module, large binary (~30MB). Check if it's tree-shaken or fully bundled. For CLI/MCP, could canvas or jimp be lighter? |
| `@anthropic-ai/sdk` | Claude API calls (`src/main/ai/ClaudeAnalyzer.ts`) | Large SDK. Check if markuprx uses enough of it to justify full import vs. raw fetch |
| `electron-store` | Settings persistence (`src/main/settings/`) | Pulls in conf, atomically, etc. Check if electron's built-in safeStorage + JSON would suffice |
| `whisper-node` | Local transcription (`src/main/transcription/WhisperService.ts`) | Native module with binary download. Check startup impact |
| `keytar` | Secure API key storage (`src/main/settings/`) | Native module. Check if Electron safeStorage could replace it |
| `zod` | Schema validation (`src/shared/`) | Check v4 bundle size. v4 is significantly larger than v3 |

For each dependency:
- Read the actual import sites to see how much of the package is used
- Check if it's properly externalized in `electron.vite.config.ts` (main process deps should be external)
- Check if CLI/MCP builds in `scripts/build-cli.mjs` and `scripts/build-mcp.mjs` properly externalize or bundle

### 3. Electron-Specific Performance Anti-Patterns

Check for these common Electron performance issues:

**Startup Time**
- Read `src/main/index.ts`: Are heavy modules imported at top level or lazy-loaded?
- Whisper model loading, ffmpeg checks, and AI pipeline initialization should be deferred until first use
- Check if `ModelDownloadManager` runs checks at startup

**Memory Leaks in Main Process**
- Read `src/main/SessionController.ts`: Are event listeners registered in constructor and cleaned up in destroy/dispose?
- Read `src/main/audio/` and `src/main/capture/`: Are MediaRecorder/stream resources released on session end?
- Check `src/main/CrashRecovery.ts`: Is the 5-second auto-save interval cleared when a session completes?
- Search for `setInterval` and `setTimeout` without corresponding `clearInterval`/`clearTimeout`

**IPC Overhead**
- Read `src/main/ipc/`: Are large payloads (screenshots, audio chunks) being sent through IPC?
- Audio level updates (`IPC_CHANNELS.AUDIO_LEVEL`) fire frequently -- check if they're throttled
- Screenshot data should use file paths through IPC, not raw buffer data

**Renderer Performance**
- Read `src/renderer/App.tsx`: Check for unnecessary re-renders from IPC event subscriptions
- Read `src/renderer/components/AudioWaveform.tsx`: Animation frame updates should use `requestAnimationFrame`, not `setInterval`
- Read `src/renderer/components/AnnotationOverlay.tsx`: Canvas drawing operations -- check for per-frame allocations
- Check if `React.memo` is used on components that receive stable props (SessionHistory list items, etc.)

### 4. Post-Processing Pipeline Performance

The pipeline (`src/main/pipeline/`) is the most compute-intensive path. Analyze:

**FrameExtractor (`src/main/pipeline/FrameExtractor.ts`)**
- How many ffmpeg processes are spawned? Should be one with multiple output timestamps, not one per frame
- What resolution are extracted frames? Full resolution is wasteful if they'll be optimized for Claude API
- Are frames extracted sequentially or in parallel?

**TranscriptAnalyzer (`src/main/pipeline/TranscriptAnalyzer.ts`)**
- Is key-moment detection O(n) or worse?
- Are there redundant passes over the transcript?

**ImageOptimizer (`src/main/ai/ImageOptimizer.ts`)**
- Sharp operations should be chained (resize + format + quality in one pipeline), not sequential
- Check if images are processed in parallel with `Promise.all` vs. sequentially
- What target dimensions and quality? Claude's vision API has diminishing returns above 1568px

**PostProcessor (`src/main/pipeline/PostProcessor.ts`)**
- Are pipeline stages overlapped where possible (e.g., start frame extraction while transcription is still running)?
- Is there a timeout if any stage hangs?

### 5. CLI and MCP Startup Performance

```bash
# Measure CLI cold start time
cd ~/Projects/markuprx && time node dist/cli/index.mjs --help 2>&1

# Measure MCP cold start overhead (if possible)
cd ~/Projects/markuprx && time node -e "require('./dist/mcp/index.mjs')" 2>&1
```

For CLI, check:
- Does `src/cli/index.ts` import the entire Electron main process code, or only what it needs?
- Are heavy imports (sharp, whisper-node) loaded eagerly or only when the `analyze` command runs?
- Commander.js setup should be near-instant

For MCP, check:
- Does the MCP server import sharp/whisper-node at startup or per-tool-call?
- Idle memory footprint matters since MCP servers run persistently

### 6. Prioritized Recommendations

Produce a ranked list:

```
=== PERFORMANCE AUDIT: markuprx ===

CRITICAL (user-visible latency or resource waste):
1. [issue] -- [location] -- [estimated impact] -- [fix]

HIGH (measurable improvement opportunity):
1. [issue] -- [location] -- [estimated impact] -- [fix]

MEDIUM (code hygiene, prevents future problems):
1. [issue] -- [location] -- [estimated impact] -- [fix]

LOW (micro-optimizations, nice to have):
1. [issue] -- [location] -- [estimated impact] -- [fix]

BUNDLE SIZE SUMMARY:
- Desktop main: XXkb (target: <500kb)
- Desktop renderer: XXkb (target: <1MB)
- CLI: XXkb (target: <200kb)
- MCP: XXkb (target: <200kb)

HEAVIEST DEPENDENCIES:
1. [package] -- [size] -- [used for] -- [lighter alternative?]
```
