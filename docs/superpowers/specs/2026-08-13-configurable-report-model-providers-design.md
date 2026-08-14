# Configurable Report Model Providers Design

## Summary

Replace markupR's user-facing Whisper model selection with report-provider and report-model selection. Whisper remains the automatic local speech-to-text engine; it is no longer presented as the model that generates feedback. Users choose how the final report is analyzed through Codex CLI, Claude Code CLI, Ollama, LM Studio, Anthropic API, or deterministic local rules.

This design supersedes the provider and model-selection portions of `2026-08-13-codex-cli-analysis-provider-design.md`. It preserves the existing Codex adapter's safety properties and the repaired PCM-to-Whisper transcription path.

## Goals

- Make the report-generation provider and model explicit and configurable.
- Support Codex CLI, Claude Code CLI, Ollama, and LM Studio in the first release.
- Preserve the existing Anthropic API and Local Rules providers.
- Discover installed CLI tools and locally available models without accepting arbitrary shell commands from the renderer.
- Let each provider remember its selected model.
- Keep transcription automatic and clearly separate from report analysis.
- Validate every AI provider's response against the same report schema.
- Always produce a Local Rules report when an AI provider fails.
- Show provider and transcription failures instead of silently displaying an empty feedback state.
- Never silently switch from one AI provider to another.
- Record requested provider, requested model, actual provider, actual model, connection class, and fallback reason in processing metadata.
- Rebuild, install, and launch the verified arm64 macOS application in `/Applications`.

## Non-goals

- Removing Whisper from the transcription pipeline.
- Letting a report model consume raw audio directly.
- Supporting Gemini CLI, OpenCode, Aider, or arbitrary command templates in this release.
- Downloading or managing full Ollama or LM Studio language models from markupR.
- Allowing remote or user-supplied Ollama or LM Studio endpoints in this release.
- Adding a persistent Codex, Claude, Ollama, or LM Studio background process.
- Silently retrying through a different paid or cloud provider.
- Refactoring unrelated capture, export, or frame-extraction behavior.

## Product Model

The application has two distinct model stages:

1. **Transcription:** captured PCM audio is transcribed locally by the automatically managed Whisper model.
2. **Report analysis:** transcript and eligible screenshots are sent to the selected report provider and model.

Whisper is a required internal dependency for local transcription, not a report model. Advanced Settings replaces the normal Whisper model chooser with a **Report provider** section and a provider-specific **Report model** control. A compact transcription diagnostic remains available so a missing or corrupt Whisper model can be repaired without suggesting that it generates the report.

## Provider Set

The normalized provider IDs are:

| Provider ID | Display name | Connection | Model source |
| --- | --- | --- | --- |
| `codex-cli` | Codex CLI | Installed CLI and existing login | Provider default, best-effort discovered catalog, or custom ID |
| `claude-cli` | Claude Code CLI | Installed CLI and existing login | Default, documented aliases, or custom ID |
| `ollama` | Ollama | Direct loopback HTTP | Installed models from the Ollama API |
| `lmstudio` | LM Studio | Direct loopback HTTP | Available models from the OpenAI-compatible API |
| `anthropic-api` | Anthropic API | Existing securely stored API key | Existing app default or custom ID |
| `rules` | Local Rules | In-process and offline | No model |

The UI labels `ollama`, `lmstudio`, and `rules` as local. CLI providers are labeled CLI because their data locality depends on the user's CLI configuration and account. `anthropic-api` is labeled cloud.

## Settings and Migration

Replace the old provider union with:

```ts
type AnalysisProvider =
  | 'rules'
  | 'anthropic-api'
  | 'codex-cli'
  | 'claude-cli'
  | 'ollama'
  | 'lmstudio';
```

Persist:

```ts
analysisProvider: AnalysisProvider;
analysisModelsByProvider: Partial<Record<Exclude<AnalysisProvider, 'rules'>, string>>;
```

An absent or blank entry means **Provider default**. Local providers require an explicit discovered model before they are ready because neither Ollama nor LM Studio has a reliable markupR-wide default. Switching providers preserves the previous selection for every provider.

