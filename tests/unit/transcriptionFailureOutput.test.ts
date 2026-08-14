import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendTranscriptionFailureToReport } from '../../src/main/output/MarkdownPatcher';
import { resolveSavedTranscriptionFailure } from '../../src/main/transcription/TranscriptionCompletion';
import { getOutputReadyStatus } from '../../src/renderer/contexts/outputReadyState';
import type { OutputReadyPayload, TranscriptionFailure } from '../../src/shared/types';

const failure: TranscriptionFailure = {
  code: 'not-configured',
  message: 'Add an OpenAI transcription key or download a local Whisper model, then record again.',
};

const outputPayload: OutputReadyPayload = {
  markdown: '# Feedback Report',
  sessionId: 'session-123',
  path: '/tmp/session-123/feedback-report.md',
  reportPath: '/tmp/session-123/feedback-report.md',
  sessionDir: '/tmp/session-123',
  recordingPath: '/tmp/session-123/session-recording.webm',
  audioPath: '/tmp/session-123/session-audio.webm',
};

describe('transcription failure output', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
  });

  it('adds one actionable transcription error notice to the saved report', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'markupr-report-'));
    temporaryDirectories.push(directory);
    const reportPath = join(directory, 'feedback-report.md');
    await writeFile(reportPath, '# Feedback Report\n', 'utf8');

    await appendTranscriptionFailureToReport(reportPath, failure);
    await appendTranscriptionFailureToReport(reportPath, failure);

    const markdown = await readFile(reportPath, 'utf8');
    expect(markdown.match(/## Transcription Error/g)).toHaveLength(1);
    expect(markdown).toContain('Your recording and audio were saved');
    expect(markdown).toContain(failure.message);
  });

  it('keeps saved output paths while selecting renderer error state', () => {
    const status = getOutputReadyStatus({
      ...outputPayload,
      transcriptionError: 'Narration could not be transcribed.',
    });

    expect(status).toEqual({
      state: 'error',
      errorMessage: 'Narration could not be transcribed.',
    });
  });

  it('selects complete state for a normal output payload', () => {
    expect(getOutputReadyStatus(outputPayload)).toEqual({
      state: 'complete',
      errorMessage: null,
    });
  });

  it('keeps saved output paths while surfacing a report-provider fallback', () => {
    expect(getOutputReadyStatus({
      ...outputPayload,
      analysisError: 'Ollama was unavailable; Local Rules report saved.',
    })).toEqual({
      state: 'error',
      errorMessage: 'Ollama was unavailable; Local Rules report saved.',
    });
  });

  it('gives transcription errors precedence when both stages fail', () => {
    expect(getOutputReadyStatus({
      ...outputPayload,
      transcriptionError: 'Narration could not be transcribed.',
      analysisError: 'Ollama was unavailable.',
    })).toEqual({
      state: 'error',
      errorMessage: 'Narration could not be transcribed.',
    });
  });

  it('uses the structured recovery failure for saved narrated audio', () => {
    expect(resolveSavedTranscriptionFailure({
      audioBytes: 42,
      transcriptTexts: [],
      recoveryFailure: failure,
    })).toEqual(failure);
  });

  it('uses a no-speech fallback when narrated audio has no recovery diagnostic', () => {
    expect(resolveSavedTranscriptionFailure({
      audioBytes: 42,
      transcriptTexts: [],
    })).toEqual({
      code: 'no-speech',
      message: 'No speech was detected in the recorded narration.',
    });
  });

  it('does not report a transcription failure when transcript text exists', () => {
    expect(resolveSavedTranscriptionFailure({
      audioBytes: 42,
      transcriptTexts: ['The footer overlaps the save button.'],
      recoveryFailure: failure,
    })).toBeUndefined();
  });

  it('does not report a transcription failure when no audio artifact was saved', () => {
    expect(resolveSavedTranscriptionFailure({
      audioBytes: 0,
      transcriptTexts: [],
      recoveryFailure: failure,
    })).toBeUndefined();
  });
});
