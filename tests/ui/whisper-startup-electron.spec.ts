import { _electron as electron, expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { createElectronHarnessEnvironment } from '../fixtures/electronHarness';

const root = resolve(import.meta.dirname, '../..');

test('shows background model progress and download failures in Settings', async () => {
  const harness = await createElectronHarnessEnvironment();
  const application = await electron.launch({ args: [root], env: harness.env });
  try {
    const page = await application.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await application.evaluate(({ ipcMain, BrowserWindow }) => {
      ipcMain.removeHandler('markuprx:whisper:check-model');
      ipcMain.handle('markuprx:whisper:check-model', () => ({
        hasAnyModel: false, defaultModel: null, downloadedModels: [],
        recommendedModel: 'tiny', recommendedModelSizeMB: 75,
        downloadStatus: { model: 'tiny', isDownloading: true, percent: 12, error: null },
      }));
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send('markuprx:show-settings');
        window.show();
      }
    });
    await page.locator('#markuprx-settings-tab-advanced').click();
    const vocabularyHints = page.getByRole('textbox', { name: 'Whisper vocabulary hints', exact: true });
    await vocabularyHints.fill('card, potion, HUD');
    await vocabularyHints.blur();
    await expect.poll(() => page.evaluate(() => window.markuprx.settings.get('localWhisperPrompt')))
      .toBe('card, potion, HUD');
    await expect(page.getByText('Downloading tiny (12%). You can keep using the app.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Downloading…', exact: true })).toBeDisabled();
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].webContents.send('markuprx:whisper:download-progress', {
        model: 'tiny', percent: 42,
      });
    });
    await expect(page.getByText('Downloading tiny (42%). You can keep using the app.')).toBeVisible();
    await application.evaluate(({ ipcMain, BrowserWindow }) => {
      ipcMain.removeHandler('markuprx:whisper:check-model');
      ipcMain.handle('markuprx:whisper:check-model', () => ({
        hasAnyModel: false, defaultModel: null, downloadedModels: [],
        recommendedModel: 'tiny', recommendedModelSizeMB: 75,
        downloadStatus: { model: 'tiny', isDownloading: false, percent: 42, error: 'Network unavailable' },
      }));
      BrowserWindow.getAllWindows()[0].webContents.send('markuprx:whisper:download-error', {
        model: 'tiny', error: 'Network unavailable',
      });
    });
    await expect(page.getByText('Network unavailable', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Repair local transcription', exact: true })).toBeEnabled();
  } finally {
    await application.close();
    await harness.cleanup();
  }
});

test('downloads and reuses a real Whisper model automatically on desktop startup', async () => {
  test.skip(process.env.MARKUPRPLUS_TEST_WHISPER_DOWNLOAD !== '1', 'Opt-in 75 MB public model download');
  test.setTimeout(180_000);
  const harness = await createElectronHarnessEnvironment();
  const env = { ...harness.env, MARKUPRX_E2E_DOWNLOAD_MODELS: '1' };
  let application = await electron.launch({ args: [root], env });
  try {
    let page = await application.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await expect.poll(
      async () => {
        const status = await page.evaluate(() => window.markuprx.whisper.checkModel());
        if (status.downloadStatus?.error) throw new Error(status.downloadStatus.error);
        return status.hasAnyModel;
      },
      { timeout: 150_000, intervals: [250, 500, 1000] },
    ).toBe(true);
    const modelPath = resolve(harness.userDataDir, 'whisper-models/ggml-tiny.bin');
    const downloaded = await stat(modelPath);
    expect(downloaded.size).toBeGreaterThan(70_000_000);
    await application.close();
    application = await electron.launch({ args: [root], env });
    page = await application.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await expect.poll(() => page.evaluate(() => window.markuprx.whisper.checkModel()))
      .toMatchObject({ hasAnyModel: true, defaultModel: 'tiny', downloadStatus: { isDownloading: false } });
    expect((await stat(modelPath)).mtimeMs).toBe(downloaded.mtimeMs);
  } finally {
    await application.close();
    await harness.cleanup();
  }
});
