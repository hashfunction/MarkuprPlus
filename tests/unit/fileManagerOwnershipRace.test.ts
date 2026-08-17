import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FileManager,
  SESSION_OWNERSHIP_SENTINEL,
  type MarkdownDocument,
} from '../../src/main/output/FileManager';
import type { Session } from '../../src/main/SessionController';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })));
});

describe('FileManager session ownership', () => {
  it('creates distinct owned directories when identical saves race', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'markuprplus-file-race-'));
    temporaryRoots.push(outputRoot);
    const manager = new FileManager();
    manager.setOutputDirectory(outputRoot);
    const session: Session = {
      id: 'concurrent-session-id',
      startTime: new Date('2026-08-17T12:34:56.000Z').getTime(),
      endTime: new Date('2026-08-17T12:35:56.000Z').getTime(),
      state: 'complete',
      sourceId: 'screen:race',
      feedbackItems: [],
      transcriptBuffer: [],
      screenshotBuffer: [],
      metadata: {
        sourceId: 'screen:race',
        sourceName: 'Ownership Race',
      },
    };
    const document: MarkdownDocument = {
      content: '# Concurrent recovery fixture\n',
      metadata: { itemCount: 0, screenshotCount: 0, types: [] },
    };

    const results = await Promise.all([
      manager.saveSession(session, document),
      manager.saveSession(session, document),
    ]);

    expect(results.every((result) => result.success)).toBe(true);
    expect(new Set(results.map((result) => result.sessionDir)).size).toBe(2);
    for (const result of results) {
      const sentinel = JSON.parse(await readFile(
        join(result.sessionDir, SESSION_OWNERSHIP_SENTINEL),
        'utf8',
      )) as unknown;
      expect(sentinel).toEqual({ version: 1, sessionId: session.id });
    }
  });
});
