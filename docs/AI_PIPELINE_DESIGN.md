# MarkuprPlus analysis pipeline

This document describes the current implementation. Earlier premium/proxy proposals are not active product behavior.

## Goals

The pipeline converts a completed capture session into validated, editable feedback without silently changing providers or losing the relationship between narration and visual evidence.

```text
screen + audio + manual/annotated cues
                 |
                 v
       persisted session evidence
                 |
                 v
 post-session transcription and frame extraction
                 |
                 v
 normalized analysis input + selected provider
                 |
                 v
 validated issues + Local Rules fallback
                 |
                 v
       Review Editor and exports
```

## Inputs

A session can contain:

- recording/audio paths and capture-source metadata;
- timestamped transcript segments;
- manual screenshot cues;
- separately committed marked issues;
- trusted PNG/JPEG/WebP screenshot media;
- best-effort cursor, active-window, focused-element, and annotation context.

Recording does not depend on live transcription. The main workflow stops capture first, then transcribes and extracts/correlates frames. This avoids presenting real-time or silence-triggered behavior that the current session controller deliberately disables.

## Transcription

Local Whisper is the primary local path after a model is downloaded. Model sizes range from 75 MB (tiny) to 3.1 GB (large), with a 142 MB base model. OpenAI transcription can be configured as a cloud recovery path.

Failures are reported with provider-specific diagnostics. A missing model/key or a provider error does not justify inventing transcript content. Existing capture evidence remains recoverable.

## Analysis providers

All provider outputs pass through the common analysis contract and validator.

| Provider ID | UI name | Connection | Behavior |
|---|---|---|---|
| `rules` | Local Rules | Local | Deterministic local issue construction; always available |
| `ollama` | Ollama | Local | Fixed loopback endpoint; model discovery and optional image capability |
| `lmstudio` | LM Studio | Local | Fixed loopback OpenAI-compatible endpoint |
| `codex-cli` | Codex CLI | CLI | Non-interactive installed CLI using its existing authentication |
| `claude-cli` | Claude Code CLI | CLI | Installed CLI using its existing authentication |
| `anthropic-api` | Anthropic API | Cloud | Direct API request using a stored key |

The user selects one analysis provider and, where applicable, a model. Discovery reports whether it is installed, authenticated, reachable, and ready. The pipeline does not silently retry through another paid/cloud provider. When enhanced analysis cannot produce a valid result, it records a fallback reason and uses Local Rules.

Local provider endpoints are constrained to loopback. Unknown model capability is treated conservatively: screenshots are sent only when the adapter can establish compatible image support; transcript-only analysis remains available.

## Analysis contract

The normalized input describes the session and evidence without granting a provider filesystem authority. Expected output is structured data, not arbitrary prose. Validation enforces bounded strings, recognized category/severity values, evidence references, and deterministic ordering. Invalid output is rejected before it reaches the Review Editor.

The report attribution identifies MarkuprPlus and `https://markuprplus.com`; compatibility IDs remain lower-case only at machine boundaries.

## Review and output

Provider output is a draft. The Review Editor lets the user:

- edit title/description;
- change category and severity;
- inspect linked evidence;
- reorder or delete findings;
- save locally;
- export Markdown, PDF, HTML, or JSON.

GitHub and Linear delivery are separate explicit actions. They receive only the reviewed body/destination chosen for that invocation.

## Security and data flow

- Renderer code reaches privileged operations only through the preload/IPC boundary.
- Screenshot bytes are validated and normalized before export or provider use.
- API keys first try the operating system credential store and then Electron `safeStorage`. If both fail, current compatibility behavior can use an owner-only plaintext `secure-keys.json` entry; users who cannot provide supported secure storage should omit hosted API keys.
- Local Rules and local Whisper do not require a model-service request.
- Ollama/LM Studio use local loopback services.
- CLI providers follow the installed CLI/account configuration.
- Anthropic/OpenAI, screen description, GitHub, and Linear can send selected content externally.
- No product telemetry is added by MarkuprPlus.

## Failure behavior

Cancellation and timeouts propagate through the pipeline. Invalid provider responses, unavailable binaries, unsafe media, or filesystem failures are surfaced without crashing the app or replacing user evidence with fabricated content. Session persistence and crash recovery remain the source of truth until output is successfully saved.

## Extension rules

A future adapter must implement the same discovery, model-selection, cancellation, size/timeout, validation, and explicit-egress contracts. It must not introduce an implicit hosted tier, proxy, or cross-provider retry.
