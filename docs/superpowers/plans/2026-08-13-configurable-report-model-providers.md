# Configurable Report Model Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace user-facing Whisper model selection with configurable report provider/model selection for Codex CLI, Claude Code CLI, Ollama, LM Studio, Anthropic API, and Local Rules while keeping Whisper automatic and surfacing every fallback as an error.

**Architecture:** A typed main-process provider registry owns discovery and analysis adapters. CLI adapters execute absolute binaries without a shell; Ollama and LM Studio use fixed loopback HTTP endpoints; every AI response passes through the existing analysis schema. The pipeline builds Local Rules first, invokes exactly one selected adapter, and records requested/actual provider-model provenance plus visible fallback diagnostics.

**Tech Stack:** Electron 28, TypeScript 5.3, React 18, Vitest, electron-store, Node child processes, native `fetch`, Anthropic SDK, existing JSON Schema analysis contract.

## Global Constraints

- Whisper remains the automatic local transcription dependency and never generates the report.
- Provider IDs are exactly `rules`, `anthropic-api`, `codex-cli`, `claude-cli`, `ollama`, and `lmstudio` after migration.
- Existing `anthropic` and `codex` settings migrate without losing API keys or the downloaded Whisper model.
- Ollama is fixed to `http://127.0.0.1:11434`; LM Studio is fixed to `http://127.0.0.1:1234`.
- The renderer cannot provide executable paths, command arguments, endpoint URLs, API keys, or raw provider requests to provider IPC.
- A selected AI provider can fall back only to Local Rules; it never invokes another AI provider.
- Provider or transcription failure must be visible in the UI, report, and processing trace; failure cannot appear only as zero feedback items.
- CLI invocations use absolute executables, argument arrays, timeouts, bounded output, and isolated temporary directories.
- Claude Code CLI uses safe mode, an empty tool set, no session persistence, and transcript-only input in v1.
- Tests use fakes/mocks and do not consume provider quota or require Ollama/LM Studio models.
- The final verified arm64 bundle replaces `/Applications/MarkuprX.app` after making a timestamped backup.

---

## File Structure

### New files

- `src/main/ai/providers/types.ts` — adapter, model, connection, and discovery contracts shared by all report providers.
- `src/main/ai/providers/AnalysisProviderRegistry.ts` — validated provider lookup, all-provider discovery, and default adapter assembly.
- `src/main/ai/providers/ClaudeCliDiscovery.ts` — safe Claude executable/version/auth discovery.
- `src/main/ai/providers/ClaudeCliAnalyzer.ts` — noninteractive transcript-only Claude CLI structured analysis.
- `src/main/ai/providers/LocalProviderHttp.ts` — fixed-endpoint JSON fetch with abort, timeout, and response bounds.
- `src/main/ai/providers/OllamaProvider.ts` — model discovery, optional capability lookup, and structured analysis.
- `src/main/ai/providers/LmStudioProvider.ts` — OpenAI-compatible model discovery and structured analysis.
- `src/main/ai/providers/AnthropicApiProvider.ts` — secure-key-backed Anthropic discovery and selected-model analysis.
- `src/renderer/components/settings/analysisProviderOptions.ts` — provider cards and pure model-selection helpers.
- `tests/unit/ai/analysisProviderRegistry.test.ts` — registry routing/discovery invariants.
- `tests/unit/ai/claudeCliProvider.test.ts` — Claude discovery and analyzer safety.
- `tests/unit/ai/localModelProviders.test.ts` — Ollama and LM Studio fixed-endpoint behavior.
- `tests/unit/analysisProviderOptions.test.ts` — UI provider/model option behavior.

### Modified files

- `src/shared/types.ts` — normalized provider/settings/status/model/provenance/output types and IPC channels.
- `src/main/settings/SettingsManager.ts` — v3 migration and model-map validation.
- `src/main/ai/CodexCliDiscovery.ts` — normalized provider ID and best-effort model catalog.
- `src/main/ai/CodexAnalyzer.ts` — selected-model argument support.
- `src/main/ai/ClaudeAnalyzer.ts` — Anthropic API selected-model support through existing options.
- `src/main/ai/AIPipelineManager.ts` — registry routing, one-provider invariant, fallback report warning, and provenance.
- `src/main/ai/types.ts` — requested/actual provider/model and connection fields.
- `src/main/ai/StructuredMarkdownBuilder.ts` — explicit provider/model attribution.
- `src/main/ipc/analysisProviderHandlers.ts` — registry-backed discover/test/model handlers with validation.
- `src/preload/index.ts` and `src/renderer/types/electron.d.ts` — narrow model-list bridge.
- `src/renderer/components/settings/AnalysisProviderSelector.tsx` — six provider cards, connection badges, and model control.
- `src/renderer/components/settings/AdvancedTab.tsx` — report generation and local transcription diagnostic.
- `src/renderer/components/settings/useSettingsPanel.ts` — per-provider model persistence, status refresh, and Whisper repair.
- `src/renderer/components/settings/analysisProviderViewState.ts` — readiness/model-aware copy for all providers.
- `src/renderer/components/SettingsPanel.tsx` — new settings props.
- `src/renderer/contexts/UIContext.tsx` — provider/model-aware main readiness copy.
- `src/renderer/contexts/outputReadyState.ts` — analysis fallback error state while retaining saved paths.
- `src/main/index.ts` and `src/main/output/MarkdownPatcher.ts` — trace provenance and analysis-error notification/payload.
- Provider, IPC, preload, pipeline, output, and view-state unit tests — migrated IDs and new coverage.

