import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface ElectronHarnessEnvironment {
  env: Record<string, string>;
  logs: string[];
  outputRoot: string;
  userDataDir: string;
  cleanup: () => Promise<void>;
}

export async function createElectronHarnessEnvironment(options: {
  showOnboarding?: boolean;
} = {}): Promise<ElectronHarnessEnvironment> {
  const root = await mkdtemp(join(tmpdir(), 'markuprx-electron-ui-'));
  const outputRoot = join(root, 'output');
  const userDataDir = join(root, 'user-data');
  const documentsDir = join(root, 'documents');
  await Promise.all([
    mkdir(outputRoot, { recursive: true }),
    mkdir(userDataDir, { recursive: true }),
    mkdir(documentsDir, { recursive: true }),
  ]);
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const logs: string[] = [];

  return {
    env: {
      ...env,
      NODE_ENV: 'test',
      MARKUPRX_E2E: '1',
      MARKUPRX_E2E_OUTPUT_ROOT: outputRoot,
      MARKUPRX_E2E_USER_DATA_DIR: userDataDir,
      MARKUPRX_E2E_DOCUMENTS_DIR: documentsDir,
      MARKUPRX_E2E_SKIP_ONBOARDING: options.showOnboarding ? '0' : '1',
    },
    logs,
    outputRoot,
    userDataDir,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
