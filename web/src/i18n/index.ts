import { en } from './en';
import { km } from './km';
import type {
  DeepPartial,
  LanguageCode,
  TranslationKey,
  TranslationValues,
  Translations,
} from './types';

export type { LanguageCode, TranslationKey, TranslationValues, Translations };

const BUNDLES: Record<LanguageCode, Translations | DeepPartial<Translations>> = { en, km };

export const LANGUAGES: { code: LanguageCode; label: string; english: string }[] = [
  { code: 'en', label: 'English', english: 'English' },
  { code: 'km', label: 'ភាសាខ្មែរ', english: 'Khmer' },
];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

function lookup(bundle: unknown, path: string): string | undefined {
  let current: unknown = bundle;
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' ? current : undefined;
}

/** Replace `{name}` placeholders. Unknown placeholders are left untouched. */
function interpolate(template: string, values?: TranslationValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/**
 * Resolve a key for a language, falling back to English per key rather than per
 * bundle, so a partly translated locale degrades one string at a time.
 */
export function translate(
  language: LanguageCode,
  key: TranslationKey,
  values?: TranslationValues,
): string {
  const localized = lookup(BUNDLES[language], key);
  const fallback = lookup(en, key);
  return interpolate(localized ?? fallback ?? key, values);
}

export function isLanguageCode(value: string): value is LanguageCode {
  return LANGUAGES.some((language) => language.code === value);
}

/** Best match between the browser's preferences and the locales we ship. */
export function detectLanguage(): LanguageCode {
  if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE;
  for (const preference of navigator.languages ?? [navigator.language]) {
    const base = preference.toLowerCase().split('-')[0] ?? '';
    if (isLanguageCode(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}
