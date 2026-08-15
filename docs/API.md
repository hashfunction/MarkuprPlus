# API Reference

markupr uses Electron's IPC (Inter-Process Communication) for all communication between the main process and renderer. This document covers the internal API for developers.

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
│  │              window.markupr                     │   │
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
| `markupr:session:start` | invoke | Select a target and start recording | `{success, sessionId?, cancelled?, error?}` |
| `markupr:session:stop` | invoke | Stop recording | `{success, session?, error?}` |
| `markupr:session:cancel` | invoke | Cancel without saving | `{success}` |
| `markupr:session:get-status` | invoke | Get current status | `SessionStatusPayload` |
| `markupr:session:get-current` | invoke | Get session data | `SessionPayload | null` |

#### Main to Renderer

| Channel | Description | Payload |
|---------|-------------|---------|
| `markupr:session:state-changed` | State transition | `{state, session}` |
| `markupr:session:status-update` | Periodic status | `SessionStatusPayload` |
| `markupr:session:complete` | Session finished | `SessionPayload` |
| `markupr:session:feedback-item` | New item captured | `FeedbackItemPayload` |
| `markupr:session:error` | Error occurred | `{message}` |

### Capture Channels

#### Renderer to Main

| Channel | Method | Description | Returns |
|---------|--------|-------------|---------|
| `markupr:capture:get-sources` | invoke | List sources | `CaptureSource[]` |
| `markupr:capture:select-target` | invoke | Open the protected target selector | `CaptureTarget | null` |
| `markupr:capture:annotation-begin` | invoke | Open the protected annotation layer | `{success, error?}` |
| `markupr:capture:annotation-end` | invoke | Close the annotation layer | `{success}` |
| `markupr:capture:annotation-set-mode` | invoke | Switch interaction/drawing mode | `{success, error?}` |
| `markupr:capture:manual-screenshot` | invoke | Take screenshot | `{success}` |

Protected selector/annotation renderer windows additionally use:

| Channel | Method | Description | Returns |
|---------|--------|-------------|---------|
| `markupr:capture-overlay:get-state` | invoke | Read the calling overlay's issued state | `CaptureOverlayState \| null` |
| `markupr:capture-overlay:confirm` | invoke | Confirm an issued exact target | `{success, error?}` |
| `markupr:capture-overlay:cancel` | invoke | Cancel all selector windows | `{success}` |
| `markupr:capture-overlay:set-selection-mode` | invoke | Synchronize Window/Region/Screen across displays | `{success, error?}` |
| `markupr:capture-overlay:annotation-event` | invoke | Submit one bounded, normalized draw event | `{success, error?}` |

#### Main to Renderer

| Channel | Description | Payload |
|---------|-------------|---------|
| `markupr:capture:screenshot-taken` | Screenshot captured | `ScreenshotCapturedPayload` |
| `markupr:capture:manual-triggered` | Manual hotkey used | `{timestamp}` |
| `markupr:capture:annotation-event` | Validated normalized cursor/stroke event | `AnnotationEvent` |
| `markupr:capture:annotation-state` | Annotation overlay lifecycle/mode | `AnnotationStatePayload` |

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
| `markupr:settings:get` | invoke | Get single setting | `AppSettings[K]` |
| `markupr:settings:get-all` | invoke | Get all settings | `AppSettings` |
| `markupr:settings:set` | invoke | Set single setting | `AppSettings` |
| `markupr:settings:get-api-key` | invoke | Get API key (secure) | `string | null` |
| `markupr:settings:set-api-key` | invoke | Set API key (secure) | `boolean` |

### Update Channels

| Channel | Method | Description | Returns |
|---------|--------|-------------|---------|
| `markupr:update:check` | invoke | Check for updates | `UpdateInfo` |
| `markupr:update:download` | invoke | Download update | `void` |
| `markupr:update:install` | invoke | Install and restart | `void` |

#### Main to Renderer

| Channel | Description | Payload |
|---------|-------------|---------|
| `markupr:update:status` | Update status change | `UpdateStatusPayload` |

## Preload API

The preload script (`src/preload/index.ts`) exposes a safe API to the renderer via `window.markupr`.

### Session API

```typescript
// Interactive start: opens the selector in Window mode by default
const result = await window.markupr.session.start();
// Returns: { success: boolean; sessionId?: string; cancelled?: boolean; error?: string }

// An already validated target can also be passed explicitly
const explicitResult = await window.markupr.session.start(captureTarget);

// Stop the current session
const result = await window.markupr.session.stop();
// Returns: { success: boolean; session?: SessionPayload; error?: string }

// Cancel without saving
const result = await window.markupr.session.cancel();
// Returns: { success: boolean }

// Get current status
const status = await window.markupr.session.getStatus();
// Returns: SessionStatusPayload

// Get current session data
const session = await window.markupr.session.getCurrent();
// Returns: SessionPayload | null

// Subscribe to state changes
const unsubscribe = window.markupr.session.onStateChange(({ state, session }) => {
  console.log('State:', state);
});

// Subscribe to new feedback items
const unsubscribe = window.markupr.session.onFeedbackItem((item) => {
  console.log('New item:', item);
});

// Subscribe to errors
const unsubscribe = window.markupr.session.onError(({ message }) => {
  console.error('Error:', message);
});
```

