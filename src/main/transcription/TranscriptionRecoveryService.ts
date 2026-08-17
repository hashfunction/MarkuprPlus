/**
 * TranscriptionRecoveryService
 *
 * Handles post-session transcription recovery when live transcription
 * produces no output. Tries local Whisper first and uses OpenAI only as an
 * explicitly configured fallback. Extracted from SessionController for
 * separation of concerns.
 */

import type { CapturedAudioAsset } from '../audio/AudioCapture';
import { extensionFromMimeType } from '../audio/audioUtils';
import { getSettingsManager } from '../settings';
import { whisperService } from './WhisperService';
import type { TranscriptEvent } from './types';
import type { TranscriptionFailure } from '../../shared/types';
import { app } from 'electron';
import { isElectronTestHarnessAllowed } from '../e2e/ElectronTestHarness';
export type { TranscriptionFailure, TranscriptionFailureCode } from '../../shared/types';

// =============================================================================
// Configuration
// =============================================================================

const WHISPER_RECOVERY_CHUNK_SECONDS = 30;
const MAX_POST_SESSION_LOCAL_RECOVERY_DURATION_SEC = 8 * 60;

function deterministicElectronLocalRecoveryAllowed(): boolean {
  return isElectronTestHarnessAllowed({
    requested:
      process.env.MARKUPRX_E2E === '1'
      && process.env.MARKUPRX_E2E_LOCAL_TRANSCRIPTION_RECOVERY === '1',
    isPackaged: app.isPackaged,
  });
}

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
 * Read the OpenAI API key from secure storage.
 */
async function getOpenAIApiKey(): Promise<string | null> {
  try {
    const settings = getSettingsManager();
    const apiKey = await settings.getApiKey('openai');
    const normalized = apiKey?.trim();
    return normalized && normalized.length > 0 ? normalized : null;
  } catch {
    console.warn('[TranscriptionRecovery] Failed to read the optional OpenAI fallback key.');
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
          throw new Error(`OpenAI transcription failed (HTTP ${response.status})`);
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
      lastError = error instanceof Error && error.name === 'AbortError'
        ? 'request timed out'
        : 'request failed after retries';
      console.warn(
        `[TranscriptionRecovery] OpenAI recovery attempt ${attempt}/${maxAttempts} failed.`,
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
    } catch {
      lastError = 'local model failed after retries';
      console.warn(
        `[TranscriptionRecovery] Whisper recovery attempt ${attempt}/${maxAttempts} failed.`,
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
 * Attempts local Whisper first. A saved OpenAI key is read only after local
 * recovery is unavailable or unsuccessful and encoded audio can be sent.
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
  const useDeterministicElectronLocalRecovery = deterministicElectronLocalRecoveryAllowed();
  const dependencies: TranscriptionRecoveryDependencies = {
    getOpenAIApiKey,
    recoverWithOpenAI,
    recoverWithWhisper: useDeterministicElectronLocalRecovery
      ? async (_audioSamples, startTime) => ({
          events: [{
            text: 'Local recovery stayed on this device.',
            isFinal: true,
            confidence: 0.99,
            timestamp: startTime,
            tier: 'whisper',
          }],
          outcome: 'success',
        })
      : recoverWithWhisper,
    isLocalModelAvailable: useDeterministicElectronLocalRecovery
      ? () => true
      : () => whisperService.isModelAvailable(),
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

  let localAttempt: RecoveryAttempt | undefined;
  let localModelAvailable = false;

  // Local raw PCM never leaves the device and is always the first strategy.
  if (hasPcmAudio && audioData.capturedAudioBuffer) {
    try {
      localModelAvailable = dependencies.isLocalModelAvailable();
    } catch {
      localAttempt = {
        events: [],
        outcome: 'provider-error',
        error: 'local model availability check failed',
      };
    }

    if (localModelAvailable) {
      try {
        const byteLength = audioData.capturedAudioBuffer.byteLength;
        const bytesPerSample = Float32Array.BYTES_PER_ELEMENT;
        if (byteLength % bytesPerSample !== 0) {
          localAttempt = {
            events: [],
            outcome: 'provider-error',
            error: 'captured PCM audio was malformed',
          };
        } else if (byteLength > MAX_POST_SESSION_LOCAL_RECOVERY_DURATION_SEC * 16000 * bytesPerSample) {
          localAttempt = {
            events: [],
            outcome: 'provider-error',
            error: `session is too long for local recovery (${Math.round(byteLength / bytesPerSample / 16000)}s)`,
          };
        } else {
          // Copy into an aligned buffer. Node Buffer slices can otherwise have
          // a byteOffset that is invalid for a Float32Array view.
          const alignedBytes = Uint8Array.from(audioData.capturedAudioBuffer);
          const audioSamples = new Float32Array(alignedBytes.buffer);
          localAttempt = await dependencies.recoverWithWhisper(audioSamples, sessionStartSec, 3);
        }
      } catch {
        localAttempt = {
          events: [],
          outcome: 'provider-error',
          error: 'local recovery failed',
        };
      }
      if (localAttempt?.events.length) {
        return { events: localAttempt.events };
      }
    }
  }

  // Cloud is an opt-in fallback: defer even reading the key until local has
  // failed or could not run, and only when an encoded asset is available.
  let openAiAttempt: RecoveryAttempt | undefined;
  let openAiApiKey: string | null = null;
  if (hasEncodedAudio && audioData.capturedAudioAsset) {
    try {
      openAiApiKey = await dependencies.getOpenAIApiKey();
    } catch {
      openAiAttempt = {
        events: [],
        outcome: 'provider-error',
        error: 'credential lookup failed',
      };
    }
    if (openAiApiKey) {
      try {
        openAiAttempt = await dependencies.recoverWithOpenAI(
          audioData.capturedAudioAsset,
          sessionStartSec,
          openAiApiKey,
          2,
        );
      } catch {
        openAiAttempt = {
          events: [],
          outcome: 'provider-error',
          error: 'request failed',
        };
      }
      if (openAiAttempt.events.length > 0) {
        return { events: openAiAttempt.events };
      }
    }
  }

  if (openAiAttempt?.outcome === 'no-speech'
    || (!openAiAttempt && localAttempt?.outcome === 'no-speech')) {
    return {
      events: [],
      failure: {
        code: 'no-speech',
        message: 'No speech was detected in the recorded narration.',
      },
    };
  }

  if (localAttempt?.outcome === 'provider-error' && openAiAttempt?.outcome === 'provider-error') {
    return {
      events: [],
      failure: {
        code: 'openai-failed',
        message:
          `Local Whisper transcription failed: ${localAttempt.error || 'local model failed'}. `
          + `OpenAI fallback failed: ${openAiAttempt.error || 'request failed'}`,
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

  if (localAttempt?.outcome === 'provider-error') {
    return {
      events: [],
      failure: {
        code: 'whisper-failed',
        message: `Local Whisper transcription failed: ${localAttempt.error || 'local model failed'}`,
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
