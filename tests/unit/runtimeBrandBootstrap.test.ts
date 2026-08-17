import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bootstrapState = vi.hoisted(() => ({
  events: [] as string[],
  app: {
    getPath: vi.fn<(name: string) => string>(),
    isPackaged: false,
    setName: vi.fn<(name: string) => void>(),
    setPath: vi.fn<(name: string, path: string) => void>(),
  },
}));

vi.mock('electron', () => ({ app: bootstrapState.app }));

const temporaryRoots: string[] = [];

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  bootstrapState.events.length = 0;
  bootstrapState.app.isPackaged = false;
  bootstrapState.app.getPath.mockReset();
  bootstrapState.app.setName.mockReset();
  bootstrapState.app.setPath.mockReset();
  bootstrapState.app.setName.mockImplementation((name) => {
    bootstrapState.events.push(`setName:${name}`);
  });
  bootstrapState.app.setPath.mockImplementation((name, path) => {
    bootstrapState.events.push(`setPath:${name}:${path}`);
  });
  vi.doMock('../../src/main/index', () => {
    bootstrapState.events.push('import:index');
    return {};
  });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })));
});

describe('runtime brand bootstrap ordering', () => {
  it('pins production data and public name before importing main initialization', async () => {
    const root = await mkdtemp(join(tmpdir(), 'markuprplus-bootstrap-brand-'));
    temporaryRoots.push(root);
    const appDataDir = join(root, 'Application Support');
    const legacyUserDataDir = join(appDataDir, 'MarkuprX');
    bootstrapState.app.getPath.mockImplementation((name) => {
      if (name === 'appData') return appDataDir;
      throw new Error('Unexpected path: ' + name);
    });
    vi.stubEnv('MARKUPRX_E2E', '0');

    await import('../../src/main/bootstrap');

    expect(bootstrapState.events).toEqual([
      `setPath:userData:${legacyUserDataDir}`,
      'setName:MarkuprPlus',
      'import:index',
    ]);
  });

  it('keeps every explicit harness path ahead of public naming and main initialization', async () => {
    const root = await mkdtemp(join(tmpdir(), 'markuprplus-bootstrap-brand-'));
    temporaryRoots.push(root);
    const userDataDir = join(root, 'explicit-user-data');
    const documentsDir = join(root, 'explicit-documents');
    bootstrapState.app.getPath.mockImplementation(() => {
      throw new Error('The harness must not read a production application-data path.');
    });
    vi.stubEnv('MARKUPRX_E2E', '1');
    vi.stubEnv('MARKUPRX_E2E_USER_DATA_DIR', userDataDir);
    vi.stubEnv('MARKUPRX_E2E_DOCUMENTS_DIR', documentsDir);

    await import('../../src/main/bootstrap');

    expect(bootstrapState.events).toEqual([
      `setPath:userData:${resolve(userDataDir)}`,
      `setPath:documents:${resolve(documentsDir)}`,
      `setPath:logs:${join(resolve(userDataDir), 'logs')}`,
      `setPath:temp:${join(resolve(userDataDir), 'temp')}`,
      'setName:MarkuprPlus',
      'import:index',
    ]);
    expect(bootstrapState.app.setPath).toHaveBeenCalledTimes(4);
  });

  it('does not import main initialization when the production data directory cannot be created', async () => {
    const root = await mkdtemp(join(tmpdir(), 'markuprplus-bootstrap-brand-'));
    temporaryRoots.push(root);
    const blockedAppDataPath = join(root, 'not-a-directory');
    await writeFile(blockedAppDataPath, 'blocked');
    bootstrapState.app.getPath.mockReturnValue(blockedAppDataPath);
    vi.stubEnv('MARKUPRX_E2E', '0');

    await expect(import('../../src/main/bootstrap')).rejects.toThrow();

    expect(bootstrapState.events).toEqual([]);
  });
});
