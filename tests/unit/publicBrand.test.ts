import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LEGACY_USER_DATA_DIRECTORY_NAME,
  PUBLIC_BRAND_NAME,
  PUBLIC_CONTACT_URL,
  PUBLIC_REPOSITORY_URL,
  PUBLIC_WEBSITE_URL,
} from '../../src/shared/publicBrand';
import { configureRuntimeBrand } from '../../src/main/runtimeBrand';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })));
});

describe('MarkuprPlus public brand contract', () => {
  it('publishes the approved product name and destinations', () => {
    expect(PUBLIC_BRAND_NAME).toBe('MarkuprPlus');
    expect(PUBLIC_WEBSITE_URL).toBe('https://markuprplus.com');
    expect(PUBLIC_REPOSITORY_URL).toBe('https://github.com/hashfunction/MarkuprPlus');
    expect(PUBLIC_CONTACT_URL).toBe(
      'https://github.com/hashfunction/MarkuprPlus/issues/new',
    );
    expect(LEGACY_USER_DATA_DIRECTORY_NAME).toBe('MarkuprX');
  });

  it('creates and retains the production user-data directory before applying the public name', async () => {
    const root = await mkdtemp(join(tmpdir(), 'markuprplus-runtime-brand-'));
    temporaryRoots.push(root);
    const appDataDir = join(root, 'Application Support');
    const legacyUserDataDir = join(appDataDir, 'MarkuprX');
    const app = {
      getPath: vi.fn((name: string) => {
        if (name === 'appData') return appDataDir;
        if (name === 'userData') return join(root, 'new-default');
        throw new Error('Unexpected path: ' + name);
      }),
      setName: vi.fn(),
      setPath: vi.fn(),
    };

    configureRuntimeBrand(app, true);

    const directory = await stat(legacyUserDataDir);
    expect(directory.isDirectory()).toBe(true);
    if (process.platform !== 'win32') {
      expect(directory.mode & 0o777).toBe(0o700);
    }
    expect(app.setPath).toHaveBeenCalledWith('userData', legacyUserDataDir);
    expect(app.setName).toHaveBeenCalledWith('MarkuprPlus');
  });

  it('uses the injected platform join contract for Windows application data', () => {
    const app = {
      getPath: vi.fn(() => String.raw`C:\Users\example\AppData\Roaming`),
      setName: vi.fn(),
      setPath: vi.fn(),
    };

    configureRuntimeBrand(app, true, {
      ensureDirectory: () => undefined,
      joinPath: win32.join,
    });

    expect(app.setPath).toHaveBeenCalledWith(
      'userData',
      String.raw`C:\Users\example\AppData\Roaming\MarkuprX`,
    );
  });

  it('does not replace or create over an isolated test-harness user-data path', () => {
    const app = {
      getPath: vi.fn(() => '/isolated/harness'),
      setName: vi.fn(),
      setPath: vi.fn(),
    };
    const ensureDirectory = vi.fn();

    configureRuntimeBrand(app, false, { ensureDirectory });

    expect(app.setName).toHaveBeenCalledWith('MarkuprPlus');
    expect(app.setPath).not.toHaveBeenCalled();
    expect(app.getPath).not.toHaveBeenCalled();
    expect(ensureDirectory).not.toHaveBeenCalled();
  });

  it('does not install a path or public name when the legacy directory cannot be created', async () => {
    const root = await mkdtemp(join(tmpdir(), 'markuprplus-runtime-brand-'));
    temporaryRoots.push(root);
    const blockedAppDataPath = join(root, 'not-a-directory');
    await writeFile(blockedAppDataPath, 'blocked');
    const app = {
      getPath: vi.fn(() => blockedAppDataPath),
      setName: vi.fn(),
      setPath: vi.fn(),
    };

    expect(() => configureRuntimeBrand(app, true)).toThrow();

    expect(app.setPath).not.toHaveBeenCalled();
    expect(app.setName).not.toHaveBeenCalled();
  });
});
