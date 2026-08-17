#!/usr/bin/env node

import { _electron as electron } from '@playwright/test';
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { runStartupProbe } from './lib/startup-probe.mjs';

const PUBLIC_PRODUCT_NAME = 'MarkuprPlus';

function defaultPackagedLayout(platform, arch, releaseRoot = resolve('release')) {
  if (platform === 'darwin') {
    if (!['x64', 'arm64', 'universal'].includes(arch)) {
      throw new Error(`Unsupported packaged smoke architecture: ${arch}.`);
    }
    const outputDirectory = arch === 'arm64'
      ? 'mac-arm64'
      : arch === 'universal' ? 'mac-universal' : 'mac';
    const executablePath = join(
      releaseRoot,
      outputDirectory,
      `${PUBLIC_PRODUCT_NAME}.app`,
      'Contents',
      'MacOS',
      PUBLIC_PRODUCT_NAME,
    );
    return {
      executablePath,
      resourcesPath: join(
        releaseRoot,
        outputDirectory,
        `${PUBLIC_PRODUCT_NAME}.app`,
        'Contents',
        'Resources',
      ),
    };
  }
  if (platform === 'win32') {
    const outputDirectory = 'win-unpacked';
    return {
      executablePath: join(releaseRoot, outputDirectory, `${PUBLIC_PRODUCT_NAME}.exe`),
      resourcesPath: join(releaseRoot, outputDirectory, 'resources'),
    };
  }
  if (platform === 'linux') {
    const outputDirectory = arch === 'arm64' ? 'linux-arm64-unpacked' : 'linux-unpacked';
    return {
      executablePath: join(releaseRoot, outputDirectory, PUBLIC_PRODUCT_NAME),
      resourcesPath: join(releaseRoot, outputDirectory, 'resources'),
    };
  }
  throw new Error(`Unsupported packaged smoke platform: ${platform}.`);
}

function resourcesPathForExecutable(executablePath, platform) {
  return platform === 'darwin'
    ? join(dirname(dirname(executablePath)), 'Resources')
    : join(dirname(executablePath), 'resources');
}

function assertRuntime(condition, message) {
  if (!condition) throw new Error(message);
}

const printLayoutArgument = process.argv.find((argument) => argument.startsWith('--print-layout='));
if (printLayoutArgument) {
  const target = printLayoutArgument.slice('--print-layout='.length);
  const [platform, arch] = target.split(':');
  console.log(JSON.stringify(defaultPackagedLayout(platform, arch), null, 2));
  process.exit(0);
}

const defaultLayout = defaultPackagedLayout(process.platform, process.arch);
const executablePath = process.env.MARKUPRX_PACKAGED_EXECUTABLE
  ? resolve(process.env.MARKUPRX_PACKAGED_EXECUTABLE)
  : defaultLayout.executablePath;
const expectedArch = process.env.MARKUPRX_EXPECTED_ARCH || process.arch;
const resourcesPath = process.env.MARKUPRX_PACKAGED_EXECUTABLE
  ? resourcesPathForExecutable(executablePath, process.platform)
  : defaultLayout.resourcesPath;
const updaterConfigPath = join(resourcesPath, 'app-update.yml');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'markuprx-packaged-smoke-'));
const userDataDir = join(temporaryRoot, 'user-data');
const documentsDir = join(temporaryRoot, 'documents');
let application;

try {
  await access(executablePath, constants.X_OK);
  let updaterMetadataPresent = true;
  try {
    await access(updaterConfigPath, constants.F_OK);
  } catch {
    updaterMetadataPresent = false;
  }
  assertRuntime(
    !updaterMetadataPresent,
    `Packaged app must not contain updater metadata: ${updaterConfigPath}`,
  );
  await Promise.all([
    mkdir(userDataDir, { recursive: true }),
    mkdir(documentsDir, { recursive: true }),
  ]);
  const inheritedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter((entry) => entry[1] !== undefined),
  );
  const launchArguments = [
    '--markuprplus-package-smoke',
    `--user-data-dir=${userDataDir}`,
  ];
  const launchEnvironment = {
    ...inheritedEnvironment,
    NODE_ENV: 'test',
    MARKUPRX_PACKAGE_SMOKE: '1',
    MARKUPRX_PACKAGE_SMOKE_USER_DATA_DIR: userDataDir,
    MARKUPRX_PACKAGE_SMOKE_DOCUMENTS_DIR: documentsDir,
  };

  if (process.env.MARKUPRX_PACKAGE_SMOKE_MODE === 'startup') {
    await runStartupProbe(executablePath, launchArguments, launchEnvironment);
    console.log(JSON.stringify({
      executablePath,
      expectedArch,
      mode: 'startup',
      startupReady: true,
      updaterMetadataPresent,
    }, null, 2));
    process.exitCode = 0;
  } else {
    application = await electron.launch({
      executablePath,
      args: launchArguments,
      env: launchEnvironment,
      timeout: 30_000,
    });

    const mainWindow = await application.firstWindow({ timeout: 30_000 });
    await mainWindow.waitForLoadState('domcontentloaded');
    await mainWindow.getByRole('heading', { name: `Welcome to ${PUBLIC_PRODUCT_NAME}` })
      .waitFor({ state: 'visible', timeout: 30_000 });
    const applicationInfo = await application.evaluate(({ app }) => ({
      name: app.getName(),
      packaged: app.isPackaged,
      version: app.getVersion(),
    }));
    const arch = await application.evaluate(() => process.arch);
    const runtime = { arch, ...applicationInfo };
    const title = await mainWindow.title();

    assertRuntime(
      expectedArch === 'universal'
        ? runtime.arch === 'x64' || runtime.arch === 'arm64'
        : runtime.arch === expectedArch,
      `Expected ${expectedArch} package architecture, received ${runtime.arch}.`);
    assertRuntime(runtime.packaged === true, 'Application did not report packaged=true.');
    assertRuntime(
      runtime.name === PUBLIC_PRODUCT_NAME,
      `Unexpected application name: ${runtime.name}.`,
    );
    assertRuntime(runtime.version === '3.0.0', `Unexpected application version: ${runtime.version}.`);
    assertRuntime(
      title.includes(PUBLIC_PRODUCT_NAME),
      `Unexpected application title: ${title}.`,
    );

    console.log(JSON.stringify({
      executablePath,
      runtime,
      title,
      onboardingVisible: true,
      updaterMetadataPresent,
    }, null, 2));
  }
} finally {
  if (application) await application.close().catch(() => undefined);
  await rm(temporaryRoot, { recursive: true, force: true });
}
