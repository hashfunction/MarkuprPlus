import { constants as fsConstants } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const PREVIOUS_MACHINE_NAME = 'markupr';
const PREVIOUS_PRODUCT_NAMES = ['markupR', PREVIOUS_MACHINE_NAME] as const;
const PREVIOUS_RECOVERY_STORE = 'markupr-crash-recovery.json';
const CURRENT_MACHINE_NAME = 'markuprx';
const CURRENT_RECOVERY_STORE = 'markuprx-crash-recovery.json';
const MIGRATION_MARKER = '.markuprx-brand-migration-v1.json';

export const CURRENT_KEYTAR_SERVICE = 'com.markuprx.app';
export const LEGACY_KEYTAR_SERVICES = [
  'com.markupr.app',
  'com.feedbackflow.app',
  'feedbackflow',
] as const;

export interface LegacyBrandMigrationOptions {
  currentUserDataDir: string;
  documentsDir: string;
}

export interface LegacyBrandMigrationResult {
  migrated: boolean;
  alreadyCompleted: boolean;
  copiedFiles: number;
  warnings: string[];
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function copyMissingTree(
  source: string,
  destination: string,
  result: LegacyBrandMigrationResult,
): Promise<void> {
  let sourceStat;
  try {
    sourceStat = await lstat(source);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }

  if (sourceStat.isSymbolicLink()) {
    result.warnings.push(`Skipped symbolic link during local-data migration: ${source}`);
    return;
  }
  if (sourceStat.isDirectory()) {
    try {
      const destinationStat = await lstat(destination);
      if (destinationStat.isSymbolicLink() || !destinationStat.isDirectory()) {
        result.warnings.push(`Skipped unsafe migration destination: ${destination}`);
        return;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await mkdir(destination, { recursive: true });
    const entries = await readdir(source);
    for (const entry of entries) {
      await copyMissingTree(join(source, entry), join(destination, entry), result);
    }
    return;
  }
  if (!sourceStat.isFile()) return;

  await mkdir(dirname(destination), { recursive: true });
  try {
    await copyFile(source, destination, fsConstants.COPYFILE_EXCL);
    result.copiedFiles += 1;
    result.migrated = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
}

async function rewriteDefaultOutputDirectory(
  settingsPath: string,
  documentsDir: string,
  result: LegacyBrandMigrationResult,
): Promise<void> {
  if (!(await pathExists(settingsPath))) return;
  try {
    const settings = JSON.parse(await readFile(settingsPath, 'utf8')) as Record<string, unknown>;
    const previousDefault = join(documentsDir, PREVIOUS_MACHINE_NAME);
    if (typeof settings.outputDirectory !== 'string'
      || resolve(settings.outputDirectory) !== resolve(previousDefault)) return;
    settings.outputDirectory = join(documentsDir, CURRENT_MACHINE_NAME);
    await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    result.migrated = true;
  } catch (error) {
    result.warnings.push(
      `Could not normalize the migrated settings output path: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Performs a private, one-way copy into MarkuprX-owned locations. Existing
 * destination files always win, so a migration can never roll back newer data.
 */
export async function migrateLegacyBrandData(
  options: LegacyBrandMigrationOptions,
): Promise<LegacyBrandMigrationResult> {
  const result: LegacyBrandMigrationResult = {
    migrated: false,
    alreadyCompleted: false,
    copiedFiles: 0,
    warnings: [],
  };
  const markerPath = join(options.currentUserDataDir, MIGRATION_MARKER);
  if (await pathExists(markerPath)) {
    result.alreadyCompleted = true;
    return result;
  }

  await mkdir(options.currentUserDataDir, { recursive: true });
  const currentSettingsPath = join(options.currentUserDataDir, 'settings.json');
  const currentSettingsAlreadyExisted = await pathExists(currentSettingsPath);
  const userDataParent = dirname(options.currentUserDataDir);
  for (const previousProductName of PREVIOUS_PRODUCT_NAMES) {
    const sourceDir = join(userDataParent, previousProductName);
    if (resolve(sourceDir) === resolve(options.currentUserDataDir)
      || !(await pathExists(sourceDir))) continue;
    const sourceStat = await lstat(sourceDir);
    if (sourceStat.isSymbolicLink() || !sourceStat.isDirectory()) {
      result.warnings.push(`Skipped unsafe legacy data source: ${sourceDir}`);
      continue;
    }
    const entries = await readdir(sourceDir);
    for (const entry of entries) {
      const destinationName = entry === PREVIOUS_RECOVERY_STORE
        ? CURRENT_RECOVERY_STORE
        : entry;
      await copyMissingTree(
        join(sourceDir, entry),
        join(options.currentUserDataDir, destinationName),
        result,
      );
    }
  }

  await copyMissingTree(
    join(options.documentsDir, PREVIOUS_MACHINE_NAME),
    join(options.documentsDir, CURRENT_MACHINE_NAME),
    result,
  );
  if (!currentSettingsAlreadyExisted) {
    await rewriteDefaultOutputDirectory(currentSettingsPath, options.documentsDir, result);
  }

  await writeFile(markerPath, `${JSON.stringify({ completedAt: new Date().toISOString() })}\n`, {
    mode: 0o600,
  });
  return result;
}
