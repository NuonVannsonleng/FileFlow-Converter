import { useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { CATEGORY_LABEL, CATEGORY_TONE } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useFormats } from '@/store/useFormats';
import { FileIcon } from '@/components/FileIcon';
import { LinkButton } from '@/components/ui/Button';
import { CATEGORIES } from '@shared';

export function AboutPage() {
  const { t } = useTranslation();
  const data = useFormats((state) => state.data);

  const stats = useMemo(() => {
    const conversions = (data?.conversions ?? []).filter((option) => option.available);
    const engines = Object.values(data?.capabilities.engines ?? {}).filter(
      (engine) => engine.available,
    );
    return {
      conversions: conversions.length,
      formats: data?.formats.length ?? 0,
      engines: engines.length,
    };
  }, [data]);

  // Group the live matrix by category so the page reflects reality, not a claim.
  const byCategory = useMemo(() => {
    const map = new Map<string, { from: string; to: string }[]>();
    for (const option of data?.conversions ?? []) {
      if (!option.available) continue;
      const list = map.get(option.category) ?? [];
      list.push({ from: option.from, to: option.to });
      map.set(option.category, list);
    }
    return map;
  }, [data]);

  return (
    <div className="container-page py-10 sm:py-14">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t('about.title')}
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
          {t('about.subtitle')}
        </p>
      </header>

      <dl className="mx-auto mt-10 grid max-w-2xl grid-cols-3 gap-3">
        <Stat value={stats.conversions} label={t('about.stats.conversions')} />
        <Stat value={stats.formats} label={t('about.stats.formats')} />
        <Stat value={stats.engines} label={t('about.stats.engines')} />
      </dl>

      <div className="mx-auto mt-10 max-w-2xl space-y-4 text-sm leading-relaxed text-muted sm:text-[15px]">
        <p>{t('about.body1')}</p>
        <p>{t('about.body2')}</p>
        <p>{t('about.body3')}</p>
      </div>

      <section className="mx-auto mt-12 max-w-4xl" aria-labelledby="matrix-heading">
        <h2 id="matrix-heading" className="text-center text-sm font-medium text-muted">
          {t('popular.viewAll')}
        </h2>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {CATEGORIES.map((category) => {
            const pairs = byCategory.get(category);
            if (!pairs || pairs.length === 0) return null;

            const sources = [...new Set(pairs.map((pair) => pair.from))].sort();
            const targets = [...new Set(pairs.map((pair) => pair.to))].sort();

            return (
              <div key={category} className="rounded-card border border-line bg-surface p-5">
                <div className="flex items-center gap-2.5">
                  <FileIcon category={category} size={16} tile className="h-8 w-8" />
                  <h3 className="text-sm font-semibold">{CATEGORY_LABEL[category]}</h3>
                  <span className="ml-auto text-xs tabular-nums text-faint">{pairs.length}</span>
                </div>

                <div className="mt-4 space-y-3 text-xs">
                  <TokenRow label="From" tokens={sources} tone={CATEGORY_TONE[category].text} />
                  <TokenRow label="To" tokens={targets} tone={CATEGORY_TONE[category].text} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="mt-12 text-center">
        <LinkButton to="/convert" size="lg">
          {t('nav.startConverting')}
        </LinkButton>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 text-center">
      <dd className="text-2xl font-semibold tabular-nums sm:text-3xl">{value}</dd>
      <dt className="mt-1 text-xs leading-snug text-muted">{label}</dt>
    </div>
  );
}

function TokenRow({ label, tokens, tone }: { label: string; tokens: string[]; tone: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-9 shrink-0 pt-0.5 text-faint">{label}</span>
      <span className="flex flex-wrap gap-1">
        {tokens.map((token) => (
          <span
            key={token}
            className={cn(
              'rounded bg-elevated px-1.5 py-0.5 font-medium uppercase tracking-wide ring-1 ring-line',
              tone,
            )}
          >
            {token === 'folder' ? 'extract' : token}
          </span>
        ))}
      </span>
    </div>
  );
}
