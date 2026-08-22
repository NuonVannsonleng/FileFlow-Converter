import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import type { Category } from '@shared';
import { useTranslation } from '@/hooks/useTranslation';
import { ConversionWorkspace } from '@/components/ConversionWorkspace';
import { ConverterCard } from '@/components/ConverterCard';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useFormats } from '@/store/useFormats';

const CATEGORY_COPY: Record<Category, { title: 'nav.image' | 'nav.video' | 'nav.audio' | 'nav.document' | 'nav.converter' }> = {
  image: { title: 'nav.image' },
  video: { title: 'nav.video' },
  audio: { title: 'nav.audio' },
  document: { title: 'nav.document' },
  archive: { title: 'nav.converter' },
};

const VALID_CATEGORIES: Category[] = ['image', 'video', 'audio', 'document', 'archive'];

export function ConverterPage() {
  const { t } = useTranslation();
  const { category } = useParams<{ category?: string }>();
  const [searchParams] = useSearchParams();

  const data = useFormats((state) => state.data);
  const status = useFormats((state) => state.status);
  const load = useFormats((state) => state.load);

  const activeCategory =
    category && VALID_CATEGORIES.includes(category as Category) ? (category as Category) : undefined;

  const initialTarget = searchParams.get('to');

  // Suggested pairs for the category landing pages, taken from the live manifest.
  const suggestions = useMemo(() => {
    if (!activeCategory) return [];
    const seen = new Set<string>();
    return (data?.conversions ?? [])
      .filter((option) => option.available && option.category === activeCategory)
      .filter((option) => {
        const key = `${option.from}-${option.to}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 9);
  }, [activeCategory, data]);

  const title = activeCategory ? t(CATEGORY_COPY[activeCategory].title) : t('nav.converter');

  return (
    <div className="container-page py-10 sm:py-14">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {activeCategory ? `${title} ${t('nav.converter')}` : t('hero.title')}
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
          {t('hero.subtitle')}
        </p>
      </header>

      <main className="mx-auto mt-9 max-w-2xl">
        {status === 'loading' && (
          <div className="space-y-4">
            <Skeleton className="h-64 rounded-card" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center rounded-card border border-danger/25 bg-danger/[0.04] px-6 py-12 text-center">
            <AlertTriangle size={26} className="text-danger" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium">{t('errors.loadFormats')}</p>
            <p className="mt-1 text-sm text-muted">{t('errors.network')}</p>
            <Button variant="secondary" size="sm" className="mt-5" onClick={() => void load()}>
              {t('errors.retry')}
            </Button>
          </div>
        )}

        {status === 'ready' && <ConversionWorkspace initialTarget={initialTarget} />}
      </main>

      {suggestions.length > 0 && status === 'ready' && (
        <section className="mx-auto mt-16 max-w-4xl" aria-labelledby="suggestions-heading">
          <h2 id="suggestions-heading" className="text-center text-sm font-medium text-muted">
            {t('popular.title')}
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((option) => (
              <ConverterCard
                key={`${option.from}-${option.to}`}
                from={option.from}
                to={option.to}
                category={option.category}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
