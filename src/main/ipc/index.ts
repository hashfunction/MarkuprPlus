/**
 * IPC Handler Barrel
 *
 * Aggregates all domain-specific IPC handler modules and
 * provides a single registration entry point for the main process.
 */

export { registerSessionHandlers } from './sessionHandlers';
export { registerCaptureHandlers } from './captureHandlers';
export { registerSettingsHandlers } from './settingsHandlers';
export { registerOutputHandlers } from './outputHandlers';
export { registerWindowHandlers } from './windowHandlers';
export { registerAnalysisProviderHandlers } from './analysisProviderHandlers';
export type { IpcContext, SessionActions } from './types';

// Re-export capture utilities used by the main entry point
export {
  extensionFromMimeType,
  finalizeScreenRecording,
  getScreenRecordingSnapshot,
  deleteFinalizedRecording,
  getActiveScreenRecordings,
  getFinalizedScreenRecordings,
} from './captureHandlers';

// Re-export session history used by the main entry point
export { listSessionHistoryItems } from './outputHandlers';

import type { IpcContext, SessionActions } from './types';
import { registerSessionHandlers } from './sessionHandlers';
import { registerCaptureHandlers } from './captureHandlers';
import { registerSettingsHandlers } from './settingsHandlers';
import { registerOutputHandlers } from './outputHandlers';
import { registerWindowHandlers } from './windowHandlers';
import { registerAnalysisProviderHandlers } from './analysisProviderHandlers';

/**
 * Register all IPC handlers in a single call.
 * Called from the main entry point after all services are initialized.
 */
export function registerAllHandlers(ctx: IpcContext, actions: SessionActions): void {
  registerSessionHandlers(ctx, actions);
  registerCaptureHandlers(ctx);
  registerSettingsHandlers(ctx, actions);
  registerOutputHandlers(ctx);
  registerWindowHandlers(ctx);
  registerAnalysisProviderHandlers(ctx);
}
