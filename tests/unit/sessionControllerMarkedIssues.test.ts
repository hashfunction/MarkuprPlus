import { afterEach, describe, expect, it } from 'vitest';
import { SessionController, type Session } from '../../src/main/SessionController';
import type { MarkedIssuePayload } from '../../src/shared/types';

function markedIssue(ordinal: number): MarkedIssuePayload {
  return {
    id: `marked-issue-${String(ordinal).padStart(3, '0')}`,
    ordinal,
    startedAt: ordinal * 100,
    markedAt: ordinal * 100 + 10,
    completedAt: ordinal * 100 + 20,
    strokeIds: [`stroke-${ordinal}`],
    tools: ['freehand'],
    colors: ['#ff3b30'],
    fallbackVideoTimestamp: ordinal,
    transcriptionStatus: 'pending',
    snapshotRevision: ordinal,
    transcriptSegmentIds: [],
  };
}

function activeController(): SessionController {
  const controller = new SessionController();
  const session: Session = {
    id: '123e4567-e89b-42d3-a456-426614174000',
    startTime: 1_000,
    state: 'recording',
    sourceId: 'screen:0:0',
    feedbackItems: [],
    transcriptBuffer: [],
    screenshotBuffer: [],
    metadata: { sourceId: 'screen:0:0' },
  };
  Object.assign(controller, { session, state: 'recording', captureCount: 2 });
  return controller;
}

const controllers: SessionController[] = [];

afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.destroy());
});

describe('SessionController marked issues', () => {
  it('stores separate issues defensively and reports generic plus marked screenshot counts', () => {
    const controller = activeController();
    controllers.push(controller);
    const issues = [markedIssue(1), markedIssue(2)];

    expect(controller.setMarkedIssues(issues)).toBe(true);
    issues[0].strokeIds.push('external-mutation');
    const read = controller.getMarkedIssues();
    read[1].strokeIds.push('read-mutation');

    expect(controller.getMarkedIssues().map((issue) => issue.strokeIds)).toEqual([
      ['stroke-1'],
      ['stroke-2'],
    ]);
    expect(controller.getStatus().screenshotCount).toBe(4);
    expect(controller.getSession()?.metadata.markedIssues).toHaveLength(2);
  });

  it('replaces issue state idempotently and refuses writes without a session', () => {
    const controller = activeController();
    controllers.push(controller);

    controller.setMarkedIssues([markedIssue(1), markedIssue(2)]);
    controller.setMarkedIssues([markedIssue(1)]);
    expect(controller.getMarkedIssues()).toHaveLength(1);
    expect(controller.getStatus().screenshotCount).toBe(3);

    Object.assign(controller, { session: null, state: 'idle' });
    expect(controller.setMarkedIssues([markedIssue(1)])).toBe(false);
    expect(controller.getMarkedIssues()).toEqual([]);
  });
});
