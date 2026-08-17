import { lstat, rm } from 'node:fs/promises';
import { isAbsolute, parse, resolve } from 'node:path';
import { resolveContainedExistingPath } from '../security/pathContainment';

let applicationDataClearInProgress = false;
let applicationDataSessionStartsInProgress = 0;

/**
 * Acquire the process-wide clear lock synchronously so recording cannot start
 * between the idle-state check and the first destructive await.
 */
export function beginApplicationDataClear(): (() => void) | null {
  if (applicationDataClearInProgress || applicationDataSessionStartsInProgress > 0) return null;
  applicationDataClearInProgress = true;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    applicationDataClearInProgress = false;
  };
}

/**
 * Reserve recording startup while permissions and target selection are still
 * asynchronous. Clear All Data cannot begin until every reservation releases,
 * and no new reservation is granted while a clear is active.
 */
export function beginApplicationDataSessionStart(): (() => void) | null {
  if (applicationDataClearInProgress) return null;
  applicationDataSessionStartsInProgress++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    applicationDataSessionStartsInProgress = Math.max(
      0,
      applicationDataSessionStartsInProgress - 1,
    );
  };
}

export function isApplicationDataClearInProgress(): boolean {
  return applicationDataClearInProgress;
}

export interface OwnedApplicationDataClearResult {
  deletedSessions: number;
  failedSessions: number;
}

export interface ClearOwnedApplicationDataDependencies {
  outputRoot: string;
  listOwnedSessions: () => Promise<string[]>;
  removePath?: (path: string) => Promise<void>;
}

/**
 * Delete only app-owned candidate directories after a second, realpath-based
 * containment check. All failures are counted without exposing pathnames.
 */
export async function clearOwnedApplicationData({
  outputRoot,
  listOwnedSessions,
  removePath = (path) => rm(path, { recursive: true, force: true }),
}: ClearOwnedApplicationDataDependencies): Promise<OwnedApplicationDataClearResult> {
  let deletedSessions = 0;
  let failedSessions = 0;
  if (!isAbsolute(outputRoot)) {
    return { deletedSessions, failedSessions: 1 };
  }
  const resolvedRoot = resolve(outputRoot);
  if (resolvedRoot === parse(resolvedRoot).root) {
    return { deletedSessions, failedSessions: 1 };
  }
  let candidates: string[];
  try {
    candidates = await listOwnedSessions();
  } catch {
    return { deletedSessions, failedSessions: 1 };
  }

  for (const candidate of candidates) {
    try {
      const contained = await resolveContainedExistingPath(outputRoot, candidate);
      if (!contained) {
        failedSessions++;
        continue;
      }
      const stats = await lstat(candidate);
      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        failedSessions++;
        continue;
      }
      await removePath(contained);
      deletedSessions++;
    } catch {
      failedSessions++;
    }
  }

  return { deletedSessions, failedSessions };
}
