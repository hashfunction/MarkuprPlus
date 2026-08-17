import { mkdtemp, mkdir, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isPathInside,
  resolveContainedExistingPath,
} from '../../src/main/security/pathContainment';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('path containment', () => {
  it('rejects the root, sibling prefixes, traversal, and absolute outsiders', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'markuprplus-containment-'));
    roots.push(sandbox);
    const root = join(sandbox, 'output');
    const child = join(root, 'session-a');
    await mkdir(child, { recursive: true });

    expect(isPathInside(root, child)).toBe(true);
    expect(isPathInside(root, root)).toBe(false);
    expect(isPathInside(root, root, true)).toBe(true);
    expect(isPathInside(root, `${root}-escape`)).toBe(false);
    expect(isPathInside(root, join(root, '..', 'outside'))).toBe(false);
  });

  it('resolves only existing real paths that stay under the real root', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'markuprplus-containment-'));
    roots.push(sandbox);
    const root = join(sandbox, 'output');
    const child = join(root, 'session-a');
    const outside = join(sandbox, 'external-canary');
    const link = join(root, 'session-link');
    await mkdir(child, { recursive: true });
    await mkdir(outside);
    await symlink(outside, link);

    await expect(resolveContainedExistingPath(root, child)).resolves.toBe(await realpath(child));
    await expect(resolveContainedExistingPath(root, root)).resolves.toBeNull();
    await expect(resolveContainedExistingPath(root, root, true)).resolves.toBe(await realpath(root));
    await expect(resolveContainedExistingPath(root, link)).resolves.toBeNull();
    await expect(resolveContainedExistingPath(root, `${root}-escape`)).resolves.toBeNull();
    await expect(resolveContainedExistingPath(root, join(root, 'missing'))).resolves.toBeNull();
  });

  it('accepts a real child when the configured root itself is reached through a symlink alias', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'markuprplus-containment-'));
    roots.push(sandbox);
    const realRoot = join(sandbox, 'real-output');
    const aliasRoot = join(sandbox, 'output-alias');
    const child = join(realRoot, 'session-a');
    await mkdir(child, { recursive: true });
    await symlink(realRoot, aliasRoot);

    await expect(resolveContainedExistingPath(aliasRoot, await realpath(child)))
      .resolves.toBe(await realpath(child));
  });
});
