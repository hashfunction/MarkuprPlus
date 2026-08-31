# MarkuprPlus CLI Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore all nine CLI report providers in the sandboxed Mac App Store edition through an authenticated, separately installed local companion, then build and submit MarkuprPlus 3.1.0 as an App Store update.

**Architecture:** The npm-installed `markuprx` executable hosts a launchd-managed HTTP service on IPv4 loopback and reuses the existing direct-build CLI analyzers. The Store app uses bridge-backed implementations of the existing provider adapter interface, stores the bridge token in Keychain through dedicated IPC, and never launches or configures an external process itself.

**Tech Stack:** TypeScript, Node.js HTTP and crypto APIs, Electron, React, Zod, Commander, launchd, Vitest, Playwright, electron-vite, electron-builder MAS, App Store Connect.

**Spec:** `docs/superpowers/specs/2026-08-30-markuprplus-cli-bridge-design.md`

## Global Constraints

- Protocol version is `1`; the production endpoint is `http://127.0.0.1:49647`.
- Authentication uses a 32-byte base64url bearer token; it never appears in URLs or logs.
- Only `codex-cli`, `claude-cli`, `opencode-cli`, `cursor-cli`, `qwen-cli`, `goose-cli`, `amp-cli`, `kiro-cli`, and `aider-cli` may cross the bridge.
- Requests never carry an executable, arguments, environment, working directory, configuration path, URL, shell text, or arbitrary filesystem path.
- Maximum request body is 32 MiB; at most 20 screenshots of at most 8 MiB decoded each; at most 2,000 transcript events and 2,000 feedback items.
- Provider connection calls time out after two seconds; analysis transport times out after 190 seconds.
- The bridge runs one analysis at a time and returns `429 BRIDGE_BUSY` for another.
- The Store application remains useful without the bridge and retains Local Rules fallback.
- Direct-build CLI execution behavior remains unchanged.
- Release version is `3.1.0`; Mac App Store build version is `3`.
- App Store submission happens only after source, unit, UI, build, signing, and MAS package verification pass.

---

### Task 1: Versioned, Path-Free Bridge Protocol

**Files:**
- Create: `src/shared/cliBridgeProtocol.ts`
- Create: `src/bridge/BridgeSession.ts`
- Test: `tests/unit/cliBridgeProtocol.test.ts`
- Test: `tests/unit/bridgeSession.test.ts`

**Interfaces:**
- Produces: `CLI_BRIDGE_PROTOCOL_VERSION`, `CLI_BRIDGE_DEFAULT_HOST`, `CLI_BRIDGE_DEFAULT_PORT`, `CLI_BRIDGE_PROVIDER_IDS`, `CliBridgeProvider`, `BridgeSessionPayload`, `BridgeAnalyzeRequest`, `BridgeErrorEnvelope`, `parseBridgeAnalyzeRequest(value)`, `serializeBridgeSession(session)`, and `deserializeBridgeSession(payload)`.
- Consumes: existing `Session`, `AnalysisProviderStatus`, `AnalysisModelOption`, and `AIAnalysisResult` types.

- [ ] **Step 1: Write failing protocol contract tests**

Assert the exact provider allowlist and constants, successful parsing of a minimal analysis request, and rejection of unknown provider IDs, unknown properties, control characters in model IDs, more than 20 screenshots, invalid base64, decoded screenshots larger than 8 MiB, and arrays longer than 2,000.

```ts
expect(CLI_BRIDGE_PROVIDER_IDS).toEqual([
  'codex-cli', 'claude-cli', 'opencode-cli', 'cursor-cli', 'qwen-cli',
  'goose-cli', 'amp-cli', 'kiro-cli', 'aider-cli',
]);
expect(() => parseBridgeAnalyzeRequest({
  provider: 'ollama', session: minimalBridgeSession,
})).toThrow(/unsupported provider/i);
```

- [ ] **Step 2: Run the protocol test and verify RED**

Run: `npx vitest run tests/unit/cliBridgeProtocol.test.ts`

