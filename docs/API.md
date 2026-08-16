# API Reference

markuprx uses Electron's IPC (Inter-Process Communication) for all communication between the main process and renderer. This document covers the internal API for developers.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [IPC Channels](#ipc-channels)
- [Preload API](#preload-api)
- [Event System](#event-system)
- [Plugin Architecture](#plugin-architecture)
- [Type Definitions](#type-definitions)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Renderer Process                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  React Application                    │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐            │   │
│  │  │  App.tsx │  │Components│  │  Hooks  │            │   │
│  │  └────┬────┘  └────┬────┘  └────┬────┘            │   │
│  │       │            │            │                   │   │
│  │       └────────────┴────────────┘                   │   │
│  │                     │                                │   │
│  │              window.markuprx                     │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        │                                     │
├────────────────────────┼─────────────────────────────────────┤
│                   Preload Script                             │
│              contextBridge.exposeInMainWorld                 │
├────────────────────────┼─────────────────────────────────────┤
│                        │                                     │
│                     ipcMain                                  │
│                        │                                     │
│  ┌─────────────────────┴───────────────────────────────┐   │
│  │                    Main Process                       │   │
│  │                                                       │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │   │
│  │  │ Session  │ │ Capture  │ │Transcript│            │   │
│  │  │Controller│ │ Service  │ │ Service  │            │   │
│  │  └──────────┘ └──────────┘ └──────────┘            │   │
│  │                                                       │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │   │
│  │  │  Hotkey  │ │   Tray   │ │ Settings │            │   │
│  │  │ Manager  │ │ Manager  │ │ Manager  │            │   │
│  │  └──────────┘ └──────────┘ └──────────┘            │   │
│  └───────────────────────────────────────────────────────┘   │
│                     Main Process                             │
└─────────────────────────────────────────────────────────────┘
```

## IPC Channels

All IPC channels are defined in `src/shared/types.ts` with the `IPC_CHANNELS` constant.

### Session Channels

#### Renderer to Main

| Channel | Method | Description | Returns |
|---------|--------|-------------|---------|
| `markuprx:session:start` | invoke | Select a target and start recording | `{success, sessionId?, cancelled?, error?}` |
| `markuprx:session:stop` | invoke | Stop recording | `{success, session?, error?}` |
| `markuprx:session:cancel` | invoke | Cancel without saving | `{success}` |
| `markuprx:session:get-status` | invoke | Get current status | `SessionStatusPayload` |
| `markuprx:session:get-current` | invoke | Get session data | `SessionPayload | null` |

#### Main to Renderer

| Channel | Description | Payload |
|---------|-------------|---------|
| `markuprx:session:state-changed` | State transition | `{state, session}` |
| `markuprx:session:status-update` | Periodic status | `SessionStatusPayload` |
| `markuprx:session:complete` | Session finished | `SessionPayload` |
| `markuprx:session:feedback-item` | New item captured | `FeedbackItemPayload` |
| `markuprx:session:error` | Error occurred | `{message}` |

### Capture Channels

#### Renderer to Main

| Channel | Method | Description | Returns |
|---------|--------|-------------|---------|
| `markuprx:capture:get-sources` | invoke | List sources | `CaptureSource[]` |
| `markuprx:capture:select-target` | invoke | Open the protected target selector | `CaptureTarget | null` |
| `markuprx:capture:annotation-begin` | invoke | Open the protected annotation layer | `{success, error?}` |
| `markuprx:capture:annotation-end` | invoke | Close the annotation layer | `{success}` |
| `markuprx:capture:annotation-set-mode` | invoke | Switch interaction/drawing mode | `{success, error?}` |
| `markuprx:capture:manual-screenshot` | invoke | Take screenshot | `{success}` |

Protected selector/annotation renderer windows additionally use:

| Channel | Method | Description | Returns |
|---------|--------|-------------|---------|
| `markuprx:capture-overlay:get-state` | invoke | Read the calling overlay's issued state | `CaptureOverlayState \| null` |
| `markuprx:capture-overlay:confirm` | invoke | Confirm an issued exact target | `{success, error?}` |
| `markuprx:capture-overlay:cancel` | invoke | Cancel all selector windows | `{success}` |
| `markuprx:capture-overlay:set-selection-mode` | invoke | Synchronize Window/Region/Screen across displays | `{success, error?}` |
| `markuprx:capture-overlay:annotation-event` | invoke | Submit one bounded, normalized draw event | `{success, error?}` |

#### Main to Renderer

| Channel | Description | Payload |
|---------|-------------|---------|
| `markuprx:capture:screenshot-taken` | Screenshot captured | `ScreenshotCapturedPayload` |
| `markuprx:capture:manual-triggered` | Manual hotkey used | `{timestamp}` |
| `markuprx:capture:annotation-event` | Validated normalized cursor/stroke event | `AnnotationEvent` |
| `markuprx:capture:annotation-state` | Annotation overlay lifecycle/mode | `AnnotationStatePayload` |

### Audio Channels

#### Communication Flow

```
Main Process                    Renderer Process
     │                               │
     │ ─── AUDIO_START_CAPTURE ───> │  Start audio capture
     │                               │
     │ <── AUDIO_CAPTURE_STARTED ─── │  Confirm started
     │                               │
     │ <── AUDIO_CHUNK ──────────── │  Audio data (100ms chunks)
     │ <── AUDIO_CHUNK ──────────── │
     │ <── AUDIO_CHUNK ──────────── │
     │                               │
     │ ─── AUDIO_STOP_CAPTURE ────> │  Stop capture
     │                               │
     │ <── AUDIO_CAPTURE_STOPPED ── │  Confirm stopped
```

### Settings Channels

| Channel | Method | Description | Returns |
|---------|--------|-------------|---------|
| `markuprx:settings:get` | invoke | Get single setting | `AppSettings[K]` |
| `markuprx:settings:get-all` | invoke | Get all settings | `AppSettings` |
| `markuprx:settings:set` | invoke | Set single setting | `AppSettings` |
| `markuprx:settings:get-api-key` | invoke | Get API key (secure) | `string | null` |
| `markuprx:settings:set-api-key` | invoke | Set API key (secure) | `boolean` |

### Update Channels

| Channel | Method | Description | Returns |
|---------|--------|-------------|---------|
| `markuprx:update:check` | invoke | Check for updates | `UpdateInfo` |
| `markuprx:update:download` | invoke | Download update | `void` |
| `markuprx:update:install` | invoke | Install and restart | `void` |

#### Main to Renderer

| Channel | Description | Payload |
|---------|-------------|---------|
| `markuprx:update:status` | Update status change | `UpdateStatusPayload` |

## Preload API

The preload script (`src/preload/index.ts`) exposes a safe API to the renderer via `window.markuprx`.

### Session API

```typescript
// Interactive start: opens the selector in Window mode by default
const result = await window.markuprx.session.start();
// Returns: { success: boolean; sessionId?: string; cancelled?: boolean; error?: string }

// An already validated target can also be passed explicitly
const explicitResult = await window.markuprx.session.start(captureTarget);

// Stop the current session
const result = await window.markuprx.session.stop();
// Returns: { success: boolean; session?: SessionPayload; error?: string }

// Cancel without saving
const result = await window.markuprx.session.cancel();
// Returns: { success: boolean }

// Get current status
const status = await window.markuprx.session.getStatus();
// Returns: SessionStatusPayload

// Get current session data
const session = await window.markuprx.session.getCurrent();
// Returns: SessionPayload | null

// Subscribe to state changes
const unsubscribe = window.markuprx.session.onStateChange(({ state, session }) => {
  console.log('State:', state);
});

// Subscribe to new feedback items
const unsubscribe = window.markuprx.session.onFeedbackItem((item) => {
  console.log('New item:', item);
});

// Subscribe to errors
const unsubscribe = window.markuprx.session.onError(({ message }) => {
  console.error('Error:', message);
});
```

### Capture API

```typescript
// Get available capture sources
const sources = await window.markuprx.capture.getSources();
// Returns: CaptureSource[]

// Open the protected Window / Region / Full Screen selector
const target = await window.markuprx.capture.selectTarget();
// Returns: CaptureTarget | null (null means the user cancelled)

// Annotation lifecycle for the active target
await window.markuprx.capture.beginAnnotation(sessionId, target);
await window.markuprx.capture.setAnnotationMode('draw');
await window.markuprx.capture.setAnnotationMode('interact');
await window.markuprx.capture.endAnnotation();

const unsubscribeAnnotation = window.markuprx.capture.onAnnotationEvent((event) => {
  console.log(event.type, event.sessionId);
});

const unsubscribeAnnotationState = window.markuprx.capture.onAnnotationState(({ active, mode }) => {
  console.log({ active, mode });
});

// Trigger manual screenshot
await window.markuprx.capture.manualScreenshot();

// Subscribe to screenshots
const unsubscribe = window.markuprx.capture.onScreenshot((data) => {
  console.log('Screenshot:', data.id, data.count);
});
```

### Audio API

```typescript
// Get available devices (enumeration happens in renderer)
const devices = await window.markuprx.audio.getDevices();

// Set preferred device
await window.markuprx.audio.setDevice(deviceId);

// Subscribe to audio level (for visualization)
const unsubscribe = window.markuprx.audio.onLevel((level) => {
  // level is 0-1 normalized amplitude
});

// Subscribe to voice activity
const unsubscribe = window.markuprx.audio.onVoiceActivity((isActive) => {
  // isActive is boolean
});
```

### Settings API

```typescript
// Get a single setting
const theme = await window.markuprx.settings.get('theme');

// Get all settings
const settings = await window.markuprx.settings.getAll();

// Set a setting
const updated = await window.markuprx.settings.set('theme', 'dark');

// Get API key from secure storage
const apiKey = await window.markuprx.settings.getApiKey('openai');

// Set API key in secure storage
const success = await window.markuprx.settings.setApiKey('openai', 'your-key');
```

### Hotkeys API

```typescript
// Get current configuration
const config = await window.markuprx.hotkeys.getConfig();
// Returns: HotkeyConfig

// Update configuration
const result = await window.markuprx.hotkeys.updateConfig({
  toggleRecording: 'CommandOrControl+Shift+G'
});
// Returns: { config: HotkeyConfig; results: RegistrationResult[] }

// Subscribe to hotkey triggers
const unsubscribe = window.markuprx.hotkeys.onTriggered(({ action, accelerator }) => {
  console.log('Hotkey:', action);
});
```

### Output API

```typescript
// Save current session
const result = await window.markuprx.output.save();
// Returns: SaveResult

// Copy to clipboard
const success = await window.markuprx.output.copyClipboard();

// Open output folder
await window.markuprx.output.openFolder();

// List saved sessions
const sessions = await window.markuprx.output.listSessions();

// Delete a session
await window.markuprx.output.deleteSession(sessionId);

// Export a session
await window.markuprx.output.exportSession(sessionId, 'pdf');
```

### Crash Recovery API

```typescript
// Check for incomplete sessions
const { hasIncomplete, session } = await window.markuprx.crashRecovery.check();

// Recover an incomplete session
const result = await window.markuprx.crashRecovery.recover(sessionId);

// Discard incomplete session
await window.markuprx.crashRecovery.discard();

// Get crash logs
const logs = await window.markuprx.crashRecovery.getLogs(10);

// Subscribe to found incomplete sessions (on startup)
const unsubscribe = window.markuprx.crashRecovery.onIncompleteFound(({ session }) => {
  // Show recovery dialog
});
```

### Updates API

```typescript
// Check for updates
await window.markuprx.updates.check();

// Download available update
await window.markuprx.updates.download();

// Install and restart
await window.markuprx.updates.install();

// Subscribe to update status
const unsubscribe = window.markuprx.updates.onStatus((status) => {
  console.log('Update status:', status.status);
  if (status.percent) {
    console.log('Progress:', status.percent);
  }
});
```

## Event System

### Event Subscription Pattern

All event subscriptions return an unsubscribe function:

```typescript
// Subscribe
const unsubscribe = window.markuprx.session.onStateChange((data) => {
  // Handle event
});

// Later, clean up
unsubscribe();
```

### Using with React

```tsx
import { useEffect, useState } from 'react';

function useSessionState() {
  const [state, setState] = useState<SessionState>('idle');

  useEffect(() => {
    const unsubscribe = window.markuprx.session.onStateChange(({ state }) => {
      setState(state);
    });

    return unsubscribe; // Clean up on unmount
  }, []);

  return state;
}
```

## Plugin Architecture

markuprx is designed to support plugins in future versions.

### Planned Plugin Types

1. **Output Formatters**: Add new export formats
2. **Transcription Services**: Alternative to OpenAI
3. **Integrations**: Connect to external services
4. **Annotation Tools**: Custom drawing tools

### Plugin Interface (Draft)

```typescript
interface markuprxPlugin {
  name: string;
  version: string;
  type: 'formatter' | 'transcription' | 'integration' | 'annotation';

  // Lifecycle hooks
  onLoad(): Promise<void>;
  onUnload(): Promise<void>;

  // Type-specific methods
  // ...
}

// Example: Custom formatter plugin
interface FormatterPlugin extends markuprxPlugin {
  type: 'formatter';

  format(session: Session): Promise<{
    content: string;
    extension: string;
    mimeType: string;
  }>;
}
```

## Type Definitions

### Core Types

```typescript
// Session state machine
type SessionState = 'idle' | 'recording' | 'processing' | 'complete';

// Session status
type SessionStatus = 'idle' | 'recording' | 'processing' | 'complete' | 'error';

// Tray icon states
type TrayState = 'idle' | 'recording' | 'processing' | 'error';
```

### Payload Types

```typescript
// Session status (sent during recording)
interface SessionStatusPayload {
  state: SessionState;
  duration: number;
  feedbackCount: number;
  screenshotCount: number;
}

// Feedback item (sent when captured)
interface FeedbackItemPayload {
  id: string;
  timestamp: number;
  text: string;
  confidence: number;
  hasScreenshot: boolean;
  screenshotId?: string;
}

// Screenshot captured
interface ScreenshotCapturedPayload {
  id: string;
  timestamp: number;
  count: number;
  width?: number;
  height?: number;
}

// Transcript chunk
interface TranscriptChunkPayload {
  text: string;
  timestamp: number;
  confidence: number;
  isFinal: boolean;
  words?: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
  }>;
}
```

### Configuration Types

```typescript
// Hotkey configuration
interface HotkeyConfig {
  toggleRecording: string;
  manualScreenshot: string;
}

// Application settings
interface AppSettings {
  outputDirectory: string;
  launchAtLogin: boolean;
  checkForUpdates: boolean;
  defaultCountdown: 0 | 3 | 5;
  showTranscriptionPreview: boolean;
  showAudioWaveform: boolean;
  pauseThreshold: number;
  minTimeBetweenCaptures: number;
  imageFormat: 'png' | 'jpeg';
  imageQuality: number;
  maxImageWidth: number;
  theme: 'dark' | 'light' | 'system';
  accentColor: string;
  hotkeys: HotkeyConfig;
  audioDeviceId: string | null;
  debugMode: boolean;
  keepAudioBackups: boolean;
}
```

### Capture Types

```typescript
// Capture source
interface CaptureSource {
  id: string;
  name: string;
  type: 'screen' | 'window';
  thumbnail?: string;
  appIcon?: string;
  display?: DisplayInfo;
}

// Display info (multi-monitor)
interface DisplayInfo {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  isPrimary: boolean;
  rotation: 0 | 90 | 180 | 270;
  internal: boolean;
}

type CaptureTarget =
  | {
      kind: 'window'; sourceId: string; sourceName: string;
      nativeWindowId: string; appName: string; bounds: CaptureBounds;
      geometryAvailable?: boolean;
    }
  | {
      kind: 'region'; sourceId: string; sourceName: string;
      displayId: string; displayBounds: CaptureBounds; scaleFactor: number;
      region: CaptureBounds;
    }
  | {
      kind: 'screen'; sourceId: string; sourceName: string;
      displayId: string; displayBounds: CaptureBounds; scaleFactor: number;
    };

type CaptureSelectionMode = 'window' | 'region' | 'screen';

interface CaptureSelectionOverlayState {
  kind: 'selection';
  overlayId: string;
  mode: CaptureSelectionMode;
  display: CaptureDisplay;
  displays: CaptureDisplay[];
  windows: CapturableWindow[];
  windowSources: CaptureSource[];
}

type AnnotationEvent =
  | { type: 'cursor'; sessionId: string; point: NormalizedPoint | null }
  | { type: 'stroke-start'; sessionId: string; stroke: AnnotationStroke }
  | { type: 'stroke-points'; sessionId: string; strokeId: string; points: NormalizedPoint[] }
  | { type: 'stroke-end'; sessionId: string; strokeId: string }
  | { type: 'undo' | 'clear'; sessionId: string }
  | { type: 'mode'; sessionId: string; mode: 'interact' | 'draw' };
```

For the complete type definitions, see `src/shared/types.ts`.
