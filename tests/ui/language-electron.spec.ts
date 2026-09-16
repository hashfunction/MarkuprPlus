import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createElectronHarnessEnvironment } from '../fixtures/electronHarness';

const root = resolve(import.meta.dirname, '../..');

async function showSettings(application: ElectronApplication) {
  const page = await application.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await application.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('markuprx:show-settings');
      window.show();
    }
  });
  await page.locator('#markuprx-settings-tab-general').click();
  return page;
}

test('defaults to English and switches languages without reloading or changing user content', async () => {
  const harness = await createElectronHarnessEnvironment();
  const application = await electron.launch({ args: [root], env: harness.env });
  try {
    const page = await showSettings(application);
    await expect(page.getByRole('tab', { name: 'General', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const language = page.getByRole('combobox', { name: /Interface language|介面語言/ });
    await expect(language).toHaveValue('en');
    await page.evaluate(() => {
      document.documentElement.dataset.languageTestSession = 'not-reloaded';
      const fixture = document.createElement('div');
      fixture.id = 'language-fixture';
      fixture.innerHTML = '<span id="translated-copy" title="Open Settings">Settings</span>'
        + '<textarea placeholder="Open Settings">Settings</textarea><pre>Settings</pre>'
        + '<div contenteditable="true">Settings</div>'
        + '<div translate="no" title="Settings">Settings</div>';
      document.body.append(fixture);
    });
    await language.selectOption('zh-TW');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
    await expect(page.getByRole('tab', { name: '一般', exact: true })).toBeVisible();
    await expect(page.locator('#translated-copy')).toHaveText('設定');
    await expect(page.locator('#translated-copy')).toHaveAttribute('title', '開啟設定');
    await expect(page.locator('#language-fixture textarea')).toHaveValue('Settings');
    await expect(page.locator('#language-fixture textarea')).toHaveAttribute('placeholder', '開啟設定');
    await expect(page.locator('#language-fixture [contenteditable]')).toHaveText('Settings');
    await expect(page.locator('#language-fixture pre')).toHaveText('Settings');
    await expect(page.locator('#language-fixture [translate="no"]')).toHaveText('Settings');
    await expect(page.locator('#language-fixture [translate="no"]')).toHaveAttribute('title', 'Settings');
    await page.evaluate(() => {
      const copy = document.querySelector('#translated-copy')!;
      copy.firstChild!.nodeValue = 'Recording Active';
      copy.setAttribute('title', 'Stop Session');
      const newLabel = document.createElement('span');
      newLabel.id = 'new-label';
      newLabel.textContent = 'Open Settings';
      copy.append(newLabel);
    });
    await expect(page.locator('#translated-copy')).toHaveText('正在錄製開啟設定');
    await expect(page.locator('#new-label')).toHaveText('開啟設定');
    await language.selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('tab', { name: 'General', exact: true })).toBeVisible();
    await expect(page.locator('#translated-copy')).toHaveText('Recording ActiveOpen Settings');
    await expect(page.locator('#translated-copy')).toHaveAttribute('title', 'Stop Session');
    await expect(page.locator('#language-fixture textarea')).toHaveAttribute('placeholder', 'Open Settings');
    await expect(page.locator('html')).toHaveAttribute('data-language-test-session', 'not-reloaded');
    await expect(language).toHaveValue('en');
  } finally {
    await application.close();
    await harness.cleanup();
  }
});

test('persists the selected language across renderer reloads and synchronizes other windows', async () => {
  const harness = await createElectronHarnessEnvironment();
  let application = await electron.launch({ args: [root], env: harness.env });
  try {
    let page = await showSettings(application);
    await page.getByRole('combobox', { name: /Interface language|介面語言/ }).selectOption('zh-TW');
    await expect.poll(() => page.evaluate(() => window.markuprx.settings.get('uiLanguage'))).toBe('zh-TW');
    await application.close();
    application = await electron.launch({ args: [root], env: harness.env });
    page = await showSettings(application);
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
    const siblingPromise = application.waitForEvent('window');
    await application.evaluate(async ({ BrowserWindow }, preload) => {
      const source = BrowserWindow.getAllWindows()[0];
      const sibling = new BrowserWindow({
        show: false,
        webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      const url = new URL(source.webContents.getURL());
      url.searchParams.set('overlay', 'capture');
      await sibling.loadURL(url.href);
    }, resolve(root, 'dist/preload/index.cjs'));
    const sibling = await siblingPromise;
    await expect(sibling.locator('html')).toHaveAttribute('lang', 'zh-TW');
    await page.evaluate(() => window.markuprx.settings.set('uiLanguage', 'en'));
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(sibling.locator('html')).toHaveAttribute('lang', 'en');
    await showSettings(application);
    const language = page.getByRole('combobox', { name: /Interface language|介面語言/ });
    await expect(language).toHaveValue('en');
    await sibling.evaluate(() => window.markuprx.settings.set('uiLanguage', 'zh-TW'));
    await expect(language).toHaveValue('zh-TW');
    await page.getByRole('button', { name: '將此區段重設為預設值', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(sibling.locator('html')).toHaveAttribute('lang', 'en');
    await expect(language).toHaveValue('en');
    await expect.poll(() => page.evaluate(() => window.markuprx.settings.get('uiLanguage'))).toBe('en');
  } finally {
    await application.close();
    await harness.cleanup();
  }
});

test('uses English for an upgraded profile without changing its transcription language', async () => {
  const harness = await createElectronHarnessEnvironment();
  await writeFile(resolve(harness.userDataDir, 'settings.json'), JSON.stringify({ language: 'ja' }));
  const application = await electron.launch({ args: [root], env: harness.env });
  try {
    const page = await showSettings(application);
    await expect(page.getByRole('combobox', { name: 'Interface language' })).toHaveValue('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(await page.evaluate(() => window.markuprx.settings.get('language'))).toBe('ja');
  } finally {
    await application.close();
    await harness.cleanup();
  }
});

test('keeps English selected and reports a failed language save', async () => {
  const harness = await createElectronHarnessEnvironment({ failSettingsKey: 'uiLanguage' });
  const application = await electron.launch({ args: [root], env: harness.env });
  try {
    const page = await showSettings(application);
    const language = page.getByRole('combobox', { name: /Interface language|介面語言/ });
    await language.selectOption('zh-TW');
    await expect(page.getByText('Unable to save', { exact: true })).toBeVisible();
    await expect(language).toHaveValue('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect.poll(() => page.evaluate(() => window.markuprx.settings.get('uiLanguage'))).toBe('en');
  } finally {
    await application.close();
    await harness.cleanup();
  }
});
