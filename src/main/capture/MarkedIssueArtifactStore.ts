import { randomUUID } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import {
  MAX_MARKED_SCREENSHOT_BYTES,
  type MarkedIssuePayload,
} from '../../shared/types';

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const CANDIDATE_PATTERN = /^candidate-(\d+)\.png$/;

function validateSessionId(sessionId: string): void {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error('Invalid marked screenshot session identifier.');
  }
}

function validateRevision(revision: number): void {
  if (!Number.isSafeInteger(revision) || revision <= 0) {
    throw new Error('Invalid marked screenshot revision.');
  }
}

function validateOrdinal(ordinal: number): void {
  if (!Number.isSafeInteger(ordinal) || ordinal <= 0 || ordinal > 200) {
    throw new Error('Invalid marked issue ordinal.');
  }
}

function validatePng(bytes: Uint8Array): void {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error('Marked screenshot bytes must be a Uint8Array.');
  }
  if (bytes.byteLength > MAX_MARKED_SCREENSHOT_BYTES) {
    throw new Error('Marked screenshot exceeds the size limit.');
  }
  if (bytes.byteLength < PNG_SIGNATURE.byteLength
    || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    throw new Error('Marked screenshot does not have a valid PNG signature.');
  }
}

async function replaceByRename(partPath: string, destinationPath: string): Promise<void> {
  try {
    await rename(partPath, destinationPath);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
    if (code !== 'EEXIST' && code !== 'EPERM') throw error;
    await rm(destinationPath, { force: true });
    await rename(partPath, destinationPath);
  }
}

function cloneIssues(issues: MarkedIssuePayload[]): MarkedIssuePayload[] {
  return structuredClone(issues);
}

export class MarkedIssueArtifactStore {
  private readonly sessionChains = new Map<string, Promise<void>>();
  private readonly committedRevisions = new Map<string, Map<number, number>>();

  constructor(private readonly stagingRoot: string) {}

  async stageCandidate(
    sessionId: string,
    revision: number,
    bytes: Uint8Array,
  ): Promise<void> {
    validateSessionId(sessionId);
    validateRevision(revision);
    validatePng(bytes);
    const ownedBytes = Buffer.from(bytes);

    return this.enqueue(sessionId, async () => {
      const sessionDir = this.stagingSessionDir(sessionId);
      await mkdir(sessionDir, { recursive: true });
      const destinationPath = join(sessionDir, `candidate-${revision}.png`);
      const partPath = join(sessionDir, `candidate-${revision}-${randomUUID()}.png.part`);
      try {
        await writeFile(partPath, ownedBytes, { flag: 'wx' });
        await replaceByRename(partPath, destinationPath);
      } catch (error) {
        await rm(partPath, { force: true });
        throw error;
      }

      const protectedRevisions = new Set(
        this.committedRevisions.get(sessionId)?.values() ?? [],
      );
      const candidates = (await readdir(sessionDir)).flatMap((name) => {
        const match = CANDIDATE_PATTERN.exec(name);
        return match ? [{ name, revision: Number(match[1]) }] : [];
      });
      const newestUncommitted = candidates.reduce(
        (newest, candidate) => protectedRevisions.has(candidate.revision)
          ? newest
          : Math.max(newest, candidate.revision),
        0,
      );
      await Promise.all(candidates.map(async (candidate) => {
        if (protectedRevisions.has(candidate.revision)
          || candidate.revision === newestUncommitted) return;
        await rm(join(sessionDir, candidate.name), { force: true });
      }));
    });
  }

  markCommitted(sessionId: string, revision: number, ordinal: number): void {
    validateSessionId(sessionId);
    validateRevision(revision);
    validateOrdinal(ordinal);
    const reservations = this.committedRevisions.get(sessionId) ?? new Map<number, number>();
    reservations.set(ordinal, revision);
    this.committedRevisions.set(sessionId, reservations);
  }

  async promoteIssues(
    sessionId: string,
    issues: MarkedIssuePayload[],
    sessionDir: string,
  ): Promise<MarkedIssuePayload[]> {
    validateSessionId(sessionId);
    const promoted = cloneIssues(issues);
    for (const issue of promoted) {
      validateOrdinal(issue.ordinal);
      validateRevision(issue.snapshotRevision);
    }

    return this.enqueue(sessionId, async () => {
      const screenshotsDir = join(sessionDir, 'screenshots');
      await mkdir(screenshotsDir, { recursive: true });

      for (const issue of promoted) {
        const sourcePath = join(
          this.stagingSessionDir(sessionId),
          `candidate-${issue.snapshotRevision}.png`,
        );
        const filename = `marked-issue-${String(issue.ordinal).padStart(3, '0')}.png`;
        const relativePath = `screenshots/${filename}`;
        const destinationPath = join(screenshotsDir, filename);
        const partPath = join(screenshotsDir, `${filename}-${randomUUID()}.part`);
        try {
          await copyFile(sourcePath, partPath);
          await replaceByRename(partPath, destinationPath);
          issue.screenshotPath = relativePath;
          delete issue.evidenceWarning;
        } catch (error) {
          await rm(partPath, { force: true });
          const code = error && typeof error === 'object' && 'code' in error
            ? String((error as { code?: unknown }).code)
            : '';
          if (code !== 'ENOENT') throw error;
          delete issue.screenshotPath;
          issue.evidenceWarning = 'Direct marked screenshot unavailable; using recorded-video fallback.';
        }
      }

      await rm(this.stagingSessionDir(sessionId), { recursive: true, force: true });
      this.committedRevisions.delete(sessionId);
      return promoted;
    });
  }

  async cleanupSession(sessionId: string): Promise<void> {
    validateSessionId(sessionId);
    await this.enqueue(sessionId, async () => {
      await rm(this.stagingSessionDir(sessionId), { recursive: true, force: true });
      this.committedRevisions.delete(sessionId);
    });
  }

  async cleanupStaleSessions(preserveSessionIds: string[] = []): Promise<void> {
    preserveSessionIds.forEach(validateSessionId);
    const preserved = new Set(preserveSessionIds);
    await Promise.allSettled([...this.sessionChains.values()]);
    await mkdir(this.stagingRoot, { recursive: true });
    const entries = await readdir(this.stagingRoot);
    await Promise.all(entries.map(async (name) => {
      if (preserved.has(name)) return;
      await rm(join(this.stagingRoot, name), { recursive: true, force: true });
      this.committedRevisions.delete(name);
    }));
  }

  private stagingSessionDir(sessionId: string): string {
    return join(this.stagingRoot, sessionId);
  }

  private enqueue<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.sessionChains.get(sessionId) ?? Promise.resolve();
    const operation = previous.catch(() => undefined).then(task);
    const settled = operation.then(() => undefined, () => undefined);
    this.sessionChains.set(sessionId, settled);
    void settled.finally(() => {
      if (this.sessionChains.get(sessionId) === settled) {
        this.sessionChains.delete(sessionId);
      }
    });
    return operation;
  }
}
