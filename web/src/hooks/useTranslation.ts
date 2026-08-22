import { useCallback } from 'react';
import { translate, type TranslationKey, type TranslationValues } from '@/i18n';
import { usePreferences } from '@/store/usePreferences';

/**
 * Translation hook. Reading `language` from the store is what makes a language
 * switch instant: every consumer re-renders, with no reload and no route change.
 */
export function useTranslation() {
  const language = usePreferences((state) => state.language);

  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues) => translate(language, key, values),
    [language],
  );

  return { t, language, locale: language === 'km' ? 'km-KH' : 'en-US' };
}
