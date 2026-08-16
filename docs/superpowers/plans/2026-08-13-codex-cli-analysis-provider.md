# Codex CLI Analysis Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a selectable Codex CLI analysis provider that discovers and safely invokes the user's installed, authenticated Codex, then rebuild and reinstall the local macOS app.

**Architecture:** Persist an explicit analysis-provider setting and route the existing safety-first report pipeline through a provider-specific adapter. A main-process discovery service resolves Codex independently of a terminal `PATH`; a Codex analyzer invokes `codex exec` with structured output, an isolated temporary directory, and read-only/ephemeral safety flags. Renderer access stays behind provider-specific IPC and preload APIs.

**Tech Stack:** Electron 28, React 18, TypeScript 5, electron-store, Node child processes and filesystem APIs, Vitest, electron-vite, electron-builder.

## Global Constraints

- This release implements Codex CLI only; no Claude Code, Gemini CLI, OpenCode, or Aider adapter.
- Provider IDs are exactly `rules`, `anthropic`, and `codex`.
- Existing users default to `anthropic`; Codex is opt-in.
- Codex uses the user's existing authentication and MarkuprX never reads or stores Codex tokens.
- Codex execution is ephemeral, read-only, ignores user configuration and rules, and has a three-minute timeout.
- Codex failure always preserves the rule-based report and never silently invokes Anthropic.
- No transcription provider behavior changes.
- The deployed artifact is an unsigned Apple Silicon app installed at `/Applications/MarkuprX.app`.

---

## File Structure

### New production files

- `src/main/ai/CliProcessRunner.ts`: bounded, timeout-aware, shell-free subprocess execution.
- `src/main/ai/CodexCliDiscovery.ts`: executable resolution plus version/authentication probes.
- `src/main/ai/CodexAnalyzer.ts`: temporary-file lifecycle, prompt/schema construction, Codex invocation, and result parsing.
- `src/main/ai/analysisContract.ts`: shared analysis system prompt, transcript formatting, JSON schema, and result parser used by both analyzers.
- `src/main/ipc/analysisProviderHandlers.ts`: validated discovery/test IPC endpoints.
- `src/renderer/components/settings/AnalysisProviderSelector.tsx`: provider cards and Codex status UI.
- `src/renderer/components/settings/analysisProviderViewState.ts`: pure readiness/copy derivation for UI tests.

### New test files

- `tests/unit/analysisProviderSettings.test.ts`
- `tests/unit/ai/cliProcessRunner.test.ts`
- `tests/unit/ai/codexCliDiscovery.test.ts`
- `tests/unit/ai/codexAnalyzer.test.ts`
- `tests/unit/ai/aiPipelineManager.test.ts`
- `tests/unit/analysisProviderIpc.test.ts`
- `tests/unit/analysisProviderViewState.test.ts`

### Existing files modified

- `src/shared/types.ts`: provider types, settings field, status types, and IPC channels.
- `src/main/settings/SettingsManager.ts`: default, schema, and value validation.
- `src/main/ai/ClaudeAnalyzer.ts`: consume the extracted shared analysis contract.
- `src/main/ai/AIPipelineManager.ts`: explicit provider selection and Codex routing.
- `src/main/ai/StructuredMarkdownBuilder.ts`: provider-neutral attribution.
- `src/main/ai/types.ts`: provider metadata on pipeline output.
- `src/main/ai/index.ts`: exports.
- `src/main/ipc/index.ts`: register analysis-provider handlers.
- `src/preload/index.ts`: expose narrow analysis-provider API.
- `src/renderer/types/electron.d.ts`: type the preload API.
- `src/renderer/components/settings/AdvancedTab.tsx`: compose provider selector and conditionally render Anthropic keys.
- `src/renderer/components/settings/useSettingsPanel.ts`: discovery, refresh, selection, and readiness state.
- `src/renderer/components/SettingsPanel.tsx`: pass provider props and use provider-aware setup badge.
- `src/renderer/contexts/UIContext.tsx`: load provider readiness instead of requiring an Anthropic key unconditionally.
- `src/renderer/App.tsx`: provider-aware setup copy.
- `src/renderer/components/Onboarding.tsx`: describe Anthropic as optional.