The settings loader normalizes current values before schema validation:

- `codex` becomes `codex-cli`.
- `anthropic` becomes `anthropic-api`.
- `rules` remains `rules`.
- A missing `analysisModelsByProvider` becomes an empty object.

The current fresh-install default remains Anthropic, expressed as `anthropic-api`, to avoid changing unrelated onboarding behavior. Existing API keys and the downloaded Whisper model are retained. Import, export, reset, and validation logic accept only known provider IDs and bounded model-ID strings.

## Provider Adapter Architecture

Replace hard-coded provider branches in `AIPipelineManager` with a main-process registry of adapters. The common boundary is conceptually:

```ts
interface AnalysisProviderAdapter {
  readonly id: AnalysisProvider;
  discover(forceRefresh: boolean): Promise<AnalysisProviderStatus>;
  listModels(forceRefresh: boolean): Promise<AnalysisModelOption[]>;
  analyze(request: AnalysisRequest, modelId?: string): Promise<AIAnalysisResult>;
}
```

Responsibilities are separated as follows:

- **Provider registry:** maps validated IDs to adapters and is the only selection point used by the analysis pipeline and IPC handlers.
- **Discovery services:** resolve executables or probe fixed loopback endpoints, returning serializable readiness and diagnostics.
- **Model discovery:** returns provider-specific model choices and capabilities without determining the selected model.
- **Adapters:** convert a common analysis request into a safe CLI invocation or HTTP request, then return normalized analysis data.
- **Schema validator:** validates and coerces all provider output through the existing `ANALYSIS_JSON_SCHEMA` rules.
- **Pipeline manager:** builds the Local Rules baseline first, invokes exactly one selected adapter, handles fallback, and records provenance.

No adapter may call another adapter. This keeps failure and cost behavior predictable and makes future Gemini CLI or OpenCode support an isolated registry addition.

## Discovery and Model Selection

### Codex CLI

Preserve the existing executable, version, and authentication discovery. Model choices always include **Codex default** and a validated custom model-ID field. A best-effort model catalog may be loaded when the installed CLI exposes its experimental bundled-model command; catalog failure must not make Codex unavailable or remove the custom-ID path.

Analysis continues to use `codex exec` with an absolute executable path, argument arrays, standard-input prompting, an ephemeral session, ignored user configuration and rules, a read-only sandbox, isolated temporary files, attached images, the shared output schema, bounded output, and a timeout. The selected nonblank model is passed with the CLI model override.

### Claude Code CLI

Discovery follows the same safe executable search strategy as Codex and probes version and authentication/readiness without reading credentials. Model choices include **Claude default**, `sonnet`, `opus`, and `haiku` aliases plus a validated custom model ID.

Analysis uses Claude's noninteractive print mode, safe mode, JSON output constrained by the shared schema, no session persistence, an empty tool set, a temporary working directory, bounded output, and a timeout. Arguments are passed without a shell. Safe mode prevents user customizations, plugins, hooks, and MCP servers from joining the automated run while preserving normal authentication. To avoid giving transcript-borne prompt injection general filesystem access, the v1 Claude adapter is transcript-only. Its provider status and report provenance explicitly state that screenshots were not supplied.

### Ollama

Probe only `http://127.0.0.1:11434`. Discover installed models from `GET /api/tags`; no arbitrary URL is accepted. The selected model is required. Where model metadata confirms vision support, the adapter may include bounded screenshot inputs; otherwise it sends transcript-only input.

Analysis uses a non-streaming local request and supplies the shared JSON Schema as Ollama's structured-output format. Requests have connection and total timeouts, response-size limits, and an abort path. Output passes through the common validator even when Ollama reports successful schema generation.

### LM Studio

Probe only `http://127.0.0.1:1234`. Discover available models from `GET /v1/models`; no arbitrary URL is accepted. The selected model is required.

