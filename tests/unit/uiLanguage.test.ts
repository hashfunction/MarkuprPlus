import { describe, expect, it, vi } from 'vitest';
import { normalizeUiLanguage, UI_LANGUAGES, type UiLanguage } from '../../src/shared/uiLanguage';
import { translateUiText } from '../../src/renderer/i18n/catalogs';
import { connectUiLanguage } from '../../src/renderer/i18n/connectUiLanguage';
import { flushPromises } from '../setup';

describe('UI language catalogs', () => {
  it('defaults missing or unsupported preferences to English without changing known choices', () => {
    for (const value of [undefined, null, 'fr', 'EN', 42]) {
      expect(normalizeUiLanguage(value)).toBe('en');
    }
    for (const { id } of UI_LANGUAGES) expect(normalizeUiLanguage(id)).toBe(id);
  });

  it('preserves English and whitespace, and falls back to the source for missing translations', () => {
    expect(translateUiText(' Settings ', 'en')).toBe(' Settings ');
    expect(translateUiText(' Settings ', 'zh-TW')).toBe(' 設定 ');
    expect(translateUiText(' \n ', 'zh-TW')).toBe(' \n ');
    expect(translateUiText('Uncatalogued label', 'zh-TW')).toBe('Uncatalogued label');
    expect(translateUiText('toString', 'zh-TW')).toBe('toString');
  });
});

describe('UI language subscription lifecycle', () => {
  function setup() {
    let resolve!: (value: UiLanguage) => void;
    let reject!: (reason: Error) => void;
    let notify!: (language: UiLanguage) => void;
    const loaded = new Promise<UiLanguage>((accept, fail) => { resolve = accept; reject = fail; });
    const unsubscribe = vi.fn();
    const settings = {
      get: vi.fn(() => loaded),
      onUiLanguageChange: vi.fn((callback: typeof notify) => {
        notify = callback;
        return unsubscribe;
      }),
    };
    const localizer = { setLanguage: vi.fn(), dispose: vi.fn() };
    const cleanup = connectUiLanguage(settings, localizer);
    return { settings, localizer, cleanup, resolve, reject, unsubscribe, notify, loaded };
  }

  it('starts in English and loads the saved preference', async () => {
    const state = setup();
    expect(state.localizer.setLanguage).toHaveBeenCalledWith('en');
    expect(state.settings.get).toHaveBeenCalledWith('uiLanguage');
    state.resolve('zh-TW');
    await state.loaded;
    await flushPromises();
    expect(state.localizer.setLanguage).toHaveBeenLastCalledWith('zh-TW');
    state.cleanup();
  });

  it('does not overwrite a newer notification with an older initial read', async () => {
    const state = setup();
    state.notify('zh-TW');
    state.resolve('en');
    await state.loaded;
    await flushPromises();
    expect(state.localizer.setLanguage).toHaveBeenLastCalledWith('zh-TW');
    state.cleanup();
  });

  it('unsubscribes and ignores late reads and notifications after disposal', async () => {
    const state = setup();
    state.cleanup();
    state.resolve('zh-TW');
    state.notify('zh-TW');
    await state.loaded;
    await flushPromises();
    expect(state.unsubscribe).toHaveBeenCalledOnce();
    expect(state.localizer.dispose).toHaveBeenCalledOnce();
    expect(state.localizer.setLanguage).toHaveBeenCalledTimes(1);
  });

  it('reports initial settings failures rather than hiding them', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const state = setup();
    const error = new Error('settings unavailable');
    state.reject(error);
    await expect(state.loaded).rejects.toThrow(error);
    expect(errorLog).toHaveBeenCalledWith(
      '[UiLanguage] Unable to load the saved interface language.',
      error,
    );
    state.cleanup();
    errorLog.mockRestore();
  });
});