---

### Task 1: Provider Settings Contract

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/settings/SettingsManager.ts`
- Create: `tests/unit/analysisProviderSettings.test.ts`

**Interfaces:**
- Produces: `AnalysisProvider`, `AnalysisProviderStatus`, `AppSettings.analysisProvider`, `IPC_CHANNELS.ANALYSIS_PROVIDERS_DISCOVER`, and `IPC_CHANNELS.ANALYSIS_PROVIDER_TEST`.
- Consumes: existing `AppSettings`, `DEFAULT_SETTINGS`, and `SettingsManager` validation patterns.

- [ ] **Step 1: Write the failing contract tests**

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, IPC_CHANNELS } from '../../src/shared/types';
import { DEFAULT_SETTINGS as MANAGER_DEFAULTS } from '../../src/main/settings/SettingsManager';

describe('analysis provider settings', () => {
  it('preserves Anthropic as the upgrade default', () => {
    expect(DEFAULT_SETTINGS.analysisProvider).toBe('anthropic');
    expect(MANAGER_DEFAULTS.analysisProvider).toBe('anthropic');
  });

  it('defines narrow provider IPC channels', () => {
    expect(IPC_CHANNELS.ANALYSIS_PROVIDERS_DISCOVER).toBe('markuprx:analysis-providers:discover');
    expect(IPC_CHANNELS.ANALYSIS_PROVIDER_TEST).toBe('markuprx:analysis-provider:test');
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npx vitest run tests/unit/analysisProviderSettings.test.ts`

Expected: TypeScript/runtime failure because `analysisProvider` and the IPC channels do not exist.

- [ ] **Step 3: Add the shared types and defaults**

Add to `src/shared/types.ts`:

```ts
export type AnalysisProvider = 'rules' | 'anthropic' | 'codex';

export interface AnalysisProviderStatus {
  id: AnalysisProvider;
  name: string;
  installed: boolean;
  executablePath?: string;
  version?: string;
  authenticated?: boolean;
  ready: boolean;
  diagnostic?: string;
}
```

Add `analysisProvider: AnalysisProvider` to `AppSettings`, set it to `anthropic` in both defaults, and add the two exact IPC channel strings from the test.

In `SettingsManager`, add the JSON schema entry and validate only the three provider IDs:

```ts
analysisProvider: { type: 'string', enum: ['rules', 'anthropic', 'codex'] },
```

```ts
case 'analysisProvider':
  return value === 'rules' || value === 'anthropic' || value === 'codex';
```

- [ ] **Step 4: Run the focused test and typecheck**

Run: `npx vitest run tests/unit/analysisProviderSettings.test.ts && npm run typecheck`

Expected: provider settings test passes; typecheck may identify exhaustive object literals in tests that must add `analysisProvider: 'anthropic'`.

- [ ] **Step 5: Update affected test fixtures and rerun**

Add `analysisProvider: 'anthropic'` only to typed `AppSettings` literals reported by TypeScript, then run: `npm run typecheck && npx vitest run tests/unit/analysisProviderSettings.test.ts`

Expected: both commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/settings/SettingsManager.ts tests/unit/analysisProviderSettings.test.ts tests
git commit -m "feat: add analysis provider setting"
```

---

### Task 2: Safe CLI Execution and Codex Discovery

**Files:**
- Create: `src/main/ai/CliProcessRunner.ts`
- Create: `src/main/ai/CodexCliDiscovery.ts`
- Create: `tests/unit/ai/cliProcessRunner.test.ts`
- Create: `tests/unit/ai/codexCliDiscovery.test.ts`
- Modify: `src/main/ai/index.ts`

**Interfaces:**
- Consumes: `AnalysisProviderStatus` from Task 1.
- Produces: `runCliProcess(options): Promise<CliProcessResult>`, `CodexCliDiscovery.discover(forceRefresh?): Promise<AnalysisProviderStatus>`, and `buildCliEnvironment(executablePath)`.

- [ ] **Step 1: Write failing process-runner tests**

Use a real Node subprocess to prove standard input, bounded output, and timeout behavior:

```ts
it('writes stdin and captures output without a shell', async () => {
  const result = await runCliProcess({
    executable: process.execPath,
    args: ['-e', 'process.stdin.pipe(process.stdout)'],
    stdin: 'session transcript',
    timeoutMs: 2_000,
    maxOutputBytes: 1024,
  });
  expect(result).toMatchObject({ exitCode: 0, stdout: 'session transcript', timedOut: false });
});

