# Direct Capture Selection and Live Annotation Design

## Summary

markupR will replace its implicit primary-display recording start with a direct desktop selector. Starting a session opens a QuickTime-style overlay across the user's displays. Window mode is the default: moving the pointer over an eligible application window highlights its real desktop bounds, and clicking it records that window source only. Region mode lets the user drag an arbitrary rectangle on one display. Full Screen mode remains available for explicit whole-display capture.

During recording, markupR will render a marker halo around the pointer and provide a drawing mode for freehand, circle, and translucent highlight annotations. The selected video source and annotations are composited into a single canvas-backed media stream before MediaRecorder encodes it. Consequently, the saved video and every frame extracted from it contain the annotations. Completing an annotation also creates a capture cue so report generation preferentially extracts an annotated frame.

## Goals

- Make direct application-window selection the default for every interactive recording start.
- Highlight the topmost eligible window under the pointer and select it with one click.
- Let the user select an arbitrary rectangular region on a single display.
- Preserve an explicit full-display option without selecting it implicitly.
- Record only the selected window when Window mode is used.
- Show a marker halo in the recorded video while preserving normal interaction with the selected application.
- Let the user enter a drawing mode, draw durable visual annotations, undo, and clear them while narrating.
- Burn annotations into the saved video and the report's extracted screenshots.
- Fail closed when the chosen source cannot be captured; never fall back to a broader display source.
- Preserve the existing audio, transcription, AI analysis, report, crash-recovery, and export pipelines.

## Non-goals

- Editing annotation timing after the recording finishes.
- Moving or resizing a completed arbitrary region after confirmation; the user can cancel and redraw it before recording.
- Capturing a region that spans multiple displays.
- Adding a native binary dependency or a new capture backend.
- Changing MCP or CLI recording behavior. Their explicit/headless capture APIs retain their current source behavior.
- Guaranteeing direct window geometry on Wayland, which intentionally prevents global window enumeration. The source-gallery fallback remains available there.

## Approaches Considered

### 1. Transparent desktop overlays plus canvas compositing (selected)

Create one protected, transparent BrowserWindow per display for target selection. Obtain real window geometry from native read-only APIs, match those windows to Electron desktop capture sources, and perform hit testing in the overlay renderer. After selection, capture the selected Electron source and draw its frames, marker position, and annotation strokes into a canvas whose stream is recorded.

This approach satisfies all interaction, privacy, and output requirements while retaining the existing MediaRecorder persistence path. It adds well-bounded selection, geometry, overlay, and compositing components but no runtime dependency.

### 2. System picker plus post-processing annotation burn-in

Use the operating system's display picker and store annotation events for an ffmpeg overlay pass after recording. This reduces live compositor work, but Electron 28 does not provide a consistent QuickTime-like window-hover and arbitrary-region flow through its display media handler. Annotation burn-in would also occur after the fact, so live visual feedback and exact timing would be harder to verify.

### 3. Native or ffmpeg-based capture replacement

Replace Chromium desktop capture with ScreenCaptureKit on macOS and Windows Graphics Capture on Windows, or run platform-specific ffmpeg capture processes. This offers maximum control, but requires native binaries, signing and architecture work, a second persistence path, and substantially more release risk than the feature needs.

## User Experience

### Starting a session

1. The user clicks Start Session or invokes the recording hotkey.
2. markupR verifies screen and microphone permissions before displaying selectable content.
3. The popover hides and a dim transparent selector covers every connected display.
4. Window mode is selected by default. The topmost eligible application window under the pointer receives a high-contrast outline and a label containing the application and window title.
5. A compact palette offers Window, Region, and Full Screen modes, plus Cancel. Escape always cancels.
6. In Window mode, one click confirms the highlighted window.
7. In Region mode, drag creates a selection rectangle. Releasing a rectangle at least 32 by 32 device-independent pixels confirms it; Escape cancels. The region is constrained to the display where the drag began.
8. In Full Screen mode, clicking a display confirms that display.
9. The selector is destroyed before session and video capture begin so it cannot appear in the recording.

If direct window geometry is unavailable, the selector still offers Region and Full Screen. On unsupported Linux window systems it can open the existing thumbnail source gallery for window selection rather than guessing geometry.

### Recording and marking

Recording begins in interaction mode so the user can reproduce the issue in the selected application. A protected transparent overlay follows the selected window or region. It is click-through in interaction mode and does not prevent the underlying application from receiving input.

