import type { Category } from '@shared';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  // Whole bytes and large round numbers read better without a decimal point.
  const precision = exponent === 0 || value >= 100 ? 0 : decimals;
  return `${value.toFixed(precision)} ${UNITS[exponent]}`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/** Size change between input and output, as a signed percentage. */
export function sizeDelta(from: number, to: number): number | null {
  if (from <= 0 || to <= 0) return null;
  return Math.round(((to - from) / from) * 100);
}

export function relativeTime(iso: string, locale: string, labels: { today: string; yesterday: string }): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const time = date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);

  if (dayDiff === 0) return `${labels.today}, ${time}`;
  if (dayDiff === 1) return `${labels.yesterday}, ${time}`;
  return `${date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}, ${time}`;
}

export function minutesUntil(iso: string): number {
  const remaining = Date.parse(iso) - Date.now();
  return Math.max(0, Math.round(remaining / 60_000));
}

/** Accent colour per category, used for icons and chips. */
export const CATEGORY_TONE: Record<Category, { text: string; bg: string; ring: string }> = {
  document: { text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10', ring: 'ring-rose-500/20' },
  image: { text: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/10', ring: 'ring-violet-500/20' },
  audio: { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', ring: 'ring-amber-500/20' },
  video: { text: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-500/10', ring: 'ring-sky-500/20' },
  archive: { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20' },
};

export const CATEGORY_LABEL: Record<Category, string> = {
  document: 'Documents',
  image: 'Images',
  audio: 'Audio',
  video: 'Video',
  archive: 'Archives',
};