it('terminates a command after its timeout', async () => {
  const result = await runCliProcess({
    executable: process.execPath,
    args: ['-e', 'setInterval(() => {}, 1000)'],
    timeoutMs: 25,
    maxOutputBytes: 1024,
  });
  expect(result.timedOut).toBe(true);
});
```

- [ ] **Step 2: Confirm process-runner RED**

Run: `npx vitest run tests/unit/ai/cliProcessRunner.test.ts`

Expected: import failure because `CliProcessRunner.ts` does not exist.

- [ ] **Step 3: Implement the process runner**

Define:

```ts
export interface CliProcessOptions {
  executable: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  timeoutMs: number;
  maxOutputBytes: number;
}

export interface CliProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
}
```

Use `spawn(executable, args, { shell: false, stdio: ['pipe', 'pipe', 'pipe'] })`, cap both streams, write/end stdin, set a timeout, send `SIGTERM`, and resolve once on `close` or `error`.

- [ ] **Step 4: Verify process-runner GREEN**

Run: `npx vitest run tests/unit/ai/cliProcessRunner.test.ts`

Expected: all process-runner tests pass.

- [ ] **Step 5: Write failing discovery tests**

Inject filesystem and runner dependencies so tests do not use the real account:

```ts
const discovery = new CodexCliDiscovery({
  env: { PATH: '/custom/bin' },
  homeDirectory: '/Users/tester',
  shell: '/bin/zsh',
  isExecutable: async (path) => path === '/opt/homebrew/bin/codex',
  realpath: async (path) => path,
  run: async ({ args }) => args.includes('--version')
    ? { exitCode: 0, stdout: 'codex-cli 0.147.0\n', stderr: '', timedOut: false, truncated: false }
    : { exitCode: 0, stdout: 'Logged in using ChatGPT\n', stderr: '', timedOut: false, truncated: false },
});

