import type { UiLanguage } from '../../shared/uiLanguage';
import { traditionalChineseCatalog } from '../traditionalChinese';

export interface UiTranslationCatalog {
  exact: Readonly<Record<string, string>>;
  fragments: ReadonlyArray<readonly [string, string]>;
}

const CATALOGS: Record<Exclude<UiLanguage, 'en'>, UiTranslationCatalog> = {
  'zh-TW': traditionalChineseCatalog,
};

export function translateUiText(value: string, language: UiLanguage): string {
  if (language === 'en' || !value.trim()) return value;
  const catalog = CATALOGS[language];
  const trimmed = value.trim();
  if (Object.prototype.hasOwnProperty.call(catalog.exact, trimmed)) {
    return value.replace(trimmed, catalog.exact[trimmed]);
  }
  return catalog.fragments.reduce(
    (translated, [source, target]) => translated.split(source).join(target),
    value,
  );
}
