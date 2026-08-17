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
  failSettingsKey?: string;
  initializeHotkeys?: boolean;
  failHotkeyPersistenceAfterRegistration?: boolean;
  processingDelayMs?: number;
  reviewSaveDelayMs?: number;
  localTranscriptionRecovery?: boolean;
  clearDataDelayMs?: number;
  audioStartDelayMs?: number;
  audioPermissionDelayMs?: number;
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
      MARKUPRX_E2E_FAIL_SETTINGS_KEY: options.failSettingsKey ?? '',
      MARKUPRX_E2E_INITIALIZE_HOTKEYS: options.initializeHotkeys ? '1' : '0',
      MARKUPRX_E2E_FAIL_HOTKEY_PERSISTENCE_AFTER_REGISTRATION:
        options.failHotkeyPersistenceAfterRegistration ? '1' : '0',
      MARKUPRX_E2E_PROCESSING_DELAY_MS: String(options.processingDelayMs ?? 0),
      MARKUPRX_E2E_REVIEW_SAVE_DELAY_MS: String(options.reviewSaveDelayMs ?? 0),
      MARKUPRX_E2E_LOCAL_TRANSCRIPTION_RECOVERY:
        options.localTranscriptionRecovery ? '1' : '0',
      MARKUPRX_E2E_CLEAR_DATA_DELAY_MS: String(options.clearDataDelayMs ?? 0),
      MARKUPRX_E2E_AUDIO_START_DELAY_MS: String(options.audioStartDelayMs ?? 0),
      MARKUPRX_E2E_AUDIO_PERMISSION_DELAY_MS: String(options.audioPermissionDelayMs ?? 0),
    },
    logs,
    outputRoot,
    userDataDir,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