Analysis uses the OpenAI-compatible chat-completions endpoint with JSON Schema response formatting, non-streaming output, request timeouts, response-size limits, and cancellation. Screenshots are sent only when the adapter can positively identify compatible multimodal support; unknown models use transcript-only analysis. Output still passes through the common validator.

### Anthropic API

Preserve the existing key storage and API adapter. Add **Anthropic default** and a custom model-ID field; absence selects the existing app default. Direct API image input remains supported. Do not expose, log, migrate, or duplicate the stored API key as part of provider discovery.

### Local Rules

Preserve deterministic, offline report generation. It requires no discovery and no model. The pipeline always builds this result before attempting any AI provider so a usable report is available after failure.

## Provider Status and IPC

Extend the serializable status model to include:

- provider ID, name, and `local`, `cli`, or `cloud` connection label;
- available and ready state;
- authentication state when relevant;
- executable path and version for CLI providers;
- fixed endpoint label for local HTTP providers;
- sanitized diagnostic and suggested action;
- discovered models and model-discovery status;
- known `supportsImages` capability per model when available;
- last refresh time.

Preload exposes narrow operations to discover providers, refresh one or all providers, list models, and test the selected configuration. Renderer IPC accepts validated provider IDs and model IDs only. It never accepts executable paths, command arguments, endpoint URLs, raw shell text, API keys, or arbitrary request bodies.

Provider and model discovery is cached briefly to avoid spawning CLIs or probing local servers on every render. Explicit **Refresh providers** bypasses that cache.

## Settings Experience

Advanced Settings contains one **Report generation** section:

- Provider cards for Codex CLI, Claude Code CLI, Ollama, LM Studio, Anthropic API, and Local Rules.
- A Local, CLI, or Cloud badge on each card.
- Readiness text such as installed and authenticated, server unavailable, model required, or API key required.
- A model selector below the selected provider when that provider uses a model.
- A custom model-ID option only for providers that cannot provide a complete stable catalog.
- **Refresh providers** and provider-appropriate setup or retry actions.

Selecting a card saves immediately. Selecting a model updates only that provider's entry in `analysisModelsByProvider`. An unavailable provider or missing required local model is marked unready and cannot pass its provider test, but recording remains available. Post-processing reports the readiness failure and uses Local Rules without attempting another AI provider.

The former Whisper model chooser is replaced by a **Local transcription** diagnostic row:

- **Ready** when the managed Whisper model and runtime are usable.
- **Needs repair** with the existing download/repair action when the model is absent or corrupt.
- No Whisper size or report-model choice.

The main window readiness message reflects the selected report provider and model. Copy consistently uses “report provider/model” for analysis and “local transcription” for Whisper.

## Analysis Data Flow

1. Capture produces screen frames and PCM audio.
2. The managed Whisper runtime converts audio to transcript segments.
3. A transcription failure is stored and surfaced; it is not converted into a successful empty transcript.
4. The pipeline builds the deterministic Local Rules report.
5. The pipeline reads `analysisProvider` and that provider's saved model exactly once.
6. The registry resolves exactly one adapter and validates readiness.
7. A common request is built from transcript, source metadata, timestamps, and eligible screenshots.
8. The adapter runs with the selected model and returns structured output.
9. The shared validator normalizes the result.
10. `StructuredMarkdownBuilder` generates the final report and includes provider/model provenance.
11. On any adapter failure, the Local Rules result is written with an explicit fallback warning and diagnostic metadata.

The generated report and processing trace distinguish requested and actual execution, for example:

```json
{
  "requestedProvider": "ollama",
  "requestedModel": "llama3.2-vision:latest",
  "actualProvider": "rules",
  "actualModel": null,
  "connection": "local",
  "fallbackReason": "Ollama was not reachable at 127.0.0.1:11434"
}
```

## Error Handling

Provider failures include missing CLI, logged-out CLI, unavailable local server, missing selected model, removed model, authentication failure, spawn failure, timeout, aborted HTTP request, non-zero exit, oversized response, malformed JSON, and schema mismatch.

For every failure:

