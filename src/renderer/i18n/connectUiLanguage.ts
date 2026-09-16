import { DEFAULT_UI_LANGUAGE, type UiLanguage } from '../../shared/uiLanguage';
import type { UiLocalizer } from './UiLocalizer';

interface UiLanguageSettings {
  get(key: 'uiLanguage'): Promise<UiLanguage>;
  onUiLanguageChange(callback: (language: UiLanguage) => void): () => void;
}

export function connectUiLanguage(settings: UiLanguageSettings, localizer: UiLocalizer): () => void {
  let active = true;
  let receivedChange = false;
  localizer.setLanguage(DEFAULT_UI_LANGUAGE);
  const unsubscribe = settings.onUiLanguageChange((language) => {
    if (!active) return;
    receivedChange = true;
    localizer.setLanguage(language);
  });
  void settings.get('uiLanguage').then((language) => {
    if (active && !receivedChange) localizer.setLanguage(language);
  }).catch((error: unknown) => {
    console.error('[UiLanguage] Unable to load the saved interface language.', error);
  });
  return () => {
    active = false;
    unsubscribe();
    localizer.dispose();
  };
}
