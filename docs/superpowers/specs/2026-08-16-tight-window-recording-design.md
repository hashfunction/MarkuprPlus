# Tight Window Recording Design

## Summary

Window recordings must use the selected window's native capture geometry. The recorder currently applies display-oriented minimum and maximum dimensions to every desktop source. On macOS, applying those constraints to a portrait window can yield a display-sized frame with the selected window positioned inside a large black surface. The compositor accepts that frame as valid, then maps window-normalized annotations over the entire surface, producing misframed video and misplaced marks.

Window targets will instead be acquired once with exact-source constraints that omit forced width and height. Screen and region targets will retain the existing high-quality attempt and same-source basic fallback.

## Goals

- Record only the selected window, without desktop-position padding.
- Keep cursor markers, annotations, staged screenshots, and WebM frames in the same coordinate space.
- Follow a selected window when it moves or resizes.
- Keep a stable encoder canvas; contain a resized source and letterbox only when its aspect ratio changes.
- Preserve full-screen and region capture quality and fallback behavior.
- Continue failing closed rather than substituting a broader source.

## Non-goals

- Dynamically changing the encoded WebM dimensions after a window resize.
- Capturing a display and cropping it to the window bounds.
- Adding a new capture backend or dependency.
- Changing report timestamps, screenshot persistence, transcription, CLI, or MCP behavior.

## Approaches Considered

### 1. Native exact-window constraints with a stable compositor canvas (selected)

For a window target, request the selected `window:*` source without `minWidth`, `minHeight`, `maxWidth`, or `maxHeight`. This lets Chromium and the operating system expose the window source at its native aspect ratio. The existing compositor keeps its initial output dimensions and contains later source-size changes, so movement is irrelevant and resizing remains uncropped.

This is the smallest change, retains the window-source privacy boundary, and directly removes the display-only assumptions that caused the malformed recording.

### 2. Dynamically resize the compositor canvas

Changing the canvas dimensions whenever the window resizes would keep every frame tightly filled. It would also change the encoded track dimensions mid-WebM, which is less reliable across MediaRecorder implementations and players. The stability risk is not justified for this bug.

### 3. Capture the display and crop using live window bounds

A display stream could be cropped to the selected window's current global bounds. This would require display association, scale conversion, multi-monitor transition handling, and continuous crop updates. It would also expose broader display pixels to the raw capture path, weakening the current privacy model.

## Design

`ScreenRecordingRenderer` will choose capture attempts by target kind:

- `window`: one basic exact-source attempt with the selected window source ID and no forced dimensions;
- `screen` and `region`: the existing high-quality attempt followed by a basic attempt for the same source ID if acquisition or composition fails.

No source enumeration or cross-source fallback is introduced. A failed window acquisition stops initialization and reports the selected source failure.

`RecordingCompositor` remains unchanged. Its input is now the native window frame rather than a display-shaped padded frame. It initializes the output canvas from that frame, maps annotations across the visible window, and contains later aspect-ratio changes inside the stable canvas. The annotation overlay already follows refreshed native window bounds, so normalized points continue to represent the currently visible window.

## Error Handling and Privacy

- A window acquisition failure is fatal; the recorder does not retry with a screen source.
- Screen and region fallback remains limited to the already selected display source ID.
- Source and compositor tracks retain the existing cleanup behavior on acquisition, composition, persistence, encoder, and selected-track failures.
- No raw display capture is added to the window path.

## Testing

Add a renderer regression test that starts an explicit window target and asserts:

- `getUserMedia` is called exactly once;
- the constraint references the selected `window:*` source ID;
- no forced width or height fields are present;
- the selected stream is passed to the compositor and recording starts.

Retain the existing screen tests proving high-quality constraints and same-source basic fallback. Run the compositor tests that cover resized window containment and annotation mapping, followed by the complete unit suite, typecheck, and lint.

## Success Criteria

- A selected portrait window produces a video framed to that window instead of a display-sized black canvas.
- A mark drawn over the window appears at the same normalized location in both the WebM and staged PNG.
- Moving the selected window does not move it within the recorded frame.
- Resizing keeps the full source visible without changing the encoded canvas dimensions.
- Screen and region behavior remains unchanged.