Expected: FAIL because `src/shared/cliBridgeProtocol.ts` does not exist.

- [ ] **Step 3: Implement strict protocol types and schemas**

Use strict Zod objects. Define `BridgeSessionPayload` with JSON-safe session, feedback, transcript, metadata, and screenshot fields. Calculate decoded base64 size before calling `Buffer.from`. Export stable error codes:

```ts
export type CliBridgeErrorCode =
  | 'AUTH_REQUIRED' | 'AUTH_INVALID' | 'METHOD_NOT_ALLOWED' | 'NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE' | 'INVALID_REQUEST' | 'PROVIDER_UNSUPPORTED'
  | 'BRIDGE_BUSY' | 'PROVIDER_UNAVAILABLE' | 'ANALYSIS_TIMEOUT'
  | 'ANALYSIS_FAILED' | 'INTERNAL_ERROR' | 'BRIDGE_PROTOCOL_ERROR';
```

- [ ] **Step 4: Run the protocol test and verify GREEN**

Run: `npx vitest run tests/unit/cliBridgeProtocol.test.ts`

Expected: PASS with zero failures.

- [ ] **Step 5: Write failing session round-trip tests**

Construct a real `Session` with transcript events, feedback, capture metadata, and PNG/JPEG screenshots. Assert serialization contains no path-like metadata keys (`recordingPath`, `audioPath`, `screenshotPath`) and deserialization restores `Buffer` objects and analyzer-relevant timestamps.

- [ ] **Step 6: Run the session test and verify RED**

Run: `npx vitest run tests/unit/bridgeSession.test.ts`

Expected: FAIL because the conversion functions do not exist.

- [ ] **Step 7: Implement path-free session conversion**

Copy JSON-compatible metadata but explicitly omit all path fields. Preserve source name, source type, capture context, marked-issue content without `screenshotPath`, transcript events, and feedback items. Decode only validated PNG and JPEG screenshots.

- [ ] **Step 8: Run both tests and verify GREEN**

Run: `npx vitest run tests/unit/cliBridgeProtocol.test.ts tests/unit/bridgeSession.test.ts`

Expected: PASS with zero failures.

- [ ] **Step 9: Commit the protocol**

```bash
git add src/shared/cliBridgeProtocol.ts src/bridge/BridgeSession.ts tests/unit/cliBridgeProtocol.test.ts tests/unit/bridgeSession.test.ts
git commit -m "feat: define secure CLI bridge protocol"
```

---

### Task 2: Authenticated Loopback Companion Server

**Files:**
- Create: `src/bridge/BridgeAuth.ts`
- Create: `src/bridge/BridgeErrors.ts`
- Create: `src/bridge/CliBridgeServer.ts`
- Test: `tests/unit/cliBridgeServer.test.ts`
- Test: `tests/integration/cliBridgeHttp.test.ts`

**Interfaces:**
- Consumes: Task 1 protocol parsing and conversion; `AnalysisProviderRegistry` from the existing CLI provider registry.
- Produces: `generateBridgeToken()`, `isAuthorized(header, token)`, `createCliBridgeServer(options)`, `startCliBridgeServer(options)`, and `CliBridgeServerHandle.close()`.

- [ ] **Step 1: Write failing authentication and routing tests**

Use an injected fake provider registry and an ephemeral port. Assert health is the only unauthenticated endpoint; provider routes require a bearer token; token comparisons accept only an exact 32-byte token; invalid Host values fail; responses set `Cache-Control: no-store` and omit CORS headers; wrong methods and paths return stable JSON errors without stack traces.

```ts
const response = await fetch(`${origin}/v1/providers`);
expect(response.status).toBe(401);
expect(await response.json()).toEqual({
  error: { code: 'AUTH_REQUIRED', message: 'Bridge authentication is required.' },
});
```

- [ ] **Step 2: Run the server unit test and verify RED**

Run: `npx vitest run tests/unit/cliBridgeServer.test.ts`

