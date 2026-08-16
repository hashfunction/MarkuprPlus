# Command-Hold Annotation, Multi-Issue Reports, and MarkuprX Rebrand Design

## Summary

MarkuprX will let a reviewer use the recorded application normally, hold Command, and drag directly over the captured area to annotate it. Releasing Command immediately restores click-through mouse behavior. The next ordinary primary click continues to the underlying application, commits the current marked area as one issue, and clears the visible marks so the reviewer can navigate and mark the next issue.

Each committed issue will have its own stable identity, marked screenshot, capture context, and associated spoken comment in the generated report. A single video session may contain many separately bounded issues. Stopping the session commits an unfinished marked issue before teardown.

The product will also be rebranded from its previous name to MarkuprX/markuprx across application UI, machine-facing identifiers, packages, commands, documentation, website content, generated output, and build/release metadata. A narrowly isolated migration will preserve existing local user settings and sessions without exposing the previous brand in shipping UI.

## Goals

- Preserve ordinary pointer movement, scrolling, hovering, and clicking whenever the annotation modifier is not held.
- On macOS, make Command-held primary-button drags draw over the selected recording target.
- Use Control as the corresponding modifier on Windows. Retain the existing explicit Draw control as a fallback where a reliable global modifier observer is unavailable.
- Never require a persistent mouse-blocking drawing mode for the primary workflow.
- Clear visible marks on the next unmodified primary click anywhere while allowing that click to reach its underlying target.
- Treat all Command-held strokes made before the next ordinary click as one marked issue.
- Capture the marked screen before navigation can change it.
- Associate spoken comments with the correct marked issue deterministically.
- Preserve separate issues when many bugs or requested changes are captured in one video session.
- Include marked issues in Markdown, HTML, JSON, GitHub Issue, Linear, Jira, and review-session output where those formats support feedback items.
- Rebrand the complete shipping project to MarkuprX/markuprx.
- Add genuine UI and Electron end-to-end coverage in addition to the existing unit-style Vitest suites.
- Exercise and improve the application for at least four hours, with timestamped verification evidence.

## Non-goals

- Editing stroke geometry or issue boundaries after recording.
- OCR or automatic interpretation of marks independent of narration.
- Sending raw input events, screenshots, audio, or video to a new external service.
- Intercepting ordinary clicks when Command or Control is not held.
- Preserving the previous CLI or npm package as a public alias. This is a breaking product rename and will use a major version bump.
- Renaming Git history or the developer's containing workspace directory.

## Chosen Approach

### Options considered

1. **OS input-state observer plus the existing Electron overlay and compositor — chosen.** A small platform adapter observes modifier and primary-button state without owning the pointer. The annotation window becomes mouse-interactive only while the modifier is held. This satisfies click-through behavior and reuses the existing stroke scene and recorded-video compositor without adding a native npm module.
2. **Keep the explicit Draw toggle.** This is simpler, but it deliberately captures the mouse until the reviewer exits drawing mode. It does not satisfy the requested interaction and remains only as an accessibility/platform fallback.
3. **Add a third-party native global-input-hook dependency.** This provides direct event callbacks, but creates native ABI, Electron rebuild, signing, notarization, and cross-platform packaging risk. It is not justified for the required state transitions.

### Platform implementation

`GlobalAnnotationInputMonitor` will expose a small injected interface:

```ts
interface GlobalAnnotationInputMonitor {
  start(listener: (state: GlobalAnnotationInputState) => void): Promise<void>;
  stop(): Promise<void>;
  health(): AnnotationInputHealth;
}
```

The macOS adapter will run one bounded, persistent `osascript` JavaScript-for-Automation process that samples Quartz combined-session modifier flags and primary-button state at 120 Hz. The reviewer must press Command before beginning the drag, which gives the overlay time to switch from click-through to interactive. The Windows adapter will use one bounded, hidden PowerShell process around `GetAsyncKeyState`, sample at 120 Hz, and map Control to the modifier. Both adapters emit only transitions, use a minimal environment, cap line length, validate every payload, terminate with the recording, and may restart once after an unexpected exit.

The monitor is scoped to an active interactive recording. It does not run for CLI/MCP processing, while paused, while selecting a target, or after teardown. Linux/Wayland and any failed monitor initialization retain the explicit Draw control and display a clear fallback message rather than silently disabling annotation.

