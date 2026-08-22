import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { detectLanguage, type LanguageCode } from '@/i18n';

export type ThemeMode = 'light' | 'dark' | 'system';

interface PreferencesState {
  theme: ThemeMode;
  language: LanguageCode;
  /** Pre-selected output format, when the file type supports it. */
  defaultFormat: string | null;
  autoDownload: boolean;
  keepHistory: boolean;
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (language: LanguageCode) => void;
  setDefaultFormat: (format: string | null) => void;
  setAutoDownload: (value: boolean) => void;
  setKeepHistory: (value: boolean) => void;
  reset: () => void;
}

const DEFAULTS = {
  theme: 'system' as ThemeMode,
  // First-time visitors get their browser's language; once they choose one in
  // Settings, the persisted value takes over and this is never consulted again.
  language: detectLanguage(),
  defaultFormat: null,
  autoDownload: false,
  keepHistory: true,
};

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setDefaultFormat: (defaultFormat) => set({ defaultFormat }),
      setAutoDownload: (autoDownload) => set({ autoDownload }),
      setKeepHistory: (keepHistory) => set({ keepHistory }),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'fileflow.preferences',
      version: 1,
    },
  ),
);

/**
 * Resolve `system` against the OS setting. Kept separate from the store so the
 * media-query listener lives in one place (see useTheme).
 */
export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
