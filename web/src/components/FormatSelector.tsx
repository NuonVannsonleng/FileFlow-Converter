import { useMemo, useState } from 'react';
import { Check, ChevronDown, Lock, Search } from 'lucide-react';
import type { Category, ConversionOption, FormatInfo } from '@shared';
import { CATEGORIES } from '@shared';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/cn';
import { CATEGORY_LABEL } from '@/lib/format';
import { formatMap, useFormats } from '@/store/useFormats';
import { FileIcon } from './FileIcon';
import { Modal } from './ui/Modal';
import { inputClass } from './ui/Field';

interface FormatSelectorProps {
  /** Targets this batch can actually produce. */
  available: string[];
  /** Targets shown greyed out with a "Coming soon" badge. */
  comingSoon?: ConversionOption[];
  value: string | null;
  onChange: (format: string) => void;
  disabled?: boolean;
  /** Highlighted at the top of the list. */
  recommended?: string[];
}

export function FormatSelector({
  available,
  comingSoon = [],
  value,
  onChange,
  disabled,
  recommended = [],
}: FormatSelectorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const data = useFormats((state) => state.data);
  const formats = useMemo(() => formatMap(data), [data]);

  const selected = value ? formats.get(value) : undefined;

  const { grouped, recommendedFormats, gated, hasResults } = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matches = (format: FormatInfo | undefined) =>
      !!format &&
      (needle === '' ||
        format.id.includes(needle) ||
        format.label.toLowerCase().includes(needle) ||
        format.description.toLowerCase().includes(needle));

    const usable = available.map((id) => formats.get(id)).filter((f): f is FormatInfo => matches(f));

    const recommendedSet = new Set(recommended);
    const recommendedList = usable.filter((format) => recommendedSet.has(format.id));

    const byCategory = new Map<Category, FormatInfo[]>();
    for (const format of usable) {
      if (recommendedSet.has(format.id)) continue;
      const list = byCategory.get(format.category) ?? [];
      list.push(format);
      byCategory.set(format.category, list);
    }

    const gatedList = comingSoon
      .map((option) => formats.get(option.to))
      .filter((f): f is FormatInfo => matches(f));

    return {
      grouped: byCategory,
      recommendedFormats: recommendedList,
      gated: gatedList,
      hasResults: usable.length > 0 || gatedList.length > 0,
    };
  }, [available, comingSoon, formats, query, recommended]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setQuery('');
          setOpen(true);
        }}
        disabled={disabled || available.length === 0}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'flex h-12 w-full items-center gap-3 rounded-xl border px-3.5 text-left transition-all duration-200',
          'disabled:cursor-not-allowed disabled:opacity-60',
          selected
            ? 'border-accent/40 bg-accent-soft/50'
            : 'border-line bg-surface hover:border-accent/40 hover:bg-elevated',
        )}
      >
        {selected ? (
          <>
            <FileIcon
              format={selected.id}
              category={selected.category}
              size={18}
              tile
              className="h-9 w-9"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{selected.label}</span>
              <span className="block truncate text-xs text-muted">{selected.description}</span>
            </span>
          </>
        ) : (
          <span className="flex-1 text-sm text-muted">{t('workspace.chooseFormat')}</span>
        )}
        <ChevronDown size={16} className="shrink-0 text-faint" aria-hidden="true" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('formatSelector.title')}
        className="sm:max-w-xl"
      >
        <div className="border-b border-line px-5 py-3">
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
              aria-hidden="true"
            />
            <input
              data-autofocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('formatSelector.search')}
              aria-label={t('formatSelector.searchLabel')}
              className={cn(inputClass, 'pl-9')}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {!hasResults && (
            <div className="px-3 py-12 text-center">
              <p className="text-sm font-medium">
                {t('formatSelector.noResults', { query: query.trim() })}
              </p>
              <p className="mt-1 text-sm text-muted">{t('formatSelector.noResultsHint')}</p>
            </div>
          )}

          {recommendedFormats.length > 0 && (
            <Group title={t('formatSelector.recommended')}>
              {recommendedFormats.map((format) => (
                <FormatRow
                  key={format.id}
                  format={format}
                  selected={format.id === value}
                  onSelect={() => {
                    onChange(format.id);
                    setOpen(false);
                  }}
                />
              ))}
            </Group>
          )}

          {CATEGORIES.map((category) => {
            const list = grouped.get(category);
            if (!list || list.length === 0) return null;
            return (
              <Group key={category} title={CATEGORY_LABEL[category]}>
                {list.map((format) => (
                  <FormatRow
                    key={format.id}
                    format={format}
                    selected={format.id === value}
                    onSelect={() => {
                      onChange(format.id);
                      setOpen(false);
                    }}
                  />
                ))}
              </Group>
            );
          })}

          {gated.length > 0 && (
            <Group title={t('formatSelector.comingSoon')} hint={t('formatSelector.comingSoonHint')}>
              {gated.map((format) => (
                <FormatRow key={format.id} format={format} comingSoon />
              ))}
            </Group>
          )}
        </div>
      </Modal>
    </>
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 last:mb-0">
      <h3 className="px-2 pb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">
        {title}
      </h3>
      {hint && <p className="px-2 pb-2 text-xs leading-relaxed text-faint">{hint}</p>}
      <div className="grid gap-1 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function FormatRow({
  format,
  selected,
  comingSoon,
  onSelect,
}: {
  format: FormatInfo;
  selected?: boolean;
  comingSoon?: boolean;
  onSelect?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={comingSoon}
      aria-pressed={selected}
      className={cn(
        'flex items-center gap-3 rounded-xl p-2.5 text-left transition-colors',
        comingSoon
          ? 'cursor-not-allowed opacity-55'
          : selected
            ? 'bg-accent-soft ring-1 ring-accent/30'
            : 'hover:bg-elevated',
      )}
    >
      <FileIcon
        format={format.id}
        category={format.category}
        size={18}
        tile
        className="h-9 w-9"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-sm font-semibold">{format.label}</span>
          {comingSoon && (
            <span className="inline-flex items-center gap-1 rounded bg-elevated px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-faint ring-1 ring-line">
              <Lock size={9} />
              {t('formatSelector.comingSoon')}
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-muted">{format.description}</span>
      </span>
      {selected && <Check size={16} className="shrink-0 text-accent" aria-hidden="true" />}
    </button>
  );
}
