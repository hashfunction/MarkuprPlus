# Code Quality Audit

Perform a targeted code quality audit of the markuprx codebase.

## Instructions

1. **Run all static analysis:**
   ```bash
   npm run lint
   npm run typecheck
   ```
   Report any errors or warnings.

2. **Check for common issues in Electron apps:**
   - IPC channels defined in `src/shared/types.ts` that are unused or missing handlers
   - `nodeIntegration` or `contextIsolation` misconfigurations in window creation
   - Missing error boundaries in React components
   - Unhandled promise rejections in main process code
   - Memory leaks from event listeners not being cleaned up

3. **Review security considerations:**
   - API keys should only be stored via keytar (never in plaintext config files)
   - No `eval()`, `innerHTML`, or `dangerouslySetInnerHTML` with user-supplied data
   - Preload script should not expose unnecessary APIs to the renderer
   - Check `webPreferences` in BrowserWindow creation for safe defaults

4. **Examine error handling patterns:**
   - Verify try/catch around ffmpeg operations (FrameExtractor)
   - Verify try/catch around Whisper operations (WhisperService)
   - Verify try/catch around Claude API calls (ClaudeAnalyzer)
   - Check that errors surface user-friendly messages, not raw stack traces

5. **Check for stale code:**
   - Unused imports or exports
   - Dead code paths (unreachable conditions)
   - TODO/FIXME/HACK comments that should be addressed

6. **Provide a prioritized report:**
   - **Critical** -- security or data loss risks
   - **High** -- bugs or broken functionality
   - **Medium** -- code quality and maintainability
   - **Low** -- style and cleanup opportunities
