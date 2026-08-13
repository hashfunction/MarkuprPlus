/**
 * TranscriptionRecoveryService
 *
 * Handles post-session transcription recovery when live transcription
 * produces no output. Tries OpenAI Whisper-1 API first, then falls back
 * to local Whisper. Extracted from SessionController for separation of concerns.
 */

import type { CapturedAudioAsset } from '../audio/AudioCapture';
import { extensionFromMimeType } from '../audio/audioUtils';
import { getSettingsManager } from '../settings';
import { whisperService } from './WhisperService';
import type { TranscriptEvent } from './types';
import type { TranscriptionFailure } from '../../shared/types';
export type { TranscriptionFailure, TranscriptionFailureCode } from '../../shared/types';

// =============================================================================
// Configuration
// =============================================================================

const WHISPER_RECOVERY_CHUNK_SECONDS = 30;
const MAX_POST_SESSION_LOCAL_RECOVERY_DURATION_SEC = 8 * 60;

// =============================================================================
// Types
// =============================================================================

/**
 * Audio data needed for recovery.
 * Provided by the SessionController from its audio capture service.
 */
export interface RecoveryAudioData {
  /** Encoded audio asset (webm/ogg/mp4). Used by OpenAI API. */
  capturedAudioAsset: CapturedAudioAsset | null;
  /** Raw PCM Float32 buffer. Used by local Whisper. */
  capturedAudioBuffer: Buffer | null;
}

export interface TranscriptRecoveryResult {
  events: TranscriptEvent[];
  failure?: TranscriptionFailure;
}

export interface RecoveryAttempt {
  events: TranscriptEvent[];
  outcome: 'success' | 'no-speech' | 'provider-error';
  error?: string;
}

export interface TranscriptionRecoveryDependencies {
  getOpenAIApiKey(): Promise<string | null>;
  recoverWithOpenAI(
    audioAsset: CapturedAudioAsset,
    sessionStartSec: number,
    apiKey: string,
    maxAttempts: number,
  ): Promise<RecoveryAttempt>;
  recoverWithWhisper(
    audioSamples: Float32Array,
    sessionStartSec: number,
    maxAttempts: number,
  ): Promise<RecoveryAttempt>;
  isLocalModelAvailable(): boolean;
}

// =============================================================================
// Pure Helper Functions
// =============================================================================

/**
 * Normalize a transcript timestamp to epoch seconds.
 * Relative offsets (< 1 day) are rebased to session start.
 */
export function normalizeTranscriptTimestamp(timestamp: number, sessionStartSec: number): number {
  if (timestamp < 86_400) {
    return sessionStartSec + Math.max(0, timestamp);
  }
  if (timestamp < sessionStartSec - 60) {
    return sessionStartSec + Math.max(0, timestamp);
  }
  return timestamp;
}

/**
 * Extract a user-friendly error message from an OpenAI API error response.
 */
async function extractOpenAiError(response: Response): Promise<string> {
  try {
    const raw = await response.text();
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return 'Unknown API error';
    }

    const parsed = JSON.parse(trimmed) as { error?: { message?: string } };
    const message = parsed?.error?.message;
    if (message && message.trim().length > 0) {
      return message.trim();
    }
    return trimmed.length > 220 ? `${trimmed.slice(0, 220)}...` : trimmed;
  } catch {
    return `HTTP ${response.status}`;
  }
}

/**
 * Read the OpenAI API key from secure storage.
 */
async function getOpenAIApiKey(): Promise<string | null> {
  try {
    const settings = getSettingsManager();
    const apiKey = await settings.getApiKey('openai');
    const normalized = apiKey?.trim();
    return normalized && normalized.length > 0 ? normalized : null;
  } catch (error) {
    console.warn('[TranscriptionRecovery] Failed to read OpenAI API key:', error);
    return null;
  }
}

// =============================================================================
// Recovery Strategies
// =============================================================================

/**
 * Recover transcript via OpenAI Whisper-1 API from an encoded audio asset.
 */
