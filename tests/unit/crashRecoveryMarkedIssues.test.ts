import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const memory = new Map<string, unknown>();

vi.mock('electron-store', () => ({
  default: class MemoryStore {
    get(key: string, defaultValue?: unknown): unknown {
      return memory.has(key) ? memory.get(key) : defaultValue;
    }
    set(key: string, value: unknown): void { memory.set(key, structuredClone(value)); }
    delete(key: string): void { memory.delete(key); }
  },
}));

import { CrashRecoveryManager, type RecoverableSession } from '../../src/main/CrashRecovery';
import type { MarkedIssuePayload } from '../../src/shared/types';

function issue(): MarkedIssuePayload {
  return {
    id: 'marked-issue-001', ordinal: 1,
    startedAt: 100, markedAt: 150, completedAt: 200,
    strokeIds: ['one'], tools: ['circle'], colors: ['#0a84ff'],
    fallbackVideoTimestamp: 0.15,
    transcriptionStatus: 'pending', snapshotRevision: 1, transcriptSegmentIds: [],
  };
}

function session(): RecoverableSession {
  return {
    id: '123e4567-e89b-42d3-a456-426614174000',
    startTime: 100,
    lastSaveTime: 200,
    feedbackItems: [],
    transcriptionBuffer: '',
    sourceId: 'screen:0:0',
    sourceName: 'Primary',
    screenshotCount: 0,
    markedIssues: [],
    metadata: { appVersion: '3.0.0', platform: 'darwin', sessionDurationMs: 0 },
  };
}

describe('CrashRecovery marked issues', () => {
  let manager: CrashRecoveryManager;

  beforeEach(() => {
    vi.useFakeTimers();
    memory.clear();
    memory.set('settings', {
      enableAutoSave: true,
      autoSaveIntervalMs: 5_000,
      enableCrashReporting: false,
      maxCrashLogs: 50,
    });
    manager = new CrashRecoveryManager();
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
  });

  it('round-trips committed and pending marked state defensively through autosave', () => {
    manager.startTracking(session());
    const issues = [issue()];
    const accumulator = {
      sessionId: session().id,
      issues,
      active: null,
      nextOrdinal: 2,
      nextRevision: 2,
    };

    manager.updateSession({
      markedIssues: issues,
      markedIssueAccumulator: accumulator,
      screenshotCount: 1,
    });
    issues[0].strokeIds.push('external');
    vi.advanceTimersByTime(5_000);
    const recovered = manager.getIncompleteSession()!;
    recovered.markedIssues![0].strokeIds.push('read-mutation');

    expect(manager.getIncompleteSession()).toMatchObject({
      screenshotCount: 1,
      markedIssues: [{ id: 'marked-issue-001', strokeIds: ['one'] }],
      markedIssueAccumulator: { nextOrdinal: 2, nextRevision: 2 },
    });
  });
});
