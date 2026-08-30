# MarkuprPlus CLI Bridge Design

**Date:** 2026-08-30
**Status:** Approved for implementation

## Goal

Restore Codex CLI, Claude Code CLI, OpenCode, Cursor Agent CLI, Qwen Code,
Goose, Amp, Kiro CLI, and Aider as functional report-generation providers in
the sandboxed Mac App Store edition without allowing the Store application to
launch arbitrary external processes.

The feature uses an optional, separately installed MarkuprPlus CLI Bridge. The
Store application remains useful without the companion through Anthropic API,
Ollama, LM Studio, and Local Rules.

## Distribution Boundary

The direct edition keeps its existing in-process CLI provider adapters. It does
not require or automatically prefer the bridge.

The Mac App Store edition exposes the same CLI provider identifiers but backs
them with bridge adapters. It never performs CLI discovery or execution in the
Store process. The Store application does not install, update, launch, or
uninstall the companion.

The bridge ships in the existing `markuprx` npm package and is installed by the
user outside the Store application. Installation creates a per-user launchd
agent. The application may show copyable installation and pairing instructions,
but all installation commands are performed explicitly by the user.

## Architecture

The feature has four isolated units:

1. **Portable bridge protocol** defines versioned request and response types,
   validation limits, error codes, and conversion between a MarkuprPlus session
   and a path-free JSON payload.
2. **Companion server** authenticates loopback requests, discovers allowlisted
   CLI providers, reconstructs an in-memory session, and delegates analysis to
   the existing CLI adapters.
3. **Store bridge client and adapters** implement the existing
   `AnalysisProviderAdapter` interface over HTTP so the report pipeline remains
   unchanged.
4. **CLI lifecycle and Store settings UI** install and manage the per-user
   launch agent outside the Store app, securely pair the two processes, and
   explain connection state.

The existing provider IDs and saved model selections remain unchanged. A report
selected with a CLI provider continues through the existing analysis pipeline,
including its Local Rules fallback and provenance fields.

## Companion Lifecycle

The `markuprx` executable gains these commands:

- `markuprx bridge install` creates bridge state if needed, writes the launchd
  property list, bootstraps the agent, and prints the pairing token once.
- `markuprx bridge serve` runs the foreground HTTP server used by launchd.
- `markuprx bridge start` and `markuprx bridge stop` control the installed agent.
- `markuprx bridge status` reports installation, process, protocol, and provider
  status without printing the secret.
- `markuprx bridge token` prints the current pairing token on explicit request.
- `markuprx bridge rotate-token` replaces the token and invalidates the previous
  pairing.
- `markuprx bridge uninstall` boots out the agent and removes only bridge-owned
  launchd and configuration files after resolving their exact paths.

The bridge listens at `127.0.0.1:49647`. Its state lives under
`~/.config/markuprplus/bridge/`, and its LaunchAgent property list lives at
`~/Library/LaunchAgents/com.trieflow.markuprplus.cli-bridge.plist`. The state
directory is mode `0700`; the configuration containing the token is mode
`0600`.

The launchd property list uses the absolute Node executable and built
`dist/cli/index.mjs` path from the installed package. Installation rejects
temporary `npx` cache paths so the service cannot silently break when a cache is
cleaned. Re-running install is idempotent and refreshes the property list for a
new npm package location while retaining the existing token.

The lifecycle implementation is macOS-only. `serve` remains directly runnable
for automated tests, but installation commands return an actionable unsupported
platform error elsewhere.

## Protocol

Protocol version `1` exposes:

- `GET /v1/health`: unauthenticated liveness response containing bridge version,
  protocol version, and whether pairing has been configured. It contains no
  provider, path, process, or credential details.
- `GET /v1/providers`: authenticated discovery for all allowlisted CLI providers.
- `POST /v1/providers/:provider/test`: authenticated forced discovery for one
  allowlisted CLI provider.
- `GET /v1/providers/:provider/models`: authenticated model discovery for one
  allowlisted CLI provider.
- `POST /v1/analyze`: authenticated analysis with provider, optional model, and
  a portable session payload.

