/**
 * MCP-specific types for the MarkuprX MCP server.
 */

/** Represents a single MCP recording/capture session. */
export interface McpSession {
  id: string;
  startTime: number;
  endTime?: number;
  label?: string;
  videoPath?: string;
  reportPath?: string;
  status: 'recording' | 'processing' | 'complete' | 'error';
}

export interface McpCaptureCursorContext {
  x: number;
  y: number;
}

export interface McpCaptureWindowContext {
  appName?: string;
  title?: string;
  pid?: number;
}

export interface McpFocusedElementHint {
  source: 'os-accessibility' | 'window-title' | 'unknown';
  role?: string;
  textPreview?: string;
  appName?: string;
  windowTitle?: string;
}

export interface McpCaptureContextSnapshot {
  recordedAt: number;
  cursor?: McpCaptureCursorContext;
  activeWindow?: McpCaptureWindowContext;
  focusedElement?: McpFocusedElementHint;
}

export interface McpCaptureEvent {
  file: string;
  label?: string;
  display?: number;
  capturedAt: number;
  context?: McpCaptureContextSnapshot;
}

/** Metadata written to each session's metadata.json on disk. */
export interface McpSessionMetadata extends McpSession {
  transcriptSegments?: number;
  extractedFrames?: number;
  durationSeconds?: number;
  recordingContextStart?: McpCaptureContextSnapshot;
  recordingContextStop?: McpCaptureContextSnapshot;
  lastCaptureContext?: McpCaptureContextSnapshot;
  captures?: McpCaptureEvent[];
}