expect(await discovery.discover()).toMatchObject({
  id: 'codex',
  installed: true,
  executablePath: '/opt/homebrew/bin/codex',
  version: 'codex-cli 0.147.0',
  authenticated: true,
  ready: true,
});
```

Also test a missing executable and a non-zero `codex login status` result.

- [ ] **Step 6: Confirm discovery RED**

Run: `npx vitest run tests/unit/ai/codexCliDiscovery.test.ts`

Expected: import failure because `CodexCliDiscovery.ts` does not exist.

- [ ] **Step 7: Implement discovery**

Check current `PATH`, `/opt/homebrew/bin/codex`, `/usr/local/bin/codex`, `~/.local/bin/codex`, then a fixed login-shell `command -v codex` probe. Resolve the executable, normalize its directory into the child `PATH`, run `--version` and `login status`, cache the result, and bypass the cache on `forceRefresh === true`.

The missing result is exact:

```ts
{
  id: 'codex',
  name: 'Codex CLI',
  installed: false,
  authenticated: false,
  ready: false,
  diagnostic: 'Codex CLI was not found. Install Codex, then scan again.',
}
```

- [ ] **Step 8: Verify discovery GREEN and commit**

Run: `npx vitest run tests/unit/ai/cliProcessRunner.test.ts tests/unit/ai/codexCliDiscovery.test.ts && npm run typecheck`

Then:

```bash
git add src/main/ai/CliProcessRunner.ts src/main/ai/CodexCliDiscovery.ts src/main/ai/index.ts tests/unit/ai
git commit -m "feat: discover installed Codex CLI"
```

---

### Task 3: Shared Analysis Contract and Codex Adapter

**Files:**
- Create: `src/main/ai/analysisContract.ts`
- Create: `src/main/ai/CodexAnalyzer.ts`
- Create: `tests/unit/ai/codexAnalyzer.test.ts`
- Modify: `src/main/ai/ClaudeAnalyzer.ts`
- Modify: `src/main/ai/index.ts`

**Interfaces:**
- Consumes: `CodexCliDiscovery`, `runCliProcess`, `Session`, and `AIAnalysisResult`.
- Produces: `ANALYSIS_SYSTEM_PROMPT`, `ANALYSIS_JSON_SCHEMA`, `buildTranscriptText`, `parseAnalysisResult`, `CodexAnalyzer.analyze(session): Promise<AIAnalysisResult>`, and `CodexCliError`.

- [ ] **Step 1: Write failing shared-contract and adapter tests**

Create a session fixture with a final transcript and one PNG screenshot buffer. Inject a ready discovery result and fake process runner that writes valid JSON to the `--output-last-message` path.

```ts
const analysis = await analyzer.analyze(sessionFixture);
expect(analysis.summary).toBe('One issue found.');
expect(invocation.args).toEqual(expect.arrayContaining([
  'exec', '--ephemeral', '--sandbox', 'read-only', '--ignore-user-config',
  '--ignore-rules', '--skip-git-repo-check', '--output-schema',
]));
expect(invocation.args).toContain('--image');
expect(invocation.stdin).toContain('Button overlaps the header');
expect(invocation.args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
```

Add tests that reject unauthenticated discovery, non-zero exit, timeout, oversized/truncated output, missing output, and malformed JSON. Assert the temporary directory is removed after success and failure.

- [ ] **Step 2: Confirm adapter RED**

Run: `npx vitest run tests/unit/ai/codexAnalyzer.test.ts`

Expected: imports fail because the analysis contract and adapter do not exist.

- [ ] **Step 3: Extract the provider-neutral analysis contract**

Move the current system prompt, transcript formatter, JSON parsing, validation, and coercion from `ClaudeAnalyzer.ts` into `analysisContract.ts`. Add an explicit JSON schema:

```ts
export const ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'items', 'themes', 'positiveNotes', 'metadata'],
  properties: {
    summary: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'category', 'priority', 'quote', 'screenshotIndices', 'actionItem', 'area'],
        properties: {
          title: { type: 'string' },
          category: { enum: ['Bug', 'UX Issue', 'Performance', 'Suggestion', 'Question', 'Positive Note'] },
          priority: { enum: ['Critical', 'High', 'Medium', 'Low'] },
          quote: { type: 'string' },
          screenshotIndices: { type: 'array', items: { type: 'integer', minimum: 0 } },
          actionItem: { type: 'string' },
          area: { type: 'string' },
        },
      },
    },
    themes: { type: 'array', items: { type: 'string' } },
    positiveNotes: { type: 'array', items: { type: 'string' } },
    metadata: {
      type: 'object',
      additionalProperties: false,
      required: ['totalItems', 'criticalCount', 'highCount'],
      properties: {
        totalItems: { type: 'integer', minimum: 0 },
        criticalCount: { type: 'integer', minimum: 0 },
        highCount: { type: 'integer', minimum: 0 },
      },
    },
  },
} as const;
```

Update `ClaudeAnalyzer` to import the extracted functions without changing its behavior.

- [ ] **Step 4: Implement the minimal Codex adapter**

Create a unique `mkdtemp(join(tmpdir(), 'markuprx-codex-'))`, write `analysis-schema.json`, write each screenshot buffer to an indexed PNG, build the exact safe argument array, and pass the full prompt on stdin. Limit captured output to 1 MiB and timeout after `180_000` ms. Read a maximum 1 MiB final-message file, parse it with `parseAnalysisResult`, and always `rm(tempDir, { recursive: true, force: true })` in `finally`.

- [ ] **Step 5: Verify adapter GREEN and Claude regression**

Run: `npx vitest run tests/unit/ai/codexAnalyzer.test.ts tests/unit/appIntegration.test.ts && npm run typecheck`

Expected: all commands exit 0 and the existing Claude path compiles unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/main/ai/analysisContract.ts src/main/ai/CodexAnalyzer.ts src/main/ai/ClaudeAnalyzer.ts src/main/ai/index.ts tests/unit/ai/codexAnalyzer.test.ts
git commit -m "feat: analyze sessions with Codex CLI"
```