---

### Task 1: Normalize Provider and Model Settings

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/settings/SettingsManager.ts`
- Modify: current provider-ID consumers under `src/main/ai`, `src/main/ipc`, and `src/renderer`
- Modify: `tests/unit/analysisProviderSettings.test.ts`
- Modify: current provider-ID expectations under `tests/unit`

**Interfaces:**
- Produces: `AnalysisProvider`, `ModelAnalysisProvider`, `AnalysisConnection`, `AnalysisModelOption`, `AnalysisModelSelections`, `isAnalysisProvider(value)`, and `normalizeAnalysisProvider(value)`.
- Produces: `AppSettings.analysisModelsByProvider` and `SettingsManager` v3 migration.
- Consumes: existing `AppSettings`, electron-store schema, settings import/export/reset paths.

- [ ] **Step 1: Write failing settings and pure migration tests**

Add expectations covering the six normalized IDs, legacy normalization, defaults, per-provider persistence, invalid keys, control characters, and 200-character bounds:

```ts
expect(normalizeAnalysisProvider('codex')).toBe('codex-cli');
expect(normalizeAnalysisProvider('anthropic')).toBe('anthropic-api');
expect(normalizeAnalysisProvider('unsupported')).toBe('anthropic-api');
expect(DEFAULT_SETTINGS.analysisModelsByProvider).toEqual({});

settings.set('analysisProvider', 'ollama');
settings.set('analysisModelsByProvider', { ollama: 'qwen2.5:7b', 'codex-cli': 'gpt-5.6-terra' });
expect(settings.get('analysisModelsByProvider')).toEqual({
  ollama: 'qwen2.5:7b',
  'codex-cli': 'gpt-5.6-terra',
});

settings.set('analysisModelsByProvider', { rules: 'bad' } as never);
expect(settings.get('analysisModelsByProvider')).not.toHaveProperty('rules');
```

- [ ] **Step 2: Run the test and confirm the type/runtime failures**

Run: `npx vitest run tests/unit/analysisProviderSettings.test.ts`

Expected: FAIL because the normalized IDs, model map, and helpers do not exist.

- [ ] **Step 3: Add normalized shared types and defaults**

Define:

```ts
export const ANALYSIS_PROVIDERS = [
  'rules',
  'anthropic-api',
  'codex-cli',
  'claude-cli',
  'ollama',
  'lmstudio',
] as const;

export type AnalysisProvider = typeof ANALYSIS_PROVIDERS[number];
export type ModelAnalysisProvider = Exclude<AnalysisProvider, 'rules'>;
export type AnalysisConnection = 'local' | 'cli' | 'cloud';
export type AnalysisModelSelections = Partial<Record<ModelAnalysisProvider, string>>;

export function isAnalysisProvider(value: unknown): value is AnalysisProvider {
  return typeof value === 'string' && (ANALYSIS_PROVIDERS as readonly string[]).includes(value);
}

export function normalizeAnalysisProvider(value: unknown): AnalysisProvider {
  if (value === 'codex') return 'codex-cli';
  if (value === 'anthropic') return 'anthropic-api';
  return isAnalysisProvider(value) ? value : 'anthropic-api';
}
```

Add `analysisModelsByProvider: {}` to both settings defaults. Add model option/status fields required by later tasks without adding adapter behavior yet.

Mechanically rename current provider literals and comparisons from `codex` to `codex-cli` and from `anthropic` to `anthropic-api` throughout existing main-process, renderer, and unit-test consumers. Do not add new provider branches in this task; this keeps the repository type-safe while later tasks replace the current hard-coded routing.

- [ ] **Step 4: Implement v3 migration and strict model-map validation**

Bump `SETTINGS_VERSION` to `3`. Keep `codex` and `anthropic` as schema-only legacy enum values so electron-store can open an old file, then normalize them during `migrateV2ToV3()` and reject them in `set()`.

Validate the model map with a pure helper:

```ts
const MODEL_PROVIDERS = new Set<ModelAnalysisProvider>([
  'anthropic-api', 'codex-cli', 'claude-cli', 'ollama', 'lmstudio',
]);