No observer event is trusted directly. The main process verifies the active session, event order, capture bounds, and finite cursor coordinates before changing overlay state.

## Interaction Model

### User-visible instructions

The recording HUD will always show the platform-specific instruction:

> Hold ⌘ and drag to mark · click to save and continue

On Windows it will show Ctrl. A short first-use explanation will state that ordinary clicks continue to the recorded app and clear the previous marks. The fallback Draw control remains labeled as a fallback, not as the primary workflow.

### State machine

The interaction state is independent from the recording session state:

```text
click-through/empty
  Command down -> armed/interactive
  drag -> drawing/current issue started
  Command up -> click-through/marked candidate captured
  Command down -> armed/add another stroke to same issue
  ordinary click -> commit candidate -> clear -> click-through/empty
  stop -> commit candidate if present -> clear -> teardown
```

Rules:

- Modifier-down alone does not create an issue.
- A primary-button drag while modified creates a stroke and starts the current issue.
- If the modifier is released before the browser overlay receives `pointerup`, the main process ends the active stroke at the latest validated cursor position.
- Releasing the modifier makes the overlay click-through immediately, then asks the compositor for a candidate screenshot after a render barrier.
- Additional modified strokes update the same candidate until an ordinary click commits it.
- An unmodified primary-button transition anywhere commits only when at least one completed stroke exists. It then broadcasts `clear` regardless of report-processing latency.
- The ordinary click is never synthesized or replayed: the overlay is already ignoring mouse events, so the OS delivers the original click to the underlying application.
- Tool-control clicks occur while the modifier is held and are excluded from stroke and issue-finalization logic.
- Pausing ends an in-progress stroke at the latest validated point, captures its candidate if it is valid, preserves completed marks without committing the issue, and forces click-through mode. Resuming starts in click-through mode with that issue still pending.
- Stopping commits the most recent valid candidate if marks are present.

The annotation `BrowserWindow` will be non-focusable and shown inactive. Entering modified drawing mode changes only `setIgnoreMouseEvents`; it does not focus MarkuprX or steal keyboard focus from the reviewed application.

## Marked Screenshot Capture

Waiting until the ordinary navigation click to capture would race with the target application's click handler. Therefore the screenshot candidate is captured on modifier release, before navigation.

`RecordingCompositor` will expose an asynchronous snapshot method that:

1. waits for the next composed frame after the final stroke event;
2. reads the same canvas used for video recording, including the exact selected source crop and retained marks;
3. encodes a PNG with bounded dimensions and size;
4. sends the bytes through a validated preload IPC method;
5. stages the candidate under a per-session temporary directory.

Each later modified stroke replaces the uncommitted candidate. The ordinary click atomically promotes the staged candidate to a sequential issue file. This makes clearing immediate and avoids holding large PNG buffers in session metadata.

If direct PNG staging fails, the issue retains the last-completed-stroke video timestamp and the post-processor extracts a fallback frame from the recorded compositor output. The click still passes through and marks still clear. The final report records a warning only if both direct capture and video extraction fail.

Temporary candidates are removed on replacement, cancellation, successful promotion, and process startup cleanup. Final issue screenshots move into the session's `screenshots` directory before report completion.

## Multi-Issue Data Model

The shared session metadata will gain a renderer-safe structure equivalent to:

```ts
interface MarkedIssuePayload {
  id: string;
  ordinal: number;
  startedAt: number;
  markedAt: number;
  completedAt: number;
  strokeIds: string[];
  tools: AnnotationTool[];
  colors: AnnotationColor[];
  screenshotPath?: string;
  fallbackVideoTimestamp: number;
  captureContext?: CaptureContextSnapshot;
  comment?: string;
  transcriptionStatus: 'pending' | 'available' | 'unavailable';
}
```

The main process owns issue numbering, staging paths, and commit. Renderer events may suggest a candidate ID but cannot choose paths or ordinals. Staging paths remain in a main-process-only record and never cross the renderer-safe session boundary. The active issue accumulator and committed issues are serializable through crash recovery. A session accepts up to 200 committed marked issues and an issue accepts up to 100 completed strokes. Reaching either cap stops new mark collection and shows an actionable warning; it never silently truncates or merges existing issues.