Expected: FAIL because the server modules do not exist.

- [ ] **Step 3: Implement token authentication, sanitized errors, and exact routing**

Bind production only to `127.0.0.1`. Validate `Host` as `127.0.0.1:<port>` or `localhost:<port>`, compare decoded tokens using `timingSafeEqual`, limit the incoming body while streaming, set `Content-Type: application/json` and `Cache-Control: no-store`, and serialize no stack traces.

- [ ] **Step 4: Implement provider and analysis handlers**

Map `/providers`, provider test, and models to registry discovery. Parse analysis through Task 1, reconstruct the session, and call only `registry.get(request.provider)`. Use an in-memory busy flag cleared in `finally`; return `BRIDGE_BUSY` before parsing a second analysis body.

- [ ] **Step 5: Run the server unit test and verify GREEN**

Run: `npx vitest run tests/unit/cliBridgeServer.test.ts`

Expected: PASS with zero failures.

- [ ] **Step 6: Write and run real HTTP integration tests**

Exercise an actual ephemeral loopback listener. Assert provider discovery, model response, analysis result, forced discovery, a 32 MiB streaming cutoff, concurrent `429`, and sanitized `502` behavior.

Run: `npx vitest run tests/integration/cliBridgeHttp.test.ts`

Expected before final implementation: FAIL on missing timeout/concurrency behavior. Expected after completing the server: PASS with zero failures.

- [ ] **Step 7: Commit the companion server**

```bash
git add src/bridge/BridgeAuth.ts src/bridge/BridgeErrors.ts src/bridge/CliBridgeServer.ts tests/unit/cliBridgeServer.test.ts tests/integration/cliBridgeHttp.test.ts
git commit -m "feat: add authenticated CLI bridge server"
```

---

### Task 3: Per-User LaunchAgent and CLI Lifecycle

**Files:**
- Create: `src/bridge/BridgeConfig.ts`
- Create: `src/bridge/BridgeLaunchAgent.ts`
- Create: `src/bridge/BridgeCommand.ts`
- Modify: `src/cli/index.ts`
- Modify: `scripts/build-cli.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/unit/bridgeConfig.test.ts`
- Test: `tests/unit/bridgeLaunchAgent.test.ts`
- Test: `tests/unit/bridgeCommand.test.ts`
- Test: `tests/unit/cliBuild.test.ts`

**Interfaces:**
- Consumes: Task 2 `startCliBridgeServer`; existing `createCliAnalysisProviderRegistry()`.
- Produces: `resolveBridgePaths(home)`, `loadOrCreateBridgeConfig(paths)`, `renderBridgeLaunchAgent(input)`, `planBridgeInstall(input)`, `planBridgeUninstall(input)`, and Commander subcommands under `markuprx bridge`.

- [ ] **Step 1: Write failing configuration and permissions tests**

Use temporary directories. Assert a new configuration receives a 43-character base64url token, state directory mode `0700`, file mode `0600`, an existing valid token is retained, malformed configuration is rejected rather than replaced, and token rotation atomically replaces only the secret.

- [ ] **Step 2: Run configuration tests and verify RED**

Run: `npx vitest run tests/unit/bridgeConfig.test.ts`

Expected: FAIL because `BridgeConfig.ts` does not exist.

- [ ] **Step 3: Implement bridge paths and secure atomic configuration writes**

Use `mkdir`, a same-directory temporary file with `open(..., 0o600)`, `rename`, and explicit `chmod`. Never use shell interpolation or broad recursive deletion.

- [ ] **Step 4: Run configuration tests and verify GREEN**

