import { app } from 'electron';
import {
  chmod,
  lstat,
  mkdir,
  realpath,
  readdir,
  rm,
  rmdir,
  unlink,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isPathInside } from './pathContainment';

export type PrivateCaptureArea = 'audio' | 'marked-issues' | 'recordings';

export function privateCaptureAreaPath(area: PrivateCaptureArea): string {
  return join(app.getPath('userData'), 'capture-recovery', area);
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as NodeJS.ErrnoException).code)
    : undefined;
}

function throwCollectedErrors(errors: unknown[], message: string): void {
  if (errors.length === 0) return;
  const reasons = errors
    .map((error) => error instanceof Error ? error.message : String(error))
    .join(' ');
  throw new AggregateError(errors, `${message} ${reasons}`);
}

/** Create or verify one real, private directory without following its final component. */
export async function ensurePrivateDirectory(
  directory: string,
  label: string,
): Promise<string> {
  let stats;
  try {
    stats = await lstat(directory);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
    try {
      await mkdir(directory, { recursive: false, mode: 0o700 });
    } catch (mkdirError) {
      if (errorCode(mkdirError) !== 'EEXIST') throw mkdirError;
    }
    stats = await lstat(directory);
  }

  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${label} is not a private directory.`);
  }
  await chmod(directory, 0o700);
  return realpath(directory);
}

/** Resolve an app-owned capture area after privately claiming its parent. */
export async function ensurePrivateCaptureArea(area: PrivateCaptureArea): Promise<string> {
  const areaPath = privateCaptureAreaPath(area);
  await ensurePrivateDirectory(app.getPath('userData'), 'Application data root');
  await ensurePrivateDirectory(dirname(areaPath), 'Capture recovery root');
  return ensurePrivateDirectory(areaPath, `${area} capture root`);
}

/**
 * Remove every selected file/link from an app-owned capture area. Directories
 * and special entries are reported, but never stop later removable entries
 * from being attempted.
 */
export async function clearPrivateCaptureFiles(
  area: PrivateCaptureArea,
  label: string,
  select: (name: string) => boolean = () => true,
): Promise<void> {
  const root = await ensurePrivateCaptureArea(area);
  const entries = await readdir(root, { withFileTypes: true });
  const errors: unknown[] = [];
  for (const entry of entries) {
    if (!select(entry.name)) continue;
    const candidate = join(root, entry.name);
    try {
      const stats = await lstat(candidate);
      if (!stats.isFile() && !stats.isSymbolicLink()) {
        throw new Error(`${label} contains an artifact that is not removable as a file.`);
      }
      await unlink(candidate);
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') errors.push(error);
    }
  }
  throwCollectedErrors(errors, `${label} could not be fully cleared.`);
}

async function assertTreeHasNoAliases(directory: string, label: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`${label} contains a symbolic link.`);
    }
    if (entry.isDirectory()) {
      await assertTreeHasNoAliases(candidate, label);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`${label} contains an unsupported filesystem entry.`);
    }
  }
}

/** Remove one verified real directory contained by a verified private root. */
export async function removePrivateDirectoryTree(
  root: string,
  candidate: string,
  label: string,
): Promise<void> {
  let stats;
  try {
    stats = await lstat(candidate);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return;
    throw error;
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${label} is not a private directory.`);
  }
  const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
  if (!isPathInside(realRoot, realCandidate)) {
    throw new Error(`${label} escapes its private root.`);
  }
  await assertTreeHasNoAliases(realCandidate, label);
  await rm(realCandidate, { recursive: true, force: false });
}

async function resolveLegacyCaptureRoot(name: string, label: string): Promise<string | null> {
  const tempRoot = app.getPath('temp');
  const candidate = join(tempRoot, name);
  let stats;
  try {
    stats = await lstat(candidate);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${label} is not a real directory.`);
  }
  if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) {
    throw new Error(`${label} is not owned by the current user.`);
  }
  const [realTempRoot, realCandidate] = await Promise.all([
    realpath(tempRoot),
    realpath(candidate),
  ]);
  if (!isPathInside(realTempRoot, realCandidate)) {
    throw new Error(`${label} escapes the temporary root.`);
  }
  return realCandidate;
}

async function clearLegacyRoot(name: string, label: string): Promise<void> {
  const root = await resolveLegacyCaptureRoot(name, label);
  if (!root) return;
  const entries = await readdir(root, { withFileTypes: true });
  const errors: unknown[] = [];
  for (const entry of entries) {
    const candidate = join(root, entry.name);
    try {
      const stats = await lstat(candidate);
      if (stats.isFile() || stats.isSymbolicLink()) {
        await unlink(candidate);
      } else if (stats.isDirectory()) {
        await removePrivateDirectoryTree(root, candidate, `${label} artifact`);
      } else {
        throw new Error(`${label} contains an unsupported filesystem artifact.`);
      }
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') errors.push(error);
    }
  }
  try {
    await rmdir(root);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') errors.push(error);
  }
  throwCollectedErrors(errors, `${label} could not be fully cleared.`);
}

/**
 * Remove every artifact from the verified pre-hardening temporary roots.
 * Final-component aliases and foreign-owned roots are rejected; child aliases
 * are unlinked without following them, and failures never stop later roots.
 */
export async function clearLegacyCaptureArtifacts(): Promise<void> {
  const operations = [
    () => clearLegacyRoot('markuprx-audio', 'Legacy audio root'),
    () => clearLegacyRoot('markuprx-recordings', 'Legacy recording root'),
    () => clearLegacyRoot('markuprx-marked-issues', 'Legacy marked screenshot root'),
  ];
  const results = await Promise.allSettled(operations.map((operation) => operation()));
  throwCollectedErrors(
    results.flatMap((result) => result.status === 'rejected' ? [result.reason] : []),
    'Legacy capture artifacts could not be fully cleared.',
  );
}

/** Remove stale pre-hardening recordings at startup without touching recoverable evidence. */
export async function clearLegacyScreenRecordingArtifacts(): Promise<void> {
  await clearLegacyRoot('markuprx-recordings', 'Legacy recording root');
}
