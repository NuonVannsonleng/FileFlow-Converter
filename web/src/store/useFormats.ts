import { create } from 'zustand';
import type { Category, ConversionOption, FormatInfo, FormatsResponse } from '@shared';
import { getFormats } from '@/lib/api';

interface FormatsState {
  data: FormatsResponse | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  load: () => Promise<void>;
}

/**
 * The capability manifest, fetched once per session. Everything the UI offers is
 * derived from this, which is what keeps the app from advertising a conversion
 * the server cannot perform.
 */
export const useFormats = create<FormatsState>((set, get) => ({
  data: null,
  status: 'idle',

  load: async () => {
    if (get().status === 'loading' || get().status === 'ready') return;
    set({ status: 'loading' });
    try {
      set({ data: await getFormats(), status: 'ready' });
    } catch {
      set({ status: 'error' });
    }
  },
}));

// ---------------------------------------------------------------------------
// Derivations. Pure functions so they can be memoised at the call site.
// ---------------------------------------------------------------------------

export function formatMap(data: FormatsResponse | null): Map<string, FormatInfo> {
  return new Map((data?.formats ?? []).map((format) => [format.id, format]));
}

/** Every target offered for a source, split into working and gated pairs. */
export function targetsFor(
  data: FormatsResponse | null,
  from: string,
): { available: ConversionOption[]; comingSoon: ConversionOption[] } {
  const matching = (data?.conversions ?? []).filter((c) => c.from === from);
  return {
    available: matching.filter((c) => c.available),
    comingSoon: matching.filter((c) => !c.available),
  };
}

/** Targets every one of these sources supports, for batches of mixed types. */
export function sharedTargets(data: FormatsResponse | null, sources: string[]): string[] {
  if (sources.length === 0) return [];
  const sets = sources.map(
    (from) => new Set(targetsFor(data, from).available.map((option) => option.to)),
  );
  const [first, ...rest] = sets;
  if (!first) return [];
  return [...first].filter((target) => rest.every((set) => set.has(target))).sort();
}

export function conversionOption(
  data: FormatsResponse | null,
  from: string,
  to: string,
): ConversionOption | undefined {
  return (data?.conversions ?? []).find((c) => c.from === from && c.to === to);
}

/** File extensions the server will accept, for the file picker's `accept`. */
export function acceptAttribute(data: FormatsResponse | null): string {
  const sources = new Set(
    (data?.conversions ?? []).filter((c) => c.available).map((c) => c.from),
  );
  const formats = formatMap(data);
  const extensions = new Set<string>();
  for (const source of sources) {
    extensions.add(`.${source}`);
    for (const alias of formats.get(source)?.aliases ?? []) extensions.add(`.${alias}`);
  }
  return [...extensions].sort().join(',');
}

export function categoriesPresent(data: FormatsResponse | null): Category[] {
  const seen = new Set<Category>();
  for (const option of data?.conversions ?? []) {
    if (option.available) seen.add(option.category);
  }
  return [...seen];
}

/** Resolve a filename to a canonical format id using the server's alias table. */
export function detectFormat(data: FormatsResponse | null, filename: string): string | undefined {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.tar.gz')) return 'tar.gz';
  const extension = lower.slice(lower.lastIndexOf('.') + 1);
  if (!extension || extension === lower) return undefined;

  for (const format of data?.formats ?? []) {
    if (format.id === extension || format.aliases?.includes(extension)) return format.id;
  }
  return undefined;
}
