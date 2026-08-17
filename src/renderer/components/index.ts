/**
 * MarkuprX UI Components
 *
 * Re-exports all components for clean imports:
 * import { RecordingOverlay, StatusIndicator, SessionReview, Onboarding, ErrorBoundary, AnnotationOverlay, AudioWaveform } from './components';
 */

export { RecordingOverlay } from './RecordingOverlay';
export { ProcessingOverlay } from './ProcessingOverlay';
export { CountdownTimer } from './CountdownTimer';
export { default as StatusIndicator } from './StatusIndicator';
export { SessionReview } from './SessionReview';
export { Onboarding } from './Onboarding';
export { ErrorBoundary, MinimalErrorBoundary } from './ErrorBoundary';
export { AnnotationOverlay } from './AnnotationOverlay';
export { AudioWaveform, CompactAudioIndicator, AudioLevelMeter } from './AudioWaveform';
export { WindowSelector } from './WindowSelector';
export { CrashRecoveryDialog, useCrashRecovery } from './CrashRecoveryDialog';
export { ExportDialog } from './ExportDialog';
export { ClarificationQuestions } from './ClarificationQuestions';

// Theme components
export { ThemeProvider, ThemeToggle, AccentColorPicker } from './ThemeProvider';

// Animation components
export { default as Skeleton } from './Skeleton';
export {
  SkeletonText,
  SkeletonAvatar,
  SkeletonThumbnail,
  SkeletonButton,
  SkeletonCard,
  SkeletonListItem,
  SkeletonFeedbackItem,
  SkeletonWindowSource,
} from './Skeleton';

export { default as Tooltip } from './Tooltip';
export { Tooltip as TooltipComponent, HotkeyTooltip, StatusTooltip } from './Tooltip';

// Keyboard shortcuts panel
export { KeyboardShortcuts, default as KeyboardShortcutsPanel } from './KeyboardShortcuts';

// Hotkey hint component (platform-aware)
export { HotkeyHint, ToggleRecordingHint, ManualScreenshotHint, getHotkeyText } from './HotkeyHint';

// Transcription tier selector
export { TranscriptionTierSelector, type TranscriptionTier } from './TranscriptionTierSelector';

// Settings panel
export { SettingsPanel, default as SettingsPanelDefault } from './SettingsPanel';
export { PortraitSurface } from './PortraitSurface';
export type { PortraitSurfaceProps } from './PortraitSurface';

// Donate button
export { DonateButton, default as DonateButtonDefault } from './DonateButton';

// Session history
export { SessionHistory } from './SessionHistory';

// Transcription preview (post-processing results viewer)
export { TranscriptionPreview, TranscriptionPreviewAnimated } from './TranscriptionPreview';
export type { TranscriptSegment, TranscriptionPreviewProps } from './TranscriptionPreview';

// Model download dialog
export { ModelDownloadDialog, useModelCheck } from './ModelDownloadDialog';

// Type exports for external use
export type { default as RecordingOverlayType } from './RecordingOverlay';
export type { SessionReviewProps } from './SessionReview';
export type { AudioWaveformProps } from './AudioWaveform';
export type { TooltipProps, TooltipPlacement, TooltipStatus } from './Tooltip';
export type {
  CrashRecoveryDialogProps,
  RecoverableSession,
  RecoverableFeedbackItem,
  UseCrashRecoveryReturn,
} from './CrashRecoveryDialog';
export type {
  KeyboardShortcutsProps,
  Shortcut,
  ShortcutCategory,
} from './KeyboardShortcuts';
export type {
  ExportDialogProps,
  ExportOptions as ExportDialogOptions,
  ExportFormat as DialogExportFormat,
} from './ExportDialog';
export type { CountdownTimerProps } from './CountdownTimer';
export type {
  ThemeProviderProps,
  ThemeToggleProps,
  AccentColorPickerProps,
} from './ThemeProvider';
export type {
  ClarificationQuestionsProps,
  ClarificationQuestion,
  ClarificationType,
} from './ClarificationQuestions';
export type { DonateButtonProps } from './DonateButton';
