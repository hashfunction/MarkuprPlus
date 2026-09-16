export const UI_LANGUAGES = [
  { id: 'en', name: 'English' },
  { id: 'zh-TW', name: '繁體中文 (Traditional Chinese)' },
] as const;

export type UiLanguage = typeof UI_LANGUAGES[number]['id'];
export const DEFAULT_UI_LANGUAGE: UiLanguage = 'en';

export function isUiLanguage(value: unknown): value is UiLanguage {
  return UI_LANGUAGES.some(({ id }) => id === value);
}

export function normalizeUiLanguage(value: unknown): UiLanguage {
  return isUiLanguage(value) ? value : DEFAULT_UI_LANGUAGE;
}