---

### Task 4: Provider-Aware AI Pipeline

**Files:**
- Modify: `src/main/ai/AIPipelineManager.ts`
- Modify: `src/main/ai/StructuredMarkdownBuilder.ts`
- Modify: `src/main/ai/types.ts`
- Modify: `src/main/index.ts`
- Create: `tests/unit/ai/aiPipelineManager.test.ts`

**Interfaces:**
- Consumes: `AppSettings.analysisProvider`, `CodexAnalyzer`, `ClaudeAnalyzer`, and `structuredMarkdownBuilder`.
- Produces: `AIPipelineOutput.provider`, provider-neutral attribution, and explicit provider fallback behavior.

- [ ] **Step 1: Write failing pipeline-selection tests**

Inject analyzer factories through optional test dependencies on `PipelineProcessOptions`:

```ts
await processSession(sessionFixture, {
  settingsManager: settingsWithProvider('codex'),
  dependencies: {
    createCodexAnalyzer: () => ({ analyze: codexAnalyze }),
    createClaudeAnalyzer: () => ({ analyze: anthropicAnalyze }),
  },
});

expect(codexAnalyze).toHaveBeenCalledOnce();
expect(anthropicAnalyze).not.toHaveBeenCalled();
```

Add tests for `rules`, successful `anthropic`, successful `codex`, Codex failure fallback, missing Codex fallback, and the guarantee that a Codex failure never calls Anthropic.

- [ ] **Step 2: Confirm pipeline RED**

Run: `npx vitest run tests/unit/ai/aiPipelineManager.test.ts`

Expected: failures because provider selection and injection do not exist.

- [ ] **Step 3: Implement explicit provider routing**

Read `settingsManager.get('analysisProvider')` once. Keep rule-based generation first. Instantiate only the selected adapter. Record:

```ts
provider: 'rules' | 'anthropic' | 'codex';
providerLabel?: string;
```

Map `rules` to `tier: 'free'`, and both external providers to `tier: 'byok'` for compatibility. On adapter error return the rule-based document with the selected provider and sanitized `fallbackReason`.

- [ ] **Step 4: Make Markdown attribution provider-neutral**

Replace hard-coded Claude footer text with `providerLabel`, for example `AI-analyzed by Codex CLI`, while keeping `modelId` optional. Update the comments in `src/main/index.ts` and include provider in analysis timing logs.

- [ ] **Step 5: Verify pipeline GREEN**

Run: `npx vitest run tests/unit/ai/aiPipelineManager.test.ts && npm run typecheck`