- The final report still uses the prebuilt Local Rules result.
- The app displays a sanitized actionable error rather than a successful empty state.
- The report includes a concise “AI analysis unavailable; local rules used” warning.
- The processing trace records the full sanitized fallback reason.
- The failed adapter is the only AI adapter attempted.
- Prompts, transcript text, API keys, tokens, and raw provider responses are not logged.

If transcription fails, the UI and report identify transcription as incomplete even if Local Rules can derive limited feedback from frames. Zero feedback items are valid only when transcription and selected analysis completed successfully or Local Rules explicitly found no issues; a provider or transcription error can never be represented solely as “no items.”

## Security and Privacy

- Resolve CLI executables to real absolute executable files.
- Spawn CLIs with argument arrays and never interpolate user content into shell commands.
- Run CLI analysis in unique temporary directories and remove them in `finally` cleanup.
- Keep the existing Codex read-only, ephemeral, ignored-config invocation.
- Disable Claude tools in v1 and provide transcript text only.
- Bind local-provider support to fixed IPv4 loopback endpoints to prevent server-side request forgery or accidental LAN/cloud egress.
- Apply strict timeouts, response-size limits, and cancellation to every provider.
- Copy or encode only the screenshots selected by the existing frame-selection stage.
- Never expose API keys or CLI authentication material to the renderer.
- Never silently switch providers.

## Testing

Automated coverage includes:

- provider type, defaults, settings validation, import/export/reset, and legacy migration;
- per-provider model persistence and provider switching;
- registry resolution and rejection of unknown IDs;
- Codex and Claude executable discovery, version/readiness probes, safe argument construction, timeouts, and cleanup;
- Codex default/custom/discovered model behavior without depending on the experimental catalog;
- Claude aliases, custom model IDs, tool disabling, transcript-only behavior, and schema parsing;
- Ollama loopback-only discovery, `/api/tags` parsing, model removal, structured-output payloads, capability handling, timeouts, and aborts;
- LM Studio loopback-only discovery, `/v1/models` parsing, structured-output payloads, capability handling, timeouts, and aborts;
- Anthropic default and custom model handling without exposing its API key;
- common schema validation for every AI adapter;
- provider/model provenance in Markdown and processing traces;
- Local Rules fallback for every failure category;
- the invariant that a selected provider never invokes another AI provider;
- visible transcription/provider errors instead of an empty-feedback state;
- IPC validation, preload exposure, provider-card state, model controls, refresh behavior, and accessibility labels.

Tests use fake executables and mocked loopback HTTP servers; they must not require installed local models or consume provider quota. Final verification runs focused tests, type checking, linting, the full automated suite, and a production build. Available real CLIs are used for discovery validation; a live analysis smoke test is limited to the selected authenticated provider and must not block packaging when an optional provider is absent.

## Deployment

Package the verified unsigned arm64 macOS application. Quit the installed markupR process cleanly, create a timestamped backup of the current `/Applications/markupR.app`, replace it with the new bundle, launch it, and verify that the running process originates from `/Applications/markupR.app`.

The installed app must show the new provider/model controls and preserve the managed Whisper model at its existing Application Support path. The bundle remains unsigned and unnotarized, so macOS may request screen-recording or microphone permissions according to its local identity rules.

## Future Extensions

Gemini CLI, OpenCode, Aider, and other providers can be added as explicit adapters implementing the same discovery, model, analysis, and status contracts. Arbitrary command templates remain out of scope until markupR has a separate security design for executable trust, argument templating, output contracts, and secret handling.

## Reference Interfaces

- Codex CLI noninteractive execution and model/schema options: <https://developers.openai.com/codex/cli/reference>
- Claude Code CLI noninteractive, model, JSON Schema, and session options: <https://code.claude.com/docs/en/cli-usage>
- Ollama model listing: <https://docs.ollama.com/api/tags>
- Ollama structured outputs: <https://docs.ollama.com/capabilities/structured-outputs>
- LM Studio model listing: <https://lmstudio.ai/docs/developer/openai-compat/models>
- LM Studio structured outputs: <https://beta.lmstudio.ai/docs/developer/openai-compat/structured-output>