Every authenticated request uses `Authorization: Bearer <token>`. Tokens contain
32 random bytes encoded as base64url. The Store app persists the token through
the existing secure `SettingsManager` secret APIs using service name
`cli-bridge`; the renderer never receives a stored token after saving it.

The portable session contains:

- session ID, state, start and optional end times;
- source ID and the existing JSON-compatible session metadata;
- feedback items and transcript events;
- screenshot IDs, timestamps, dimensions, MIME type, and base64 bytes.

It contains no filesystem paths. The bridge decodes screenshots into `Buffer`
objects and invokes the existing analyzer with a temporary session. Existing
analyzers may create their own private temporary files as they do in the direct
edition.

The protocol applies these exact limits before analysis:

- request body: 32 MiB;
- screenshots: at most 20;
- decoded screenshot: at most 8 MiB each;
- transcript events: at most 2,000;
- feedback items: at most 2,000;
- model ID: at most 200 characters with no control characters;
- one active analysis request at a time;
- analysis deadline: 190 seconds at the transport layer, preserving each
  analyzer's existing 180-second process deadline.

Unknown JSON properties, non-finite numbers, invalid base64, unsupported image
types, non-CLI provider IDs, and invalid session states are rejected. Protocol
errors use a JSON envelope with a stable code and sanitized message. CLI output,
session contents, authorization headers, and tokens are never written to bridge
logs.

## Security Model

The bridge assumes other unprivileged processes on the same Mac are untrusted.
Its defenses are:

- bind only to IPv4 loopback and reject non-loopback socket addresses;
- require exact API paths and methods;
- require the bearer token for every operation that reveals provider details or
  performs work;
- compare tokens with a timing-safe comparison;
- reject missing or unexpected `Host` values rather than serving through DNS
  rebinding hostnames;
- allow only the nine compile-time CLI provider IDs;
- never accept executable paths, command arguments, working directories,
  environment variables, configuration paths, URLs, or shell text from the
  client;
- cap request size before buffering the entire body;
- allow one analysis at a time and return `429 BRIDGE_BUSY` for another;
- sanitize error messages using the same credential-redaction rules as existing
  CLI diagnostics;
- set `Cache-Control: no-store` and return no CORS headers.

Loopback HTTP is acceptable for this local boundary because the bearer token is
high entropy, never placed in a URL, and readable only from mode-restricted
companion state or the Store app's secure secret storage. TLS would not add a
useful identity guarantee without introducing a local certificate lifecycle.

## Provider Routing

`createDefaultAnalysisProviderRegistry` becomes distribution-aware:

- `direct` registers the existing `CodexAnalyzer`, `ClaudeCliAnalyzer`, and
  `ProfiledCliProvider` adapters;
- `mas` registers one `BridgeCliProvider` per CLI provider ID plus Ollama,
  LM Studio, and Anthropic API;
- tests may inject a distribution and bridge client explicitly.

`BridgeCliProvider.discover()` calls the bridge and returns an ordinary
`AnalysisProviderStatus`. A missing token reports `Pair MarkuprPlus Bridge`.
Connection refusal reports `Start MarkuprPlus CLI Bridge`. An incompatible
protocol reports the installed and required versions without exposing any
secret.

`BridgeCliProvider.analyze()` serializes the session and returns the existing
`AIAnalysisResult`. The central pipeline therefore retains current Local Rules
fallback behavior without bridge-specific branching.

## Store Settings Experience

The Store edition displays all provider cards in the existing order. CLI cards
use the `CLI` badge and add `Via MarkuprPlus Bridge` to their description or
status. The direct edition's cards and descriptions remain unchanged.

A Store-only bridge setup panel appears before the provider cards. It contains:

- connection state: Not paired, Bridge offline, Version incompatible, or
  Connected;
- a password-style pairing-token field;
- Pair, Test connection, Forget pairing, and Refresh actions as appropriate;
- copyable terminal instructions for installing the published `markuprx`
  package and running `markuprx bridge install`;
- a clear statement that the optional companion is installed outside the Mac
  App Store and runs only for the current user.

