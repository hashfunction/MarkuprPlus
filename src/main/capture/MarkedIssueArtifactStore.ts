import { randomUUID } from 'node:crypto';
import {
  copyFile,
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  MAX_MARKED_SCREENSHOT_BYTES,
  type MarkedIssuePayload,
} from '../../shared/types';
import {
  ensurePrivateDirectory,
  removePrivateDirectoryTree,
} from '../security/PrivateCaptureStorage';
import { isPathInside } from '../security/pathContainment';

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

  constructor(
    private readonly stagingRoot: string,
    private readonly legacyStagingRoot?: string,
  ) {}

  private async ensureStagingRoot(): Promise<string> {
    await ensurePrivateDirectory(dirname(this.stagingRoot), 'Capture recovery root');
    return ensurePrivateDirectory(this.stagingRoot, 'Marked screenshot staging root');
  }

  private async ensureSessionDirectory(sessionId: string): Promise<string> {
    const root = await this.ensureStagingRoot();
    const sessionDir = join(root, sessionId);
    try {
      await mkdir(sessionDir, { recursive: false, mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const stats = await lstat(sessionDir);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error('Marked screenshot session is not a private directory.');
    }
    await chmod(sessionDir, 0o700);
    return sessionDir;
  }

  /** Move previous-version staged evidence into the private store on demand. */
  async migrateLegacySession(sessionId: string): Promise<void> {
    validateSessionId(sessionId);
    if (!this.legacyStagingRoot) return;

    let rootStats;
    try {
      rootStats = await lstat(this.legacyStagingRoot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
      throw new Error('Legacy marked screenshot root is not a real directory.');
    }
    if (typeof process.getuid === 'function' && rootStats.uid !== process.getuid()) {
      throw new Error('Legacy marked screenshot root is not owned by the current user.');
    }

    const legacyRoot = await realpath(this.legacyStagingRoot);
    const legacySession = join(legacyRoot, sessionId);
    let sessionStats;
    try {
      sessionStats = await lstat(legacySession);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    if (sessionStats.isSymbolicLink() || !sessionStats.isDirectory()) {
      throw new Error('Legacy marked screenshot session is not a real directory.');
    }
    if (typeof process.getuid === 'function' && sessionStats.uid !== process.getuid()) {
      throw new Error('Legacy marked screenshot session is not owned by the current user.');
    }
    const realSession = await realpath(legacySession);
    if (!isPathInside(legacyRoot, realSession)) {
      throw new Error('Legacy marked screenshot session escapes its root.');
    }

    const entries = await readdir(realSession, { withFileTypes: true });
    for (const entry of entries) {
      const match = CANDIDATE_PATTERN.exec(entry.name);
      if (!match) continue;
      const source = join(realSession, entry.name);
      const stats = await lstat(source);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new Error('Legacy marked screenshot candidate is not a regular file.');
      }
      if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) {
        throw new Error('Legacy marked screenshot candidate is not owned by the current user.');
      }
      if (stats.size > MAX_MARKED_SCREENSHOT_BYTES) {
        throw new Error('Legacy marked screenshot exceeds the size limit.');
      }
      const bytes = new Uint8Array(await readFile(source));
      validatePng(bytes);
      await this.stageCandidate(sessionId, Number(match[1]), bytes);
    }

    await removePrivateDirectoryTree(
      legacyRoot,
      realSession,
      'Legacy marked screenshot session',
    );
  }

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
      const sessionDir = await this.ensureSessionDirectory(sessionId);
      const destinationPath = join(sessionDir, `candidate-${revision}.png`);
      const partPath = join(sessionDir, `candidate-${revision}-${randomUUID()}.png.part`);
      try {
        await writeFile(partPath, ownedBytes, { flag: 'wx', mode: 0o600 });
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
      const stagingRoot = await this.ensureStagingRoot();
      const screenshotsDir = join(sessionDir, 'screenshots');
      await mkdir(screenshotsDir, { recursive: true });

      for (const issue of promoted) {
        const sourcePath = join(
          stagingRoot,
          sessionId,
          `candidate-${issue.snapshotRevision}.png`,
        );
        const filename = `marked-issue-${String(issue.ordinal).padStart(3, '0')}.png`;
        const relativePath = `screenshots/${filename}`;
        const destinationPath = join(screenshotsDir, filename);
        const partPath = join(screenshotsDir, `${filename}-${randomUUID()}.part`);
        try {
          const sourceStats = await lstat(sourcePath);
          if (sourceStats.isSymbolicLink() || !sourceStats.isFile()) {
            throw new Error('Marked screenshot candidate is not a regular file.');
          }
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

      await removePrivateDirectoryTree(
        stagingRoot,
        join(stagingRoot, sessionId),
        'Marked screenshot session',
      );
      this.committedRevisions.delete(sessionId);
      return promoted;
    });
  }

  async cleanupSession(sessionId: string): Promise<void> {
    validateSessionId(sessionId);
    await this.enqueue(sessionId, async () => {
      const root = await this.ensureStagingRoot();
      await removePrivateDirectoryTree(
        root,
        join(root, sessionId),
        'Marked screenshot session',
      );
      this.committedRevisions.delete(sessionId);
    });
  }

  async cleanupStaleSessions(preserveSessionIds: string[] = []): Promise<void> {
    preserveSessionIds.forEach(validateSessionId);
    const preserved = new Set(preserveSessionIds);
    await Promise.allSettled([...this.sessionChains.values()]);
    const root = await this.ensureStagingRoot();
    const entries = await readdir(root, { withFileTypes: true });
    const errors: unknown[] = [];
    for (const entry of entries) {
      if (preserved.has(entry.name)) continue;
      const candidate = join(root, entry.name);
      try {
        const stats = await lstat(candidate);
        if (stats.isSymbolicLink() || stats.isFile()) {
          await rm(candidate, { force: true });
        } else if (stats.isDirectory()) {
          await removePrivateDirectoryTree(root, candidate, 'Marked screenshot session');
        } else {
          throw new Error('Marked screenshot root contains an unsupported artifact.');
        }
        if (SESSION_ID_PATTERN.test(entry.name)) this.committedRevisions.delete(entry.name);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') errors.push(error);
      }
    }
    if (errors.length > 0) {
      const reasons = errors
        .map((error) => error instanceof Error ? error.message : String(error))
        .join(' ');
      throw new AggregateError(
        errors,
        `Marked screenshot staging could not be fully cleared. ${reasons}`,
      );
    }
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