Every unmodified click after one or more strokes commits exactly one issue. Multiple strokes before that click remain together. A later marked area gets a new ordinal and screenshot even if it uses the same tool or appears close in time. Generic AI/pause/manual frame cues remain separate from marked issues and must not deduplicate them.

## Comment Association

Post-session transcription timestamps are authoritative because local Whisper may not produce text until recording stops. Issues are ordered by `completedAt` and converted to video-relative times using the persisted video start time.

For each marked issue, the comment window begins at the later of:

- the previous issue's completion time; or
- 30 seconds before this issue's first stroke.

It ends at this issue's ordinary-click completion time. Transcript segments whose midpoint lies in that interval are assigned to the issue, normalized, and joined in chronological order. A transcript segment is assigned to at most one marked issue. If no segment falls in the interval, the nearest preceding, still-unassigned segment ending within 12 seconds of the first stroke is used. Remaining transcript is preserved as general session feedback.

When audio exists but transcription fails, the issue text states that narration was recorded but could not be transcribed and includes the existing actionable transcription error. When no narration exists, it states “No spoken comment was captured for this marked issue.” Empty comments are never silently substituted with unrelated transcript.

## Report and Export Flow

Marked issues become first-class feedback items rather than a loose list of auto-extracted frames.

After post-processing:

1. Promote staged screenshots or resolve fallback extracted frames.
2. Associate transcript segments with committed issues.
3. Build ordered marked feedback items with stable `MX-001`, `MX-002`, and subsequent IDs.
4. Insert a `## Marked Issues` section before generic auto-extracted screenshots in the saved Markdown report.
5. Include for each issue its comment, timestamp, capture context, tools/colors, marked screenshot, and suggested next step where the selected analyzer can provide one.
6. Exclude marked issue screenshots from the generic auto-extracted section to prevent duplication.
7. Add the same marked items to the review-session model and structured export adapters.
8. Persist the finalized issue list and relative screenshot paths in `metadata.json` and JSON exports.

Report generation remains useful when AI analysis is unavailable: marked issue grouping, comments, and evidence are deterministic local output. AI providers may enrich titles, severity, category, and suggested action but may not merge or discard separately committed marked issues.

## Error Handling and Privacy

- Input monitor unavailable: show the fallback Draw control and a nonfatal explanation.
- Input monitor exits unexpectedly: force click-through mode, end any active stroke, restart once, then fall back.
- Malformed or flooded monitor output: reject invalid lines, coalesce state samples, and retain bounded queues.
- Overlay renderer failure: force click-through, preserve the latest staged candidate, and continue recording.
- Snapshot encoding or staging failure: store a fallback video timestamp and continue navigation.
- Missing direct and fallback screenshot: retain the issue and comment with an explicit evidence warning.
- Window move/resize: continue using the existing bounds refresh and normalized stroke coordinates.
- Selected source ends: retain all committed issues and use the existing fail-closed recording cleanup.
- Pause/cancel/stop/crash: stop the monitor and destroy overlays idempotently.

Raw global input is not persisted. Only modifier transitions, primary-button transitions while a recording is active, and normalized cursor points needed for strokes are processed. No keystroke content is observed. Existing content protection and exact-source capture guarantees remain in place.

## Complete MarkuprX Rebrand

Human-facing product text will use **MarkuprX**. Machine-facing identifiers will use **markuprx**.

The rebrand includes:

- Electron product/executable names, bundle ID, installer names, file associations, tray/menu titles, notifications, and window titles.
- npm package and binary names: `markuprx` and `markuprx-mcp`.
- MCP server name, tool descriptions, example configuration keys, and generated paths.
- context bridge (`window.markuprx`) and IPC namespace (`markuprx:`).
- environment variables, log prefixes, temporary/output directories, settings keys, project configuration filename, and setup scripts.
- repository/action references, including renaming the action directory and documentation to `markuprx-action`.
- website, metadata, structured data, domain links, emails, badges, release URLs, documentation, examples, tests, comments, logos, and generated report attribution.
- release version `3.0.0` because public package, CLI, bridge, and configuration identifiers change.

A repository-wide case-insensitive brand audit will fail CI if the old name appears outside one allowlisted legacy-migration module and its focused tests. That module performs a one-way copy of existing local settings/session data into MarkuprX locations without presenting the previous name to users. Historical Git commits and the containing workspace directory are outside repository content and are not rewritten.