export function isValidAnalysisModelSelections(value: unknown): value is AnalysisModelSelections {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([provider, model]) =>
    MODEL_PROVIDERS.has(provider as ModelAnalysisProvider) &&
    typeof model === 'string' &&
    model.length > 0 &&
    model.length <= 200 &&
    !/[\u0000-\u001F\u007F]/.test(model)
  );
}
```

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npx vitest run tests/unit/analysisProviderSettings.test.ts && npm run typecheck`

Expected: settings test and typecheck pass with all currently shipped provider behavior using normalized IDs.

- [ ] **Step 6: Commit the settings foundation**

```bash
git add src/shared/types.ts src/main/settings/SettingsManager.ts src/main/ai src/main/ipc src/renderer tests/unit
git commit -m "feat: add configurable report model settings"
```

---

### Task 2: Add the Provider Adapter Registry

**Files:**
- Create: `src/main/ai/providers/types.ts`
- Create: `src/main/ai/providers/AnalysisProviderRegistry.ts`
- Create: `tests/unit/ai/analysisProviderRegistry.test.ts`
- Modify: `src/main/ai/index.ts`

**Interfaces:**
- Consumes: `AnalysisProvider`, `AnalysisProviderStatus`, `AnalysisModelOption`, `AnalysisConnection`, `Session`, `AIAnalysisResult`, `ISettingsManager`.
- Produces: `AnalysisProviderAdapter`, `AnalysisProviderContext`, `AnalysisProviderRegistry`, `createDefaultAnalysisProviderRegistry(settingsManager)`.

- [ ] **Step 1: Write failing registry tests**

Use fake adapters to assert exact lookup, all-provider discovery order, unknown-ID rejection, selected-model forwarding, and no adapter-to-adapter fallback:

```ts
const registry = new AnalysisProviderRegistry([codex, claude, ollama]);
expect(registry.get('codex-cli')).toBe(codex);
expect(() => registry.get('rules')).toThrow('Unsupported analysis provider: rules');
await expect(registry.discoverAll(false)).resolves.toEqual([
  codexStatus, claudeStatus, ollamaStatus,
]);
await registry.analyze('ollama', sessionFixture, 'qwen2.5:7b');
expect(ollama.analyze).toHaveBeenCalledWith(sessionFixture, 'qwen2.5:7b');
expect(codex.analyze).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run the failing registry test**

Run: `npx vitest run tests/unit/ai/analysisProviderRegistry.test.ts`

Expected: FAIL because registry modules do not exist.

- [ ] **Step 3: Implement focused adapter contracts**

Define:

```ts
export interface AnalysisProviderAdapter {
  readonly id: Exclude<AnalysisProvider, 'rules'>;
  readonly name: string;
  readonly connection: AnalysisConnection;
  discover(forceRefresh?: boolean): Promise<AnalysisProviderStatus>;
  analyze(session: Session, modelId?: string): Promise<AIAnalysisResult | null>;
}
```

The registry stores adapters in a `Map`, rejects duplicates in its constructor, validates lookup IDs, and invokes only the requested adapter.

- [ ] **Step 4: Implement default assembly seam**

Export a factory whose concrete adapter imports can be added in Tasks 3 and 4. Until then it can accept an injected adapter list, allowing the registry contract to land independently:

```ts
export function createAnalysisProviderRegistry(
  adapters: AnalysisProviderAdapter[],
): AnalysisProviderRegistry {
  return new AnalysisProviderRegistry(adapters);
}
```

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run tests/unit/ai/analysisProviderRegistry.test.ts && npm run typecheck`

```bash
git add src/main/ai/providers src/main/ai/index.ts tests/unit/ai/analysisProviderRegistry.test.ts
git commit -m "feat: add report provider adapter registry"
```

---

### Task 3: Implement Codex and Claude CLI Providers

**Files:**
- Modify: `src/main/ai/CodexCliDiscovery.ts`
- Modify: `src/main/ai/CodexAnalyzer.ts`
- Create: `src/main/ai/providers/ClaudeCliDiscovery.ts`
- Create: `src/main/ai/providers/ClaudeCliAnalyzer.ts`
- Modify: `src/main/ai/providers/AnalysisProviderRegistry.ts`
- Modify: `tests/unit/ai/codexCliDiscovery.test.ts`
- Modify: `tests/unit/ai/codexAnalyzer.test.ts`
- Create: `tests/unit/ai/claudeCliProvider.test.ts`