The composed video shows a red marker halo at the pointer position whenever the pointer is inside the recorded bounds. The halo is drawn by the compositor, so it is present for window captures even though the annotation overlay is a separate protected window.

The recording HUD includes a Draw control. Activating it makes the annotation overlay interactive and changes the cursor to a crosshair/marker. A compact toolbar provides:

- freehand marker;
- circle;
- translucent highlight;
- four high-contrast colors;
- undo;
- clear;
- Done, which returns to interaction mode.

Escape also exits drawing mode. Annotations remain visible and burned into subsequent video frames until undone or cleared. Drawing is disabled while recording is paused because paused video cannot contain new visual state.

### Moving or closing a selected window

The native geometry adapter refreshes the selected window bounds during recording and moves the protected annotation surface with it. Annotation coordinates are normalized to the current selected bounds before being sent to the compositor. The recorded video canvas keeps a stable output size; if the captured source aspect ratio changes, it is contained without cropping and unused pixels are letterboxed.

If the selected capture track ends because the window closes or the operating system revokes access, markupR exits drawing mode, stops the recording path safely, preserves already-written chunks, and shows an actionable error. It does not substitute a screen source.

## Architecture

### Shared capture contracts

`CaptureTarget` is a discriminated union shared by main, preload, and renderer processes:

- `window`: Electron source ID, source name, application name, native window ID, and current global bounds.
- `region`: display source ID, display identity and bounds, and a display-relative crop rectangle.
- `screen`: display source ID, display identity and bounds.

All coordinates crossing IPC are finite, integer device-independent pixels. Region targets are validated against their display bounds in the main process. Session metadata stores the selected target, source type, and video start time.

`AnnotationEvent` represents normalized cursor movement, stroke start/points/end, undo, clear, annotation mode changes, and source-bound updates. Stroke points use values from 0 through 1 so the same event stream maps to overlay device-independent pixels and compositor video pixels.

### Native window geometry

`WindowGeometryProvider` returns visible capturable windows in front-to-back order.

- macOS uses one bounded `osascript -l JavaScript` call to `CGWindowListCopyWindowInfo`. Core Graphics supplies z-order, global bounds, owner PID/name, title, layer, and the CG window number. Electron documents the `XX` component of `window:XX:YY` as the native window ID, allowing exact source matching.
- Windows uses a bounded PowerShell process with User32 `EnumWindows`, `GetWindowRect`, visibility checks, cloaking checks, and owner PID lookup. The HWND is matched to Electron's window source ID.
- X11 uses available EWMH tooling when present. Wayland and environments without a geometry source report that direct geometry is unavailable and use the existing source gallery for windows.

The provider excludes markupR's own process, system surfaces, zero-area windows, transparent/invisible layers, and sources Electron did not expose. Native command output is capped, parsed defensively, and subject to a short timeout.

### Capture overlay manager

`CaptureOverlayManager` owns the selection and annotation BrowserWindows. It has one active request and one active recording overlay at a time. All overlay windows are frameless, transparent, always on top, omitted from task switching, visible across workspaces, and content-protected so controls are not captured. The manager restores the main popover after selection cancellation and tears every overlay down on stop, error, display change, or app quit.

Selection overlays use the existing renderer bundle with an `overlay=selection` query. Their preload API exposes only the typed capture-overlay IPC surface. Each display overlay performs local pointer hit testing against the shared front-to-back window snapshot, draws the highlight, and reports a confirmed target to the manager.

Annotation uses an `overlay=annotation` query. The manager polls the pointer and selected-window bounds at a bounded rate, broadcasts normalized cursor and bounds updates, and switches the annotation window between click-through interaction mode and interactive draw mode.

### Video compositor

`RecordingCompositor` owns an off-DOM video element, a canvas, and a render loop. It:

1. receives the exact selected Electron media stream;
2. waits for video metadata;
3. calculates either the full source rectangle or the region crop in source pixels;
4. draws each video frame into a stable canvas using contain scaling;
5. draws completed and in-progress annotation strokes;
6. draws the marker halo last;
7. exposes `canvas.captureStream(30)` to MediaRecorder.

The original source stream and canvas stream are both released on every stop/error path. The compositor caps its output to the selected source dimensions and never enlarges the selected source above its native pixel size.

`ScreenRecordingRenderer` records the compositor stream rather than the raw desktop stream. It requests only the chosen source ID. High-quality and basic constraints may be retried for that same ID, but source enumeration is not used to fall back to another screen.

### Annotation-to-report data flow