Run: `npx vitest run tests/unit/bridgeConfig.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing launch-agent planning tests**

Assert XML escaping, exact program arguments, `RunAtLoad`, `KeepAlive`, log paths inside bridge state, GUI domain `gui/<uid>`, idempotent replacement, rejection of `npx` cache paths, unsupported platforms, and uninstall targets limited to the exact plist/config files.

- [ ] **Step 6: Run launch-agent tests and verify RED**

Run: `npx vitest run tests/unit/bridgeLaunchAgent.test.ts`

Expected: FAIL because launch-agent planning does not exist.

- [ ] **Step 7: Implement launch-agent rendering and command execution**

Invoke `/bin/launchctl` with argument arrays through `spawn`, never a shell. Use `bootstrap`, `bootout`, and `kickstart -k`; treat already-loaded and already-unloaded exit results idempotently. `uninstall` resolves and validates exact owned paths before unlinking them.

- [ ] **Step 8: Add failing CLI command tests, then implement commands**

Test `install`, `serve`, `start`, `stop`, `status`, `token`, `rotate-token`, and `uninstall` with injected lifecycle functions. Then register the command tree in `src/cli/index.ts`. `status` must never print the token; `token` must print it only when explicitly invoked.

Run: `npx vitest run tests/unit/bridgeCommand.test.ts`

Expected after implementation: PASS.

- [ ] **Step 9: Prove the npm CLI bundle contains the bridge**

Add a build test that runs `node scripts/build-cli.mjs`, invokes `node dist/cli/index.mjs bridge --help`, and asserts all lifecycle commands are present.

Run: `npx vitest run tests/unit/cliBuild.test.ts`

Expected after implementation: PASS.

- [ ] **Step 10: Commit bridge lifecycle support**

```bash
git add src/bridge/BridgeConfig.ts src/bridge/BridgeLaunchAgent.ts src/bridge/BridgeCommand.ts src/cli/index.ts scripts/build-cli.mjs package.json package-lock.json tests/unit/bridgeConfig.test.ts tests/unit/bridgeLaunchAgent.test.ts tests/unit/bridgeCommand.test.ts tests/unit/cliBuild.test.ts
git commit -m "feat: install CLI bridge as a user agent"
```

---

### Task 4: Store Bridge Client and Provider Adapters

**Files:**
- Create: `src/main/ai/bridge/CliBridgeClient.ts`
- Create: `src/main/ai/bridge/BridgeCliProvider.ts`
- Modify: `src/main/ai/providers/AnalysisProviderRegistry.ts`
- Modify: `src/main/ai/index.ts`
- Test: `tests/unit/ai/cliBridgeClient.test.ts`
- Test: `tests/unit/ai/bridgeCliProvider.test.ts`
- Modify: `tests/unit/ai/analysisProviderRegistry.test.ts`

**Interfaces:**
- Consumes: Tasks 1-3 protocol and bridge server; `ISettingsManager.getApiKey('cli-bridge')`.
- Produces: `CliBridgeClient`, `CliBridgeClient.getHealth()`, `.discoverProviders(force)`, `.testProvider(provider)`, `.models(provider)`, `.analyze(provider, session, modelId)`, `BridgeCliProvider`, and distribution-aware default registry options.

- [ ] **Step 1: Write failing client transport tests**

Inject `fetch`, token loading, base URL, and timers. Assert two-second discovery timeout, 190-second analysis timeout, authorization header behavior, no request when a token is absent, protocol-version rejection, error-envelope mapping, malformed JSON handling, and session serialization.

- [ ] **Step 2: Run client tests and verify RED**

Run: `npx vitest run tests/unit/ai/cliBridgeClient.test.ts`

Expected: FAIL because the client does not exist.

- [ ] **Step 3: Implement the minimal typed bridge client**

Use `AbortSignal.timeout` or a locally managed `AbortController`. Never log request bodies or headers. Map connection refusal to `Start MarkuprPlus CLI Bridge`, missing token to `Pair MarkuprPlus Bridge`, and malformed responses to `BRIDGE_PROTOCOL_ERROR`.

- [ ] **Step 4: Run client tests and verify GREEN**

Run: `npx vitest run tests/unit/ai/cliBridgeClient.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing adapter and registry distribution tests**

