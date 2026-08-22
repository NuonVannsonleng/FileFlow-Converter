import { useEffect } from 'react';
import { resolveTheme, usePreferences } from '@/store/usePreferences';

/**
 * Keeps `<html>` in sync with the theme preference, and re-resolves `system`
 * when the OS setting changes while the app is open.
 */
export function useThemeEffect(): void {
  const theme = usePreferences((state) => state.theme);
  const language = usePreferences((state) => state.language);

  useEffect(() => {
    const apply = () => {
      document.documentElement.classList.toggle('dark', resolveTheme(theme) === 'dark');
    };
    apply();

    if (theme !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [theme]);

  // Screen readers and font selection both key off the document language.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
}
