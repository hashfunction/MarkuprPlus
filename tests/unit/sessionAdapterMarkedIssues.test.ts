import { describe, expect, it } from 'vitest';
import type { Session } from '../../src/main/SessionController';
import {
  adaptSessionForMarkdown,
  adaptSessionForReview,
} from '../../src/main/output/sessionAdapter';
import type { MarkedIssuePayload } from '../../src/shared/types';

const startTime = 1_700_000_000_000;

function issue(overrides: Partial<MarkedIssuePayload> = {}): MarkedIssuePayload {
  return {
    id: 'marked-issue-001',
    ordinal: 1,
    startedAt: startTime,
    markedAt: startTime + 400,
    completedAt: startTime + 2_500,
    strokeIds: ['stroke-1'],
    tools: ['circle'],
    colors: ['#ff3b30'],
    fallbackVideoTimestamp: 2,
    transcriptionStatus: 'available',
    snapshotRevision: 1,
    transcriptSegmentIds: ['transcript-segment-0001'],
    comment: 'The checkout button needs more contrast.',
    screenshotPath: 'screenshots/marked-issue-001.png',
    ...overrides,
  };
}

function session(): Session {
  return {
    id: '123e4567-e89b-42d3-a456-426614174000',
    startTime,
    endTime: startTime + 5_000,
    state: 'complete',
    sourceId: 'window:test:0',
    feedbackItems: [],
    transcriptBuffer: [
      {
        text: 'The checkout button needs more contrast.',
        isFinal: true,
        confidence: 0.99,
        timestamp: startTime / 1_000 + 1,
        tier: 'timer-only',
      },
      {
        text: 'This unrelated note should remain actionable.',
        isFinal: true,
        confidence: 0.98,
        timestamp: startTime / 1_000 + 4,
        tier: 'timer-only',
      },
    ],
    screenshotBuffer: [],
    metadata: {
      sourceId: 'window:test:0',
      sourceName: 'Adapter Fixture',
      sourceType: 'window',
      markedIssues: [issue()],
    },
  };
}

describe('session adapter marked issue identity', () => {
  it('does not duplicate transcript segments already claimed by a marked issue', () => {
    const adapted = adaptSessionForMarkdown(session());

    expect(adapted.feedbackItems).toHaveLength(1);
    expect(adapted.feedbackItems[0].transcription)
      .toBe('This unrelated note should remain actionable.');
    expect(adapted.metadata?.markedIssues).toEqual([issue()]);
  });

  it('exposes marked issues as individually editable review items', () => {
    const adapted = adaptSessionForReview(session());

    expect(adapted.feedbackItems).toHaveLength(2);
    expect(adapted.feedbackItems).toMatchObject([
      { transcription: 'This unrelated note should remain actionable.' },
      {
        id: 'marked-issue-001',
        transcription: 'The checkout button needs more contrast.',
        reviewItemKind: 'marked-issue',
        markedIssueOrdinal: 1,
        screenshots: [{ imagePath: 'screenshots/marked-issue-001.png' }],
      },
    ]);
  });
});
