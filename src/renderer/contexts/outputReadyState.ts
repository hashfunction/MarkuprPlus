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

  const analysisError = payload.analysisError?.trim();
  if (analysisError) {
    return {
      state: 'error',
      errorMessage: analysisError,
    };
  }

  return {
    state: 'complete',
    errorMessage: null,
  };
}
