#!/usr/bin/env node

import { _electron as electron } from '@playwright/test';
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function defaultExecutablePath() {
  if (process.platform !== 'darwin') {
    throw new Error(
      'Set MARKUPRX_PACKAGED_EXECUTABLE to test a packaged app outside macOS.',
    );
  }
  const outputDirectory = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
  return resolve(
    'release',
    outputDirectory,
    'MarkuprX.app',
    'Contents',
    'MacOS',
    'MarkuprX',
  );
}

function assertRuntime(condition, message) {
  if (!condition) throw new Error(message);
}

const executablePath = process.env.MARKUPRX_PACKAGED_EXECUTABLE
  ? resolve(process.env.MARKUPRX_PACKAGED_EXECUTABLE)
  : defaultExecutablePath();
const expectedArch = process.env.MARKUPRX_EXPECTED_ARCH || process.arch;
const temporaryRoot = await mkdtemp(join(tmpdir(), 'markuprx-packaged-smoke-'));
const outputRoot = join(temporaryRoot, 'output');
const userDataDir = join(temporaryRoot, 'user-data');
const documentsDir = join(temporaryRoot, 'documents');
let application;

try {
  await access(executablePath, constants.X_OK);
  await Promise.all([
    mkdir(outputRoot, { recursive: true }),
    mkdir(userDataDir, { recursive: true }),
    mkdir(documentsDir, { recursive: true }),
  ]);
  const inheritedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter((entry) => entry[1] !== undefined),
  );
  application = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${userDataDir}`],
    env: {
      ...inheritedEnvironment,
      NODE_ENV: 'test',
      MARKUPRX_E2E: '1',
      MARKUPRX_E2E_OUTPUT_ROOT: outputRoot,
      MARKUPRX_E2E_USER_DATA_DIR: userDataDir,
      MARKUPRX_E2E_DOCUMENTS_DIR: documentsDir,
      MARKUPRX_E2E_SKIP_ONBOARDING: '0',
    },
    timeout: 30_000,
  });

  const mainWindow = await application.firstWindow({ timeout: 30_000 });
  await mainWindow.waitForLoadState('domcontentloaded');
  await mainWindow.getByRole('heading', { name: 'Welcome to MarkuprX' })
    .waitFor({ state: 'visible', timeout: 30_000 });
  const applicationInfo = await application.evaluate(({ app }) => ({
    name: app.getName(),
    packaged: app.isPackaged,
    version: app.getVersion(),
  }));
  const arch = await application.evaluate(() => process.arch);
  const runtime = { arch, ...applicationInfo };
  const title = await mainWindow.title();

  assertRuntime(runtime.arch === expectedArch,
    `Expected ${expectedArch} package architecture, received ${runtime.arch}.`);
  assertRuntime(runtime.packaged === true, 'Application did not report packaged=true.');
  assertRuntime(runtime.name === 'MarkuprX', `Unexpected application name: ${runtime.name}.`);
  assertRuntime(runtime.version === '3.0.0', `Unexpected application version: ${runtime.version}.`);
  assertRuntime(title.includes('MarkuprX'), `Unexpected application title: ${title}.`);

  console.log(JSON.stringify({
    executablePath,
    runtime,
    title,
    onboardingVisible: true,
  }, null, 2));
} finally {
  if (application) await application.close().catch(() => undefined);
  await rm(temporaryRoot, { recursive: true, force: true });
}