**Interfaces:**
- Consumes: `runCliProcess`, `buildCliEnvironment`, shared schema/prompt/result parser, registry adapter contract.
- Produces: Codex status/model choices, `CodexAnalyzer.analyze(session, modelId?)`, `ClaudeCliDiscovery.discover()`, and `ClaudeCliAnalyzer.analyze(session, modelId?)`.

- [ ] **Step 1: Add failing Codex model tests**

Assert the normalized provider ID, default/custom behavior, best-effort catalog parsing, and exact `--model` ordering:

```ts
expect(status).toMatchObject({ id: 'codex-cli', connection: 'cli' });
expect(status.models?.[0]).toEqual({ id: '', name: 'Codex default', source: 'default' });

await analyzer.analyze(sessionFixture, 'gpt-5.6-terra');
expect(run).toHaveBeenCalledWith(expect.objectContaining({
  args: expect.arrayContaining(['--model', 'gpt-5.6-terra']),
}));
```

Catalog command failure must still return a ready Codex status with the default option.

- [ ] **Step 2: Add failing Claude discovery/analyzer tests**

Cover executable search, `claude --version`, `claude auth status`, missing/logged-out diagnostics, model aliases, and the safe invocation:

```ts
expect(run).toHaveBeenCalledWith(expect.objectContaining({
  args: expect.arrayContaining([
    '--print', '--safe-mode', '--tools', '', '--no-session-persistence',
    '--output-format', 'json', '--json-schema', expect.any(String),
    '--model', 'sonnet',
  ]),
  stdin: expect.stringContaining('The save button is hard to find'),
}));
expect(run.mock.calls[0][0].args).not.toContain('--add-dir');
```

Also cover timeout, non-zero exit, truncated output, invalid wrapper JSON, invalid structured result, and temp cleanup.

- [ ] **Step 3: Run the failing CLI tests**

Run: `npx vitest run tests/unit/ai/codexCliDiscovery.test.ts tests/unit/ai/codexAnalyzer.test.ts tests/unit/ai/claudeCliProvider.test.ts`

Expected: FAIL on normalized types, model support, and missing Claude modules.

- [ ] **Step 4: Extend Codex discovery and analysis**

Change status ID to `codex-cli`, set `connection: 'cli'`, and always include the default model. Probe `codex debug models --bundled` with a five-second/two-MiB bound; parse JSON arrays defensively into unique `{ id, name, source: 'discovered' }` options. Treat every catalog error as non-fatal.

Change the analyzer signature to `analyze(session, modelId?)` and insert `--model`, `modelId` before the final prompt `-` only when the trimmed model is nonblank.

- [ ] **Step 5: Implement Claude discovery**

Use PATH, `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`, and fixed login-shell `command -v claude` resolution. Probe version and `auth status` with five-second bounded child processes. Return these static model choices:

```ts
[
  { id: '', name: 'Claude default', source: 'default' },
  { id: 'sonnet', name: 'Sonnet', source: 'preset' },
  { id: 'opus', name: 'Opus', source: 'preset' },
  { id: 'haiku', name: 'Haiku', source: 'preset' },
]
```

- [ ] **Step 6: Implement Claude structured analysis**

Build a transcript/source/timestamp prompt without screenshot file paths. Invoke the resolved executable in an isolated temp directory with safe mode, empty tools, no session persistence, JSON output, inline JSON Schema, stdin prompt, three-minute timeout, and one-MiB bounds. Claude JSON output wraps structured output; extract `structured_output` when present and otherwise parse the final text result, then pass it through `parseAnalysisResult`.

- [ ] **Step 7: Register both CLI adapters and verify**

Add adapter objects that delegate discovery/analyze without cross-calling. Run:

`npx vitest run tests/unit/ai/codexCliDiscovery.test.ts tests/unit/ai/codexAnalyzer.test.ts tests/unit/ai/claudeCliProvider.test.ts tests/unit/ai/analysisProviderRegistry.test.ts && npm run typecheck`

- [ ] **Step 8: Commit the CLI providers**

```bash
git add src/main/ai/CodexCliDiscovery.ts src/main/ai/CodexAnalyzer.ts src/main/ai/providers tests/unit/ai
git commit -m "feat: add selectable Codex and Claude CLI models"
```

---

### Task 4: Implement Ollama and LM Studio Providers

