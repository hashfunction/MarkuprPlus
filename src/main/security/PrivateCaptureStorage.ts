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

const LEGACY_SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const LEGACY_RECORDING_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:mov|mp4|webm)$/iu;

export function privateCaptureAreaPath(area: PrivateCaptureArea): string {
  return join(app.getPath('userData'), 'capture-recovery', area);
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as NodeJS.ErrnoException).code)
    : undefined;
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

async function removeLegacyFiles(
  root: string,
  pattern: RegExp,
  label: string,
): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!pattern.test(entry.name)) continue;
    const candidate = join(root, entry.name);
    const stats = await lstat(candidate);
    if (!stats.isFile() && !stats.isSymbolicLink()) {
      throw new Error(`${label} contains a non-file artifact.`);
    }
    await unlink(candidate);
  }
}

async function removeLegacyRootIfEmpty(root: string): Promise<void> {
  try {
    await rmdir(root);
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(errorCode(error) ?? '')) throw error;
  }
}

/**
 * Remove only recognized artifacts from the pre-hardening temporary roots.
 * Final-component aliases and foreign-owned roots are rejected; child aliases
 * are unlinked without following them.
 */
export async function clearLegacyCaptureArtifacts(): Promise<void> {
  const audioRoot = await resolveLegacyCaptureRoot('markuprx-audio', 'Legacy audio root');
  if (audioRoot) {
    await removeLegacyFiles(audioRoot, /^audio-.+\.raw$/iu, 'Legacy audio root');
    await removeLegacyRootIfEmpty(audioRoot);
  }

  const recordingsRoot = await resolveLegacyCaptureRoot(
    'markuprx-recordings',
    'Legacy recording root',
  );
  if (recordingsRoot) {
    await removeLegacyFiles(
      recordingsRoot,
      LEGACY_RECORDING_PATTERN,
      'Legacy recording root',
    );
    await removeLegacyRootIfEmpty(recordingsRoot);
  }

  const markedRoot = await resolveLegacyCaptureRoot(
    'markuprx-marked-issues',
    'Legacy marked screenshot root',
  );
  if (!markedRoot) return;

  const entries = await readdir(markedRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!LEGACY_SESSION_ID_PATTERN.test(entry.name)) continue;
    const candidate = join(markedRoot, entry.name);
    const stats = await lstat(candidate);
    if (stats.isSymbolicLink()) {
      await unlink(candidate);
      continue;
    }
    if (!stats.isDirectory()) {
      throw new Error('Legacy marked screenshot root contains an invalid session artifact.');
    }
    await removePrivateDirectoryTree(markedRoot, candidate, 'Legacy marked screenshot session');
  }
  await removeLegacyRootIfEmpty(markedRoot);
}
