import { motion } from 'framer-motion';
import { ArrowDown, Settings2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { FormatBadge } from './FileIcon';
import { Progress } from './ui/Progress';
import type { WorkItem } from '@/store/useConversion';

interface ConversionProgressProps {
  items: WorkItem[];
  target: string;
  overall: number;
}

/**
 * The hero moment of a conversion: one clear headline, one honest number. Per
 * file detail lives underneath so a batch does not lose its individual rows.
 */
export function ConversionProgress({ items, target, overall }: ConversionProgressProps) {
  const { t } = useTranslation();

  const tracked = items.filter((item) => item.job);
  const done = tracked.filter(
    (item) => item.job!.status === 'completed' || item.job!.status === 'failed',
  ).length;

  const active = tracked.find((item) => item.job!.status === 'processing') ?? tracked[0];
  const stage = active?.job?.status === 'queued' ? 'queued' : (active?.job?.stage ?? 'preparing');

  const headline =
    stage === 'queued'
      ? t('progress.queued')
      : stage === 'preparing'
        ? t('progress.preparing')
        : stage === 'finalizing' || stage === 'done'
          ? t('progress.finalizing')
          : t('progress.converting');

  return (
    <div className="flex flex-col items-center px-4 py-10 text-center sm:py-14">
      <p className="max-w-full truncate text-sm font-medium text-muted">
        {tracked.length === 1 ? active?.name : t('progress.ofFiles', { done, total: tracked.length })}
      </p>

      <motion.div
        animate={{ y: [0, 6, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        className="my-3 text-faint motion-reduce:animate-none"
        aria-hidden="true"
      >
        <ArrowDown size={18} />
      </motion.div>

      {/* Rotating gear inside a progress ring */}
      <div className="relative grid h-24 w-24 place-items-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="44" fill="none" stroke="rgb(var(--c-line))" strokeWidth="6" />
          <motion.circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="rgb(var(--c-accent))"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 44}
            initial={false}
            animate={{ strokeDashoffset: 2 * Math.PI * 44 * (1 - overall / 100) }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
        <Settings2
          size={30}
          className="animate-spin-slow text-accent motion-reduce:animate-none"
          aria-hidden="true"
        />
      </div>

      <p className="mt-5 text-lg font-semibold" aria-live="polite">
        {headline}
      </p>

      <div className="mt-4 w-full max-w-sm">
        <Progress value={overall} label={t('a11y.progressLabel')} />
        <p className="mt-2 text-sm tabular-nums text-muted">
          {overall}%
          {overall >= 80 && overall < 100 && (
            <span className="ml-2 text-faint">{t('progress.almostDone')}</span>
          )}
        </p>
      </div>

      {tracked.length > 1 && (
        <ul className="mt-8 w-full max-w-md space-y-2.5 text-left">
          {tracked.map((item) => {
            const job = item.job!;
            const settled = job.status === 'completed' || job.status === 'failed';
            return (
              <li key={item.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-xs text-muted" title={item.name}>
                  {item.name}
                </span>
                <Progress
                  value={settled ? 100 : job.progress}
                  size="sm"
                  tone={job.status === 'failed' ? 'danger' : settled ? 'success' : 'accent'}
                  className="w-24 shrink-0 sm:w-32"
                />
                <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-faint">
                  {job.status === 'failed' ? '—' : `${settled ? 100 : job.progress}%`}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8 flex items-center gap-2 text-xs text-faint">
        <span>{t('workspace.outputFormat')}</span>
        <FormatBadge format={target} tone="accent" />
      </div>
    </div>
  );
}