Assert one bridge adapter per CLI ID, correct status/model/analysis forwarding, direct distribution using existing local adapters, MAS distribution using bridge adapters, and Ollama/LM Studio/Anthropic remaining in both.

```ts
const mas = createDefaultAnalysisProviderRegistry(settings, {
  distribution: 'mas', bridgeClient,
});
expect(mas.get('codex-cli')).toBeInstanceOf(BridgeCliProvider);
expect(mas.get('ollama')).toMatchObject({ id: 'ollama' });
```

- [ ] **Step 6: Run adapter/registry tests and verify RED**

Run: `npx vitest run tests/unit/ai/bridgeCliProvider.test.ts tests/unit/ai/analysisProviderRegistry.test.ts`

Expected: FAIL because MAS adapters are absent.

- [ ] **Step 7: Implement bridge adapters and distribution routing**

Replace the boolean `allowCliProviders` parameter with:

```ts
export interface DefaultAnalysisProviderRegistryOptions {
  distribution?: DistributionKind;
  bridgeClient?: CliBridgeClient;
}
```

Default `distribution` through `currentDistribution()`. Direct registers existing analyzers; MAS registers `BridgeCliProvider` instances using one shared client.

- [ ] **Step 8: Run provider and pipeline regressions**

Run: `npx vitest run tests/unit/ai/bridgeCliProvider.test.ts tests/unit/ai/analysisProviderRegistry.test.ts tests/unit/ai/aiPipelineManager.test.ts tests/unit/analysisProviderIpc.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit Store provider routing**

```bash
git add src/main/ai/bridge/CliBridgeClient.ts src/main/ai/bridge/BridgeCliProvider.ts src/main/ai/providers/AnalysisProviderRegistry.ts src/main/ai/index.ts tests/unit/ai/cliBridgeClient.test.ts tests/unit/ai/bridgeCliProvider.test.ts tests/unit/ai/analysisProviderRegistry.test.ts
git commit -m "feat: route Store CLI providers through bridge"
```

---

### Task 5: Secure Pairing IPC and Preload API

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/main/ipc/cliBridgeHandlers.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/main/ipc/settingsHandlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/types/electron.d.ts`
- Test: `tests/unit/cliBridgeIpc.test.ts`
- Test: `tests/unit/cliBridgePreload.test.ts`
- Modify: `tests/unit/navigationPreload.test.ts`

**Interfaces:**
- Consumes: Task 4 client and `ISettingsManager` secure secret storage.
- Produces: `CliBridgeConnectionStatus`, IPC channels `CLI_BRIDGE_STATUS`, `CLI_BRIDGE_PAIR`, and `CLI_BRIDGE_FORGET`; renderer API `window.markuprx.cliBridge.status()`, `.pair(token)`, and `.forget()`.

- [ ] **Step 1: Write failing IPC security tests**

Assert status never returns a token, Pair rejects malformed token lengths without network access, Pair validates via authenticated discovery before saving, failed validation preserves an existing valid token, Forget deletes the secret, changes a selected CLI provider to `rules`, and direct distribution returns `not-applicable`.

- [ ] **Step 2: Run IPC tests and verify RED**

Run: `npx vitest run tests/unit/cliBridgeIpc.test.ts`

Expected: FAIL because bridge IPC is undefined.

- [ ] **Step 3: Implement dedicated bridge IPC**

Do not add `cli-bridge` to the generic renderer-readable API-key service allowlist. Main-process handlers alone call `getApiKey`, `setApiKey`, and `deleteApiKey` for the service. Add deletion to Clear All Data.

- [ ] **Step 4: Run IPC tests and verify GREEN**

