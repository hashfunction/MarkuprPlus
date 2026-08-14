import type { OutputReadyPayload, SessionState } from '../../shared/types';

export interface OutputReadyStatus {
  state: Extract<SessionState, 'complete' | 'error'>;
  errorMessage: string | null;
}

/** Keep saved output available while surfacing a transcription failure. */
export function getOutputReadyStatus(payload: OutputReadyPayload): OutputReadyStatus {
  const transcriptionError = payload.transcriptionError?.trim();
  if (transcriptionError) {
    return {
      state: 'error',
      errorMessage: transcriptionError,
    };
  }

  return {
    state: 'complete',
    errorMessage: null,
  };
}
