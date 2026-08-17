import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { app } from 'electron';
import { isElectronTestHarnessAllowed } from './e2e/ElectronTestHarness';
import { configureRuntimeBrand } from './runtimeBrand';

const testHarnessAllowed = isElectronTestHarnessAllowed({
  requested: process.env.MARKUPRX_E2E === '1',
  isPackaged: app.isPackaged,
});

if (testHarnessAllowed) {
  const requestedRoot = process.env.MARKUPRX_E2E_USER_DATA_DIR;
  if (!requestedRoot) {
    throw new Error('MARKUPRX_E2E_USER_DATA_DIR is required for isolated Electron tests.');
  }

  const userDataDir = resolve(requestedRoot);
  const documentsDir = resolve(process.env.MARKUPRX_E2E_DOCUMENTS_DIR || join(userDataDir, 'documents'));
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

configureRuntimeBrand(app, !testHarnessAllowed);

await import('./index');
