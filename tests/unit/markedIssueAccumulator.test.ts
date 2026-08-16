import { describe, expect, it } from 'vitest';
import type { AnnotationEvent } from '../../src/shared/types';
import {
  MarkedIssueAccumulator,
  type MarkedIssueAccumulatorSnapshot,
} from '../../src/main/capture/MarkedIssueAccumulator';

const SESSION_ID = 'session-1';

function start(
  strokeId: string,
  tool: 'freehand' | 'circle' | 'highlight' = 'freehand',
  color: '#ff3b30' | '#ffcc00' | '#34c759' | '#0a84ff' = '#ff3b30',
): AnnotationEvent {
  return {
    type: 'stroke-start',
    sessionId: SESSION_ID,
    stroke: {
      id: strokeId,
      tool,
      color,
      width: 0.008,
      points: [{ x: 0.2, y: 0.3 }],
    },
  };
}

function end(strokeId: string): AnnotationEvent {
  return { type: 'stroke-end', sessionId: SESSION_ID, strokeId };
}

function completeStroke(
  accumulator: MarkedIssueAccumulator,
  strokeId: string,
  startedAt: number,
  endedAt: number,
  tool: 'freehand' | 'circle' | 'highlight' = 'freehand',
  color: '#ff3b30' | '#ffcc00' | '#34c759' | '#0a84ff' = '#ff3b30',
): void {
  expect(accumulator.consume(start(strokeId, tool, color), startedAt).accepted).toBe(true);
  expect(accumulator.consume(end(strokeId), endedAt).accepted).toBe(true);
}

