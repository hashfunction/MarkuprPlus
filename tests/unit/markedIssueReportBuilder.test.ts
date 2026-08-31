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

  it('places matched marked screenshots inside AI feedback items and preserves unmatched evidence', () => {
    const issues: MarkedIssuePayload[] = [{
      ...issue(1, VIDEO_START + 30_000, VIDEO_START + 44_000, 'screenshots/marked-issue-001.png'),
      comment: 'This button needs to take me to the top of the page.',
      transcriptionStatus: 'available',
    }, {
      ...issue(2, VIDEO_START + 190_000, VIDEO_START + 219_000, 'screenshots/marked-issue-002.png'),
      comment: 'The cost is not clear if it is included. Clarify what the initial term is.',
      transcriptionStatus: 'available',
    }, {
      ...issue(3, VIDEO_START + 240_000, VIDEO_START + 263_000, 'screenshots/marked-issue-003.png'),
      transcriptionStatus: 'unavailable',
      transcriptionWarning: 'No narration was associated with this marked issue.',
    }, {
      ...issue(4, VIDEO_START + 80_000, VIDEO_START + 94_000, 'screenshots/marked-issue-004.png'),
      comment: 'Unrelated narration that was not identified as feedback.',
      transcriptionStatus: 'available',
    }];
    const base = [
      '# Report',
      '',
      '> AI-analyzed by Codex CLI | Duration: 4:30 | 4 screenshots | 4 items identified',
      '',
      '## High Priority',
      '',
      '### FB-001: Clarify whether the cost is included',
      '> "The cost is not clear if it is included."',
      '',
      '- **Timestamp:** 03:19',
      '',
      '---',
      '',
      '### FB-002: Define the initial term',
      '> "Clarify what the initial term is."',
      '',
      '- **Timestamp:** 03:30',
      '',
      '---',
      '',
      '## Improvements Needed',
      '',
      '### FB-003: Make the button return to the page top',
      '> "This button should take me to the top of the page."',
      '',
      '- **Timestamp:** 00:30',
      '',
      '---',
      '',
      '## Suggestions',
      '',
      '### FB-004: Add static to the description',
      '> "Add the word static."',
      '',
      '- **Timestamp:** 04:00',
      '',
      '---',
      '',
      '## Session Info',
      '',
      'Details',
      '',
    ].join('\n');

    const once = insertMarkedIssuesSection(base, issues, './screenshots');
    const twice = insertMarkedIssuesSection(once, issues, './screenshots');
    const firstIssue = once.slice(
      once.indexOf('### FB-001:'),
      once.indexOf('### FB-002:'),
    );
    const secondIssue = once.slice(
      once.indexOf('### FB-002:'),
      once.indexOf('## Improvements Needed'),
    );
    const thirdIssue = once.slice(
      once.indexOf('### FB-003:'),
      once.indexOf('## Suggestions'),
    );
    const fourthIssue = once.slice(
      once.indexOf('### FB-004:'),
      once.indexOf('## Session Info'),
    );
    const unmatched = once.slice(once.indexOf('## Unmatched Marked Evidence'));

    expect(twice).toBe(once);
    expect(firstIssue).toContain('![Marked issue MX-002](./screenshots/marked-issue-002.png)');
    expect(secondIssue).toContain('![Marked issue MX-002](./screenshots/marked-issue-002.png)');
    expect(thirdIssue).toContain('![Marked issue MX-001](./screenshots/marked-issue-001.png)');
    expect(fourthIssue).toContain('![Marked issue MX-003](./screenshots/marked-issue-003.png)');
    expect(once.match(/marked-issue-002\.png/g)).toHaveLength(2);
    expect(once).not.toContain('## Marked Issues');
    expect(unmatched).toContain('### MX-004');
    expect(unmatched).toContain('marked-issue-004.png');
    expect(unmatched).not.toContain('### MX-001');
    expect(unmatched).not.toContain('### MX-002');
    expect(unmatched).not.toContain('### MX-003');
  });

  it('preserves ambiguous or unrelated evidence instead of guessing an inline match', () => {
    const issues: MarkedIssuePayload[] = [{
      ...issue(1, VIDEO_START + 50_000, VIDEO_START + 60_000, 'screenshots/marked-issue-001.png'),
      comment: 'Change the heading color.',
      transcriptionStatus: 'available',
    }, {
      ...issue(2, VIDEO_START + 55_000, VIDEO_START + 65_000, 'screenshots/marked-issue-002.png'),
      comment: 'Change the heading color.',
      transcriptionStatus: 'available',
    }, {
      ...issue(3, VIDEO_START + 115_000, VIDEO_START + 120_000, 'screenshots/marked-issue-003.png'),
      transcriptionStatus: 'unavailable',
    }, {
      ...issue(4, VIDEO_START + 119_000, VIDEO_START + 124_000, 'screenshots/marked-issue-004.png'),
      transcriptionStatus: 'unavailable',
    }, {
      ...issue(5, VIDEO_START + 175_000, VIDEO_START + 180_000, 'screenshots/marked-issue-005.png'),
      comment: 'This narration is unrelated.',
      transcriptionStatus: 'available',
    }];
    const base = [
      '# Report',
      '',
      '> AI-analyzed by Codex CLI | Duration: 3:00 | 5 screenshots | 3 items identified',
      '',
      '## Improvements Needed',
      '',
      '### FB-001: Heading color',
      '> "Change the heading color."',
      '',
      '- **Timestamp:** 01:00',
      '',
      '### FB-002: Narration-free mark',
      '> "Add supporting evidence."',
      '',
      '- **Timestamp:** 02:02',
      '',
      '### FB-003: Unrelated nearby narration',
      '> "Fix the footer spacing."',
      '',
      '- **Timestamp:** 03:00',
      '',
      '## Session Info',
      '',
    ].join('\n');

    const report = insertMarkedIssuesSection(base, issues, './screenshots');
    const feedback = report.slice(0, report.indexOf('## Unmatched Marked Evidence'));
    const unmatched = report.slice(report.indexOf('## Unmatched Marked Evidence'));

    expect(feedback).not.toContain('marked-issue-001.png');
    expect(feedback).not.toContain('marked-issue-002.png');
    expect(feedback).not.toContain('marked-issue-003.png');
    expect(feedback).not.toContain('marked-issue-004.png');
    expect(feedback).not.toContain('marked-issue-005.png');
    expect(unmatched.match(/^### MX-\d{3}$/gm)).toHaveLength(5);
  });

  it('uses an unambiguous timestamp fallback beyond 99 minutes', () => {
    const marked = {
      ...issue(1, VIDEO_START + 6_000_000, VIDEO_START + 6_005_000, 'screenshots/marked-issue-001.png'),
      fallbackVideoTimestamp: 6_005,
      transcriptionStatus: 'unavailable' as const,
    };
    const base = [
      '# Report',
      '',
      '> AI-analyzed by Codex CLI | Duration: 100:10 | 1 screenshots | 1 items identified',
      '',
      '## Improvements Needed',
      '',
      '### FB-001: Long-session issue',
      '> "Add supporting evidence."',
      '',
      '- **Timestamp:** 100:05',
      '',
      '## Session Info',
      '',
    ].join('\n');

    const report = insertMarkedIssuesSection(base, [marked], './screenshots');

    expect(report).toContain('![Marked issue MX-001](./screenshots/marked-issue-001.png)');
    expect(report).not.toContain('## Unmatched Marked Evidence');
  });
});
