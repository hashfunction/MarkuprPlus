import { mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { MarkedIssuePayload } from '../../src/shared/types';
import { MarkedIssueArtifactStore } from '../../src/main/capture/MarkedIssueArtifactStore';

const SESSION_ID = '123e4567-e89b-42d3-a456-426614174000';
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'markuprx-marked-artifacts-'));
  temporaryRoots.push(root);
  return root;
}

function issue(ordinal: number, revision: number): MarkedIssuePayload {
  return {
    id: `marked-issue-${String(ordinal).padStart(3, '0')}`,
    ordinal,
    startedAt: ordinal * 100,
    markedAt: ordinal * 100 + 20,
    completedAt: ordinal * 100 + 40,
    strokeIds: [`stroke-${ordinal}`],
    tools: ['freehand'],
    colors: ['#ff3b30'],
    fallbackVideoTimestamp: ordinal,
    transcriptionStatus: 'pending',
    snapshotRevision: revision,
    transcriptSegmentIds: [],
  };
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('MarkedIssueArtifactStore', () => {
  it('stages a validated PNG atomically and replaces older uncommitted revisions', async () => {
    const root = await temporaryRoot();
    const store = new MarkedIssueArtifactStore(join(root, 'staging'));

    await store.stageCandidate(SESSION_ID, 1, PNG);
    await store.stageCandidate(SESSION_ID, 2, new Uint8Array([...PNG, 5]));

    const sessionFiles = await readdir(join(root, 'staging', SESSION_ID));
    expect(sessionFiles).toEqual(['candidate-2.png']);
    expect(new Uint8Array(await readFile(join(root, 'staging', SESSION_ID, 'candidate-2.png'))))
      .toEqual(new Uint8Array([...PNG, 5]));
    expect(sessionFiles.some((name) => name.endsWith('.part'))).toBe(false);
  });

  it('takes ownership of renderer bytes before asynchronous filesystem work', async () => {
    const root = await temporaryRoot();
    const store = new MarkedIssueArtifactStore(join(root, 'staging'));
    const mutable = new Uint8Array(PNG);

    const staging = store.stageCandidate(SESSION_ID, 1, mutable);
    mutable.fill(0);
    await staging;

    expect(new Uint8Array(await readFile(join(root, 'staging', SESSION_ID, 'candidate-1.png'))))
      .toEqual(PNG);
  });

  it('retains committed candidates while replacing only the active candidate', async () => {
    const root = await temporaryRoot();
    const store = new MarkedIssueArtifactStore(join(root, 'staging'));
    await store.stageCandidate(SESSION_ID, 1, PNG);
    store.markCommitted(SESSION_ID, 1, 1);
    await store.stageCandidate(SESSION_ID, 2, PNG);
    await store.stageCandidate(SESSION_ID, 3, PNG);

    expect(await readdir(join(root, 'staging', SESSION_ID))).toEqual([
      'candidate-1.png',
      'candidate-3.png',
    ]);
  });

  it('honors a commit reservation made before a delayed candidate is staged', async () => {
    const root = await temporaryRoot();
    const store = new MarkedIssueArtifactStore(join(root, 'staging'));
    store.markCommitted(SESSION_ID, 4, 1);
    await store.stageCandidate(SESSION_ID, 4, PNG);
    await store.stageCandidate(SESSION_ID, 5, PNG);

    expect(await readdir(join(root, 'staging', SESSION_ID))).toEqual([
      'candidate-4.png',
      'candidate-5.png',
    ]);
  });

  it('rejects traversal, invalid revisions, malformed PNGs, and oversized bytes', async () => {
    const root = await temporaryRoot();
    const store = new MarkedIssueArtifactStore(join(root, 'staging'));

    await expect(store.stageCandidate('../escape', 1, PNG)).rejects.toThrow('session');
    await expect(store.stageCandidate(SESSION_ID, 0, PNG)).rejects.toThrow('revision');
    await expect(store.stageCandidate(SESSION_ID, 1, new Uint8Array([1, 2, 3])))
      .rejects.toThrow('PNG');
    await expect(store.stageCandidate(
      SESSION_ID,
      1,
      new Uint8Array(15 * 1024 * 1024 + 1),
    )).rejects.toThrow('size limit');
    await expect(stat(join(root, 'escape'))).rejects.toThrow();
  });

  it('promotes committed candidates to stable sequential screenshot files', async () => {
    const root = await temporaryRoot();
    const staging = join(root, 'staging');
    const sessionDir = join(root, 'output', SESSION_ID);
    const store = new MarkedIssueArtifactStore(staging);
    await store.stageCandidate(SESSION_ID, 2, PNG);
    store.markCommitted(SESSION_ID, 2, 1);
    await store.stageCandidate(SESSION_ID, 4, new Uint8Array([...PNG, 9]));
    store.markCommitted(SESSION_ID, 4, 2);

    const promoted = await store.promoteIssues(
      SESSION_ID,
      [issue(1, 2), issue(2, 4)],
      sessionDir,
    );

    expect(promoted.map((entry) => entry.screenshotPath)).toEqual([
      'screenshots/marked-issue-001.png',
      'screenshots/marked-issue-002.png',
    ]);
    expect(new Uint8Array(await readFile(join(sessionDir, promoted[1].screenshotPath!))))
      .toEqual(new Uint8Array([...PNG, 9]));
    await expect(stat(join(staging, SESSION_ID))).rejects.toThrow();
    expect(await readdir(join(sessionDir, 'screenshots'))).toEqual([
      'marked-issue-001.png',
      'marked-issue-002.png',
    ]);
  });

  it('leaves a missing candidate for video fallback without dropping the issue', async () => {
    const root = await temporaryRoot();
    const store = new MarkedIssueArtifactStore(join(root, 'staging'));

    const [promoted] = await store.promoteIssues(
      SESSION_ID,
      [issue(1, 99)],
      join(root, 'output', SESSION_ID),
    );

    expect(promoted).toMatchObject({
      id: 'marked-issue-001',
      fallbackVideoTimestamp: 1,
      evidenceWarning: 'Direct marked screenshot unavailable; using recorded-video fallback.',
    });
    expect(promoted.screenshotPath).toBeUndefined();
  });

  it('cleans one session or every stale staging session idempotently', async () => {
    const root = await temporaryRoot();
    const staging = join(root, 'staging');
    const store = new MarkedIssueArtifactStore(staging);
    const secondSession = '223e4567-e89b-42d3-a456-426614174000';
    await store.stageCandidate(SESSION_ID, 1, PNG);
    await store.stageCandidate(secondSession, 1, PNG);

    await store.cleanupSession(SESSION_ID);
    await store.cleanupSession(SESSION_ID);
    expect(await readdir(staging)).toEqual([secondSession]);

    await store.cleanupStaleSessions();
    await expect(stat(staging)).resolves.toBeDefined();
    expect(await readdir(staging)).toEqual([]);
  });

  it('preserves an explicitly recoverable session during startup cleanup', async () => {
    const root = await temporaryRoot();
    const staging = join(root, 'staging');
    const store = new MarkedIssueArtifactStore(staging);
    const staleSession = '223e4567-e89b-42d3-a456-426614174000';
    await store.stageCandidate(SESSION_ID, 1, PNG);
    await store.stageCandidate(staleSession, 1, PNG);

    await store.cleanupStaleSessions([SESSION_ID]);

    expect(await readdir(staging)).toEqual([SESSION_ID]);
    expect(await readdir(join(staging, SESSION_ID))).toEqual(['candidate-1.png']);
  });
});