The annotation renderer sends normalized stroke events to `CaptureOverlayManager`. The manager validates and broadcasts them to the primary renderer. `RecordingCompositor` updates its retained stroke scene immediately.

When a stroke ends, the main process registers an annotation capture cue containing the stroke tool/color and completion time. At stop, capture cues are converted to high-priority key moments relative to `videoStartTime` and merged with transcript/AI moments before frame extraction. A small positive frame offset ensures the completed stroke is present in the encoded frame. The resulting PNG therefore contains the exact composited annotation and remains embedded or linked through the current report and export pipeline.

## Privacy and Security

- A window target is always captured through its window source ID.
- Failure to capture that ID is fatal to the recording start; markupR never widens to a display capture.
- Region coordinates are clamped and validated in the main process.
- Overlay IPC validates event shape, point count, numeric bounds, stroke width, color allowlist, and active session ownership.
- Native geometry commands receive no user-controlled shell string. They use `execFile` argument arrays, bounded output, a minimal environment, and timeouts.
- Overlay windows are destroyed before target capture begins and content-protected during annotation.
- No raw video, pointer data, or annotations leave the existing local session pipeline.

## Error Handling

- Permission denied: keep the session idle and show the existing settings guidance.
- Selection canceled: return to idle without an error card or notification.
- No window geometry: retain Region and Full Screen and offer the source-gallery fallback.
- Invalid or stale selected window: refresh once; if its Electron source no longer exists, keep selection open with an explanatory message.
- Source acquisition failure: stop initialization, release all streams, preserve privacy, and report the selected source name.
- Canvas or captureStream unavailable: abort recording start rather than save a video without requested annotation behavior.
- Selected track ended: stop safely, preserve completed chunks, and surface the reason.
- Overlay renderer crash: return to interaction mode; continue the recording with existing compositor state and show a non-fatal warning.
- Annotation event flood: coalesce pointer movement and cap each stroke's retained points while preserving endpoints.

## Testing

### Unit tests

- Native window output parsing, filtering, z-order, exact Electron source matching, timeouts, and malformed output.
- Target validation for windows, displays, negative-origin monitors, high-DPI displays, minimum regions, and out-of-bounds regions.
- Window hit testing and region drag normalization on positive and negative display coordinates.
- Crop conversion from device-independent display coordinates to source video pixels at 1x, 2x, and non-integer scaling.
- Contain layout and normalized annotation mapping after aspect-ratio changes.
- Annotation reducer behavior for start, append, completion, undo, clear, point caps, and invalid events.
- Compositor draw order: source, retained strokes, active stroke, marker.
- Screen recorder uses only the chosen source and releases both source and composed tracks on every failure path.
- Annotation cues outrank nearby periodic and pause moments.

### Integration tests

- Start without a target invokes selection; cancellation remains idle.
- Window, region, and full-screen targets survive preload and session serialization.
- Overlay confirmation starts the session with the exact source ID.
- Annotation mode transitions update the HUD and overlay click-through state.
- Stroke completion reaches the compositor and registers one report cue.
- Stop/error/cancel destroys overlays and unsubscribes annotation listeners.
- Frame extraction receives annotation timestamps relative to the persisted video start time.

### End-to-end and manual verification

- Build and run the Electron app on macOS with two ordinary application windows.
- Verify hover follows front-to-back z-order, excludes markupR, cancels with Escape, and records the clicked app without surrounding desktop pixels.
- Verify region selection on primary and negative-origin secondary displays and compare the output dimensions/content with the chosen rectangle.
- Interact with the recorded app in interaction mode, enter drawing mode from the HUD, draw each tool/color, undo, clear, and exit with Escape.
- Move and resize a selected window during recording and verify overlay alignment and uncropped contained video.
- Close the selected window mid-recording and verify fail-closed cleanup.
- Inspect saved video frames with ffprobe/ffmpeg and verify marker and stroke pixels.
- Complete a narrated session and verify the generated Markdown/HTML/PDF report frames include the completed annotation.
- Run the complete unit, integration, and end-to-end suite, TypeScript check, lint, desktop build, CLI/MCP build, and a repeated start/cancel/start/stop stress loop.

## Compatibility

The desktop UI behavior changes only for interactive starts with no explicit target. Existing explicit source IDs remain accepted for internal compatibility, and MCP/CLI behavior is unchanged. Existing sessions without `captureTarget` deserialize as before. Reports and exports gain optional region/annotation metadata without changing required fields.

The implementation targets the repository's pinned Electron 28, React 18, TypeScript 5.3, and Node 18+ support floor. It adds no package dependency.
