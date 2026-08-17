import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/** Lexical containment that cannot be fooled by sibling-prefix paths. */
export function isPathInside(root: string, candidate: string, allowRoot = false): boolean {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  const difference = relative(resolvedRoot, resolvedCandidate);
  if (difference === '') return allowRoot;
  return difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference);
}

/**
 * Resolve both sides through the filesystem, rejecting missing paths and
 * symlinks whose destination escapes the configured root.
 */
export async function resolveContainedExistingPath(
  root: string,
  candidate: string,
  allowRoot = false,
): Promise<string | null> {
  try {
    const [realRoot, realCandidate] = await Promise.all([
      realpath(root),
      realpath(candidate),
    ]);
    // A configured path can itself contain an OS alias (for example macOS
    // `/var` -> `/private/var`). Accept either spelling before enforcing the
    // definitive realpath containment check.
    if (!isPathInside(root, candidate, allowRoot)
      && !isPathInside(realRoot, candidate, allowRoot)) return null;
    return isPathInside(realRoot, realCandidate, allowRoot) ? realCandidate : null;
  } catch {
    return null;
  }
}
