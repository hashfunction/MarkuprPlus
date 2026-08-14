import type { TranscriptionFailure } from '../../shared/types';

export interface SavedTranscriptionInput {
  audioBytes: number;
  transcriptTexts: string[];
  recoveryFailure?: TranscriptionFailure;
}

/**
 * Resolve a user-visible failure only after the audio artifact has been saved.
 * A recorded screen without narration is valid, while saved narration with no
 * transcript must never be presented as a successful zero-item report.
 */
export function resolveSavedTranscriptionFailure(
  input: SavedTranscriptionInput,
): TranscriptionFailure | undefined {
  if (input.audioBytes <= 0) {
    return undefined;
  }

  const hasTranscript = input.transcriptTexts.some((text) => text.trim().length > 0);
  if (hasTranscript) {
    return undefined;
  }

  return input.recoveryFailure ?? {
    code: 'no-speech',
    message: 'No speech was detected in the recorded narration.',
  };
}
