import { DEFAULT_UI_LANGUAGE, normalizeUiLanguage } from '../../shared/uiLanguage';
import { translateUiText } from './catalogs';

const ATTRIBUTE_NAMES = ['title', 'aria-label', 'placeholder', 'data-tooltip-content'];
const SKIP_TEXT = 'script,style,textarea,input,pre,[contenteditable],[translate="no"]';
const SKIP_ATTRIBUTES = 'script,style,pre,[translate="no"]';

interface TranslatedValue {
  source: string;
  translated: string;
}

export interface UiLocalizer {
  setLanguage(language: unknown): void;
  dispose(): void;
}

export function createUiLocalizer(document: Document): UiLocalizer {
  const textValues = new WeakMap<Node, TranslatedValue>();
  const attributeValues = new WeakMap<Element, Map<string, TranslatedValue>>();
  let language = DEFAULT_UI_LANGUAGE;
  let scheduled = false;
  let disposed = false;

  function translatedValue(current: string, previous?: TranslatedValue): TranslatedValue {
    // React may have updated this same node since the last translation pass.
    const source = previous?.translated === current ? previous.source : current;
    return { source, translated: translateUiText(source, language) };
  }

  function apply(): void {
    if (disposed) return;
    observer.disconnect();
    document.documentElement.lang = language;
    if (document.body) {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        if (node.parentElement && !node.parentElement.closest(SKIP_TEXT)) {
          const value = translatedValue(node.nodeValue ?? '', textValues.get(node));
          textValues.set(node, value);
          if (node.nodeValue !== value.translated) node.nodeValue = value.translated;
        }
        node = walker.nextNode();
      }
      for (const element of [document.body, ...document.body.querySelectorAll('*')]) {
        if (element.closest(SKIP_ATTRIBUTES)) continue;
        const values = attributeValues.get(element) ?? new Map<string, TranslatedValue>();
        for (const name of ATTRIBUTE_NAMES) {
          const current = element.getAttribute(name);
          if (current === null) {
            values.delete(name);
            continue;
          }
          const value = translatedValue(current, values.get(name));
          values.set(name, value);
          if (current !== value.translated) element.setAttribute(name, value.translated);
        }
        attributeValues.set(element, values);
      }
    }
    if (language !== 'en') {
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ATTRIBUTE_NAMES,
      });
    }
  }

  const observer = new MutationObserver(() => {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      apply();
    });
  });

  return {
    setLanguage(value) {
      language = normalizeUiLanguage(value);
      apply();
    },
    dispose() {
      language = DEFAULT_UI_LANGUAGE;
      apply();
      disposed = true;
      observer.disconnect();
    },
  };
}
