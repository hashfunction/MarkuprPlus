import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { app } from 'electron';
import { isElectronTestHarnessAllowed } from './e2e/ElectronTestHarness';
import { configureRuntimeBrand } from './runtimeBrand';

const testHarnessAllowed = isElectronTestHarnessAllowed({
  requested: process.env.MARKUPRX_E2E === '1',
  isPackaged: app.isPackaged,
});
const packagedSmokeAllowed = app.isPackaged
  && process.env.MARKUPRX_PACKAGE_SMOKE === '1'
  && process.argv.includes('--markuprplus-package-smoke');
const isolatedRuntime = testHarnessAllowed || packagedSmokeAllowed;

if (isolatedRuntime) {
  const requestedRoot = testHarnessAllowed
    ? process.env.MARKUPRX_E2E_USER_DATA_DIR
    : process.env.MARKUPRX_PACKAGE_SMOKE_USER_DATA_DIR;
  if (!requestedRoot) {
    throw new Error(
      testHarnessAllowed
        ? 'MARKUPRX_E2E_USER_DATA_DIR is required for isolated Electron tests.'
        : 'MARKUPRX_PACKAGE_SMOKE_USER_DATA_DIR is required for packaged smoke tests.',
    );
  }

  const userDataDir = resolve(requestedRoot);
  const requestedDocumentsDir = testHarnessAllowed
    ? process.env.MARKUPRX_E2E_DOCUMENTS_DIR
    : process.env.MARKUPRX_PACKAGE_SMOKE_DOCUMENTS_DIR;
  const documentsDir = resolve(requestedDocumentsDir || join(userDataDir, 'documents'));
  const logsDir = join(userDataDir, 'logs');
  const tempDir = join(userDataDir, 'temp');
  for (const path of [userDataDir, documentsDir, logsDir, tempDir]) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
  }

  app.setPath('userData', userDataDir);
  app.setPath('documents', documentsDir);
  app.setPath('logs', logsDir);
  app.setPath('temp', tempDir);
}

configureRuntimeBrand(app, !isolatedRuntime);

await import('./index');
