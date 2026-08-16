import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildRecoveredSession,
  saveRecoveredSession,
} from '../../src/main/recovery/RecoveredSessionWriter';
import type { RecoverableSession } from '../../src/main/CrashRecovery';
import type { Session } from '../../src/main/SessionController';
import type { MarkedIssuePayload } from '../../src/shared/types';

const cleanupDirectories: string[] = [];

function markedIssue(): MarkedIssuePayload {
  const startTime = 1_700_000_000_000;
  return {
    id: 'marked-issue-001',
    ordinal: 1,
    startedAt: startTime,
    markedAt: startTime + 200,
    completedAt: startTime + 3_000,
    strokeIds: ['stroke-1'],
    tools: ['circle'],
    colors: ['#ff3b30'],
    fallbackVideoTimestamp: 2,
    transcriptionStatus: 'pending',
    snapshotRevision: 1,
    transcriptSegmentIds: [],
  };
}

function recoverableSession(): RecoverableSession {
  const startTime = 1_700_000_000_000;
  return {
    id: '123e4567-e89b-42d3-a456-426614174000',
    startTime,
    lastSaveTime: startTime + 4_000,
    feedbackItems: [],
    transcriptionBuffer: '',
    transcriptEvents: [{
      text: 'The recovered checkout button needs more contrast.',
      isFinal: true,
      confidence: 0.99,
      timestamp: startTime / 1_000 + 1,
      tier: 'timer-only',
    }],
    sourceId: 'window:test:0',
    sourceName: 'Recovered Fixture',
    screenshotCount: 1,
    markedIssues: [markedIssue()],
    metadata: {
      appVersion: '3.0.0',
      platform: 'darwin',
      sessionDurationMs: 4_000,
    },
  };
}

afterEach(async () => {
  await Promise.all(cleanupDirectories.splice(0).map(async (directory) => {
    const { rm } = await import('node:fs/promises');
    await rm(directory, { recursive: true, force: true });
  }));
});

describe('RecoveredSessionWriter', () => {
  it('rebuilds final transcript events and associates them with committed marks', () => {
    const recovered = buildRecoveredSession(recoverableSession());

    expect(recovered.state).toBe('complete');
    expect(recovered.transcriptBuffer).toHaveLength(1);
    expect(recovered.metadata.markedIssues).toMatchObject([{
      id: 'marked-issue-001',
      comment: 'The recovered checkout button needs more contrast.',
      transcriptionStatus: 'available',
      transcriptSegmentIds: ['transcript-segment-0001'],
    }]);
  });

  it('promotes staged evidence and saves an idempotent recovered report', async () => {
    const root = await mkdtemp(join(tmpdir(), 'markuprx-recovered-session-'));
    cleanupDirectories.push(root);
    const sessionDir = join(root, 'session');
    const screenshotsDir = join(sessionDir, 'screenshots');
    await mkdir(screenshotsDir, { recursive: true });

    const savedSessions: unknown[] = [];
    const dependencies = {
      saveSession: async (session: Session, document: { content: string }) => {
        savedSessions.push(structuredClone(session));
        await writeFile(join(sessionDir, 'feedback-report.md'), document.content, 'utf8');
        await writeFile(join(sessionDir, 'feedback-summary.md'), '**Screenshots:** 0\n', 'utf8');
        await writeFile(join(sessionDir, 'metadata.json'), JSON.stringify({
          sessionId: session.id,
          itemCount: 1,
          screenshotCount: 0,
          markedIssues: session.metadata.markedIssues,
        }), 'utf8');
        return {
          success: true,
          sessionDir,
          markdownPath: join(sessionDir, 'feedback-report.md'),
          summaryPath: join(sessionDir, 'feedback-summary.md'),
          screenshotPaths: [],
          metadataPath: join(sessionDir, 'metadata.json'),
        };
      },
      promoteIssues: async (_sessionId: string, issues: MarkedIssuePayload[]) => {
        await writeFile(join(screenshotsDir, 'marked-issue-001.png'), Buffer.from('png'));
        return issues.map((issue) => ({
          ...issue,
          screenshotPath: 'screenshots/marked-issue-001.png',
        }));
      },
      cleanupSession: async () => undefined,
    };

    const result = await saveRecoveredSession(recoverableSession(), dependencies);
    const report = await readFile(result.reportPath, 'utf8');
    const metadata = JSON.parse(await readFile(join(sessionDir, 'metadata.json'), 'utf8')) as {
      screenshotCount: number;
      markedIssues: MarkedIssuePayload[];
    };

    expect(savedSessions).toHaveLength(1);
    expect(result.sessionDir).toBe(sessionDir);
    expect(report).toContain('The recovered checkout button needs more contrast.');
    expect(report).toContain('./screenshots/marked-issue-001.png');
    expect(report.match(/^## Marked Issues$/gm)).toHaveLength(1);
    expect(metadata.screenshotCount).toBe(1);
    expect(metadata.markedIssues[0].screenshotPath)
      .toBe('screenshots/marked-issue-001.png');
  });
});