Run: `npx vitest run tests/unit/cliBridgeIpc.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing preload surface tests**

Assert the three exact IPC calls and prove the renderer-facing TypeScript interface has no token getter.

- [ ] **Step 6: Implement and verify the preload API**

Run: `npx vitest run tests/unit/cliBridgePreload.test.ts tests/unit/navigationPreload.test.ts && npm run typecheck`

Expected after implementation: PASS and zero type errors.

- [ ] **Step 7: Commit pairing IPC**

```bash
git add src/shared/types.ts src/main/ipc/cliBridgeHandlers.ts src/main/ipc/index.ts src/main/ipc/settingsHandlers.ts src/preload/index.ts src/renderer/types/electron.d.ts tests/unit/cliBridgeIpc.test.ts tests/unit/cliBridgePreload.test.ts tests/unit/navigationPreload.test.ts
git commit -m "feat: add secure CLI bridge pairing"
```

---

### Task 6: Store Bridge Setup and Provider UX

**Files:**
- Create: `src/renderer/components/settings/CliBridgeSetup.tsx`
- Create: `src/renderer/components/settings/cliBridgeViewState.ts`
- Modify: `src/renderer/components/settings/AdvancedTab.tsx`
- Modify: `src/renderer/components/settings/AnalysisProviderSelector.tsx`
- Modify: `src/renderer/components/settings/analysisProviderOptions.ts`
- Modify: `src/renderer/components/settings/useSettingsPanel.ts`
- Modify: `src/renderer/components/SettingsPanel.tsx`
- Test: `tests/unit/cliBridgeViewState.test.ts`
- Modify: `tests/unit/analysisProviderOptions.test.ts`
- Modify: `tests/unit/analysisProviderViewState.test.ts`
- Modify: `tests/ui/markuprx-electron.spec.ts`

**Interfaces:**
- Consumes: Task 5 `window.markuprx.cliBridge` API and `CliBridgeConnectionStatus`.
- Produces: Store-only setup panel, pairing handlers in `useSettingsPanel`, all provider cards in MAS, and `Via MarkuprPlus Bridge` CLI status copy.

- [ ] **Step 1: Write failing pure view-state and provider-option tests**

Assert Not paired, Bridge offline, Version incompatible, and Connected copy/actions. Change the MAS provider expectation from four cards to all thirteen; ensure MAS CLI descriptions mention the bridge while direct descriptions remain unchanged.

- [ ] **Step 2: Run the pure renderer tests and verify RED**

Run: `npx vitest run tests/unit/cliBridgeViewState.test.ts tests/unit/analysisProviderOptions.test.ts tests/unit/analysisProviderViewState.test.ts`

Expected: FAIL on the old MAS filter and missing view state.

- [ ] **Step 3: Implement view-state helpers and provider option transformation**

`providerOptionsForDistribution('mas')` returns every option and copies CLI options with bridge-specific descriptions. Do not mutate the direct option constants.

- [ ] **Step 4: Implement Store-only pairing state in the settings hook**

Track token input locally; load status without retrieving the saved token; pair through dedicated IPC; clear the input after success; refresh providers after Pair/Forget/Test; preserve errors until the next action.

- [ ] **Step 5: Implement the accessible setup panel**

Use a password input, visible labels, status text, Pair/Test/Forget/Refresh buttons, and copyable commands:

```text
npm install -g markuprx
markuprx bridge install
```

The Store app displays but never executes these commands. Render the panel only when `currentDistribution() === 'mas'`.

- [ ] **Step 6: Run renderer tests and typecheck**

Run: `npx vitest run tests/unit/cliBridgeViewState.test.ts tests/unit/analysisProviderOptions.test.ts tests/unit/analysisProviderViewState.test.ts tests/unit/appViewState.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Add an Electron UI assertion and run it**

Build the MAS renderer and assert Advanced Settings shows the bridge panel and Codex/OpenCode cards while the direct build omits the setup panel.

Run: `npm run build:desktop && npx playwright test tests/ui/markuprx-electron.spec.ts`

Expected: PASS.

- [ ] **Step 8: Commit the Store UX**

