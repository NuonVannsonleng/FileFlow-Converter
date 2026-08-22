import type { Translations } from './en';

export type { Translations };

/** Recursively optional, so a locale can be translated incrementally. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends string ? string : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type LanguageCode = 'en' | 'km';

/**
 * Dotted path into the translation tree, e.g. `hero.title`. Typing this means a
 * mistyped key is a build error rather than a blank label at runtime.
 */
export type TranslationKey = Paths<Translations>;

type Paths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : T[K] extends object
      ? Paths<T[K], `${Prefix}${K}.`>
      : never;
}[keyof T & string];

/** Values interpolated into `{placeholder}` slots. */
export type TranslationValues = Record<string, string | number>;
