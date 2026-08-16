# Refactor -- Safe Refactoring with Test Guard Rails

Perform incremental, test-guarded refactoring of a specified area of the markuprx codebase. Every change is validated by re-running the test suite to ensure nothing breaks.

**Target area:** $ARGUMENTS

If no argument is provided, ask the user what area to refactor. Examples:
- A specific file: `src/main/SessionController.ts`
- A module: `src/main/pipeline/`
- A pattern: `error handling`, `IPC layer`, `AI pipeline`

## Instructions

### 1. Establish Baseline -- Run Tests First

```bash
cd ~/Projects/markuprx && npm test -- --run 2>&1
```

Record the baseline: total tests, passed, failed. If any tests are ALREADY failing, report them and ask the user whether to proceed (refactoring on a red test suite is risky).

### 2. Read and Analyze the Target Code

Read the target file(s) thoroughly. Identify refactoring opportunities specific to markuprx's Electron + React + TypeScript stack:

**Electron Main Process (`src/main/`)**
- SessionController FSM: overly complex state transitions, duplicated guard clauses
- IPC handlers in `src/main/ipc/`: handlers doing too much work (should delegate to services)
- CrashRecovery: deeply nested try/catch, unclear recovery paths
- Pipeline steps: tight coupling between PostProcessor, TranscriptAnalyzer, FrameExtractor
- Settings: redundant validation that Zod should handle

**React Renderer (`src/renderer/`)**
- Components over 200 lines that should be split (especially `App.tsx`, `SettingsPanel.tsx`, `SessionReview.tsx`)
- Props drilling that should use React context or composition
- `useEffect` cleanup functions missing for event subscriptions via `window.markuprx.*`
- Inline styles or magic numbers that should be Tailwind utilities or constants
- State that lives in components but should be lifted or extracted to hooks

**Shared / Cross-cutting**
- Type definitions in `src/shared/types.ts` that have grown too large (split by domain)
- Duplicated type definitions between main and renderer
- String-based IPC channel names that could benefit from a type-safe wrapper
- Error handling patterns that swallow errors silently

**CLI and MCP (`src/cli/`, `src/mcp/`)**
- Code duplicated between CLI pipeline and main process pipeline
- MCP tools with similar boilerplate that could share a base pattern

### 3. Propose Changes Before Making Them

For each refactoring opportunity found, describe:
- **What**: The specific change (extract function, rename, split file, simplify conditional)
- **Why**: The code smell or principle violated (SRP, DRY, readability, testability)
- **Risk**: Low (rename/extract), Medium (restructure), High (behavior change)
- **Files affected**: List every file that will be modified

Present the plan and wait for confirmation before proceeding, unless the user said to go ahead.

### 4. Make Changes Incrementally

Apply ONE refactoring at a time, then immediately verify:

```bash
cd ~/Projects/markuprx && npm test -- --run 2>&1
```

If tests fail after a change:
1. Report which test(s) broke and why
2. Revert the change or fix the test (only if the test was testing implementation details, not behavior)
3. Re-run tests to confirm green

Do NOT batch multiple refactoring changes before running tests.

### 5. Type Check After Each Change

```bash
cd ~/Projects/markuprx && npm run typecheck 2>&1
```

TypeScript errors are blockers. Fix them before proceeding to the next refactoring step. This is especially important for:
- IPC channel type changes (affects `src/shared/types.ts`, `src/preload/index.ts`, and all handlers)
- Renamed exports (affects all importers)
- Changed function signatures (affects callers across main/renderer boundary)

### 6. Lint After Each Change

```bash
cd ~/Projects/markuprx && npm run lint 2>&1
```

Fix any new lint errors introduced by the refactoring. Use `npm run lint:fix` for auto-fixable issues.

### 7. Final Validation

After all refactoring steps are complete, run the full validation:

```bash
cd ~/Projects/markuprx && npm test -- --run 2>&1
cd ~/Projects/markuprx && npm run typecheck 2>&1
cd ~/Projects/markuprx && npm run lint 2>&1
cd ~/Projects/markuprx && npm run build 2>&1
```

All four must pass.

### 8. Report

Produce a summary:

```
=== REFACTORING REPORT ===

Target: [what was refactored]
Baseline: X tests passing before refactoring
Final: X tests passing after refactoring

Changes Made:
1. [change] -- [rationale] -- [files]
2. ...

Tests: PASS / FAIL
Typecheck: PASS / FAIL
Lint: PASS / FAIL
Build: PASS / FAIL

Net effect: [simpler code, better separation, improved testability, etc.]
```