**Files:**
- Create: `src/main/ai/providers/LocalProviderHttp.ts`
- Create: `src/main/ai/providers/OllamaProvider.ts`
- Create: `src/main/ai/providers/LmStudioProvider.ts`
- Modify: `src/main/ai/providers/AnalysisProviderRegistry.ts`
- Create: `tests/unit/ai/localModelProviders.test.ts`

**Interfaces:**
- Consumes: native/injected `fetch`, `ANALYSIS_JSON_SCHEMA`, shared prompt/result parser, adapter contract, `optimizeForAPI` for confirmed Ollama vision models.
- Produces: `fetchBoundedJson()`, `OllamaProvider`, `LmStudioProvider`, and registered local adapters.

- [ ] **Step 1: Write failing fixed-endpoint and discovery tests**

```ts
await ollama.discover(true);
expect(fetchFn).toHaveBeenCalledWith(
  'http://127.0.0.1:11434/api/tags',
  expect.objectContaining({ signal: expect.any(AbortSignal) }),
);
expect(status.models).toEqual([
  { id: 'qwen2.5:7b', name: 'qwen2.5:7b', source: 'discovered' },
]);

await lmStudio.discover(true);
expect(fetchFn).toHaveBeenCalledWith(
  'http://127.0.0.1:1234/v1/models',
  expect.any(Object),
);
```

Cover server-down diagnostics, empty model lists, malformed JSON, oversized content-length/body, and abort timeouts.

- [ ] **Step 2: Write failing structured-analysis tests**

For Ollama, verify `/api/show` capability lookup, `format: ANALYSIS_JSON_SCHEMA`, `stream: false`, model selection, and image base64 only when capabilities include `vision`. For LM Studio, verify `response_format.type === 'json_schema'`, the selected model, no image blocks in v1 when capability is unknown, and parsing of `choices[0].message.content`.

- [ ] **Step 3: Run the failing local-provider tests**

Run: `npx vitest run tests/unit/ai/localModelProviders.test.ts`

Expected: FAIL because local provider modules do not exist.

- [ ] **Step 4: Implement bounded loopback JSON transport**

`fetchBoundedJson(url, init, options)` must reject any URL whose origin/path is not supplied by the adapter constant, abort after the configured timeout, reject non-2xx responses with sanitized status text, enforce a one-MiB response limit from both `content-length` and actual text length, and JSON-parse only after those checks. It receives an injected fetch function in tests.

- [ ] **Step 5: Implement Ollama provider**

Discover from `/api/tags`. Require a nonblank selected model for `analyze`. Call `/api/show` for that model; if `capabilities` includes `vision`, optimize and attach bounded images, otherwise send transcript text only. POST `/api/chat` with:

```ts
{
  model: modelId,
  stream: false,
  format: ANALYSIS_JSON_SCHEMA,
  messages: [{ role: 'user', content: prompt, ...(images.length ? { images } : {}) }],
  options: { temperature: 0.2 },
}
```

- [ ] **Step 6: Implement LM Studio provider**

Discover from `/v1/models`. Require a selected model. POST `/v1/chat/completions` with transcript-only messages and:

```ts
response_format: {
  type: 'json_schema',
  json_schema: { name: 'markuprx_analysis', strict: true, schema: ANALYSIS_JSON_SCHEMA },
}
```

- [ ] **Step 7: Register, verify, and commit local providers**

Run: `npx vitest run tests/unit/ai/localModelProviders.test.ts tests/unit/ai/analysisProviderRegistry.test.ts && npm run typecheck`

```bash
git add src/main/ai/providers tests/unit/ai/localModelProviders.test.ts tests/unit/ai/analysisProviderRegistry.test.ts
git commit -m "feat: add Ollama and LM Studio report providers"
```

---

### Task 5: Route the Pipeline and Surface Provenance/Fallback Errors

**Files:**
- Modify: `src/main/ai/AIPipelineManager.ts`
- Modify: `src/main/ai/types.ts`
- Modify: `src/main/ai/ClaudeAnalyzer.ts`
- Create: `src/main/ai/providers/AnthropicApiProvider.ts`
- Modify: `src/main/ai/providers/AnalysisProviderRegistry.ts`
- Modify: `src/main/ai/StructuredMarkdownBuilder.ts`
- Modify: `src/main/output/MarkdownPatcher.ts`
- Modify: `src/main/index.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/renderer/contexts/outputReadyState.ts`
- Modify: `tests/unit/ai/aiPipelineManager.test.ts`
- Modify: `tests/unit/transcriptionFailureOutput.test.ts`

**Interfaces:**
- Consumes: `createDefaultAnalysisProviderRegistry(settingsManager)`, provider/model settings, existing rules document builder.
- Produces: provenance-rich `AIPipelineOutput`, visible analysis fallback Markdown, `OutputReadyPayload.analysisError`, and processing trace fields.