describe('MarkedIssueAccumulator', () => {
  it('groups every completed stroke before an ordinary click into one issue', () => {
    const accumulator = new MarkedIssueAccumulator(SESSION_ID);
    completeStroke(accumulator, 'a', 1_000, 1_200, 'freehand', '#ff3b30');
    completeStroke(accumulator, 'b', 1_500, 1_700, 'circle', '#ffcc00');

    expect(accumulator.releaseModifier(1_710, 500)).toEqual({
      sessionId: SESSION_ID,
      revision: 1,
      requestedAt: 1_710,
    });
    expect(accumulator.commit(2_000)).toEqual({
      id: 'marked-issue-001',
      ordinal: 1,
      startedAt: 1_000,
      markedAt: 1_700,
      completedAt: 2_000,
      strokeIds: ['a', 'b'],
      tools: ['freehand', 'circle'],
      colors: ['#ff3b30', '#ffcc00'],
      fallbackVideoTimestamp: 1.2,
      transcriptionStatus: 'pending',
      snapshotRevision: 1,
      transcriptSegmentIds: [],
    });
    expect(accumulator.commit(2_100)).toBeNull();
  });

  it('starts a new sequential issue after the previous ordinary click', () => {
    const accumulator = new MarkedIssueAccumulator(SESSION_ID);
    completeStroke(accumulator, 'first', 100, 200);
    accumulator.releaseModifier(210, 0);
    expect(accumulator.commit(250)?.id).toBe('marked-issue-001');

    completeStroke(accumulator, 'second', 300, 400, 'highlight', '#34c759');
    accumulator.releaseModifier(410, 0);
    const second = accumulator.commit(450);

    expect(second).toMatchObject({
      id: 'marked-issue-002',
      ordinal: 2,
      strokeIds: ['second'],
      tools: ['highlight'],
      colors: ['#34c759'],
    });
    expect(accumulator.getIssues()).toHaveLength(2);
  });

  it('does not create an issue from modifier presses or ordinary clicks without completed marks', () => {
    const accumulator = new MarkedIssueAccumulator(SESSION_ID);

    expect(accumulator.releaseModifier(100, 0)).toBeNull();
    expect(accumulator.commit(120)).toBeNull();
    accumulator.consume(start('unfinished'), 130);
    expect(accumulator.releaseModifier(140, 0)).toBeNull();
    expect(accumulator.commit(150)).toBeNull();
  });

  it('keeps modifier releases idempotent until the marks change', () => {
    const accumulator = new MarkedIssueAccumulator(SESSION_ID);
    completeStroke(accumulator, 'a', 1_000, 1_100);

    expect(accumulator.releaseModifier(1_110, 500)?.revision).toBe(1);
    expect(accumulator.releaseModifier(1_120, 500)).toBeNull();
    completeStroke(accumulator, 'b', 1_200, 1_300);
    expect(accumulator.releaseModifier(1_310, 500)?.revision).toBe(2);
    expect(accumulator.commit(1_400)?.snapshotRevision).toBe(2);
  });

  it('applies undo and clear to the pending issue without altering committed issues', () => {
    const accumulator = new MarkedIssueAccumulator(SESSION_ID);
    completeStroke(accumulator, 'kept', 100, 150);
    completeStroke(accumulator, 'undone', 160, 200);
    expect(accumulator.consume({ type: 'undo', sessionId: SESSION_ID }, 210).accepted).toBe(true);
    accumulator.releaseModifier(220, 0);
    expect(accumulator.commit(230)?.strokeIds).toEqual(['kept']);

    completeStroke(accumulator, 'cleared', 300, 350);
    expect(accumulator.consume({ type: 'clear', sessionId: SESSION_ID }, 360).accepted).toBe(true);
    expect(accumulator.commit(370)).toBeNull();
    expect(accumulator.getIssues().map((issue) => issue.strokeIds)).toEqual([['kept']]);
  });

  it('rejects mismatched, duplicate, and out-of-order stroke events', () => {
    const accumulator = new MarkedIssueAccumulator(SESSION_ID);

    expect(accumulator.consume({ ...start('wrong'), sessionId: 'session-2' }, 100).accepted).toBe(false);
    expect(accumulator.consume(end('missing'), 110).accepted).toBe(false);
    expect(accumulator.consume(start('a'), 120).accepted).toBe(true);
    expect(accumulator.consume(start('b'), 130).accepted).toBe(false);
    expect(accumulator.consume(end('b'), 140).accepted).toBe(false);
    expect(accumulator.consume(end('a'), 150).accepted).toBe(true);
    expect(accumulator.consume(end('a'), 160).accepted).toBe(false);
  });

  it('enforces the per-issue stroke cap without truncating accepted strokes', () => {
    const accumulator = new MarkedIssueAccumulator(SESSION_ID);
    for (let index = 0; index < 100; index += 1) {
      completeStroke(accumulator, `stroke-${index}`, index * 2, index * 2 + 1);
    }

    expect(accumulator.consume(start('overflow'), 250)).toEqual({
      accepted: false,
      limitReached: 'strokes',
    });
    accumulator.releaseModifier(260, 0);
    expect(accumulator.commit(270)?.strokeIds).toHaveLength(100);
  });

  it('enforces the session issue cap without merging or discarding accepted issues', () => {
    const accumulator = new MarkedIssueAccumulator(SESSION_ID);
    for (let index = 0; index < 200; index += 1) {
      completeStroke(accumulator, `stroke-${index}`, index * 10, index * 10 + 1);
      accumulator.releaseModifier(index * 10 + 2, 0);
      expect(accumulator.commit(index * 10 + 3)).not.toBeNull();
    }

    expect(accumulator.consume(start('overflow'), 3_000)).toEqual({
      accepted: false,
      limitReached: 'issues',
    });
    expect(accumulator.getIssues()).toHaveLength(200);
    expect(accumulator.getIssues()[199].id).toBe('marked-issue-200');
  });

  it('finalizes a pending issue once when recording stops', () => {
    const accumulator = new MarkedIssueAccumulator(SESSION_ID);
    completeStroke(accumulator, 'last', 500, 600);
    accumulator.releaseModifier(610, 100);

    expect(accumulator.finalize(700)?.id).toBe('marked-issue-001');
    expect(accumulator.finalize(710)).toBeNull();
  });

  it('round-trips committed and pending state through a defensive crash snapshot', () => {
    const accumulator = new MarkedIssueAccumulator(SESSION_ID);
    completeStroke(accumulator, 'committed', 100, 150);
    accumulator.releaseModifier(160, 0);
    accumulator.commit(170);
    completeStroke(accumulator, 'pending', 200, 250, 'circle', '#0a84ff');
    accumulator.releaseModifier(260, 0);

    const snapshot = accumulator.snapshot();
    const restored = MarkedIssueAccumulator.restore(SESSION_ID, snapshot);
    snapshot.issues[0].strokeIds.push('mutated');

    expect(restored.getIssues()[0].strokeIds).toEqual(['committed']);
    expect(restored.commit(300)).toMatchObject({
      id: 'marked-issue-002',
      strokeIds: ['pending'],
      snapshotRevision: 2,
    });
  });

  it('rejects a crash snapshot owned by another session', () => {
    const snapshot: MarkedIssueAccumulatorSnapshot = {
      sessionId: 'session-2',
      issues: [],
      active: null,
      nextOrdinal: 1,
      nextRevision: 1,
    };

    expect(() => MarkedIssueAccumulator.restore(SESSION_ID, snapshot))
      .toThrow('Marked issue snapshot belongs to a different session.');
  });

  it('rejects malformed crash snapshots before they can bypass runtime bounds', () => {
    const accumulator = new MarkedIssueAccumulator(SESSION_ID);
    for (let index = 0; index < 100; index += 1) {
      completeStroke(accumulator, `stroke-${index}`, index * 2, index * 2 + 1);
    }
    const oversized = accumulator.snapshot();
    oversized.active!.strokes.push({
      ...oversized.active!.strokes[0],
      id: 'overflow',
    });

    expect(() => MarkedIssueAccumulator.restore(SESSION_ID, oversized))
      .toThrow('Marked issue snapshot is invalid.');

    const invalidTimestamp = accumulator.snapshot();
    invalidTimestamp.active!.startedAt = Number.NaN;
    expect(() => MarkedIssueAccumulator.restore(SESSION_ID, invalidTimestamp))
      .toThrow('Marked issue snapshot is invalid.');

    expect(() => MarkedIssueAccumulator.restore(
      SESSION_ID,
      null as unknown as MarkedIssueAccumulatorSnapshot,
    )).toThrow('Marked issue snapshot is invalid.');

    const coercedTimestamp = accumulator.snapshot();
    coercedTimestamp.active!.startedAt = '0' as unknown as number;
    expect(() => MarkedIssueAccumulator.restore(SESSION_ID, coercedTimestamp))
      .toThrow('Marked issue snapshot is invalid.');
  });

  it('rejects duplicate stroke identities and inconsistent crash counters', () => {
    const accumulator = new MarkedIssueAccumulator(SESSION_ID);
    completeStroke(accumulator, 'committed', 100, 150);
    accumulator.releaseModifier(160, 0);
    accumulator.commit(170);
    completeStroke(accumulator, 'pending', 200, 250);
    const duplicated = accumulator.snapshot();
    duplicated.active!.strokes[0].id = 'committed';

    expect(() => MarkedIssueAccumulator.restore(SESSION_ID, duplicated))
      .toThrow('Marked issue snapshot is invalid.');

    const inconsistentCounter = accumulator.snapshot();
    inconsistentCounter.nextOrdinal = 1;
    expect(() => MarkedIssueAccumulator.restore(SESSION_ID, inconsistentCounter))
      .toThrow('Marked issue snapshot is invalid.');
  });
});