### Capture API

```typescript
// Get available capture sources
const sources = await window.markupr.capture.getSources();
// Returns: CaptureSource[]

// Open the protected Window / Region / Full Screen selector
const target = await window.markupr.capture.selectTarget();
// Returns: CaptureTarget | null (null means the user cancelled)

// Annotation lifecycle for the active target
await window.markupr.capture.beginAnnotation(sessionId, target);
await window.markupr.capture.setAnnotationMode('draw');
await window.markupr.capture.setAnnotationMode('interact');
await window.markupr.capture.endAnnotation();

const unsubscribeAnnotation = window.markupr.capture.onAnnotationEvent((event) => {
  console.log(event.type, event.sessionId);
});

const unsubscribeAnnotationState = window.markupr.capture.onAnnotationState(({ active, mode }) => {
  console.log({ active, mode });
});

// Trigger manual screenshot
await window.markupr.capture.manualScreenshot();

// Subscribe to screenshots
const unsubscribe = window.markupr.capture.onScreenshot((data) => {
  console.log('Screenshot:', data.id, data.count);
});
```

### Audio API

```typescript
// Get available devices (enumeration happens in renderer)
const devices = await window.markupr.audio.getDevices();

// Set preferred device
await window.markupr.audio.setDevice(deviceId);

// Subscribe to audio level (for visualization)
const unsubscribe = window.markupr.audio.onLevel((level) => {
  // level is 0-1 normalized amplitude
});

// Subscribe to voice activity
const unsubscribe = window.markupr.audio.onVoiceActivity((isActive) => {
  // isActive is boolean
});
```

### Settings API

```typescript
// Get a single setting
const theme = await window.markupr.settings.get('theme');

// Get all settings
const settings = await window.markupr.settings.getAll();

// Set a setting
const updated = await window.markupr.settings.set('theme', 'dark');

// Get API key from secure storage
const apiKey = await window.markupr.settings.getApiKey('openai');

// Set API key in secure storage
const success = await window.markupr.settings.setApiKey('openai', 'your-key');
```

### Hotkeys API

```typescript
// Get current configuration
const config = await window.markupr.hotkeys.getConfig();
// Returns: HotkeyConfig

// Update configuration
const result = await window.markupr.hotkeys.updateConfig({
  toggleRecording: 'CommandOrControl+Shift+G'
});
// Returns: { config: HotkeyConfig; results: RegistrationResult[] }

// Subscribe to hotkey triggers
const unsubscribe = window.markupr.hotkeys.onTriggered(({ action, accelerator }) => {
  console.log('Hotkey:', action);
});
```

### Output API

```typescript
// Save current session
const result = await window.markupr.output.save();
// Returns: SaveResult

// Copy to clipboard
const success = await window.markupr.output.copyClipboard();

// Open output folder
await window.markupr.output.openFolder();

// List saved sessions
const sessions = await window.markupr.output.listSessions();

// Delete a session
await window.markupr.output.deleteSession(sessionId);

// Export a session
await window.markupr.output.exportSession(sessionId, 'pdf');
```

### Crash Recovery API

```typescript
// Check for incomplete sessions
const { hasIncomplete, session } = await window.markupr.crashRecovery.check();

// Recover an incomplete session
const result = await window.markupr.crashRecovery.recover(sessionId);

// Discard incomplete session
await window.markupr.crashRecovery.discard();

// Get crash logs
const logs = await window.markupr.crashRecovery.getLogs(10);

// Subscribe to found incomplete sessions (on startup)
const unsubscribe = window.markupr.crashRecovery.onIncompleteFound(({ session }) => {
  // Show recovery dialog
});
```

### Updates API

```typescript
// Check for updates
await window.markupr.updates.check();

// Download available update
await window.markupr.updates.download();

// Install and restart
await window.markupr.updates.install();

// Subscribe to update status
const unsubscribe = window.markupr.updates.onStatus((status) => {
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
const unsubscribe = window.markupr.session.onStateChange((data) => {
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
    const unsubscribe = window.markupr.session.onStateChange(({ state }) => {
      setState(state);
    });

    return unsubscribe; // Clean up on unmount
  }, []);

  return state;
}
```

## Plugin Architecture

markupr is designed to support plugins in future versions.

### Planned Plugin Types

1. **Output Formatters**: Add new export formats
2. **Transcription Services**: Alternative to OpenAI
3. **Integrations**: Connect to external services
4. **Annotation Tools**: Custom drawing tools

### Plugin Interface (Draft)

```typescript
interface markuprPlugin {
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
interface FormatterPlugin extends markuprPlugin {
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