- [ ] **Step 1: Rewrite pipeline tests around registry routing**

Cover all six providers, selected-model forwarding, Anthropic model override, exact single-adapter invocation, and fallback provenance:

```ts
expect(result.pipelineOutput).toMatchObject({
  requestedProvider: 'ollama',
  requestedModel: 'qwen2.5:7b',
  actualProvider: 'rules',
  actualModel: null,
  connection: 'local',
  fallbackReason: 'Ollama is unavailable',
});
expect(result.document.content).toContain('AI analysis unavailable; Local Rules used');
expect(otherAdapters.every((adapter) => adapter.analyze.mock.calls.length === 0)).toBe(true);
```

- [ ] **Step 2: Add failing output/trace error tests**

Assert `getOutputReadyStatus()` selects `error` for `analysisError` while retaining the output payload, and `writeProcessingTrace()` writes requested/actual provider/model, connection, and fallback reason.

- [ ] **Step 3: Run the failing pipeline/output tests**

Run: `npx vitest run tests/unit/ai/aiPipelineManager.test.ts tests/unit/transcriptionFailureOutput.test.ts`

- [ ] **Step 4: Replace hard-coded branches with registry routing**

Read provider and `analysisModelsByProvider` once. Local Rules returns directly. For every other provider, resolve exactly one adapter and call `analyze(session, selectedModel)`. Implement `AnthropicApiProvider` so discovery checks `settingsManager.hasApiKey('anthropic')` and analysis obtains the secure key before constructing `ClaudeAnalyzer` with `{ model: selectedModel || DEFAULT_CLAUDE_ANALYZER_OPTIONS.model }`. Register it alongside the CLI and local adapters in `createDefaultAnalysisProviderRegistry(settingsManager)`.

Extend output with:

```ts
requestedProvider: AnalysisProvider;
requestedModel: string | null;
actualProvider: AnalysisProvider;
actualModel: string | null;
connection: AnalysisConnection;
```

Retain `provider` as the requested provider for backward compatibility during this release.

- [ ] **Step 5: Add safe fallback report warning**

On failure, clone the Local Rules document and insert one warning after the title:

```md
> **AI analysis unavailable; Local Rules used.**
> Ollama was not reachable at 127.0.0.1:11434.
```

Normalize whitespace and strip control characters from the reason before placing it in Markdown or renderer payloads.

- [ ] **Step 6: Carry provenance and errors through save/trace/output**

Add the new fields to main-process local variables and `writeProcessingTrace`. Add `analysisError` to `OutputReadyPayload`; when fallback occurs, return saved paths with renderer error state and show an error notification that says the Local Rules report was saved. Transcription errors take display precedence when both exist, while both remain in the trace and report.

- [ ] **Step 7: Verify and commit**

Run: `npx vitest run tests/unit/ai/aiPipelineManager.test.ts tests/unit/transcriptionFailureOutput.test.ts tests/unit/appViewState.test.ts && npm run typecheck`

```bash
git add src/main/ai src/main/output/MarkdownPatcher.ts src/main/index.ts src/shared/types.ts src/renderer/contexts/outputReadyState.ts tests/unit/ai/aiPipelineManager.test.ts tests/unit/transcriptionFailureOutput.test.ts
git commit -m "feat: record report provider provenance and fallback errors"
```

---

