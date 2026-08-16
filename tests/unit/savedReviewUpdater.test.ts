import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { updateSavedReviewSession } from '../../src/main/output/SavedReviewUpdater';
import type { MarkedIssuePayload, ReviewSession } from '../../src/shared/types';

const cleanupDirectories: string[] = [];

function markedIssue(): MarkedIssuePayload {
  return {
    id: 'marked-issue-001',
    ordinal: 1,
    startedAt: 1_700_000_000_000,
    markedAt: 1_700_000_000_500,
    completedAt: 1_700_000_002_000,
    strokeIds: ['stroke-1'],
    tools: ['circle'],
    colors: ['#ff3b30'],
    fallbackVideoTimestamp: 2,
    transcriptionStatus: 'available',
    snapshotRevision: 1,
    transcriptSegmentIds: ['transcript-segment-0001'],
    comment: 'Keep this marked comment.',
    screenshotPath: 'screenshots/marked-issue-001.png',
  };
}

function reviewSession(id: string): ReviewSession {
  return {
    id,
    startTime: 1_700_000_000_000,
    endTime: 1_700_000_005_000,
    feedbackItems: [{
      id: 'transcript-only-1',
      transcription: 'Edited checkout feedback.',
      timestamp: 1_700_000_001_000,
      screenshots: [],
      title: 'Checkout contrast',
      keywords: ['checkout', 'contrast'],
      category: 'Bug',
      severity: 'High',
    }],
    metadata: {
      os: 'darwin',
      sourceName: 'Review Fixture',
      sourceType: 'window',
    },
  };
}

async function fixture() {
  const outputRoot = await mkdtemp(join(tmpdir(), 'markuprx-review-output-'));
  cleanupDirectories.push(outputRoot);
  const sessionDir = join(outputRoot, 'review-fixture-20260816-000000');
  await mkdir(join(sessionDir, 'screenshots'), { recursive: true });
  const sessionId = '123e4567-e89b-42d3-a456-426614174000';
  await writeFile(join(sessionDir, 'feedback-report.md'), [
    '# Existing Feedback Report',
    '',
    'Old unedited checkout feedback.',
    '',
    '## Session Recording',
    '- [Open full recording](./session-recording.webm)',
    '',
    '## Session Audio',
    '- [Open narration audio](./session-audio.wav)',
    '',
    '## Auto-Extracted Screenshots',
    '![Frame](./screenshots/frame-001.png)',
    '',
    '## Transcription Error',
    '> The fallback transcript was incomplete.',
    '',
  ].join('\n'), 'utf8');
  await writeFile(join(sessionDir, 'feedback-summary.md'), '# Quick Summary\n', 'utf8');
  await writeFile(join(sessionDir, 'metadata.json'), JSON.stringify({
    sessionId,
    startTime: 1_700_000_000_000,
    endTime: 1_700_000_005_000,
    itemCount: 2,
    screenshotCount: 2,
    source: { id: 'window:test:0', name: 'Review Fixture' },
    markedIssues: [markedIssue()],
  }), 'utf8');
  return { outputRoot, sessionDir, sessionId };
}

