import { describe, expect, it } from 'vitest';
import { selectFrameMomentRequests } from '../../src/main/pipeline/FrameExtractor';
import type { KeyMoment } from '../../src/main/pipeline/TranscriptAnalyzer';

describe('marked frame request selection', () => {
  it('keeps separate marked IDs through close timestamps and caps only ordinary frames', () => {
    const marked: KeyMoment[] = Array.from({ length: 25 }, (_, index) => ({
      timestamp: 5 + index * 0.02,
      reason: `Marked ${index + 1}`,
      confidence: 1,
      markedIssueId: `marked-issue-${String(index + 1).padStart(3, '0')}`,
    }));
    const ordinary: KeyMoment[] = Array.from({ length: 40 }, (_, index) => ({
      timestamp: 10 + index,
      reason: `Ordinary ${index + 1}`,
      confidence: 0.5,
    }));

    const selected = selectFrameMomentRequests([...ordinary, ...marked], 60, 20);

    expect(selected.filter((moment) => moment.markedIssueId)).toHaveLength(25);
    expect(selected.filter((moment) => !moment.markedIssueId).length).toBeLessThanOrEqual(20);
    expect(new Set(selected.flatMap((moment) => moment.markedIssueId ?? []))).toEqual(
      new Set(marked.map((moment) => moment.markedIssueId)),
    );
  });
});
