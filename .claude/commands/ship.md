# Ship -- Full Release Prep

Run a comprehensive release readiness assessment for markuprx. This goes beyond `release-check` by generating changelogs, scanning for tech debt markers, checking dependency health, and producing a final go/no-go verdict.

## Instructions

### 1. Run the Full Test Suite with Coverage

```bash
cd ~/Projects/markuprx && npm run test:ci -- --run
```

Report: total tests, passed, failed, skipped, and coverage percentages for lines/functions/branches/statements. Compare against the thresholds in `vitest.config.ts` (lines 8%, functions 30%, branches 55%, statements 8%). Flag if any threshold is missed.

### 2. Lint and Type Check

```bash
cd ~/Projects/markuprx && npm run lint 2>&1; npm run typecheck 2>&1
```

Report error count and warning count separately. Zero errors required for ship. Warnings are acceptable but list them.

### 3. Version Consistency Check

Read and compare the version string across all of these sources:
- `package.json` `"version"` field
- `CLAUDE.md` `**Version:**` line
- `electron-builder.yml` (check if `artifactName` patterns reference a hardcoded version)
- Any version constant in `src/main/index.ts` or `src/shared/` if present

Flag any mismatch. All must agree before shipping.

### 4. Build Validation

Run all three build targets and confirm each succeeds:

```bash
cd ~/Projects/markuprx && npm run build 2>&1
```

This runs `node scripts/build.mjs` which builds desktop (electron-vite), CLI (esbuild), and MCP (esbuild). All three must succeed. Report output sizes for:
- `dist/main/index.mjs`
- `dist/cli/index.mjs`
- `dist/mcp/index.mjs`
- `dist/renderer/` total size

### 5. Git Status and Unpushed Commits

```bash
cd ~/Projects/markuprx && git status --short 2>&1
cd ~/Projects/markuprx && git log origin/main..HEAD --oneline 2>&1
```

Flag: uncommitted changes, untracked files, unpushed commits. The working tree should be clean and fully pushed before a release.

### 6. Changelog Generation

```bash
cd ~/Projects/markuprx && git log $(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~30)..HEAD --oneline --no-merges
```

Categorize each commit into:
- **Features** (feat:, add:, new:)
- **Fixes** (fix:, bugfix:, patch:)
- **Refactoring** (refactor:, cleanup:, chore:)
- **Documentation** (docs:, readme:)
- **Breaking Changes** (breaking:, BREAKING CHANGE in body)

Format as a draft CHANGELOG entry with the current version from `package.json`. Include commit hashes for traceability.

### 7. TODO/FIXME/HACK Scan

Search the `src/` directory for tech debt markers:

```bash
cd ~/Projects/markuprx && grep -rn "TODO\|FIXME\|HACK\|XXX\|TEMP\|WORKAROUND" src/ --include="*.ts" --include="*.tsx" 2>&1
```

Report each one with file path and line number. Categorize by severity:
- **FIXME/HACK** -- should ideally be resolved before shipping
- **TODO** -- acceptable to ship with, but document in release notes
- **TEMP/WORKAROUND** -- flag for review, may indicate fragile code

### 8. Dependency Freshness

```bash
cd ~/Projects/markuprx && npm outdated 2>&1
```

For each outdated package, note:
- Current vs latest version
- Whether it's a major version behind (risky to upgrade)
- Whether it's a security-sensitive dependency (electron, keytar, sharp, @anthropic-ai/sdk, @modelcontextprotocol/sdk, whisper-node)

Do NOT block the release for outdated deps, but flag any that are more than one major version behind.

### 9. Native Module Compatibility

```bash
cd ~/Projects/markuprx && npm ls keytar sharp whisper-node 2>&1
```

Verify native modules resolve correctly. These are the modules that need electron-rebuild and are the most common source of packaging failures.

### 10. Go / No-Go Summary

Produce a structured verdict:

```
=== SHIP READINESS: markuprx vX.X.X ===

BLOCKERS (must fix before release):
- [ ] ... or "None"

WARNINGS (acceptable but should be tracked):
- [ ] ...

RELEASE TYPE RECOMMENDATION:
- patch / minor / major (based on changelog analysis)

VERDICT: GO / NO-GO
```

A release is NO-GO if ANY of these are true:
- Tests fail
- Lint errors exist
- Build fails for any target (desktop, CLI, MCP)
- Version mismatch across package.json / CLAUDE.md
- Uncommitted changes in the working tree

A release is GO if all the above pass, even with warnings.
