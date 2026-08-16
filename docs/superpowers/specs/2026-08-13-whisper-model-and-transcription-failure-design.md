# Whisper Model Discovery and Transcription Failure Design

## Problem

MarkuprX can save valid screen and audio recordings while producing a zero-item feedback report. The observed session captured 426,748 bytes of audio and 7,270,938 bytes of video, but it had no transcript events. No OpenAI transcription key or local Whisper model was available, so Codex received neither a transcript nor screenshots and correctly declined analysis. MarkuprX then presented the rule-based empty document as a successful capture.

There is a second defect in the local fallback: the model UI recommends and downloads `ggml-tiny.bin`, while `WhisperService` defaults to `ggml-medium.bin`. A downloaded Tiny model is reported as a transcription capability but is not selected by the transcription service.

## Goals

- Use a valid downloaded Whisper model, including Tiny, without requiring the Medium model.
- Detect the model again when transcription begins so a model downloaded after app startup is usable immediately.
- Preserve the report, audio, and recording when narration cannot be transcribed.
- Present an actionable error instead of a successful zero-item completion when recorded narration yields no transcript.
- Keep OpenAI-first recovery and local Whisper fallback behavior unchanged when either succeeds.

## Non-goals

- Automatically download a model without user consent.
- Treat raw audio or video as input that Codex CLI can transcribe.
- Invent a feedback item when no transcript was produced.
- Add a full historical-session reprocessing workflow in this change.

## Considered Approaches

### 1. Block recording when no transcription backend is ready

This prevents a known-empty analysis but stops users from capturing valuable screen and audio artifacts. It also cannot prevent runtime failures such as an invalidated API key or local model load error.

### 2. Preserve artifacts and surface an actionable failure

This keeps the user's source material, accurately reports that analysis did not complete, and covers both missing configuration and runtime transcription failures. This is the selected approach.

### 3. Automatically download Tiny when recording starts

This creates an unexpected network transfer and delays capture. It also does not address corrupted models or transcription runtime failures, so it is outside this change.

## Design

### Model discovery

`WhisperService` will resolve its model path from the models directory using the same preference order as `ModelDownloadManager`: Medium, Small, Base, then Tiny, with Large used when it is the only valid model. A caller-supplied model path remains authoritative.

Discovery will run before availability checks and initialization, not only in the constructor. This makes a newly downloaded model available to the existing singleton without restarting MarkuprX. A candidate counts as available only when it exists as a regular file and has a plausible nonzero size; `ModelDownloadManager` remains responsible for its stricter download-size validation.

The model download completion handler will also point the singleton at the completed model path. This gives immediate, deterministic selection of the model the user just downloaded.

### Transcription outcome

Transcript recovery will return a structured outcome containing recovered events and, when empty, an actionable failure reason. It will distinguish these cases:

- no OpenAI key and no local model;
- OpenAI transcription failed and no local model was usable;
- local Whisper could not load or returned no speech;
- captured audio was empty or unavailable.

The outcome will not contain API keys, provider response bodies, or other secrets.

### Session completion behavior

When nonempty recorded audio produces no transcript:

1. MarkuprX will still save `feedback-report.md`, `session-audio.*`, `session-recording.*`, metadata, and the processing trace.
2. The generated report will state that narration was recorded but could not be transcribed. It will include the actionable recovery reason and links to the preserved artifacts.
3. The main process will send output paths to the renderer, then finish the stop request with a failure result that includes the report path.
4. The renderer will enter its error state while retaining the report, audio, recording, and session-directory paths so the user can open or copy them.
5. The desktop notification will say that the recording was saved but transcription failed. It will not say “Feedback Captured” or claim that zero items were successfully saved.

Silent recordings remain a transcription failure when audio bytes were captured but no speech was detected; the error copy will say that no speech was detected rather than claiming missing configuration.

### Success behavior

If OpenAI or local Whisper produces at least one transcript event, the current AI-analysis and report pipeline continues normally. The selected analysis provider remains independent from the transcription provider.

## Error Copy

The default configuration error is:

> Narration was recorded, but MarkuprX could not transcribe it. Your recording and audio were saved. Add an OpenAI transcription key or download a local Whisper model, then record again.

Runtime-specific details may replace the final sentence, but every message must state that artifacts were saved and must avoid implying that Codex performs transcription.

## Testing

- Unit-test model selection with only Tiny installed, multiple models installed, a caller-supplied path, and a model added after construction.
- Unit-test recovery outcomes for missing configuration, OpenAI failure, local Whisper failure, no speech, and successful recovery.
- Integration-test that an empty transcript with captured audio returns an error while preserving output paths and files.
- Integration-test that successful local transcription still reaches analysis and produces feedback items.
- Verify the existing analysis-provider tests continue to pass, confirming that Codex selection remains independent from transcription.

## Existing Recording

The Tiny model has been downloaded to:

`~/Library/Application Support/markuprx/whisper-models/ggml-tiny.bin`

The existing example session remains untouched. Historical reprocessing is outside this change, so its audio can be retained for a later reprocessing command or manually analyzed after transcription support is available.