```bash
git add src/renderer/components/settings/CliBridgeSetup.tsx src/renderer/components/settings/cliBridgeViewState.ts src/renderer/components/settings/AdvancedTab.tsx src/renderer/components/settings/AnalysisProviderSelector.tsx src/renderer/components/settings/analysisProviderOptions.ts src/renderer/components/settings/useSettingsPanel.ts src/renderer/components/SettingsPanel.tsx tests/unit/cliBridgeViewState.test.ts tests/unit/analysisProviderOptions.test.ts tests/unit/analysisProviderViewState.test.ts tests/ui/markuprx-electron.spec.ts
git commit -m "feat: add Store CLI bridge setup"
```

---

### Task 7: Release Documentation, Privacy, and Version 3.1.0

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `electron-builder.mas.yml`
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `site/privacy.html`
- Modify: `app-store/metadata/en-US.md`
- Modify: `app-store/review-notes.md`
- Modify: `app-store/privacy-answers.md`
- Modify: `tests/unit/appStoreMetadata.test.ts`
- Test: `tests/unit/cliBridgeDocumentation.test.ts`

**Interfaces:**
- Consumes: final bridge commands and Store UX wording.
- Produces: version `3.1.0`, build `3`, accurate public instructions, privacy disclosure, review walkthrough, and App Store What's New copy.

- [ ] **Step 1: Write failing release-copy tests**

Assert package versions, build version, install/pair/status/rotate/uninstall commands, optional-companion language, loopback disclosure, Local Rules review path, no claim that the Store app directly executes external tools, and App Store field limits.

- [ ] **Step 2: Run metadata tests and verify RED**

Run: `npx vitest run tests/unit/appStoreMetadata.test.ts tests/unit/cliBridgeDocumentation.test.ts`

Expected: FAIL on version and missing bridge disclosures.

- [ ] **Step 3: Update release and user documentation**

Set package and lockfile version to `3.1.0`, MAS `buildVersion` to `3`, add a 3.1.0 changelog entry, and document the complete lifecycle. App Store description names CLI compatibility only through the optional local companion. Review notes lead with a companion-free Local Rules walkthrough and separately disclose optional bridge testing.

- [ ] **Step 4: Run metadata tests and verify GREEN**

Run: `npx vitest run tests/unit/appStoreMetadata.test.ts tests/unit/cliBridgeDocumentation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit release documentation**

```bash
git add package.json package-lock.json electron-builder.mas.yml CHANGELOG.md README.md site/privacy.html app-store/metadata/en-US.md app-store/review-notes.md app-store/privacy-answers.md tests/unit/appStoreMetadata.test.ts tests/unit/cliBridgeDocumentation.test.ts
git commit -m "docs: prepare MarkuprPlus 3.1.0 Store update"
```

---

### Task 8: Full Verification and Real Local Bridge Smoke Test

**Files:**
- Modify only files required by failures that reproduce a feature regression, always after adding a failing regression test.

**Interfaces:**
- Consumes: Tasks 1-7.
- Produces: verified source, npm bundles, direct desktop bundle, MAS desktop bundle, and a real local bridge/provider smoke result.

- [ ] **Step 1: Run the bridge-focused suite**

```bash
npx vitest run \
  tests/unit/cliBridgeProtocol.test.ts \
  tests/unit/bridgeSession.test.ts \
  tests/unit/cliBridgeServer.test.ts \
  tests/integration/cliBridgeHttp.test.ts \
  tests/unit/bridgeConfig.test.ts \
  tests/unit/bridgeLaunchAgent.test.ts \
  tests/unit/bridgeCommand.test.ts \
  tests/unit/ai/cliBridgeClient.test.ts \
  tests/unit/ai/bridgeCliProvider.test.ts \
  tests/unit/cliBridgeIpc.test.ts \
  tests/unit/cliBridgePreload.test.ts \
  tests/unit/cliBridgeViewState.test.ts
