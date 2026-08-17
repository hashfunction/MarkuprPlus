import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginApplicationDataClear,
  beginApplicationDataSessionStart,
  clearOwnedApplicationData,
  isApplicationDataClearInProgress,
} from '../../src/main/settings/clearApplicationData';
import {
  FileManager,
  SESSION_OWNERSHIP_SENTINEL,
} from '../../src/main/output/FileManager';

const roots: string[] = [];

async function pathExists(path: string): Promise<boolean> {
  return lstat(path).then(() => true, () => false);
}

async function createLegacySession(root: string, name: string, id: string): Promise<string> {
  const directory = join(root, name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'metadata.json'), JSON.stringify({
    sessionId: id,
    startTime: 1_700_000_000_000,
    itemCount: 1,
    screenshotCount: 0,
    source: { id: 'screen:1:0', name: 'Safe fixture' },
    environment: { os: 'darwin', version: '3.0.0' },
  }));
  await writeFile(join(directory, 'feedback-report.md'), '# Report');
  await writeFile(join(directory, 'feedback-summary.md'), '# Summary');
  return directory;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('owned session discovery', () => {
  it('finds sentinel and strict legacy sessions but excludes unrelated and symlink entries', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'markuprplus-owned-sessions-'));
    roots.push(sandbox);
    const outputRoot = join(sandbox, 'output');
    await mkdir(outputRoot);

    const sentinelSession = join(outputRoot, 'sentinel-session');
    await mkdir(sentinelSession);
    await writeFile(join(sentinelSession, SESSION_OWNERSHIP_SENTINEL), JSON.stringify({
      version: 1,
      sessionId: 'sentinel-session-id',
    }));
    const legacySession = await createLegacySession(outputRoot, 'legacy-session', 'legacy-id');

    const unrelated = join(outputRoot, 'personal-files');
    await mkdir(unrelated);
    await writeFile(join(unrelated, 'metadata.json'), '{"sessionId":"not-enough"}');
    const external = join(sandbox, 'external-canary');
    await mkdir(external);
    await writeFile(join(external, SESSION_OWNERSHIP_SENTINEL), JSON.stringify({
      version: 1,
      sessionId: 'external-id',
    }));
    await symlink(external, join(outputRoot, 'session-link'));

    const manager = new FileManager();
    manager.setOutputDirectory(outputRoot);

    await expect(manager.listOwnedSessionDirectoriesForDeletion())
      .resolves.toEqual((await Promise.all([
        realpath(legacySession),
        realpath(sentinelSession),
      ])).sort());
  });
});

describe('clearOwnedApplicationData', () => {
  it('holds an exclusive application-data clear lock until the owner releases it', () => {
    expect(isApplicationDataClearInProgress()).toBe(false);
    const release = beginApplicationDataClear();
    expect(release).toBeTypeOf('function');
    expect(isApplicationDataClearInProgress()).toBe(true);
    expect(beginApplicationDataClear()).toBeNull();
    release?.();
    release?.();
    expect(isApplicationDataClearInProgress()).toBe(false);
  });

  it('makes recording startup and application-data clearing mutually exclusive', () => {
    const releaseStart = beginApplicationDataSessionStart();
    expect(releaseStart).toBeTypeOf('function');
    expect(beginApplicationDataClear()).toBeNull();

    releaseStart?.();
    const releaseClear = beginApplicationDataClear();
    expect(releaseClear).toBeTypeOf('function');
    expect(beginApplicationDataSessionStart()).toBeNull();
    releaseClear?.();

    const releaseNextStart = beginApplicationDataSessionStart();
    expect(releaseNextStart).toBeTypeOf('function');
    releaseNextStart?.();
  });

  it('rejects a filesystem root before enumerating candidates', async () => {
    const listOwnedSessions = vi.fn(async () => ['/']);
    const removePath = vi.fn(async () => undefined);

    await expect(clearOwnedApplicationData({
      outputRoot: '/',
      listOwnedSessions,
      removePath,
    })).resolves.toEqual({ deletedSessions: 0, failedSessions: 1 });
    expect(listOwnedSessions).not.toHaveBeenCalled();
    expect(removePath).not.toHaveBeenCalled();
  });

  it('rejects a relative configured root before resolving it against the process cwd', async () => {
    const listOwnedSessions = vi.fn(async () => ['relative-output/session-a']);
    const removePath = vi.fn(async () => undefined);

    await expect(clearOwnedApplicationData({
      outputRoot: 'relative-output',
      listOwnedSessions,
      removePath,
    })).resolves.toEqual({ deletedSessions: 0, failedSessions: 1 });
    expect(listOwnedSessions).not.toHaveBeenCalled();
    expect(removePath).not.toHaveBeenCalled();
  });

  it('removes only contained real candidates and never removes the root or unrelated content', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'markuprplus-clear-data-'));
    roots.push(sandbox);
    const outputRoot = join(sandbox, 'output');
    const first = join(outputRoot, 'session-a');
    const second = join(outputRoot, 'session-b');
    const unrelated = join(outputRoot, 'personal-files');
    const siblingPrefix = `${outputRoot}-escape`;
    const external = join(sandbox, 'external-canary');
    const link = join(outputRoot, 'session-link');
    await Promise.all([
      mkdir(first, { recursive: true }),
      mkdir(second, { recursive: true }),
      mkdir(unrelated, { recursive: true }),
      mkdir(siblingPrefix),
      mkdir(external),
    ]);
    await writeFile(join(outputRoot, 'root-sentinel.txt'), 'keep root');
    await writeFile(join(unrelated, 'keep.txt'), 'keep unrelated');
    await writeFile(join(external, 'keep.txt'), 'keep external');
    await symlink(external, link);

    const removePath = vi.fn(async (path: string) => {
      await rm(path, { recursive: true, force: true });
    });
    const result = await clearOwnedApplicationData({
      outputRoot,
      listOwnedSessions: async () => [
        first,
        outputRoot,
        siblingPrefix,
        join(outputRoot, '..', 'outside'),
        link,
        second,
      ],
      removePath,
    });

    expect(result).toEqual({ deletedSessions: 2, failedSessions: 4 });
    expect(removePath).toHaveBeenCalledTimes(2);
    expect(removePath).not.toHaveBeenCalledWith(outputRoot);
    await expect(readFile(join(outputRoot, 'root-sentinel.txt'), 'utf8')).resolves.toBe('keep root');
    await expect(readFile(join(unrelated, 'keep.txt'), 'utf8')).resolves.toBe('keep unrelated');
    await expect(readFile(join(external, 'keep.txt'), 'utf8')).resolves.toBe('keep external');
    expect(await pathExists(first)).toBe(false);
    expect(await pathExists(second)).toBe(false);
  });

  it('reports one removal failure while continuing with later safe sessions', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'markuprplus-clear-data-'));
    roots.push(sandbox);
    const outputRoot = join(sandbox, 'output');
    const first = join(outputRoot, 'session-a');
    const second = join(outputRoot, 'session-b');
    await mkdir(first, { recursive: true });
    await mkdir(second);
    const realFirst = await realpath(first);
    const removePath = vi.fn(async (path: string) => {
      if (path === realFirst) throw new Error('injected deletion failure');
      await rm(path, { recursive: true, force: true });
    });

    const result = await clearOwnedApplicationData({
      outputRoot,
      listOwnedSessions: async () => [first, second],
      removePath,
    });

    expect(result).toEqual({ deletedSessions: 1, failedSessions: 1 });
    expect(removePath).toHaveBeenCalledTimes(2);
    expect(await pathExists(first)).toBe(true);
    expect(await pathExists(second)).toBe(false);
  });
});
