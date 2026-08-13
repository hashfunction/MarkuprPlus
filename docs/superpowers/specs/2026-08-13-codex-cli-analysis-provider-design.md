# Codex CLI Analysis Provider Design

## Summary

markupR currently enhances reports only when an Anthropic API key is available. Add a selectable Codex CLI analysis provider so a user who already has Codex installed and authenticated can use that existing login instead of supplying an Anthropic key.

This release implements Codex only. The provider boundary and discovery result types will allow additional local CLI adapters later without changing the analysis pipeline or settings UI.

## Goals

- Let users select Codex CLI, Anthropic API, or local rules for report analysis.
- Discover an installed Codex executable from an Electron app launched outside a terminal.
- Show the detected executable path, version, and authentication state.
- Run analysis through the user's existing Codex authentication without reading or storing OpenAI credentials.
- Preserve the existing rule-based report whenever Codex analysis cannot complete.
- Never silently invoke Anthropic when Codex is explicitly selected.
- Rebuild, reinstall, and restart the local Apple Silicon application after verification.

## Non-goals

- Supporting Claude Code, Gemini CLI, OpenCode, Aider, or other CLI providers in this release.
- Managing Codex installation, login, account selection, model selection, or subscription state.
- Keeping a persistent Codex App Server process.
- Reordering markupR's post-processing pipeline or changing frame extraction behavior.
- Replacing OpenAI or local Whisper transcription settings.

## Provider Architecture

Introduce an analysis-provider boundary with three provider IDs:

- `rules`: existing deterministic local report generation.
- `anthropic`: existing Anthropic BYOK analysis.
- `codex`: new installed Codex CLI analysis.

Persist the selection as `analysisProvider` in `AppSettings`. Its default is `anthropic` so upgrades preserve current behavior; Codex is opt-in. Existing AI tier metadata remains for compatibility, while pipeline output also records the concrete provider and provider label.

The analysis pipeline continues to create the rule-based document first. It then selects exactly the configured provider:

- `rules` returns the rule-based document immediately.
- `anthropic` uses the existing key-backed analyzer and falls back to rules on failure.
- `codex` invokes the Codex analyzer and falls back to rules on failure.

An explicit Codex selection never falls through to Anthropic, even if an Anthropic key exists.

## Codex Discovery

Create a discovery service in the Electron main process. It returns a serializable status containing:

- provider ID and display name;
- installed state;
- resolved executable path;
- version string;
- authenticated state;
- actionable diagnostic text when unavailable.

Discovery checks, in order:

1. The current process `PATH`.
2. Standard macOS/Linux locations such as `/opt/homebrew/bin`, `/usr/local/bin`, and `~/.local/bin`.
3. The user's login shell with a fixed `command -v codex` query.

Only a real, executable file is accepted. Commands use the resolved absolute executable with an argument array and never interpolate user data into a shell command. The child environment receives a normalized `PATH` containing the resolved executable directory so script launchers using `/usr/bin/env node` work from a Finder-launched Electron app.

Version and authentication probes use `codex --version` and `codex login status` with short timeouts. Probe output is normalized into the discovery status without exposing credentials.

## Codex Invocation

The adapter uses the stable non-interactive `codex exec` command documented in the official OpenAI CLI reference. Each invocation uses:

- `--ephemeral` to avoid persisting a Codex session;
- `--sandbox read-only` to prevent model-generated file changes;
- `--ignore-user-config` to exclude user MCP servers and custom runtime configuration while retaining Codex authentication;
- `--ignore-rules` to exclude project and user instruction files;
- `--skip-git-repo-check` because analysis runs in an isolated temporary directory;
- `--output-schema <path>` to constrain the final response to markupR's analysis schema;
- `--output-last-message <path>` to capture only the final structured response;
- `--image <path>` for each screenshot available to the existing analysis stage;
- `-` so the complete prompt is supplied on standard input.

The prompt combines markupR's existing analysis instructions with the session transcript, source name, screenshot timestamps, and screenshot index mapping. The adapter parses the final message with the same validation and coercion rules used for Anthropic results.

The command runs with a three-minute timeout. Standard output and error capture are bounded. On timeout, the complete child process is terminated. Prompt, schema, copied image, and result files live in a uniquely created OS temporary directory and are removed in a `finally` block.

## IPC and Renderer State

Expose a narrow preload API for:

- discovering supported analysis providers;
- refreshing Codex status;
- testing the selected Codex installation.

The renderer cannot execute arbitrary commands or provide executable arguments. Provider IDs are validated in the main process.

Settings > Advanced gains an **AI Analysis Provider** section with three choices:

- Codex CLI;
- Anthropic API;
- Local rules only.

The Codex choice displays installation path, version, authentication state, and a **Scan again** action. Selecting a provider saves immediately. Anthropic API-key controls are shown when Anthropic is selected and remain stored when another provider is selected.

The main window reports provider readiness:

- **Codex CLI ready** when Codex is installed and authenticated;
- **Codex needs attention** with a Settings action when it is missing or logged out;
- the existing Anthropic setup state when Anthropic is selected;
- no setup warning for local-rules mode.

Onboarding copy no longer describes Anthropic as mandatory. It explains that AI analysis can be configured later in Settings and retains the existing skip path.

## Error Handling and Privacy

The following conditions produce a rule-based report and a specific fallback reason:

- Codex is not found;
- the executable is no longer available at the discovered path;
- Codex is not authenticated;
- process spawn fails;
- the three-minute timeout is reached;
- Codex exits with a non-zero status;
- the output file is absent, oversized, or invalid;
- the result does not satisfy the analysis schema.

Logs include provider, duration, exit status, and sanitized diagnostics. They do not include prompts, transcript content, API keys, authentication tokens, or full Codex configuration. A failed Codex selection never invokes Anthropic.

## Testing

Add automated coverage for:

- settings defaults, validation, import, export, and reset behavior;
- discovery through `PATH`, common locations, and login-shell fallback;
- rejection of missing or non-executable candidates;
- version and authentication probes;
- exact safe argument construction without shell execution;
- prompt delivery through standard input and screenshot attachment arguments;
- structured result parsing and coercion;
- timeout and child cleanup;
- temporary-directory cleanup;
- provider selection and rule-based fallback;
- the guarantee that Codex selection never calls Anthropic;
- IPC handler validation and preload exposure;
- Advanced Settings selection and readiness display logic;
- main-window readiness copy.

Tests use fake executables and mocked process launching so the automated suite does not consume a user's quota. Final local verification performs one minimal real invocation through the installed authenticated Codex CLI, then runs type checking, relevant tests, the full build, unsigned arm64 packaging, installation to `/Applications/markupR.app`, restart, and process verification.

## Deployment

Build the Electron desktop bundles, package an unsigned arm64 macOS application, quit the existing installed process cleanly, replace `/Applications/markupR.app` with the newly packaged bundle, launch it, and confirm the installed version and process path.

The resulting local app remains unsigned and unnotarized. macOS may preserve or request screen-recording and microphone permissions according to its code-signing identity rules.
