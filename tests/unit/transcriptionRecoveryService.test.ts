import { describe, expect, it, vi } from 'vitest';
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

  it('does not read or log an OpenAI error response body', async () => {
    const responseBody = vi.fn(async () => 'sensitive provider response');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      text: responseBody,
    } as unknown as Response);
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const result = await recoverTranscript(
        sessionStartSec,
        encodedAudio(false),
        {
          getOpenAIApiKey: async () => 'configured',
          isLocalModelAvailable: () => false,
        },
      );

      expect(result.failure).toEqual({
        code: 'openai-failed',
        message: 'OpenAI transcription failed: request failed after retries',
      });
      expect(responseBody).not.toHaveBeenCalled();
      expect(warnMock.mock.calls.flat().join(' ')).not.toContain('sensitive provider response');
    } finally {
      fetchMock.mockRestore();
      warnMock.mockRestore();
    }
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

  it('uses local Whisper first and never reads a key or calls cloud after local success', async () => {
    const event = transcriptEvent('The save button overlaps the footer.');
    const getOpenAIApiKey = vi.fn(async () => 'configured');
    const recoverWithOpenAI = vi.fn(async () => success([transcriptEvent('cloud')]));
    const recoverWithWhisper = vi.fn(async () => success([event]));
    const result = await recoverTranscript(
      sessionStartSec,
      encodedAudio(),
      dependencies({
        getOpenAIApiKey,
        recoverWithOpenAI,
        isLocalModelAvailable: () => true,
        recoverWithWhisper,
      })
    );

    expect(result).toEqual({ events: [event] });
    expect(recoverWithWhisper).toHaveBeenCalledOnce();
    expect(getOpenAIApiKey).not.toHaveBeenCalled();
    expect(recoverWithOpenAI).not.toHaveBeenCalled();
  });

  it('uses a configured OpenAI key only after local Whisper fails', async () => {
    const event = transcriptEvent('The navigation label is unclear.');
    const calls: string[] = [];
    const result = await recoverTranscript(
      sessionStartSec,
      encodedAudio(),
      dependencies({
        isLocalModelAvailable: () => true,
        recoverWithWhisper: async () => {
          calls.push('local');
          return { events: [], outcome: 'provider-error', error: 'model failed' };
        },
        getOpenAIApiKey: async () => {
          calls.push('key');
          return 'configured';
        },
        recoverWithOpenAI: async () => {
          calls.push('cloud');
          return success([event]);
        },
      })
    );

    expect(result).toEqual({ events: [event] });
    expect(calls).toEqual(['local', 'key', 'cloud']);
  });

  it('uses configured cloud fallback after local is unavailable', async () => {
    const event = transcriptEvent('Cloud fallback transcript.');
    const getOpenAIApiKey = vi.fn(async () => 'configured');
    const recoverWithOpenAI = vi.fn(async () => success([event]));

    const result = await recoverTranscript(
      sessionStartSec,
      encodedAudio(),
      dependencies({ getOpenAIApiKey, recoverWithOpenAI }),
    );

    expect(result).toEqual({ events: [event] });
    expect(getOpenAIApiKey).toHaveBeenCalledOnce();
    expect(recoverWithOpenAI).toHaveBeenCalledOnce();
  });

  it('does not call cloud after local failure when no key is configured', async () => {
    const recoverWithOpenAI = vi.fn(async () => success([transcriptEvent('unexpected cloud')]));
    const result = await recoverTranscript(
      sessionStartSec,
      encodedAudio(),
      dependencies({
        isLocalModelAvailable: () => true,
        recoverWithWhisper: async () => ({
          events: [],
          outcome: 'provider-error',
          error: 'model failed',
        }),
        getOpenAIApiKey: async () => null,
        recoverWithOpenAI,
      }),
    );

    expect(recoverWithOpenAI).not.toHaveBeenCalled();
    expect(result.failure).toEqual({
      code: 'whisper-failed',
      message: 'Local Whisper transcription failed: model failed',
    });
  });

  it('reports local then configured cloud failures in their actual order', async () => {
    const result = await recoverTranscript(
      sessionStartSec,
      encodedAudio(),
      dependencies({
        isLocalModelAvailable: () => true,
        recoverWithWhisper: async () => ({
          events: [],
          outcome: 'provider-error',
          error: 'model failed',
        }),
        getOpenAIApiKey: async () => 'configured',
        recoverWithOpenAI: async () => ({
          events: [],
          outcome: 'provider-error',
          error: 'request timed out',
        }),
      }),
    );

    expect(result.failure).toEqual({
      code: 'openai-failed',
      message: 'Local Whisper transcription failed: model failed. OpenAI fallback failed: request timed out',
    });
  });

  it('contains thrown local and cloud failures without skipping the configured fallback order', async () => {
    const calls: string[] = [];
    const result = await recoverTranscript(
      sessionStartSec,
      encodedAudio(),
      dependencies({
        isLocalModelAvailable: () => true,
        recoverWithWhisper: async () => {
          calls.push('local');
          throw new Error('sensitive local details');
        },
        getOpenAIApiKey: async () => {
          calls.push('key');
          return 'configured';
        },
        recoverWithOpenAI: async () => {
          calls.push('cloud');
          throw new Error('sensitive cloud details');
        },
      }),
    );

    expect(calls).toEqual(['local', 'key', 'cloud']);
    expect(result.failure).toEqual({
      code: 'openai-failed',
      message: 'Local Whisper transcription failed: local recovery failed. OpenAI fallback failed: request failed',
    });
    expect(JSON.stringify(result)).not.toContain('sensitive');
  });

  it('never reads a cloud key when encoded audio is absent', async () => {
    const getOpenAIApiKey = vi.fn(async () => 'configured');
    const result = await recoverTranscript(
      sessionStartSec,
      { capturedAudioAsset: null, capturedAudioBuffer: Buffer.alloc(16, 1) },
      dependencies({
        isLocalModelAvailable: () => true,
        recoverWithWhisper: async () => ({
          events: [],
          outcome: 'provider-error',
          error: 'model failed',
        }),
        getOpenAIApiKey,
      }),
    );

    expect(getOpenAIApiKey).not.toHaveBeenCalled();
    expect(result.failure?.code).toBe('whisper-failed');
  });
});