```

Expected: PASS with zero failures.

- [ ] **Step 2: Run static and full test gates**

Run: `npm run lint && npm run typecheck && npm run test:ci`

Expected: all commands exit zero with no new warnings.

- [ ] **Step 3: Build every published runtime**

Run: `npm run build && npm run build:mas`

Expected: desktop, CLI, MCP, direct renderer, and MAS renderer builds exit zero. Inspect MAS renderer strings for Codex/OpenCode and direct main bundle behavior for local CLI adapters.

- [ ] **Step 4: Run Electron UI and package-source checks**

Run: `npx playwright test && npm run verify:brand && node scripts/verify-ci.mjs`

Expected: PASS.

- [ ] **Step 5: Smoke test a real foreground bridge without installing launchd state**

Run `node dist/cli/index.mjs bridge serve` using a temporary configuration directory override reserved for tests, read the generated token with the explicit token command, call health and provider discovery, and execute one available provider against a controlled transcript-only session. Do not send user capture data.

Expected: health reports protocol 1; at least one locally installed provider reports its real readiness; a ready provider returns a valid analysis result. If none is ready, record discovery evidence and keep the automated fake-provider analysis test as the execution proof.

- [ ] **Step 6: Commit any test-proven verification fixes**

Commit only focused corrections with their regression tests. End with `git status --short` showing only pre-existing user-owned untracked files outside this feature.

---

### Task 9: Signed MAS Package, Upload, and App Store Submission

**Files:**
- Generated: `release-mas/MarkuprPlus.app`
- Generated: `release-mas/markuprplus-3.1.0-mas.pkg`
- External: App Store Connect MarkuprPlus macOS version 3.1.0.

**Interfaces:**
- Consumes: verified Task 8 commit, Apple Distribution and Mac Installer Distribution identities, MAS provisioning profile, App Store Connect account.
- Produces: signed universal MAS package, uploaded build 3, completed version metadata, selected processed build, and submitted App Store update.

- [ ] **Step 1: Resolve release credentials without exposing secrets**

Check available signing identities with `security find-identity -v -p codesigning`, resolve the exact provisioning profile path through configured environment or known release state, and verify the App Store Connect session. Print only presence/status, never private-key, API-key, password, or profile contents.

- [ ] **Step 2: Build and verify the signed package**

Run: `npm run package:mas`

Expected: universal signed `.app` and installer `.pkg`; `npm run verify:mas` passes signature, profile, entitlements, architectures, and layout.

- [ ] **Step 3: Perform independent binary checks**

```bash
codesign --verify --deep --strict --verbose=2 release-mas/MarkuprPlus.app
codesign -d --entitlements :- release-mas/MarkuprPlus.app
pkgutil --check-signature release-mas/markuprplus-3.1.0-mas.pkg
lipo -archs release-mas/MarkuprPlus.app/Contents/MacOS/MarkuprPlus
```

Expected: valid nested signatures, App Sandbox/network/audio/user-selected-file entitlements, trusted installer signature, and `x86_64 arm64`.

- [ ] **Step 4: Upload build 3**

Use the available authenticated Apple upload path (Transporter/App Store Connect tooling) to upload the `.pkg`. Preserve upload logs without secrets and verify App Store Connect accepts the bundle/version/build tuple.

- [ ] **Step 5: Wait for build processing and resolve validation errors**

Monitor build 3 until processing completes. If Apple reports a validation error, capture its exact code/message, add a failing package regression test when locally reproducible, implement the smallest correction, rebuild, reverify, and upload a strictly higher build number.

- [ ] **Step 6: Complete version 3.1.0 metadata**

Create or select macOS version 3.1.0, apply the approved What's New, description, URLs, privacy declarations, age rating, export compliance, review notes, availability, and existing $9.99 price. Reuse valid screenshots unless App Store Connect requires replacements.

- [ ] **Step 7: Select the processed build and submit for review**

Select the processed build, resolve remaining App Store Connect validation items, and invoke Submit for Review. The user's instruction on 2026-08-30 to “build and submit to app store autonomously as an update” is the explicit action-time authorization for this submission.

- [ ] **Step 8: Record release evidence**

Report version, build, source commit, package path, signature verification, upload delivery identifier, App Store Connect processing state, selected build, and final submission state. Do not report or store secrets.
