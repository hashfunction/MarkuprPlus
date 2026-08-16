import { describe, expect, it } from 'vitest';
import type { MarkedIssuePayload, TranscriptionFailure } from '../../src/shared/types';
import type { TranscriptSegment } from '../../src/main/pipeline/PostProcessor';
import {
  assignMarkedIssueComments,
  buildMarkedIssueFeedbackItems,
  insertMarkedIssuesSection,
} from '../../src/main/output/MarkedIssueReportBuilder';

const VIDEO_START = 1_000_000;

function issue(
  ordinal: number,
  startedAt: number,
  completedAt: number,
  screenshotPath?: string,
): MarkedIssuePayload {
  return {
    id: `marked-issue-${String(ordinal).padStart(3, '0')}`,
    ordinal,
    startedAt,
    markedAt: startedAt + 100,
    completedAt,
    strokeIds: [`stroke-${ordinal}`],
    tools: [ordinal === 1 ? 'circle' : 'freehand'],
    colors: [ordinal === 1 ? '#ff3b30' : '#007aff'],
    ...(screenshotPath ? { screenshotPath } : {}),
    fallbackVideoTimestamp: (completedAt - VIDEO_START) / 1_000,
    transcriptionStatus: 'pending',
    snapshotRevision: ordinal,
    transcriptSegmentIds: [],
  };
}

function segment(text: string, startTime: number, endTime: number): TranscriptSegment {
  return { text, startTime, endTime, confidence: 0.95 };
}

describe('MarkedIssueReportBuilder', () => {
  it('assigns comments within non-overlapping issue windows exactly once', () => {
    const issues = [
      issue(1, VIDEO_START + 10_000, VIDEO_START + 20_000),
      issue(2, VIDEO_START + 30_000, VIDEO_START + 40_000),
    ];
    const segments = [
      segment('The save button overlaps the footer.', 11, 13),
      segment('This dialog needs a cancel action.', 32, 34),
    ];

    const assigned = assignMarkedIssueComments(issues, segments, {
      videoStartTime: VIDEO_START,
      hasAudio: true,
    });

    expect(assigned[0].comment).toBe('The save button overlaps the footer.');
    expect(assigned[1].comment).toBe('This dialog needs a cancel action.');
    expect(assigned.map((item) => item.transcriptionStatus)).toEqual(['available', 'available']);
    expect(new Set(assigned.flatMap((item) => item.transcriptSegmentIds)).size).toBe(2);
  });

  it('uses the 30-second lookback and previous completion as hard midpoint boundaries', () => {
    const issues = [
      issue(1, VIDEO_START + 50_000, VIDEO_START + 55_000),
      issue(2, VIDEO_START + 70_000, VIDEO_START + 80_000),
    ];
    const assigned = assignMarkedIssueComments(issues, [
      segment('Too early.', 18, 20),
      segment('Belongs to the first issue.', 20, 22),
      segment('Still belongs to the first issue.', 53, 55),
      segment('Belongs to the second issue.', 72, 74),
    ], { videoStartTime: VIDEO_START, hasAudio: true });

    expect(assigned[0].comment).toBe(
      'Belongs to the first issue. Still belongs to the first issue.',
    );
    expect(assigned[1].comment).toBe('Belongs to the second issue.');
    expect(assigned.flatMap((item) => item.transcriptSegmentIds)).toHaveLength(3);
  });

  it('falls back to the nearest preceding unassigned segment ending within 12 seconds', () => {
    const marked = issue(1, VIDEO_START + 100_000, VIDEO_START + 105_000);
    const assigned = assignMarkedIssueComments([marked], [
      segment('Long segment ending shortly before the click.', 0, 94),
    ], { videoStartTime: VIDEO_START, hasAudio: true });

    expect(assigned[0].comment).toBe('Long segment ending shortly before the click.');
    expect(assigned[0].transcriptSegmentIds).toHaveLength(1);
  });

  it('marks absent narration and transcription failures explicitly without inventing comments', () => {
    const marked = issue(1, VIDEO_START + 10_000, VIDEO_START + 20_000);
    const noAudio = assignMarkedIssueComments([marked], [], {
      videoStartTime: VIDEO_START,
      hasAudio: false,
    });
    const failure: TranscriptionFailure = {
      code: 'whisper-failed',
      message: 'Local transcription could not be completed.',
    };
    const failed = assignMarkedIssueComments([marked], [], {
      videoStartTime: VIDEO_START,
      hasAudio: true,
      transcriptionFailure: failure,
    });

    expect(noAudio[0]).toMatchObject({ transcriptionStatus: 'unavailable' });
    expect(noAudio[0].comment).toBeUndefined();
    expect(failed[0]).toMatchObject({ transcriptionStatus: 'unavailable' });
    expect(failed[0].comment).toBeUndefined();
  });

  it('builds identity-bearing feedback items with their matching evidence path', () => {
    const marked = {
      ...issue(2, VIDEO_START + 30_000, VIDEO_START + 40_000, 'screenshots/marked-issue-002.png'),
      comment: 'The dialog needs a cancel action.',
      transcriptionStatus: 'available' as const,
    };

    expect(buildMarkedIssueFeedbackItems([marked])).toEqual([expect.objectContaining({
      id: 'marked-issue-002',
      transcription: 'The dialog needs a cancel action.',
      screenshots: [expect.objectContaining({
        id: 'marked-issue-002-evidence',
        imagePath: 'screenshots/marked-issue-002.png',
      })],
    })]);
  });

  it('inserts separate escaped Markdown issues before generic frames and is idempotent', () => {
    const issues: MarkedIssuePayload[] = [{
      ...issue(1, VIDEO_START + 10_000, VIDEO_START + 20_000, 'screenshots/marked-issue-001.png'),
      comment: 'Click <script>alert("x")</script> & keep [this] separate.',
      transcriptionStatus: 'available',
      captureContext: {
        recordedAt: VIDEO_START + 10_000,
        trigger: 'annotation',
        activeWindow: { appName: 'Browser <unsafe>', sourceName: 'Demo' },
        focusedElement: { source: 'renderer-dom', label: 'Save [button]' },
      },
    }, {
      ...issue(2, VIDEO_START + 30_000, VIDEO_START + 40_000),
      transcriptionStatus: 'unavailable',
      evidenceWarning: 'No marked screenshot could be recovered for this issue.',
    }];
    const base = '# Report\n\n## Auto-Extracted Screenshots\n\n![Frame](./screenshots/frame-001.png)\n';

    const once = insertMarkedIssuesSection(base, issues, './screenshots');
    const twice = insertMarkedIssuesSection(once, issues, './screenshots');

    expect(twice).toBe(once);
    expect(once.match(/^### MX-001$/gm)).toHaveLength(1);
    expect(once.match(/^### MX-002$/gm)).toHaveLength(1);
    expect(once.indexOf('## Marked Issues')).toBeLessThan(once.indexOf('## Auto-Extracted Screenshots'));
    expect(once).toContain('![Marked issue MX-001](./screenshots/marked-issue-001.png)');
    expect(once).toContain('&lt;script&gt;alert');
    expect(once).not.toContain('<script>');
    expect(once).toContain('Browser &lt;unsafe&gt;');
    expect(once).toContain('circle');
    expect(once).toContain('#ff3b30');
    expect(once).toContain('No narration was associated with this marked issue.');
    expect(once).toContain('No marked screenshot could be recovered for this issue.');
  });
});
