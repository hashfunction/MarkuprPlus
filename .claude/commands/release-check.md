# Pre-Release Checklist

Validate that markuprx is ready for a new release. Run this before bumping the version.

## Instructions

1. **Verify the build succeeds:**
   ```bash
   npm run build
   ```
   This builds the desktop app, CLI, and MCP server. All three must succeed.

2. **Run the full test suite:**
   ```bash
   npm test -- --run
   ```
   All tests must pass. Do not proceed if any fail.

3. **Run lint and type checking:**
   ```bash
   npm run lint
   npm run typecheck
   ```
   Zero errors required. Warnings are acceptable but should be noted.

4. **Check version consistency:**
   - Read `package.json` for the current version
   - Read `CLAUDE.md` for the documented version
   - Read `electron-builder.yml` for the builder config version
   - Flag any mismatches

5. **Review recent changes since last release:**
   ```bash
   git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~20)..HEAD
   ```
   Categorize commits as: features, fixes, chores, breaking changes.

6. **Check for uncommitted changes:**
   ```bash
   git status
   ```
   Working tree should be clean before release.

7. **Verify native dependencies:**
   ```bash
   npm ls keytar sharp whisper-node
   ```
   Ensure native modules are installed and compatible.

8. **Produce a release summary:**
   - Suggested version bump (patch/minor/major) based on changes
   - Draft CHANGELOG entry
   - Any blockers or risks identified
   - Confirmation: "Ready for release" or "Not ready -- [reasons]"