Pair validates the token against authenticated provider discovery before saving
it. Failed validation leaves the previous valid token intact. Forget pairing
deletes the secret and changes a currently selected CLI provider to Local Rules
so the next report does not fail unexpectedly.

Provider discovery combines bridge-backed CLI statuses with the existing local
and cloud providers. Settings discovery must remain responsive when the bridge
is absent by using a two-second connection deadline. Analysis uses the longer
190-second deadline.

## App Store Compliance

The Store binary remains sandboxed and self-contained for its core behavior. It
does not download, install, update, launch, or modify the companion. The
companion is an optional user-installed integration analogous to connecting to
an already running local service. MarkuprPlus remains functional with Local
Rules and the existing sandbox-safe providers when the companion is absent.

Store metadata, privacy copy, and review notes must disclose:

- the optional local companion;
- loopback communication;
- that report material is sent only to the locally running companion when a CLI
  provider is explicitly selected;
- that the companion invokes the user's separately installed and authenticated
  CLI;
- complete review steps using Local Rules without requiring companion setup.

The Store review notes must not claim that the Store app directly executes
external CLIs.

## Error Handling

Bridge transport errors map to concise, actionable provider diagnostics. The
server returns these stable codes:

- `AUTH_REQUIRED` and `AUTH_INVALID` (`401`);
- `METHOD_NOT_ALLOWED` (`405`);
- `NOT_FOUND` (`404`);
- `PAYLOAD_TOO_LARGE` (`413`);
- `INVALID_REQUEST` (`400`);
- `PROVIDER_UNSUPPORTED` (`400`);
- `BRIDGE_BUSY` (`429`);
- `PROVIDER_UNAVAILABLE` (`503`);
- `ANALYSIS_TIMEOUT` (`504`);
- `ANALYSIS_FAILED` (`502`);
- `INTERNAL_ERROR` (`500`).

The server never returns stack traces. The client treats malformed responses as
`BRIDGE_PROTOCOL_ERROR`. Report generation then uses the existing Local Rules
fallback and records the sanitized reason in report provenance.

## Testing

Development follows red-green-refactor. Tests cover:

- protocol validation, serialization round trips, and every payload limit;
- token generation, file permissions, timing-safe authentication, Host checks,
  route/method allowlisting, request size limiting, response headers, and log
  redaction;
- real loopback HTTP behavior using an ephemeral test port and injected fake
  provider registry;
- one-analysis concurrency and timeout behavior;
- bridge adapters for discovery, model discovery, analysis, authentication,
  incompatible versions, malformed responses, and connection refusal;
- direct versus Store registry contents;
- CLI lifecycle property-list generation, idempotent install planning, exact
  path resolution, and safe uninstall planning without mutating the developer's
  real launchd state;
- secure pairing IPC and renderer state without exposing stored tokens;
- Store and direct provider option ordering and copy;
- existing provider, pipeline, settings, packaging, and Electron UI regressions;
- CLI and MCP npm bundle construction, MAS desktop build, type checking, lint,
  and the full unit suite.

A manual local verification runs the companion in the foreground, pairs a MAS
development build, confirms real provider discovery, and executes one available
CLI against a controlled transcript. Signed Store packaging remains a separate
release step because it needs distribution credentials and a provisioning
profile.

## Documentation and Release

The README and website gain a CLI Bridge section with install, pairing, status,
token rotation, troubleshooting, and uninstall instructions. The npm package
includes all bridge runtime files through its existing bundled CLI entry point.

The Store build version must be incremented before the next upload. Submission
does not occur as part of implementation and still requires explicit action-time
confirmation.

## Success Criteria

- All nine CLI providers appear in the Store settings UI.
- With a valid paired bridge, Store discovery and report analysis work through
  the user's installed CLI without spawning it from the Store process.
- Without a bridge, Store startup and settings remain responsive and explain
  the exact setup action.
- Invalid clients cannot discover providers or trigger execution.
- The bridge accepts no arbitrary executable, arguments, environment, working
  directory, or filesystem path from the Store app.
- The direct edition behaves exactly as before.
- Store-safe providers and Local Rules continue working without the companion.
- Automated verification passes for source, bundles, and MAS behavior.