Expected: all provider routes and typecheck pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/ai/AIPipelineManager.ts src/main/ai/StructuredMarkdownBuilder.ts src/main/ai/types.ts src/main/index.ts tests/unit/ai/aiPipelineManager.test.ts
git commit -m "feat: route analysis through selected provider"
```

---

### Task 5: Provider IPC and Preload API

**Files:**
- Create: `src/main/ipc/analysisProviderHandlers.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/types/electron.d.ts`
- Create: `tests/unit/analysisProviderIpc.test.ts`
- Modify: `tests/unit/navigationPreload.test.ts`

**Interfaces:**
- Consumes: `CodexCliDiscovery.discover()` and the Task 1 IPC channels.
- Produces: `window.markuprx.analysisProviders.discover(forceRefresh?)` and `.test('codex')`.

- [ ] **Step 1: Write failing IPC/preload tests**

Assert that registration installs both handlers, rejects provider IDs other than `codex`, and that the preload source invokes only the fixed channels:

```ts
expect(window.markuprx.analysisProviders.discover(true)).resolves.toEqual([codexStatus]);
expect(window.markuprx.analysisProviders.test('codex')).resolves.toEqual(codexStatus);
```

- [ ] **Step 2: Confirm IPC RED**

Run: `npx vitest run tests/unit/analysisProviderIpc.test.ts tests/unit/navigationPreload.test.ts`

Expected: missing handler registration and preload API failures.

- [ ] **Step 3: Implement narrow handlers and preload methods**

The discovery endpoint returns static ready statuses for `rules`, a key-presence status for `anthropic`, and the discovered Codex status. The test endpoint accepts only the literal `codex`, forces a refresh, and throws `Unsupported analysis provider` otherwise. The renderer never supplies a path, command, or argument.

- [ ] **Step 4: Verify IPC GREEN and commit**

Run: `npx vitest run tests/unit/analysisProviderIpc.test.ts tests/unit/navigationPreload.test.ts && npm run typecheck`

Then:

```bash
git add src/main/ipc/analysisProviderHandlers.ts src/main/ipc/index.ts src/preload/index.ts src/renderer/types/electron.d.ts tests/unit/analysisProviderIpc.test.ts tests/unit/navigationPreload.test.ts
git commit -m "feat: expose analysis provider discovery"
```

---

### Task 6: Provider Selection and Readiness UI

**Files:**
- Create: `src/renderer/components/settings/AnalysisProviderSelector.tsx`
- Create: `src/renderer/components/settings/analysisProviderViewState.ts`
- Modify: `src/renderer/components/settings/AdvancedTab.tsx`
- Modify: `src/renderer/components/settings/useSettingsPanel.ts`
- Modify: `src/renderer/components/SettingsPanel.tsx`
- Modify: `src/renderer/contexts/UIContext.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/Onboarding.tsx`
- Create: `tests/unit/analysisProviderViewState.test.ts`
- Modify: `tests/unit/appViewState.test.ts`

**Interfaces:**
- Consumes: `AnalysisProviderStatus`, `AppSettings.analysisProvider`, and `window.markuprx.analysisProviders`.
- Produces: `getAnalysisProviderViewState(provider, statuses)`, provider selector UI, provider-aware Settings badge, and main-window readiness copy.

- [ ] **Step 1: Write failing view-state tests**

```ts
expect(getAnalysisProviderViewState('codex', [readyCodex])).toEqual({
  ready: true,
  title: 'Codex CLI ready',
  detail: 'Reports will be analyzed with your installed Codex CLI.',
  actionLabel: undefined,
});

expect(getAnalysisProviderViewState('codex', [missingCodex])).toMatchObject({
  ready: false,
  title: 'Codex needs attention',
  actionLabel: 'Open AI Settings',
});

expect(getAnalysisProviderViewState('rules', [])).toMatchObject({ ready: true });
```

Also retain an Anthropic missing-key case with the existing setup action.

- [ ] **Step 2: Confirm UI-state RED**

Run: `npx vitest run tests/unit/analysisProviderViewState.test.ts tests/unit/appViewState.test.ts`

Expected: missing helper and old hard-coded BYOK copy failures.

- [ ] **Step 3: Implement the pure readiness helper and selector component**

Render three radio-style provider cards. The Codex card shows status dot, version, path, diagnostic, and **Scan again**. Use native buttons and existing Settings styles/tokens; do not add a UI library.

- [ ] **Step 4: Wire Settings state**

On Settings open, load settings and discover providers. Selecting a card calls `settings.set('analysisProvider', id)`, updates local state, and dispatches `markuprx:settings-updated`. Scan again calls `analysisProviders.discover(true)`. Show Anthropic key controls only for `analysisProvider === 'anthropic'`; keep the OpenAI transcription-key controls unchanged.

- [ ] **Step 5: Replace hard-coded BYOK readiness**

`UIContext` loads settings plus provider statuses, derives view state, and refreshes after settings updates. `App.tsx` renders the provider-specific title/detail/action. `SettingsPanel` uses `AI Setup Required` only when the selected provider is not ready. Update onboarding text to say Anthropic is one optional analysis provider and keep its skip button.

- [ ] **Step 6: Verify UI GREEN**

Run: `npx vitest run tests/unit/analysisProviderViewState.test.ts tests/unit/appViewState.test.ts tests/unit/onboardingFlow.test.ts && npm run typecheck`

Expected: all UI state and type tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer src/shared/types.ts tests/unit/analysisProviderViewState.test.ts tests/unit/appViewState.test.ts tests/unit/onboardingFlow.test.ts
git commit -m "feat: add Codex analysis provider picker"
```

