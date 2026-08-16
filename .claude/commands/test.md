# Run Tests and Report Results

Run the markuprx test suite and report results with actionable analysis.

## Instructions

1. **Run the full test suite:**
   ```bash
   npm test -- --run
   ```

2. **If tests fail**, analyze each failure:
   - Read the failing test file to understand what it expects
   - Read the source file being tested to understand current behavior
   - Determine if the failure is a regression (source changed) or a test that needs updating (requirements changed)
   - Provide a clear summary: which tests failed, why, and a recommended fix

3. **If all tests pass**, run coverage:
   ```bash
   npm run test:coverage -- --run
   ```
   Report coverage summary and identify any source files with 0% coverage that should have tests.

4. **Check for untested modules:**
   - Compare files in `src/main/` against test files in `tests/unit/`
   - Flag any major module (SessionController, CrashRecovery, ErrorHandler, pipeline components, MCP tools) that lacks test coverage

5. **Run type checking** as a bonus validation:
   ```bash
   npm run typecheck
   ```

6. **Provide a summary** with:
   - Total tests: passed / failed / skipped
   - Coverage highlights (if run)
   - Any type errors found
   - Recommended next steps (tests to write, failures to fix)
