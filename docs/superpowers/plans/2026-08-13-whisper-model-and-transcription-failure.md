# Whisper Model and Transcription Failure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make markupR use any valid downloaded Whisper model and preserve captured artifacts while surfacing an actionable error whenever recorded narration cannot be transcribed.

**Architecture:** `WhisperService` will refresh an auto-discovered model path at use time while preserving explicit model overrides. `TranscriptionRecoveryService` will return a structured result with either transcript events or a typed failure. The stop pipeline will patch the saved report, publish output paths with an error status, and return a failed stop result without deleting the preserved recording or audio.

**Tech Stack:** Electron 28, TypeScript 5, React 18, Vitest, Node.js filesystem APIs, whisper-node

## Global Constraints

- Do not automatically download a model.
- Do not claim that Codex CLI transcribes audio or video.
- Do not invent feedback items when no transcript exists.
- Keep the existing example session untouched.
- Preserve `feedback-report.md`, `session-audio.*`, `session-recording.*`, metadata, and the processing trace after transcription failure.
- Never expose API keys or provider response bodies in diagnostics.

---

### Task 1: Dynamic Whisper Model Discovery

**Files:**
- Modify: `src/main/transcription/WhisperService.ts`
- Modify: `src/main/ipc/windowHandlers.ts`
- Create: `tests/unit/whisperModelSelection.test.ts`

**Interfaces:**
- Consumes: the existing Whisper model directory and `WhisperService.setModelPath(modelPath: string)`.
- Produces: `resolveDownloadedWhisperModelPath(modelsDirectory: string): string | null`; `WhisperService.isModelAvailable()` and `initialize()` refresh auto-discovery; model download completion selects the downloaded path immediately.

- [ ] **Step 1: Write the failing model-selection tests**

```ts
it('selects Tiny when it is the only valid downloaded model', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'markupr-whisper-'));
  await writeFile(join(directory, 'ggml-tiny.bin'), Buffer.alloc(16));
  expect(resolveDownloadedWhisperModelPath(directory)).toBe(join(directory, 'ggml-tiny.bin'));
});

it('refreshes auto-discovery when a model appears after construction', async () => {
  const service = new WhisperService({ modelsDirectory: directory });
  expect(service.isModelAvailable()).toBe(false);
  await writeFile(join(directory, 'ggml-tiny.bin'), Buffer.alloc(16));
  expect(service.isModelAvailable()).toBe(true);
  expect(service.getConfig().modelPath).toBe(join(directory, 'ggml-tiny.bin'));
});
```

Also cover preference order `medium`, `small`, `base`, `tiny`, `large`, zero-byte rejection, and preservation of an explicit `modelPath`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run tests/unit/whisperModelSelection.test.ts`

Expected: FAIL because `resolveDownloadedWhisperModelPath` and the `modelsDirectory` constructor option do not exist and `WhisperService` remains fixed to Medium.

- [ ] **Step 3: Implement minimal dynamic discovery**

Add a models-directory override and track whether `modelPath` was explicitly supplied. Resolve only regular, nonzero files:

```ts
const MODEL_PREFERENCE = [
  'ggml-medium.bin',
  'ggml-small.bin',
  'ggml-base.bin',
  'ggml-tiny.bin',
  'ggml-large-v3.bin',
] as const;

export function resolveDownloadedWhisperModelPath(modelsDirectory: string): string | null {
  for (const filename of MODEL_PREFERENCE) {
    const candidate = join(modelsDirectory, filename);
    try {
      const stats = statSync(candidate);
      if (stats.isFile() && stats.size > 0) return candidate;
    } catch {
      // Continue to the next candidate.
    }
  }
  return null;
}
```

Call a private refresh method from `isModelAvailable()` and `initialize()` only for auto-discovered configurations. Extend `WhisperConfig` locally with optional `modelsDirectory` without changing the renderer-facing settings schema. In the successful `WHISPER_DOWNLOAD_MODEL` handler, call `whisperService.setModelPath(result.path)` before returning.

- [ ] **Step 4: Run focused and adjacent tests and verify GREEN**

Run: `npx vitest run tests/unit/whisperModelSelection.test.ts tests/unit/tierManagerExpanded.test.ts`

Expected: PASS with no unhandled errors.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/main/transcription/WhisperService.ts src/main/ipc/windowHandlers.ts tests/unit/whisperModelSelection.test.ts
git commit -m "fix: discover downloaded whisper models"
```

