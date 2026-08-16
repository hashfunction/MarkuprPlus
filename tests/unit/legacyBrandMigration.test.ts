import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CURRENT_KEYTAR_SERVICE,
  LEGACY_KEYTAR_SERVICES,
  migrateLegacyBrandData,
} from '../../src/main/migration/LegacyBrandMigration';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })));
});

describe('legacy brand migration', () => {
  it('copies settings, recovery state, models, and sessions into MarkuprX paths once', async () => {
    const root = await mkdtemp(join(tmpdir(), 'markuprx-brand-migration-'));
    temporaryRoots.push(root);
    const applicationSupport = join(root, 'Application Support');
    const documentsDir = join(root, 'Documents');
    const legacyUserDataDir = join(applicationSupport, 'markupR');
    const currentUserDataDir = join(applicationSupport, 'MarkuprX');
    await mkdir(join(legacyUserDataDir, 'whisper-models'), { recursive: true });
    await mkdir(join(documentsDir, 'markupr', 'session-old'), { recursive: true });
    await writeFile(join(legacyUserDataDir, 'settings.json'), JSON.stringify({
      outputDirectory: join(documentsDir, 'markupr'),
      hasCompletedOnboarding: true,
    }));
    await writeFile(join(legacyUserDataDir, 'markupr-crash-recovery.json'), JSON.stringify({
      activeSession: { id: 'recover-me' },
    }));
    await writeFile(join(legacyUserDataDir, 'whisper-models', 'ggml-tiny.bin'), 'model');
    await writeFile(join(documentsDir, 'markupr', 'session-old', 'feedback-report.md'), '# Old session');

    const first = await migrateLegacyBrandData({ currentUserDataDir, documentsDir });
    const migratedSettings = JSON.parse(await readFile(join(currentUserDataDir, 'settings.json'), 'utf8'));

    expect(first.migrated).toBe(true);
    expect(migratedSettings).toMatchObject({
      outputDirectory: join(documentsDir, 'markuprx'),
      hasCompletedOnboarding: true,
    });
    expect(await readFile(join(currentUserDataDir, 'markuprx-crash-recovery.json'), 'utf8'))
      .toContain('recover-me');
    expect(await readFile(join(currentUserDataDir, 'whisper-models', 'ggml-tiny.bin'), 'utf8'))
      .toBe('model');
    expect(await readFile(join(documentsDir, 'markuprx', 'session-old', 'feedback-report.md'), 'utf8'))
      .toBe('# Old session');
    expect(await readdir(currentUserDataDir)).not.toContain('markupr-crash-recovery.json');

    const second = await migrateLegacyBrandData({ currentUserDataDir, documentsDir });
    expect(second).toMatchObject({ migrated: false, alreadyCompleted: true });
  });

  it('never overwrites current data and leaves custom output paths unchanged', async () => {
    const root = await mkdtemp(join(tmpdir(), 'markuprx-brand-migration-'));
    temporaryRoots.push(root);
    const applicationSupport = join(root, 'Application Support');
    const documentsDir = join(root, 'Documents');
    const legacyUserDataDir = join(applicationSupport, 'markupr');
    const currentUserDataDir = join(applicationSupport, 'MarkuprX');
    const customOutput = join(root, 'custom', 'review-sessions');
    await mkdir(legacyUserDataDir, { recursive: true });
    await mkdir(currentUserDataDir, { recursive: true });
    await writeFile(join(legacyUserDataDir, 'settings.json'), JSON.stringify({ outputDirectory: customOutput }));
    await writeFile(join(currentUserDataDir, 'settings.json'), JSON.stringify({ theme: 'dark' }));

    await migrateLegacyBrandData({ currentUserDataDir, documentsDir });

    expect(JSON.parse(await readFile(join(currentUserDataDir, 'settings.json'), 'utf8')))
      .toEqual({ theme: 'dark' });
  });

  it('does not rewrite an existing current settings file that uses the previous output folder', async () => {
    const root = await mkdtemp(join(tmpdir(), 'markuprx-brand-migration-'));
    temporaryRoots.push(root);
    const applicationSupport = join(root, 'Application Support');
    const documentsDir = join(root, 'Documents');
    const legacyUserDataDir = join(applicationSupport, 'markupR');
    const currentUserDataDir = join(applicationSupport, 'MarkuprX');
    const previousOutput = join(documentsDir, 'markupr');
    await mkdir(legacyUserDataDir, { recursive: true });
    await mkdir(currentUserDataDir, { recursive: true });
    await writeFile(join(legacyUserDataDir, 'settings.json'), JSON.stringify({ theme: 'light' }));
    await writeFile(join(currentUserDataDir, 'settings.json'), JSON.stringify({
      outputDirectory: previousOutput,
      theme: 'dark',
    }));

    await migrateLegacyBrandData({ currentUserDataDir, documentsDir });

    expect(JSON.parse(await readFile(join(currentUserDataDir, 'settings.json'), 'utf8')))
      .toEqual({ outputDirectory: previousOutput, theme: 'dark' });
  });

  it('skips symbolic-link sources and destinations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'markuprx-brand-migration-'));
    temporaryRoots.push(root);
    const applicationSupport = join(root, 'Application Support');
    const documentsDir = join(root, 'Documents');
    const outsideDir = join(root, 'outside');
    const currentUserDataDir = join(applicationSupport, 'MarkuprX');
    await mkdir(applicationSupport, { recursive: true });
    await mkdir(documentsDir, { recursive: true });
    await mkdir(outsideDir, { recursive: true });
    await writeFile(join(outsideDir, 'settings.json'), JSON.stringify({ theme: 'light' }));
    await symlink(outsideDir, join(applicationSupport, 'markupR'));
    await symlink(outsideDir, join(documentsDir, 'markuprx'));
    await mkdir(join(documentsDir, 'markupr'), { recursive: true });
    await writeFile(join(documentsDir, 'markupr', 'session.md'), '# should not escape');

    const result = await migrateLegacyBrandData({ currentUserDataDir, documentsDir });

    expect(result.warnings.some((warning) => warning.includes('unsafe legacy data source'))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('unsafe migration destination'))).toBe(true);
    expect(await readFile(join(outsideDir, 'settings.json'), 'utf8')).toContain('light');
    await expect(readFile(join(outsideDir, 'session.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('exposes only the current keychain service plus private one-way migration sources', () => {
    expect(CURRENT_KEYTAR_SERVICE).toBe('com.markuprx.app');
    expect(LEGACY_KEYTAR_SERVICES).toContain('com.markupr.app');
    expect(LEGACY_KEYTAR_SERVICES).not.toContain(CURRENT_KEYTAR_SERVICE);
  });
});