### Task 6: Expose Providers and Models Through Validated IPC

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/ipc/analysisProviderHandlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/types/electron.d.ts`
- Modify: `tests/unit/analysisProviderIpc.test.ts`
- Modify: `tests/unit/analysisProviderPreload.test.ts`
- Modify: `tests/unit/navigationPreload.test.ts`

**Interfaces:**
- Consumes: default registry, secure Anthropic-key status, provider/model validators.
- Produces: `ANALYSIS_PROVIDER_MODELS`, `analysisProviders.discover()`, `.test(provider)`, and `.models(provider, forceRefresh?)`.

- [ ] **Step 1: Write failing all-provider IPC tests**

Assert discovery returns rules and Anthropic plus registry adapters, test accepts every normalized provider but rejects unknown/legacy IDs, model listing is limited to the named adapter, local status is unready without a selected model, and no handler accepts endpoint/executable arguments.

```ts
await expect(testHandler({}, 'claude-cli')).resolves.toMatchObject({ id: 'claude-cli' });
await expect(testHandler({}, 'codex')).rejects.toThrow('Unsupported analysis provider');
await expect(modelsHandler({}, 'ollama', true)).resolves.toEqual(ollamaModels);
```

- [ ] **Step 2: Write failing preload bridge tests**

```ts
await analysisProviders.models('ollama', true);
expect(ipcRenderer.invoke).toHaveBeenCalledWith(
  'markuprx:analysis-provider:models', 'ollama', true,
);
```

- [ ] **Step 3: Run the failing IPC/preload tests**

Run: `npx vitest run tests/unit/analysisProviderIpc.test.ts tests/unit/analysisProviderPreload.test.ts tests/unit/navigationPreload.test.ts`

- [ ] **Step 4: Implement registry-backed handlers**

The handler builds only the Local Rules status locally, gets every AI-provider status—including Anthropic—from the registry, applies the saved model requirement to Ollama/LM Studio readiness, and returns the fixed UI order: Codex CLI, Claude Code CLI, Ollama, LM Studio, Anthropic API, Local Rules.

Validate every provider with `isAnalysisProvider`; only model providers can use the model channel. Model IPC returns `AnalysisModelOption[]` and never accepts a URL, executable, or request body.

- [ ] **Step 5: Extend preload/types, verify, and commit**

Run: `npx vitest run tests/unit/analysisProviderIpc.test.ts tests/unit/analysisProviderPreload.test.ts tests/unit/navigationPreload.test.ts && npm run typecheck`

```bash
git add src/shared/types.ts src/main/ipc/analysisProviderHandlers.ts src/preload/index.ts src/renderer/types/electron.d.ts tests/unit/analysisProviderIpc.test.ts tests/unit/analysisProviderPreload.test.ts tests/unit/navigationPreload.test.ts
git commit -m "feat: expose validated report provider models"
```

---

### Task 7: Build the Provider/Model Settings Experience

**Files:**
- Create: `src/renderer/components/settings/analysisProviderOptions.ts`
- Modify: `src/renderer/components/settings/AnalysisProviderSelector.tsx`
- Modify: `src/renderer/components/settings/AdvancedTab.tsx`
- Modify: `src/renderer/components/settings/useSettingsPanel.ts`
- Modify: `src/renderer/components/SettingsPanel.tsx`
- Modify: `src/renderer/components/settings/analysisProviderViewState.ts`
- Modify: `src/renderer/contexts/UIContext.tsx`
- Modify: `src/renderer/components/Onboarding.tsx`
- Create: `tests/unit/analysisProviderOptions.test.ts`
- Modify: `tests/unit/analysisProviderViewState.test.ts`
- Modify: `tests/unit/appViewState.test.ts`
- Modify: `tests/unit/onboardingFlow.test.ts`

**Interfaces:**
- Consumes: normalized provider status/model/settings types and preload provider/Whisper APIs.
- Produces: six provider cards, per-provider model control, status badges, refresh, and automatic local transcription repair row.

- [ ] **Step 1: Write failing pure option/view-state tests**

Assert exact card order/badges, default/preset/custom/local selector modes, saved custom-model recognition, local missing-model readiness, and provider-specific copy:

```ts
expect(PROVIDER_OPTIONS.map(({ id }) => id)).toEqual([
  'codex-cli', 'claude-cli', 'ollama', 'lmstudio', 'anthropic-api', 'rules',
]);
expect(getModelControlMode('ollama')).toBe('discovered-only');
expect(getModelControlMode('codex-cli')).toBe('default-or-custom');
expect(getAnalysisProviderViewState('lmstudio', statuses, {})).toMatchObject({
  ready: false,
  title: 'LM Studio model required',
});
```

- [ ] **Step 2: Run the failing UI helper tests**

Run: `npx vitest run tests/unit/analysisProviderOptions.test.ts tests/unit/analysisProviderViewState.test.ts tests/unit/appViewState.test.ts tests/unit/onboardingFlow.test.ts`

- [ ] **Step 3: Implement provider/model option helpers**

Centralize titles, descriptions, connection badges, selector mode, default labels, and saved-model normalization in `analysisProviderOptions.ts`. Local providers return `discovered-only`; rules returns `none`; CLI/API providers return `default-or-custom`.

- [ ] **Step 4: Expand the selector UI**

Render six accessible radio cards with Local/CLI/Cloud badges. Under the selected non-rules provider:

- Ollama/LM Studio render a `<select>` whose first option is “Select an installed model”.
- Codex/Claude/Anthropic render an `<input list>` with discovered/preset options and a blank provider-default placeholder.
- The current saved model is preserved when switching cards.
- Refresh copy says **Refresh providers**, not CLI-only detection.

- [ ] **Step 5: Persist per-provider models in the settings hook**

Add:

```ts
const handleAnalysisModelChange = useCallback(async (
  provider: ModelAnalysisProvider,
  modelId: string,
) => {
  const next = { ...settings.analysisModelsByProvider };
  const trimmed = modelId.trim();
  if (trimmed) next[provider] = trimmed;
  else delete next[provider];
  await handleSettingChange('analysisModelsByProvider', next);
}, [settings.analysisModelsByProvider, handleSettingChange]);
```

Refresh statuses after provider/model changes and dispatch the existing settings-updated event.

- [ ] **Step 6: Replace Whisper choice copy with a repair diagnostic**

On Advanced Settings load, call `whisper.checkModel()`. Local readiness is derived only from `hasAnyModel`; an OpenAI key must not make a missing local model appear ready. Render:

- **Local transcription ready** with the managed model name when available.
- **Local transcription needs repair** with a button that calls `whisper.downloadModel('tiny')` when absent/corrupt.
- No model-size selector or suggestion that Whisper generates the report.

Keep the existing OpenAI transcription-key controls as the optional cloud fallback.

- [ ] **Step 7: Update main-window/onboarding copy**

Readiness includes the selected model when present. Onboarding analysis copy lists report providers generically and directs configuration to Settings > Advanced without making Anthropic mandatory. Transcription copy calls Whisper “local transcription,” never “analysis model.”

- [ ] **Step 8: Verify and commit the settings experience**

Run: `npx vitest run tests/unit/analysisProviderOptions.test.ts tests/unit/analysisProviderViewState.test.ts tests/unit/appViewState.test.ts tests/unit/onboardingFlow.test.ts && npm run typecheck && npm run lint`

```bash
git add src/renderer src/shared/types.ts tests/unit/analysisProviderOptions.test.ts tests/unit/analysisProviderViewState.test.ts tests/unit/appViewState.test.ts tests/unit/onboardingFlow.test.ts
git commit -m "feat: add report provider and model settings"
```

---

### Task 8: Full Verification, Packaging, Installation, and Live Validation

**Files:**
- Modify only files required by failures found during verification.
- Verify: `/Applications/MarkuprX.app`

**Interfaces:**
- Consumes: all earlier tasks.
- Produces: a clean, committed, installed, running application.

- [ ] **Step 1: Run the provider-focused regression set**

Run:

```bash
npx vitest run \
  tests/unit/analysisProviderSettings.test.ts \
  tests/unit/ai/analysisProviderRegistry.test.ts \
  tests/unit/ai/codexCliDiscovery.test.ts \
  tests/unit/ai/codexAnalyzer.test.ts \
  tests/unit/ai/claudeCliProvider.test.ts \
  tests/unit/ai/localModelProviders.test.ts \
  tests/unit/ai/aiPipelineManager.test.ts \
  tests/unit/analysisProviderIpc.test.ts \
  tests/unit/analysisProviderPreload.test.ts \
  tests/unit/analysisProviderOptions.test.ts \
  tests/unit/analysisProviderViewState.test.ts \
  tests/unit/transcriptionFailureOutput.test.ts