### Task 2: Structured Transcript Recovery Outcomes

**Files:**
- Modify: `src/main/transcription/TranscriptionRecoveryService.ts`
- Modify: `src/main/SessionController.ts`
- Modify: `src/shared/types.ts`
- Modify: `tests/e2e/recordingPipeline.test.ts`
- Create: `tests/unit/transcriptionRecoveryService.test.ts`

**Interfaces:**
- Produces: `TranscriptionFailureCode`, `TranscriptionFailure`, and `TranscriptRecoveryResult`.
- Changes: `recoverTranscript(sessionStartSec, audioData, dependencies?)` returns `Promise<TranscriptRecoveryResult>` instead of `Promise<TranscriptEvent[]>`.
- Stores: `SessionMetadata.transcriptionFailure?: TranscriptionFailure` for downstream output handling.

- [ ] **Step 1: Write failing recovery-outcome tests**

```ts
it('reports missing configuration when audio exists without a key or local model', async () => {
  const result = await recoverTranscript(100, encodedAudio(), dependencies({
    getOpenAIApiKey: async () => null,
    isLocalModelAvailable: () => false,
  }));
  expect(result.events).toEqual([]);
  expect(result.failure?.code).toBe('not-configured');
});

it('reports no speech separately from provider failure', async () => {
  const result = await recoverTranscript(100, encodedAudio(), dependencies({
    getOpenAIApiKey: async () => 'configured',
    recoverWithOpenAI: async () => ({ events: [], outcome: 'no-speech' }),
  }));
  expect(result.failure?.code).toBe('no-speech');
});

it('returns recovered events without a failure', async () => {
  const event = transcriptEvent('Save button overlaps the footer');
  const result = await recoverTranscript(100, encodedAudio(), dependencies({
    getOpenAIApiKey: async () => 'configured',
    recoverWithOpenAI: async () => ({ events: [event], outcome: 'success' }),
  }));
  expect(result).toEqual({ events: [event] });
});
```

Also cover audio unavailable, OpenAI failure without local fallback, local Whisper failure, and OpenAI failure followed by local success.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run tests/unit/transcriptionRecoveryService.test.ts`

Expected: FAIL because recovery returns a bare array and offers no dependency seam or typed failure.

- [ ] **Step 3: Implement typed outcomes and dependency injection**

Use these public types:

```ts
export type TranscriptionFailureCode =
  | 'audio-unavailable'
  | 'not-configured'
  | 'openai-failed'
  | 'whisper-failed'
  | 'no-speech';

export interface TranscriptionFailure {
  code: TranscriptionFailureCode;
  message: string;
}

export interface TranscriptRecoveryResult {
  events: TranscriptEvent[];
  failure?: TranscriptionFailure;
}
```

Add injectable functions for API-key lookup, OpenAI recovery, local recovery, and model availability while retaining current implementations as defaults. Internal recovery attempts return `{ events, outcome: 'success' | 'no-speech' | 'provider-error', error?: string }`. Sanitize runtime diagnostics to provider name and concise error message; do not copy response bodies.

Update `SessionController.recoverTranscriptFromCapturedAudio()` to append `result.events` on success or store `result.failure` in `session.metadata.transcriptionFailure` on failure. Clear stale failure metadata after successful recovery. Update mocked recovery calls to return `{ events: [] }`.

- [ ] **Step 4: Run focused and session tests and verify GREEN**

Run: `npx vitest run tests/unit/transcriptionRecoveryService.test.ts tests/unit/sessionController.test.ts tests/e2e/recordingPipeline.test.ts`

Expected: PASS with SessionController retaining the typed failure and preserving successful transcript behavior.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/main/transcription/TranscriptionRecoveryService.ts src/main/SessionController.ts src/shared/types.ts tests/unit/transcriptionRecoveryService.test.ts tests/e2e/recordingPipeline.test.ts
git commit -m "fix: report transcript recovery failures"
```

### Task 3: Preserve Artifacts and Deliver an Error State

**Files:**
- Modify: `src/main/output/MarkdownPatcher.ts`
- Modify: `src/main/index.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/contexts/RecordingContext.tsx`
- Create: `src/renderer/contexts/outputReadyState.ts`
- Create: `tests/unit/transcriptionFailureOutput.test.ts`