async function recoverWithOpenAI(
  audioAsset: CapturedAudioAsset,
  sessionStartSec: number,
  apiKey: string,
  maxAttempts: number,
): Promise<RecoveryAttempt> {
  let lastError = 'request failed after retries';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutMs = Math.min(180_000, Math.max(30_000, Math.round(audioAsset.durationMs * 1.8)));
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const recoveredEvents: TranscriptEvent[] = [];

      try {
        const extension = extensionFromMimeType(audioAsset.mimeType);
        const form = new FormData();
        form.append('model', 'whisper-1');
        form.append('response_format', 'verbose_json');
        form.append('temperature', '0');
        form.append(
          'file',
          new Blob([new Uint8Array(audioAsset.buffer)], { type: audioAsset.mimeType }),
          `session-audio${extension}`,
        );

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: form,
          signal: controller.signal,
        });

        if (!response.ok) {
          const detail = await extractOpenAiError(response);
          throw new Error(`OpenAI transcription failed (${response.status}): ${detail}`);
        }

        const payload = (await response.json()) as {
          text?: string;
          segments?: Array<{
            text?: string;
            start?: number;
          }>;
        };

        const segments = Array.isArray(payload.segments) ? payload.segments : [];
        if (segments.length > 0) {
          for (const segment of segments) {
            const text = segment.text?.trim();
            if (!text) {
              continue;
            }

            const start = Number.isFinite(segment.start) ? Math.max(0, Number(segment.start)) : 0;
            const normalizedTimestamp = normalizeTranscriptTimestamp(sessionStartSec + start, sessionStartSec);
            recoveredEvents.push({
              text,
              isFinal: true,
              confidence: 0.9,
              timestamp: normalizedTimestamp,
              tier: 'whisper',
            });
          }
        } else if (payload.text?.trim()) {
          recoveredEvents.push({
            text: payload.text.trim(),
            isFinal: true,
            confidence: 0.85,
            timestamp: normalizeTranscriptTimestamp(sessionStartSec, sessionStartSec),
            tier: 'whisper',
          });
        }
      } finally {
        clearTimeout(timeout);
      }

      if (recoveredEvents.length === 0) {
        console.warn(
          `[TranscriptionRecovery] OpenAI recovery attempt ${attempt}/${maxAttempts} detected no speech.`,
        );
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
          continue;
        }
        return { events: [], outcome: 'no-speech' };
      }

      console.log(
        `[TranscriptionRecovery] Recovered ${recoveredEvents.length} segments via OpenAI (attempt ${attempt}/${maxAttempts}).`,
      );
      return { events: recoveredEvents, outcome: 'success' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = error instanceof Error && error.name === 'AbortError'
        ? 'request timed out'
        : 'request failed after retries';
      console.warn(
        `[TranscriptionRecovery] OpenAI recovery attempt ${attempt}/${maxAttempts} failed: ${message}`,
      );

      if (attempt < maxAttempts) {
        const delayMs = 500 * attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  return { events: [], outcome: 'provider-error', error: lastError };
}

/**
 * Recover transcript via local Whisper from raw PCM audio samples.
 */
async function recoverWithWhisper(
  audioSamples: Float32Array,
  sessionStartSec: number,
  maxAttempts: number,
): Promise<RecoveryAttempt> {
  const sampleRate = 16000;
  const chunkSamples = sampleRate * WHISPER_RECOVERY_CHUNK_SECONDS;
  let lastError = 'local model failed after retries';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const recoveredSegments: Array<{
        text: string;
        startTime: number;
        endTime: number;
        confidence: number;
      }> = [];
      for (let offset = 0; offset < audioSamples.length; offset += chunkSamples) {
        const chunk = audioSamples.subarray(offset, Math.min(audioSamples.length, offset + chunkSamples));
        const chunkStartSec = sessionStartSec + offset / sampleRate;
        const chunkSegments = await whisperService.transcribeSamples(chunk, chunkStartSec);
        recoveredSegments.push(...chunkSegments);

        // Yield between chunks to keep the app responsive during longer sessions.
        if (offset + chunkSamples < audioSamples.length) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      const recoveredEvents: TranscriptEvent[] = recoveredSegments
        .map((segment) => ({
          text: segment.text,
          isFinal: true as const,
          confidence: segment.confidence,
          timestamp: normalizeTranscriptTimestamp(segment.startTime, sessionStartSec),
          tier: 'whisper' as const,
        }))
        .filter((segment) => segment.text.trim().length > 0);

      if (recoveredEvents.length === 0) {
        console.warn(
          `[TranscriptionRecovery] Whisper recovery attempt ${attempt}/${maxAttempts} detected no speech.`,
        );
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
          continue;
        }
        return { events: [], outcome: 'no-speech' };
      }

      console.log(
        `[TranscriptionRecovery] Recovered ${recoveredEvents.length} segments via Whisper (attempt ${attempt}/${maxAttempts}).`,
      );
      return { events: recoveredEvents, outcome: 'success' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = message.trim().slice(0, 180) || 'local model failed after retries';
      console.warn(
        `[TranscriptionRecovery] Whisper recovery attempt ${attempt}/${maxAttempts} failed: ${message}`,
      );

      if (attempt < maxAttempts) {
        const delayMs = 400 * attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  return { events: [], outcome: 'provider-error', error: lastError };
}

// =============================================================================
// Main Recovery Orchestrator
// =============================================================================

/**
 * Run post-session transcription recovery.
 *
 * Attempts OpenAI API first, then falls back to local Whisper.
 * Returns recovered transcript events, or an empty array if all strategies fail.
 *
 * @param sessionStartSec - Session start time in epoch seconds
 * @param audioData - Audio data from the capture service
 * @returns Recovered transcript events (may be empty)
 */
export async function recoverTranscript(
  sessionStartSec: number,
  audioData: RecoveryAudioData,
  dependencyOverrides: Partial<TranscriptionRecoveryDependencies> = {},
): Promise<TranscriptRecoveryResult> {
  const dependencies: TranscriptionRecoveryDependencies = {
    getOpenAIApiKey,
    recoverWithOpenAI,
    recoverWithWhisper,
    isLocalModelAvailable: () => whisperService.isModelAvailable(),
    ...dependencyOverrides,
  };
  const hasEncodedAudio = Boolean(
    audioData.capturedAudioAsset && audioData.capturedAudioAsset.buffer.byteLength > 0
  );
  const hasPcmAudio = Boolean(
    audioData.capturedAudioBuffer && audioData.capturedAudioBuffer.byteLength > 0
  );

  if (!hasEncodedAudio && !hasPcmAudio) {
    return {
      events: [],
      failure: {
        code: 'audio-unavailable',
        message: 'No recorded narration audio was available for transcription.',
      },
    };
  }

  let openAiAttempt: RecoveryAttempt | undefined;
  let localAttempt: RecoveryAttempt | undefined;
  const openAiApiKey = hasEncodedAudio ? await dependencies.getOpenAIApiKey() : null;

  // Try OpenAI first (best quality)
  if (hasEncodedAudio && audioData.capturedAudioAsset) {
    if (openAiApiKey) {
      openAiAttempt = await dependencies.recoverWithOpenAI(
        audioData.capturedAudioAsset,
        sessionStartSec,
        openAiApiKey,
        2,
      );
      if (openAiAttempt.events.length > 0) {
        return { events: openAiAttempt.events };
      }
    } else {
      console.warn('[TranscriptionRecovery] OpenAI recovery skipped: API key not configured.');
    }
  }

  // Fall back to local Whisper (raw PCM only)
  const localModelAvailable = dependencies.isLocalModelAvailable();
  if (hasPcmAudio && audioData.capturedAudioBuffer && localModelAvailable) {
    const audioSamples = new Float32Array(
      audioData.capturedAudioBuffer.buffer,
      audioData.capturedAudioBuffer.byteOffset,
      audioData.capturedAudioBuffer.byteLength / 4,
    );
    const audioDurationSec = audioSamples.length / 16000;
    if (audioDurationSec <= MAX_POST_SESSION_LOCAL_RECOVERY_DURATION_SEC) {
      localAttempt = await dependencies.recoverWithWhisper(audioSamples, sessionStartSec, 3);
      if (localAttempt.events.length > 0) {
        return { events: localAttempt.events };
      }
    } else {
      localAttempt = {
        events: [],
        outcome: 'provider-error',
        error: `session is too long for local recovery (${Math.round(audioDurationSec)}s)`,
      };
    }
  }

  if (localAttempt?.outcome === 'no-speech' || openAiAttempt?.outcome === 'no-speech') {
    return {
      events: [],
      failure: {
        code: 'no-speech',
        message: 'No speech was detected in the recorded narration.',
      },
    };
  }

  if (localAttempt?.outcome === 'provider-error') {
    return {
      events: [],
      failure: {
        code: 'whisper-failed',
        message: `Local Whisper transcription failed: ${localAttempt.error || 'local model failed'}`,
      },
    };
  }

  if (openAiAttempt?.outcome === 'provider-error') {
    return {
      events: [],
      failure: {
        code: 'openai-failed',
        message: `OpenAI transcription failed: ${openAiAttempt.error || 'request failed'}`,
      },
    };
  }

  if (!openAiApiKey && !localModelAvailable) {
    return {
      events: [],
      failure: {
        code: 'not-configured',
        message: 'Add an OpenAI transcription key or download a local Whisper model, then record again.',
      },
    };
  }

  return {
    events: [],
    failure: {
      code: 'whisper-failed',
      message: hasPcmAudio
        ? 'Local Whisper transcription could not process the recorded narration.'
        : 'Local Whisper transcription could not use the captured audio format.',
    },
  };
}
