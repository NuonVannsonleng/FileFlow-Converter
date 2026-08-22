import { Check, Info, Minus } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { useFormats } from '@/store/useFormats';
import { LinkButton } from '@/components/ui/Button';

export function PricingPage() {
  const { t } = useTranslation();
  const data = useFormats((state) => state.data);

  const capabilities = data?.capabilities;
  const availableCount = (data?.conversions ?? []).filter((option) => option.available).length;

  const freeFeatures = [
    t('pricing.perFile', {
      size: capabilities ? formatBytes(capabilities.maxFileSizeBytes, 0) : '200 MB',
    }),
    t('pricing.perBatch', { count: capabilities?.maxFilesPerBatch ?? 20 }),
    t('pricing.allFormats', { count: availableCount || 180 }),
    t('pricing.noAccount'),
    t('pricing.autoDelete'),
  ];

  return (
    <div className="container-page py-10 sm:py-14">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t('pricing.title')}
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
          {t('pricing.subtitle')}
        </p>
      </header>

      <div className="mx-auto mt-10 grid max-w-4xl gap-4 lg:grid-cols-3">
        {/* The only plan that exists */}
        <div className="relative rounded-card border-2 border-accent bg-surface p-6 shadow-lift lg:order-1">
          <span className="absolute -top-3 left-6 rounded-pill bg-accent px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-ink">
            {t('formatSelector.recommended')}
          </span>

          <h2 className="text-lg font-semibold">{t('pricing.free')}</h2>
          <p className="mt-1 text-sm text-muted">{t('pricing.freeDesc')}</p>

          <p className="mt-5 flex items-baseline gap-1.5">
            <span className="text-4xl font-semibold tracking-tight">{t('pricing.freePrice')}</span>
            <span className="text-sm text-muted">/ {t('pricing.freePeriod')}</span>
          </p>

          <ul className="mt-6 space-y-2.5">
            {freeFeatures.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-sm">
                <Check size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                <span className="text-muted">{feature}</span>
              </li>
            ))}
          </ul>

          <LinkButton to="/convert" size="lg" fullWidth className="mt-7">
            {t('pricing.freeCta')}
          </LinkButton>
        </div>

        {/* Roadmap tiers, clearly marked as not purchasable */}
        <PlannedPlan title={t('pricing.pro')} description={t('pricing.proDesc')} period={t('pricing.proPeriod')} cta={t('pricing.proCta')} />
        <PlannedPlan title={t('pricing.team')} description={t('pricing.teamDesc')} period={t('pricing.proPeriod')} cta={t('pricing.proCta')} className="lg:order-2" />
      </div>

      <p className="mx-auto mt-8 flex max-w-2xl items-start gap-2 rounded-xl border border-line bg-surface p-4 text-xs leading-relaxed text-muted">
        <Info size={14} className="mt-0.5 shrink-0 text-faint" aria-hidden="true" />
        {t('pricing.plannedNote')}
      </p>
    </div>
  );
}

function PlannedPlan({
  title,
  description,
  period,
  cta,
  className,
}: {
  title: string;
  description: string;
  period: string;
  cta: string;
  className?: string;
}) {
  return (
    <div className={cn('rounded-card border border-line bg-surface p-6 opacity-75', className)}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>

      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold tracking-tight text-faint">—</span>
        <span className="text-sm text-faint">{period}</span>
      </p>

      <ul className="mt-6 space-y-2.5">
        {[0, 1, 2].map((index) => (
          <li key={index} className="flex items-center gap-2.5 text-sm text-faint">
            <Minus size={16} className="shrink-0" aria-hidden="true" />
            <span className="h-2 w-full max-w-[8rem] rounded-pill bg-line" />
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled
        className="mt-7 h-11 w-full cursor-not-allowed rounded-xl border border-line text-sm font-medium text-faint"
      >
        {cta}
      </button>
    </div>
  );
}
