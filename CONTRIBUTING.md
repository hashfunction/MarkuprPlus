# Contributing to MarkuprPlus

Thanks for helping improve MarkuprPlus. Start with a focused issue or proposal, preserve the compatibility boundaries below, and include evidence for behavior changes.

## Setup

Requirements:

- Node.js 22.23.2 for contributor tooling (the published CLI retains a Node.js 20.9+ engine);
- npm;
- ffmpeg on `PATH`;
- macOS for the currently exercised real-Electron desktop/package path (other targets may still be developed/tested where supported).

```bash
git clone https://github.com/hashfunction/MarkuprPlus.git
cd MarkuprPlus
npm install
npm run dev
```

A local Whisper model is optional for most development. The tiny download is about 75 MB and base is 142 MB. Cloud keys are optional and should never be committed.

## Before coding

1. Search existing [issues](https://github.com/hashfunction/MarkuprPlus/issues).
2. Read the nearest `AGENTS.md` if one is present, plus the applicable plan/spec.
3. Identify whether the work changes public behavior or a retained compatibility interface.
4. Add a failing test for fixes/features before production changes.

## Compatibility boundary

Public product copy is MarkuprPlus. Retain these machine-facing names unless the change includes a reviewed migration:

- package/CLI `markuprx`, MCP binary `markuprx-mcp`, MCP registry ID;
- `.markuprx`, `.markuprx.json`, `MARKUPRX_*`;
- `window.markuprx`, `markuprx:` IPC, public TypeScript API names;
- app ID, stored paths, service identifiers, and migration keys.

Do not perform a blind repository-wide rename.

## Architecture expectations

- Main process owns files, shell, capture orchestration, credentials, providers, export, and native UI.
- Preload exposes only explicit typed capabilities.
- Renderer is unprivileged React.
- Shared types/channels/constants are single sources of truth.
- CLI/MCP reuse service/output modules without bypassing their validation.

The project uses repository CSS and CSS variables, not Tailwind. Follow existing component and stylesheet patterns.

## Testing

Run the smallest relevant test first, then broaden in proportion to risk:

```bash
npm run typecheck
npm run lint
npm run test:unit -- --run
npm run test:integration -- --run
npm run build:desktop
npm run test:ui-electron
npm run verify:source
```

`verify:source` is the source release gate. Real-Electron tests are required for main/preload/renderer behavior that a DOM-only unit test cannot prove. Packaging changes also require the package verifier and the applicable startup smoke.

Tests should cover failure paths, cancellation, cleanup, accessibility, and compatibility—not just the happy path. Avoid weakening assertions or refreshing visual snapshots without understanding the change.

## Security and privacy

- Treat renderer values, imported settings, provider output, paths, and media bytes as untrusted.
- Validate IPC senders and keep channel access enumerated.
- Never log or commit API keys, tokens, private screenshots, audio, or user paths.
- Do not introduce shell command interpolation or broad recursive deletion.
- Describe provider-specific egress accurately: local capture is not proof that a selected cloud/CLI/delivery operation stays local.
- Report vulnerabilities according to [SECURITY.md](SECURITY.md), not a public issue.

## Pull requests

Keep each PR focused and explain:

- user-visible outcome;
- tests added and RED/GREEN evidence;
- commands run and results;
- compatibility/security/data-flow impact;
- screenshots for UI changes;
- known limitations or follow-up work.

Do not commit build output, personal configuration, credentials, or unrelated formatting churn. Update public documentation when behavior or availability changes.

## Style

- TypeScript strictness and existing ESLint rules apply.
- Prefer explicit types at process/security boundaries.
- Keep functions small and pure where practical.
- Use public-brand constants for visible application copy.
- Add comments for intent or a compatibility/security constraint, not restatements of code.
- Preserve keyboard and screen-reader behavior when changing UI.

## Community

Use [GitHub Issues](https://github.com/hashfunction/MarkuprPlus/issues) for bugs and feature requests and follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). The project is MIT licensed.
