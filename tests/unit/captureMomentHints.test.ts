import { describe, expect, it } from 'vitest';
import type { CaptureContextSnapshot, MarkedIssuePayload } from '../../src/shared/types';
import {
  attachFallbackFramesToMarkedIssues,
  captureContextsToKeyMoments,
  nearestCaptureContext,
} from '../../src/main/pipeline/CaptureMomentHints';

const annotationContext: CaptureContextSnapshot = {
  recordedAt: 11_000,
  trigger: 'annotation',
  annotation: { strokeId: 'stroke-1', tool: 'circle', color: '#ff3b30' },
};

function markedIssue(
  ordinal: number,
  fallbackVideoTimestamp: number,
  screenshotPath?: string,
): MarkedIssuePayload {
  return {
    id: `marked-issue-${String(ordinal).padStart(3, '0')}`,
    ordinal,
    startedAt: 10_000 + ordinal,
    markedAt: 10_100 + ordinal,
    completedAt: 10_200 + ordinal,
    strokeIds: [`stroke-${ordinal}`],
    tools: ['circle'],
    colors: ['#ff3b30'],
    fallbackVideoTimestamp,
    ...(screenshotPath ? { screenshotPath } : {}),
    transcriptionStatus: 'pending',
    snapshotRevision: ordinal,
    transcriptSegmentIds: [],
  };
}

describe('CaptureMomentHints', () => {
  it('creates one fallback moment per marked issue rather than one per stroke cue', () => {
    const issues = [markedIssue(1, 1.2), markedIssue(2, 1.25)];
    expect(captureContextsToKeyMoments([annotationContext], 10_000, issues)).toEqual([{
      timestamp: 1.2,
      reason: 'Marked issue MX-001',
      confidence: 1,
      markedIssueId: 'marked-issue-001',
    }, {
      timestamp: 1.25,
      reason: 'Marked issue MX-002',
      confidence: 1,
      markedIssueId: 'marked-issue-002',
    }]);
  });

  it('ignores per-stroke contexts, direct screenshots, and malformed issue timestamps', () => {
    const contexts: CaptureContextSnapshot[] = [
      { recordedAt: 10_100, trigger: 'manual' },
      { ...annotationContext, recordedAt: Number.NaN },
      { ...annotationContext, recordedAt: 9_000 },
    ];

    expect(captureContextsToKeyMoments(contexts, 10_000, [
      markedIssue(1, Number.NaN),
      markedIssue(2, 2, 'screenshots/marked-issue-002.png'),
    ])).toEqual([]);
    expect(captureContextsToKeyMoments([annotationContext], Number.NaN, [markedIssue(1, 2)]))
      .toEqual([]);
  });

  it('matches extracted frames against video time rather than earlier session setup time', () => {
    const contexts: CaptureContextSnapshot[] = [
      annotationContext,
      { ...annotationContext, recordedAt: 14_000, annotation: { ...annotationContext.annotation!, strokeId: 'stroke-2' } },
    ];

    expect(nearestCaptureContext(1.15, 10_000, contexts, 500)?.annotation?.strokeId).toBe('stroke-1');
    expect(nearestCaptureContext(1.15, 8_000, contexts, 500)).toBeUndefined();
  });

  it('attaches fallback evidence by issue identity without replacing direct screenshots', () => {
    const direct = markedIssue(1, 1, 'screenshots/marked-issue-001.png');
    const fallback = markedIssue(2, 2);
    const missing = markedIssue(3, 3);

    expect(attachFallbackFramesToMarkedIssues([direct, fallback, missing], [{
      path: '/tmp/report/screenshots/marked-issue-002.png',
      markedIssueId: fallback.id,
    }])).toEqual([
      direct,
      {
        ...fallback,
        screenshotPath: 'screenshots/marked-issue-002.png',
      },
      {
        ...missing,
        evidenceWarning: 'No marked screenshot could be recovered for this issue.',
      },
    ]);
  });
});
