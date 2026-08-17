import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, dialog, ipcMain } from 'electron';
import { registerSettingsHandlers } from '../../src/main/ipc/settingsHandlers';
import type { IpcContext, SessionActions } from '../../src/main/ipc/types';
import { DEFAULT_SETTINGS, IPC_CHANNELS, type AppSettings } from '../../src/shared/types';

const temporaryRoots: string[] = [];

function registeredHandler(channel: string): (...args: unknown[]) => unknown {
  const registration = vi.mocked(ipcMain.handle).mock.calls.find(([name]) => name === channel);
  if (!registration) throw new Error(`Handler not registered for ${channel}`);
  return registration[1] as (...args: unknown[]) => unknown;
}

function context(update: (updates: Partial<AppSettings>) => AppSettings): IpcContext {
  return {
    getMainWindow: () => null,
    getPopover: () => null,
    getSettingsManager: () => ({
      getAll: () => ({ ...DEFAULT_SETTINGS }),
      update,
    } as never),
    getWindowsTaskbar: () => null,
    getHasCompletedOnboarding: () => true,
    setHasCompletedOnboarding: () => undefined,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })));
});

describe('settings file public brand', () => {
  it('offers the MarkuprPlus settings filename for export', async () => {
    vi.mocked(app.getPath).mockReturnValue('/Documents');
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: true, filePath: '' });
    registerSettingsHandlers(context((updates) => ({ ...DEFAULT_SETTINGS, ...updates })), {} as SessionActions);

    await registeredHandler(IPC_CHANNELS.SETTINGS_EXPORT)({});

    expect(dialog.showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Export MarkuprPlus Settings',
      defaultPath: join('/Documents', 'MarkuprPlus-settings.json'),
    }));
  });

  it('imports an existing legacy-named settings file through the MarkuprPlus dialog', async () => {
    const root = await mkdtemp(join(tmpdir(), 'markuprplus-settings-import-'));
    temporaryRoots.push(root);
    const legacySettingsPath = join(root, 'MarkuprX-settings.json');
    await writeFile(legacySettingsPath, JSON.stringify({ theme: 'dark' }));
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: false,
      filePaths: [legacySettingsPath],
    });
    const update = vi.fn((updates: Partial<AppSettings>) => ({
      ...DEFAULT_SETTINGS,
      ...updates,
    }));
    registerSettingsHandlers(context(update), {} as SessionActions);

    const result = await registeredHandler(IPC_CHANNELS.SETTINGS_IMPORT)({});

    expect(dialog.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Import MarkuprPlus Settings',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    }));
    expect(update).toHaveBeenCalledWith({ theme: 'dark' });
    expect(result).toMatchObject({ theme: 'dark' });
  });
});