**Interfaces:**
- Produces: `appendTranscriptionFailureToReport(markdownPath: string, failure: TranscriptionFailure): Promise<void>`.
- Extends: `OutputReadyPayload.transcriptionError?: string`.
- Produces: `getOutputReadyStatus(payload: OutputReadyPayload): { state: 'complete' | 'error'; errorMessage: string | null }`.
- Changes: a failed stop response may include `reportPath`, `sessionDir`, `recordingPath`, and `audioPath` while `success` is `false`.

- [ ] **Step 1: Write failing output-preservation tests**

```ts
it('adds an idempotent transcription error notice to the saved report', async () => {
  const failure = {
    code: 'not-configured' as const,
    message: 'Add an OpenAI transcription key or download a local Whisper model, then record again.',
  };
  await writeFile(reportPath, '# Feedback Report\n');
  await appendTranscriptionFailureToReport(reportPath, failure);
  await appendTranscriptionFailureToReport(reportPath, failure);
  const markdown = await readFile(reportPath, 'utf8');
  expect(markdown.match(/## Transcription Error/g)).toHaveLength(1);
  expect(markdown).toContain('Your recording and audio were saved');
});

it('maps an output payload with transcriptionError to renderer error state', () => {
  expect(getOutputReadyStatus({ ...payload, transcriptionError: 'Narration could not be transcribed.' }))
    .toEqual({ state: 'error', errorMessage: 'Narration could not be transcribed.' });
});
```

Also test that the normal successful payload maps to `complete`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run tests/unit/transcriptionFailureOutput.test.ts`

Expected: FAIL because the report patcher, payload error field, and renderer status helper do not exist.

- [ ] **Step 3: Implement report and UI error delivery**

Append this idempotent section after artifacts have been attached:

```md
## Transcription Error

> Narration was recorded, but markupR could not transcribe it. Your recording and audio were saved.

<actionable provider-specific reason>
```

In `stopSession()`, define transcription failure when `audioArtifact.bytesWritten > 0` and the session has no nonblank transcript. Use the structured recovery failure when available and a generic no-speech failure otherwise. Patch the report before reading `markdownForPayload`. Add `transcriptionFailure` to `processing-trace.json`.

Send `OUTPUT_READY` with all saved paths plus `transcriptionError`. Use `getOutputReadyStatus()` in `RecordingContext` so paths are stored while state becomes `error`. Show `showErrorNotification('Transcription Failed', ...)` and return `{ success: false, error, reportPath, sessionDir, recordingPath, audioPath }`; retain the current success notification and result for sessions with transcript content.

- [ ] **Step 4: Run focused and integration tests and verify GREEN**

Run: `npx vitest run tests/unit/transcriptionFailureOutput.test.ts tests/unit/appIntegration.test.ts tests/integration/sessionFlow.test.ts`

Expected: PASS; failure payloads preserve paths and select error state, while normal payloads remain complete.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/main/output/MarkdownPatcher.ts src/main/index.ts src/shared/types.ts src/preload/index.ts src/renderer/contexts/RecordingContext.tsx src/renderer/contexts/outputReadyState.ts tests/unit/transcriptionFailureOutput.test.ts
git commit -m "fix: surface saved transcription failures"
```

### Task 4: Full Verification

**Files:**
- Modify only files required to correct verification failures caused by Tasks 1-3.

**Interfaces:**
- Consumes: all interfaces introduced by Tasks 1-3.
- Produces: a type-safe desktop build and passing regression suite.

- [ ] **Step 1: Run formatting and static checks**

Run: `npm run typecheck && npm run lint`

Expected: both commands exit 0 without TypeScript or ESLint errors.

- [ ] **Step 2: Run the complete test suite**

Run: `npm test -- --run`

Expected: all test files pass with zero failures.

- [ ] **Step 3: Build the desktop application**

Run: `npm run build:desktop`

Expected: Electron main, preload, and renderer bundles build successfully.

- [ ] **Step 4: Verify the installed model and repository state**

Run:

```bash
stat -f '%N | %z bytes' "$HOME/Library/Application Support/markupr/whisper-models/ggml-tiny.bin"
git status --short
git log --oneline -5
```

Expected: Tiny is 77,691,713 bytes, no uncommitted files remain, and the task commits are present.

- [ ] **Step 5: Confirm final repository cleanliness**

Run: `git status --short`

Expected: no output. If a verification correction was necessary, commit it with the task whose behavior it corrected, rerun that task's focused test, then repeat Steps 1-5.