Changing the macOS bundle identifier means the OS may require screen, microphone, and accessibility permissions to be granted again. Onboarding and troubleshooting copy will state this explicitly.

## Testing Strategy

### Test-driven implementation

Every behavior change begins with a failing focused test. Production changes follow only after the failure is confirmed for the intended reason. Focused tests run green before moving to the next behavior.

### Unit tests

- Modifier/button transition reducer, including duplicate samples, reversed release order, drag cancellation, and clicks outside bounds.
- Input monitor parsing, validation, restart limit, shutdown, child cleanup, minimal environment, and unsupported-platform fallback.
- Overlay click-through transitions and the invariant that unmodified clicks never make the window interactive.
- Stroke completion on modifier release and point/event caps.
- Compositor render barrier, exact crop, PNG encoding, size limits, replacement, and failure fallback.
- Issue accumulator grouping, sequential IDs, stop finalization, empty clicks, bounds filtering, cap behavior, and crash serialization.
- Comment interval assignment, overlap boundaries, no duplicate segments, lookback fallback, missing narration, and transcription failure.
- Marked issue report rendering, escaping, stable ordering, missing screenshots, and nonduplication with generic frames.
- Every export adapter and review-session conversion.
- Legacy data migration and complete brand-scan enforcement.

### Integration tests

- Input monitor -> overlay manager -> live overlay -> compositor transition flow.
- Several modified strokes -> one candidate -> ordinary click -> one committed issue -> clear.
- Three separate marked screens in one recording -> three separate screenshots/comments/report items.
- Ordinary click reaches a test target while marks clear.
- Pause/resume, overlay crash, monitor crash, selected-window resize, stop, cancel, and restart cleanup.
- Direct snapshot failure -> video-frame fallback -> complete issue report.
- Post-session transcription -> deterministic per-issue comment association.
- Rebranded preload/main/renderer IPC and storage paths.

### Real UI and Electron end-to-end tests

The project will add Playwright Electron coverage that launches the built application rather than treating service-level Vitest files as end-to-end tests. A deterministic test capture source and microphone fixture will be available only under an explicit test environment flag.

The UI suite will verify onboarding, permissions guidance, target selection, HUD directions, modifier drawing, click-through navigation, mark clearing, multiple issue capture, pause/resume, stop/processing, report review, settings, export, error recovery, and keyboard accessibility. It will inspect generated PNGs and report files, not only DOM state.

### Runtime and release verification

- Run unit, integration, legacy service-level E2E, and real Electron UI suites.
- Run coverage and raise thresholds to reflect the new critical paths.
- Run typecheck, lint, dependency audit, desktop/CLI/MCP builds, and macOS unsigned packaging.
- Launch the packaged application and exercise a real application window with permitted screen/microphone/accessibility access.
- Inspect the saved video with `ffprobe`/`ffmpeg`, compare marked PNG dimensions/content, and inspect every generated report/export.
- Run repeated start/cancel/start/draw/click/pause/resume/stop and injected-failure stress loops.
- Run light/dark, keyboard-only, reduced-motion, small-window, high-DPI, and multiple-display UI checks where the environment supports them.
- Maintain a timestamped verification log covering at least four real hours of active test, diagnosis, fix, and rerun work. Waiting alone does not count as testing.

## Acceptance Criteria

1. Without Command or Control held, the selected application receives ordinary mouse interaction and MarkuprX does not focus or intercept it.
2. Holding the platform modifier before dragging draws over the current selected capture target.
3. Releasing the modifier restores click-through behavior and preserves the visible marks.
4. The next unmodified primary click reaches its underlying target, commits one issue, and clears the marks regardless of where the reviewer clicks.
5. Multiple strokes before the ordinary click appear in one marked screenshot; strokes after it appear in a separate issue.
6. Stopping with uncommitted marks commits a final issue.
7. Each committed issue appears separately in the report with the correct marked screenshot and spoken comment or explicit narration status.
8. Marked issues survive AI-provider failure, transcription failure, snapshot failure with video fallback, and crash recovery.
9. No shipping UI, documentation, package metadata, generated output, URL, command, IPC namespace, or asset retains the previous brand.
10. All required tests and builds pass from a clean checkout, the packaged app launches, and the four-hour verification log demonstrates comprehensive runtime exercise and resulting improvements.