---

### Task 7: Full Verification, Integration, and Local Deployment

**Files:**
- Modify only files required by failures proven in this task.
- Build artifact: `release/mac-arm64/MarkuprX.app`
- Install target: `/Applications/MarkuprX.app`

**Interfaces:**
- Consumes: all preceding tasks.
- Produces: verified main-branch source and a running installed arm64 application.

- [ ] **Step 1: Run focused feature tests**

Run:

```bash
npx vitest run \
  tests/unit/analysisProviderSettings.test.ts \
  tests/unit/ai/cliProcessRunner.test.ts \
  tests/unit/ai/codexCliDiscovery.test.ts \
  tests/unit/ai/codexAnalyzer.test.ts \
  tests/unit/ai/aiPipelineManager.test.ts \
  tests/unit/analysisProviderIpc.test.ts \
  tests/unit/analysisProviderViewState.test.ts \
  tests/unit/navigationPreload.test.ts \
  tests/unit/appViewState.test.ts \
  tests/unit/onboardingFlow.test.ts
```

Expected: all selected tests pass with zero failures.

- [ ] **Step 2: Run repository verification**

Run: `npm run typecheck && npm run lint && npm test -- --run`

Expected: all commands exit 0. If a pre-existing test failure appears, record it separately; any feature-caused failure must receive a failing regression test before its fix.

- [ ] **Step 3: Run a real installed-Codex smoke test**

Use a temporary schema and output file to invoke the discovered absolute Codex path with the same safety flags. Supply the prompt `Return {"status":"ok"}.` on stdin and require a schema containing only the string property `status`. Confirm the output parses and equals `{ "status": "ok" }`, then remove the temporary directory.

- [ ] **Step 4: Build desktop bundles**

Run: `npm run build:desktop`

Expected: main, preload, and renderer builds exit 0.

- [ ] **Step 5: Commit final verified source**

If verification required a test-backed correction:

```bash
git add src/main/ai src/main/ipc src/preload/index.ts src/renderer src/shared/types.ts tests/unit
git commit -m "fix: harden Codex provider integration"
```

If the tree is already clean, do not create an empty commit.

- [ ] **Step 6: Merge the feature branch into main**

From the primary checkout, verify `git status --short` is empty, merge the feature branch with `git merge --ff-only feature/codex-cli-analysis`, and rerun `npm run typecheck` plus the focused feature tests.

- [ ] **Step 7: Package the unsigned arm64 app**

Run from main: `npm run package:mac:unsigned -- --arm64 --publish never`

Expected: `release/mac-arm64/MarkuprX.app/Contents/MacOS/MarkuprX` is a Mach-O arm64 executable.

- [ ] **Step 8: Replace and relaunch the installed app**

Quit `com.eddiesanjuan.markuprx` via AppleScript, wait for the old PID to exit, copy `release/mac-arm64/MarkuprX.app` to `/Applications/MarkuprX.app` with `ditto`, and launch it with `open -n /Applications/MarkuprX.app`.

- [ ] **Step 9: Verify the installed application**

Confirm:

```bash
test -d /Applications/MarkuprX.app
file /Applications/MarkuprX.app/Contents/MacOS/MarkuprX
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' /Applications/MarkuprX.app/Contents/Info.plist
pgrep -fl '^/Applications/MarkuprX\.app/Contents/MacOS/MarkuprX$'
```

Expected: arm64 executable, bundle ID `com.eddiesanjuan.markuprx`, and a live process whose executable is the installed app.