```

Expected: all pass without network access or quota use.

- [ ] **Step 2: Run static and full-suite verification**

Run in order:

```bash
npm run typecheck
npm run lint
npx vitest run
npm run build
```

Expected: typecheck/build succeed, all tests pass, lint has no new errors.

- [ ] **Step 3: Validate real provider discovery without report generation**

Run the packaged main-process discovery path or equivalent focused executable probes. Confirm the installed Codex and Claude binaries are reported with versions/readiness, and absent Ollama/LM Studio servers produce actionable unavailable statuses without delaying startup.

- [ ] **Step 4: Package unsigned arm64 app**

Run: `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64 --config electron-builder.yml`

Expected: a valid arm64 `MarkuprX.app` under the configured release directory.

- [ ] **Step 5: Back up and install safely**

Resolve the produced bundle path and verify both source and target are concrete `.app` paths. Quit the running MarkuprX process, move `/Applications/MarkuprX.app` to `/Applications/MarkuprX.app.backup-YYYYMMDD-HHMMSS`, copy the new bundle to `/Applications/MarkuprX.app`, and launch it with `open -a /Applications/MarkuprX.app`.

- [ ] **Step 6: Verify the installed process and UI assets**

Confirm the running executable path is inside `/Applications/MarkuprX.app`, the bundle is arm64, provider/model strings exist in the packaged renderer, the Whisper model still exists in Application Support, and Settings opens without renderer errors.

- [ ] **Step 7: Commit verification fixes and report exact evidence**

If verification required code changes, rerun the affected test plus the full static/suite/build gates and commit those changes. End with a clean `git status --short`, the final commit IDs, test counts, bundle path, backup path, installed process path, and any optional provider that was unavailable locally.
