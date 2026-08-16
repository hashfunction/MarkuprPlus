/**
 * markuprx Context Providers
 *
 * Re-exports all context providers and hooks for clean imports:
 * import { useRecording, useProcessing, useUI } from './contexts';
 */

// Recording context (session state, IPC, actions)
export { RecordingProvider, useRecording } from './RecordingContext';
export type { RecordingContextValue, ProcessingProgress, RecentSession, LastCapture } from './RecordingContext';

// Processing context (progress smoothing)
export {
  ProcessingProvider,
  useProcessing,
  PROCESSING_BASELINE_PERCENT,
  PROCESSING_DOT_FRAMES,
  formatProcessingStep,
} from './ProcessingContext';
export type { ProcessingContextValue } from './ProcessingContext';

// UI context (navigation, settings, derived state)
export { UIProvider, useUI } from './UIContext';
export type { UIContextValue, AppView } from './UIContext';
