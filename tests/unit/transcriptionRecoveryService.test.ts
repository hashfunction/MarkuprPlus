import { describe, expect, it } from 'vitest';
import {
  recoverTranscript,
  type RecoveryAudioData,
  type RecoveryAttempt,
  type TranscriptionRecoveryDependencies,
} from '../../src/main/transcription/TranscriptionRecoveryService';
import type { TranscriptEvent } from '../../src/main/transcription/types';

const sessionStartSec = 1_786_663_895;

function encodedAudio(includePcm = true): RecoveryAudioData {
  return {
    capturedAudioAsset: {
      buffer: Buffer.from('encoded narration'),
      mimeType: 'audio/webm;codecs=opus',
      durationMs: 2_000,
    },
    capturedAudioBuffer: includePcm ? Buffer.alloc(16, 1) : null,
  };
}

function transcriptEvent(text: string): TranscriptEvent {
  return {
    text,
    isFinal: true,
    confidence: 0.9,
    timestamp: sessionStartSec,
    tier: 'whisper',
  };
}

function success(events: TranscriptEvent[]): RecoveryAttempt {
  return { events, outcome: 'success' };
}

function dependencies(
  overrides: Partial<TranscriptionRecoveryDependencies> = {}
): TranscriptionRecoveryDependencies {
  return {
    getOpenAIApiKey: async () => null,
    recoverWithOpenAI: async () => ({ events: [], outcome: 'provider-error' }),
    recoverWithWhisper: async () => ({ events: [], outcome: 'provider-error' }),
    isLocalModelAvailable: () => false,
    ...overrides,
  };
}

describe('recoverTranscript outcomes', () => {
  it('reports missing configuration when audio exists without a key or local model', async () => {
    const result = await recoverTranscript(sessionStartSec, encodedAudio(), dependencies());

    expect(result.events).toEqual([]);
    expect(result.failure?.code).toBe('not-configured');
    expect(result.failure?.message).toContain('OpenAI transcription key');
    expect(result.failure?.message).toContain('local Whisper model');
  });

  it('reports unavailable audio separately from missing configuration', async () => {
    const result = await recoverTranscript(
      sessionStartSec,
      { capturedAudioAsset: null, capturedAudioBuffer: null },
      dependencies()
    );

    expect(result.events).toEqual([]);
    expect(result.failure?.code).toBe('audio-unavailable');
  });

  it('reports no speech separately from a provider failure', async () => {
    const result = await recoverTranscript(
      sessionStartSec,
      encodedAudio(false),
      dependencies({
        getOpenAIApiKey: async () => 'configured',
        recoverWithOpenAI: async () => ({ events: [], outcome: 'no-speech' }),
      })
    );

    expect(result.events).toEqual([]);
    expect(result.failure?.code).toBe('no-speech');
  });

  it('reports an OpenAI runtime failure when no local fallback is usable', async () => {
    const result = await recoverTranscript(
      sessionStartSec,
      encodedAudio(false),
      dependencies({
        getOpenAIApiKey: async () => 'configured',
        recoverWithOpenAI: async () => ({
          events: [],
          outcome: 'provider-error',
          error: 'request timed out',
        }),
      })
    );

    expect(result.events).toEqual([]);
    expect(result.failure).toEqual({
      code: 'openai-failed',
      message: 'OpenAI transcription failed: request timed out',
    });
  });

  it('reports a local Whisper runtime failure', async () => {
    const result = await recoverTranscript(
      sessionStartSec,
      encodedAudio(),
      dependencies({
        isLocalModelAvailable: () => true,
        recoverWithWhisper: async () => ({
          events: [],
          outcome: 'provider-error',
          error: 'model could not load',
        }),
      })
    );

    expect(result.events).toEqual([]);
    expect(result.failure).toEqual({
      code: 'whisper-failed',
      message: 'Local Whisper transcription failed: model could not load',
    });
  });

  it('uses local Whisper successfully after OpenAI fails', async () => {
    const event = transcriptEvent('The save button overlaps the footer.');
    const result = await recoverTranscript(
      sessionStartSec,
      encodedAudio(),
      dependencies({
        getOpenAIApiKey: async () => 'configured',
        recoverWithOpenAI: async () => ({
          events: [],
          outcome: 'provider-error',
          error: 'service unavailable',
        }),
        isLocalModelAvailable: () => true,
        recoverWithWhisper: async () => success([event]),
      })
    );

    expect(result).toEqual({ events: [event] });
  });

  it('returns OpenAI events without a failure', async () => {
    const event = transcriptEvent('The navigation label is unclear.');
    const result = await recoverTranscript(
      sessionStartSec,
      encodedAudio(),
      dependencies({
        getOpenAIApiKey: async () => 'configured',
        recoverWithOpenAI: async () => success([event]),
      })
    );

    expect(result).toEqual({ events: [event] });
  });
});
