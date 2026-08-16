# Security -- Electron Application Security Audit

Perform a thorough security audit of markuprx, an Electron app that handles API keys, screen recordings, voice data, and AI API communication. This audit covers Electron-specific attack surfaces, OWASP Top 10 adapted for desktop apps, and markuprx's specific threat model.

## Threat Model

markuprx's attack surface includes:
- **API keys** (OpenAI, Anthropic) stored via keytar/OS keychain
- **Screen recordings** and **voice recordings** saved to disk
- **Network traffic** to OpenAI Whisper API, Anthropic Claude API, HuggingFace model downloads
- **Local Whisper binary** downloaded from HuggingFace and executed
- **IPC bridge** between Electron main and renderer processes
- **MCP server** accepting tool calls from external AI agents
- **CLI tool** processing arbitrary video files from disk
- **Auto-updater** downloading and installing updates from GitHub Releases

## Instructions

### 1. Dependency Vulnerability Scan

```bash
cd ~/Projects/markuprx && npm audit --omit=dev 2>&1
cd ~/Projects/markuprx && npm audit 2>&1
```

Report all vulnerabilities by severity (critical, high, moderate, low). For each critical/high:
- Which package and what CVE?
- Is it in a production dependency or dev-only?
- Is it actually reachable in markuprx's code paths?

### 2. Hardcoded Secrets Scan

Search the entire codebase for leaked secrets:

```bash
cd ~/Projects/markuprx && grep -rn "sk-\|api[_-]key\|secret\|token\|password\|credential" src/ --include="*.ts" --include="*.tsx" -i 2>&1
cd ~/Projects/markuprx && grep -rn "ANTHROPIC_API_KEY\|OPENAI_API_KEY\|GITHUB_TOKEN" src/ .env* .github/ --include="*.ts" --include="*.tsx" --include="*.yml" --include="*.env*" 2>&1
```

Verify:
- API keys are ONLY accessed via keytar (`src/main/settings/SettingsManager.ts`)
- No API keys in environment variables, config files, or committed `.env` files
- No keys in test fixtures or mock data
- The preload script (`src/preload/index.ts`) does not expose raw API keys to the renderer
- Check `electron-builder.yml` and `scripts/notarize.cjs` for hardcoded signing credentials

### 3. Electron Security Configuration

Read the BrowserWindow creation code in `src/main/index.ts` and verify:

**webPreferences (Critical)**
- `nodeIntegration` MUST be `false` (or absent, as false is default)
- `contextIsolation` MUST be `true`
- `sandbox` should be `true` if possible
- `webSecurity` MUST NOT be set to `false`
- `allowRunningInsecureContent` MUST NOT be set to `true`
- `experimentalFeatures` should be `false`
- `enableRemoteModule` MUST be `false` (or absent)

**Content Security Policy**
- Check if a CSP is set via `session.defaultSession.webRequest.onHeadersReceived` or in the HTML
- Renderer should not be able to load arbitrary external resources
- `unsafe-inline` and `unsafe-eval` in script-src are red flags

**Navigation and Window Opening**
- Check for `will-navigate` handler that blocks external navigation
- Check for `setWindowOpenHandler` that prevents arbitrary window creation
- The app should not navigate to external URLs in the main window

### 4. Preload Script API Surface Audit

Read `src/preload/index.ts` thoroughly. The preload script is the security boundary between main and renderer. Verify:

- No direct `ipcRenderer.send()` or `ipcRenderer.invoke()` with user-controlled channel names
- All exposed APIs use hardcoded `IPC_CHANNELS.*` constants
- No generic `ipcRenderer.on(channel)` where `channel` comes from renderer input
- The `copyToClipboard` function does not pass unsanitized data
- The `settings.import()` function validates imported JSON before applying
- File paths received from renderer (e.g., `output.openFolder(sessionDir)`) are validated/sanitized in the main process handler

### 5. IPC Handler Input Validation

Read the IPC handlers in `src/main/ipc/`. For each handler, check:

- Are arguments validated before use? (Zod schemas preferred)
- Can a malicious renderer forge IPC messages to:
  - Read arbitrary files (via `output.openFolder` with path traversal)?
  - Execute arbitrary commands (via ffmpeg or Whisper with crafted input)?
  - Access API keys directly?
  - Write to arbitrary locations?

