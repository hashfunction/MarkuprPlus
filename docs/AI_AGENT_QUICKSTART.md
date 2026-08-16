# AI Agent Quickstart

This repo includes a one-command setup path for coding agents.

## Command

From repo root:

```bash
npm run setup:markuprx
# or directly:
./scripts/setup-markuprx.sh
```

This command:
- validates Node.js version (20.9+)
- installs dependencies if missing
- runs `npm run typecheck`

## Fast Variants

```bash
./scripts/setup-markuprx.sh --skip-install
./scripts/setup-markuprx.sh --skip-checks
```

## First Run Test Loop

After setup:

```bash
npm run dev
# In a separate terminal:
npm test
```

## BYOK Requirements (Open Source Mode)

For full report quality in this repo version:
- OpenAI API key (transcription)
- Anthropic API key (analysis)

Keys are configured in-app under `Settings > Advanced`.
