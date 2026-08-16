/**
 * Window management for MarkuprX
 *
 * Exports:
 * - PopoverManager: NSPopover-like menu bar window
 * - TaskbarIntegration: Jump lists, progress bar, thumbnail toolbar (Windows)
 *
 * @module windows
 */

export {
  PopoverManager,
  POPOVER_SIZES,
  type PopoverConfig,
  type PopoverState
} from './PopoverManager';

export {
  TaskbarIntegration,
  taskbarIntegration,
  type SessionInfo,
  type RecordingState
} from './TaskbarIntegration';