Specific handlers to scrutinize:
- `SESSION_START` -- does `sourceId` get validated?
- `SCREEN_RECORDING_START` -- does `sessionId` get sanitized before building file paths?
- `SCREEN_RECORDING_CHUNK` -- is the chunk size bounded?
- `SETTINGS_IMPORT` -- is imported JSON schema-validated?
- `OUTPUT_OPEN_FOLDER` -- is the path restricted to the output directory?
- `WHISPER_DOWNLOAD_MODEL` -- is the model name validated against an allowlist?

### 6. Command Injection via External Processes

markuprx spawns child processes. Check each for injection risks:

**ffmpeg (`src/main/pipeline/FrameExtractor.ts`)**
- Are file paths passed to ffmpeg properly escaped/quoted?
- Can a crafted filename or path inject ffmpeg flags or shell commands?
- Is ffmpeg invoked via `child_process.spawn` (safer) or `exec` (shell injection risk)?

**Whisper (`src/main/transcription/WhisperService.ts`)**
- Same questions as ffmpeg
- Is the Whisper binary path validated before execution?
- Could a replaced Whisper binary execute arbitrary code?

**notarize script (`scripts/notarize.cjs`)**
- Does it use environment variables safely?
- No shell injection via Apple ID or team ID?

### 7. Network Security

**API Communication**
- Read `src/main/ai/ClaudeAnalyzer.ts`: Are all API calls over HTTPS?
- Read Whisper cloud transcription code: Is the OpenAI API endpoint hardcoded to `https://`?
- Are API keys sent in headers (Authorization), not query parameters?

**Model Downloads**
- Read `src/main/transcription/ModelDownloadManager.ts`: Is the HuggingFace download URL hardcoded or user-configurable?
- Is the downloaded model checksum-verified?
- Could a MITM attack replace the Whisper model with a malicious binary?

**Auto-Updater**
- Read `src/main/AutoUpdater.ts`: Is update verification enabled?
- Does `electron-updater` verify code signatures on downloaded updates?
- Is the update feed URL locked to `github.com/eddiesanjuan/markuprx`?

### 8. Data at Rest Security

- Where are session recordings stored? Check `src/main/output/FileManager.ts`
- Are recordings accessible to other applications?
- Is there a session cleanup/deletion mechanism that properly removes files?
- Do crash recovery files (`CrashRecovery.ts`) persist sensitive data (transcripts with potentially confidential info)?
- Is `electron-store` data encrypted or plaintext on disk?

### 9. MCP Server Security

Read `src/mcp/server.ts` and each tool in `src/mcp/tools/`:

- Can an MCP client trigger screen capture without user consent?
- Can an MCP client access files outside the session directory?
- Are tool inputs validated with Zod schemas?
- Is there rate limiting on tool calls?
- Can an MCP client exfiltrate data by crafting tool call arguments?
- Does `startRecording`/`stopRecording` require any authentication?

### 10. OWASP Desktop Top 10 Checklist

Produce a checklist adapted for markuprx:

```
=== SECURITY AUDIT: markuprx vX.X.X ===

[PASS/FAIL/PARTIAL] D1: Injection (command injection via ffmpeg/Whisper, path traversal via IPC)
[PASS/FAIL/PARTIAL] D2: Broken Authentication (API key storage, MCP server access control)
[PASS/FAIL/PARTIAL] D3: Sensitive Data Exposure (recordings on disk, crash recovery data, API keys in memory)
[PASS/FAIL/PARTIAL] D4: Insecure Deserialization (IPC message handling, settings import, MCP tool inputs)
[PASS/FAIL/PARTIAL] D5: Broken Access Control (renderer->main boundary, file system access, MCP tool permissions)
[PASS/FAIL/PARTIAL] D6: Security Misconfiguration (Electron webPreferences, CSP, auto-updater)
[PASS/FAIL/PARTIAL] D7: Insufficient Logging (crash logs, audit trail for sensitive operations)
[PASS/FAIL/PARTIAL] D8: Insecure Communication (API calls over HTTPS, model downloads, update feed)
[PASS/FAIL/PARTIAL] D9: Using Components with Known Vulnerabilities (npm audit results)
[PASS/FAIL/PARTIAL] D10: Insufficient Binary Protections (code signing, notarization, hardened runtime)

CRITICAL FINDINGS:
- [finding with file path and line number]

HIGH FINDINGS:
- [finding]

MEDIUM FINDINGS:
- [finding]

RECOMMENDATIONS (prioritized):
1. [action] -- [effort: low/medium/high] -- [impact: low/medium/high]
```
