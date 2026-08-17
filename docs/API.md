# MarkuprPlus desktop API

The renderer's supported bridge is `window.markuprx`, exposed by `src/preload/index.ts`. The lower-case namespace and exported TypeScript API names are retained compatibility contracts.

This is an internal desktop boundary, not a web/plugin API. Third-party renderer code is not loaded, and no stable plugin SDK is currently shipped.

## Security model

- Context isolation is enabled.
- The renderer has no direct Node/Electron import.
- Preload methods use enumerated `markuprx:` IPC channels.
- Main-process handlers validate senders, values, paths, and media before privileged work.
- Event subscriptions return an unsubscribe function.
- External navigation is guarded and allowed links are opened explicitly.

Do not expose `ipcRenderer`, filesystem, shell, or arbitrary channel access to renderer code.

## Domains

The exact request/response types live in `src/renderer/types/electron.d.ts` and `src/shared/types.ts`. The current top-level domains are:

| Domain | Responsibility |
|---|---|
| `session` | Start, stop, pause, resume, cancel, status/current session, lifecycle events |
| `capture` | Source discovery/selection, annotation lifecycle/mode, manual cues, screenshot events |
| `captureOverlay` | Selection/annotation overlay state and target confirmation |
| `audio` | Device discovery, capture controls, levels, and voice-activity events |
| `screenRecording` | Stream/chunk lifecycle owned by the capture renderer |
| `transcript` | Transcript subscription and finalization |
| `processing` | Post-session processing progress |
| `transcription` | Tier status and model download/cancel operations |
| `settings` | Get/set, credential operations, directory picker, import/export/reset |
| `analysisProviders` | Provider discovery, refresh, and model selection data |
| `hotkeys` | Current config, validation, update, and reset |
| `permissions` | Check/request/open settings for OS permissions |
| `output` | Save, Review export, clipboard/folder, history list/delete/export |
| `crashRecovery` | Check, recover, discard, logs, settings, recovery event |
| `updates` | Dormant updater status/check/download/install surface |
| `whisper` | Model state, capability, download, cancel, progress |
| `window` | Hide the popover/window |
| `popover` | Resize/position portrait and compact states |
| `navigation` | Request application-surface navigation |

An E2E-only domain is exposed only when the authorized Electron test harness is active. Production builds do not make the harness generally available.

## Example: read settings

```ts
const settings = await window.markuprx.settings.getAll();
console.log(settings.outputDirectory);
```

## Example: subscribe safely

```ts
const unsubscribe = window.markuprx.session.onStateChange(({ state }) => {
  console.log(state);
});

// Component cleanup
unsubscribe();
```

## Example: start and stop

```ts
const started = await window.markuprx.session.start();
if (!started.success) {
  throw new Error(started.error ?? 'Unable to start');
}

const stopped = await window.markuprx.session.stop();
if (!stopped.success) {
  throw new Error(stopped.error ?? 'Unable to stop');
}
```

Starting may trigger source selection and permission flows; it is not an unattended background-recording API.

## Review export

`output.exportReview(session, options)` accepts a validated `ReviewSession` and a `ReviewExportOptions` format of Markdown, PDF, HTML, or JSON. The main process chooses safe output paths and validates screenshot media. Never treat renderer-provided paths/base64 as trusted.

History batch export currently accepts Markdown, JSON, or PDF for one or more persisted sessions. That narrower API is distinct from Review export.

## Settings and credentials

Ordinary settings are schema-validated. API keys are not returned in `getAll()` and should be handled only through the dedicated credential methods. Do not persist keys in renderer state, logs, reports, or configuration examples.

Settings export defaults to `MarkuprPlus-settings.json`; compatible older selected JSON files remain importable after validation.

## Updates

The `updates` domain mirrors an updater implementation, but current production startup does not initialize a published feed. Callers must respect `updaterAvailable` and must not present the API's existence as proof of an active release channel.

## Compatibility and evolution

Additive API changes should update shared types, preload implementation, renderer declaration, main handler, channel allowlist, and tests together. Removing or renaming `window.markuprx`, exported `MarkuprXAPI` types, or existing channels requires an explicit migration plan.