afterEach(async () => {
  await Promise.all(cleanupDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe('SavedReviewUpdater', () => {
  it('updates the existing report while retaining marked and media evidence', async () => {
    const { outputRoot, sessionDir, sessionId } = await fixture();

    const result = await updateSavedReviewSession(
      reviewSession(sessionId),
      sessionDir,
      outputRoot,
    );
    const report = await readFile(join(sessionDir, 'feedback-report.md'), 'utf8');
    const summary = await readFile(join(sessionDir, 'feedback-summary.md'), 'utf8');
    const metadata = JSON.parse(await readFile(join(sessionDir, 'metadata.json'), 'utf8')) as {
      itemCount: number;
      screenshotCount: number;
      reviewFeedbackItems: ReviewSession['feedbackItems'];
      markedIssues: MarkedIssuePayload[];
    };

    expect(result).toEqual({
      success: true,
      path: join(sessionDir, 'feedback-report.md'),
    });
    expect(report).toContain('Edited checkout feedback.');
    expect(report).not.toContain('Old unedited checkout feedback.');
    expect(report).toContain('Keep this marked comment.');
    expect(report).toContain('./screenshots/marked-issue-001.png');
    expect(report).toContain('./session-recording.webm');
    expect(report).toContain('./session-audio.wav');
    expect(report).toContain('./screenshots/frame-001.png');
    expect(report).toContain('## Transcription Error');
    expect(summary).toContain('**Items:** 2');
    expect(summary).toContain('**Screenshots:** 2');
    expect(metadata.itemCount).toBe(2);
    expect(metadata.screenshotCount).toBe(2);
    expect(metadata.reviewFeedbackItems).toMatchObject([{
      transcription: 'Edited checkout feedback.',
      category: 'Bug',
      severity: 'High',
    }]);
    expect(metadata.markedIssues).toEqual([markedIssue()]);
  });

  it('rejects sibling-prefix traversal, session mismatches, and symlink escapes', async () => {
    const { outputRoot, sessionDir, sessionId } = await fixture();
    const sibling = `${outputRoot}-outside`;
    cleanupDirectories.push(sibling);
    await mkdir(sibling, { recursive: true });

    await expect(updateSavedReviewSession(reviewSession(sessionId), sibling, outputRoot))
      .rejects.toThrow('outside');
    await expect(updateSavedReviewSession(reviewSession('wrong-session'), sessionDir, outputRoot))
      .rejects.toThrow('does not match');

    const external = await mkdtemp(join(tmpdir(), 'markuprx-review-external-'));
    cleanupDirectories.push(external);
    const link = join(outputRoot, 'linked-session');
    await symlink(external, link);
    await expect(updateSavedReviewSession(reviewSession(sessionId), link, outputRoot))
      .rejects.toThrow('outside');
  });

  it('updates marked comments without counting their review rows twice', async () => {
    const { outputRoot, sessionDir, sessionId } = await fixture();
    const review = reviewSession(sessionId);
    review.feedbackItems.push({
      id: 'marked-issue-001',
      transcription: 'Edited marked checkout comment.',
      timestamp: 1_700_000_002_000,
      screenshots: [{
        id: 'marked-issue-001-evidence',
        timestamp: 1_700_000_000_500,
        imagePath: 'screenshots/marked-issue-001.png',
        width: 0,
        height: 0,
      }],
      category: 'UX Issue',
      severity: 'Medium',
      reviewItemKind: 'marked-issue',
      markedIssueOrdinal: 1,
    });

    await updateSavedReviewSession(review, sessionDir, outputRoot);
    const report = await readFile(join(sessionDir, 'feedback-report.md'), 'utf8');
    const metadata = JSON.parse(await readFile(join(sessionDir, 'metadata.json'), 'utf8')) as {
      itemCount: number;
      screenshotCount: number;
      markedIssues: MarkedIssuePayload[];
    };

    expect(report.match(/^### MX-001$/gm)).toHaveLength(1);
    expect(report).toContain('Edited marked checkout comment.');
    expect(report).not.toContain('Keep this marked comment.');
    expect(metadata.itemCount).toBe(2);
    expect(metadata.screenshotCount).toBe(2);
    expect(metadata.markedIssues[0].comment).toBe('Edited marked checkout comment.');
  });

  it('rejects a marked review row that is not backed by saved evidence', async () => {
    const { outputRoot, sessionDir, sessionId } = await fixture();
    const reportPath = join(sessionDir, 'feedback-report.md');
    const originalReport = await readFile(reportPath, 'utf8');
    const review = reviewSession(sessionId);
    review.feedbackItems = [{
      id: 'forged-marked-issue',
      transcription: 'This must not silently disappear.',
      timestamp: 1_700_000_002_000,
      screenshots: [],
      reviewItemKind: 'marked-issue',
      markedIssueOrdinal: 2,
    }];

    await expect(updateSavedReviewSession(review, sessionDir, outputRoot))
      .rejects.toThrow('does not match saved marked evidence');
    expect(await readFile(reportPath, 'utf8')).toBe(originalReport);
  });

  it('rejects duplicate review item identities before changing saved files', async () => {
    const { outputRoot, sessionDir, sessionId } = await fixture();
    const metadataPath = join(sessionDir, 'metadata.json');
    const originalMetadata = await readFile(metadataPath, 'utf8');
    const review = reviewSession(sessionId);
    review.feedbackItems.push({
      ...review.feedbackItems[0],
      transcription: 'A second row reused the same identity.',
    });

    await expect(updateSavedReviewSession(review, sessionDir, outputRoot))
      .rejects.toThrow('duplicate feedback identifier');
    expect(await readFile(metadataPath, 'utf8')).toBe(originalMetadata);
  });

  it('rejects a marked review row whose ordinal targets different evidence', async () => {
    const { outputRoot, sessionDir, sessionId } = await fixture();
    const review = reviewSession(sessionId);
    review.feedbackItems = [{
      id: 'marked-issue-001',
      transcription: 'Do not attach this to the wrong evidence.',
      timestamp: 1_700_000_002_000,
      screenshots: [],
      reviewItemKind: 'marked-issue',
      markedIssueOrdinal: 2,
    }];

    await expect(updateSavedReviewSession(review, sessionDir, outputRoot))
      .rejects.toThrow('ordinal does not match saved marked evidence');
  });

  it('rejects an ordinary row that reuses a saved marked-evidence identity', async () => {
    const { outputRoot, sessionDir, sessionId } = await fixture();
    const review = reviewSession(sessionId);
    review.feedbackItems[0].id = 'marked-issue-001';

    await expect(updateSavedReviewSession(review, sessionDir, outputRoot))
      .rejects.toThrow('identifier collides with saved marked evidence');
  });

  it.each([
    [
      'more than 200 feedback items',
      (review: ReviewSession) => {
        review.feedbackItems = Array.from({ length: 201 }, (_, index) => ({
          id: `item-${index}`,
          transcription: `Feedback ${index}`,
          timestamp: index,
          screenshots: [],
        }));
      },
      'feedback item count',
    ],
    [
      'an overlong transcription',
      (review: ReviewSession) => {
        review.feedbackItems[0].transcription = 'x'.repeat(20_001);
      },
      'feedback transcription',
    ],
    [
      'a negative item timestamp',
      (review: ReviewSession) => {
        review.feedbackItems[0].timestamp = -1;
      },
      'feedback timestamp',
    ],
    [
      'a non-finite session end time',
      (review: ReviewSession) => {
        review.endTime = Number.POSITIVE_INFINITY;
      },
      'end time',
    ],
    [
      'a non-finite screenshot timestamp',
      (review: ReviewSession) => {
        review.feedbackItems[0].screenshots = [{
          id: 'bad-screenshot',
          timestamp: Number.NaN,
          imagePath: 'screenshots/frame.png',
          width: 10,
          height: 10,
        }];
      },
      'screenshot timestamp',
    ],
  ])('rejects %s without mutating the report', async (_label, mutate, expectedError) => {
    const { outputRoot, sessionDir, sessionId } = await fixture();
    const reportPath = join(sessionDir, 'feedback-report.md');
    const originalReport = await readFile(reportPath, 'utf8');
    const review = reviewSession(sessionId);
    mutate(review);

    await expect(updateSavedReviewSession(review, sessionDir, outputRoot))
      .rejects.toThrow(expectedError);
    expect(await readFile(reportPath, 'utf8')).toBe(originalReport);
  });
});
