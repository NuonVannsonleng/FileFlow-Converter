import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Check, Download, Package, Plus, RotateCcw } from 'lucide-react';
import type { ConversionJob } from '@shared';
import { useTranslation } from '@/hooks/useTranslation';
import { downloadBatch, downloadUrl, triggerDownload } from '@/lib/api';
import { formatBytes, formatDuration, minutesUntil, sizeDelta } from '@/lib/format';
import { toast } from '@/store/useToasts';
import { Button } from './ui/Button';
import { FormatBadge } from './FileIcon';

interface SuccessScreenProps {
  completed: ConversionJob[];
  failed: ConversionJob[];
  onConvertAnother: () => void;
  onConvertMore: () => void;
}

export function SuccessScreen({
  completed,
  failed,
  onConvertAnother,
  onConvertMore,
}: SuccessScreenProps) {
  const { t } = useTranslation();
  const [downloadingAll, setDownloadingAll] = useState(false);

  const single = completed.length === 1 ? completed[0] : undefined;
  const partial = failed.length > 0;

  const handleDownloadAll = async () => {
    setDownloadingAll(true);
    try {
      await downloadBatch(completed.map((job) => job.id));
      toast.success(t('toast.downloaded'));
    } catch {
      toast.error(t('errors.generic'));
    } finally {
      setDownloadingAll(false);
    }
  };

  const handleDownload = (job: ConversionJob) => {
    triggerDownload(downloadUrl(job.id), job.outputName);
    toast.success(t('toast.downloaded'));
  };

  return (
    <div className="px-4 py-10 sm:py-12">
      <div className="flex flex-col items-center text-center">
        {/* Check mark draws itself in, once */}
        <motion.div
          className="grid h-16 w-16 place-items-center rounded-2xl bg-success/12 text-success"
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.span
            initial={{ scale: 0.4 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.12, duration: 0.35, ease: [0.34, 1.4, 0.64, 1] }}
          >
            <Check size={30} strokeWidth={2.6} />
          </motion.span>
        </motion.div>

        <h2 className="mt-5 text-xl font-semibold sm:text-2xl" aria-live="polite">
          {partial ? t('success.titlePartial') : t('success.title')}
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          {completed.length === 1 ? t('success.subtitle') : t('success.subtitlePlural')}
        </p>

        {partial && (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-warning/10 px-3 py-1.5 text-sm text-warning">
            <AlertTriangle size={14} aria-hidden="true" />
            {failed.length === 1
              ? t('success.someFailed', { count: failed.length })
              : t('success.someFailedPlural', { count: failed.length })}
          </p>
        )}
      </div>

      {/* Single-file summary gets the full detail treatment */}
      {single && (
        <dl className="mx-auto mt-8 grid max-w-md gap-x-6 gap-y-3.5 rounded-xl border border-line bg-surface p-5 sm:grid-cols-2">
          <Detail label={t('success.original')} value={single.originalName} truncate />
          <Detail label={t('success.converted')} value={single.outputName ?? '—'} truncate />
          <Detail
            label={t('success.outputFormat')}
            value={
              <span className="flex items-center gap-1.5">
                <FormatBadge format={single.from} />
                <ArrowRight size={11} className="text-faint" aria-hidden="true" />
                <FormatBadge format={single.to} tone="accent" />
              </span>
            }
          />
          <Detail
            label={t('success.size')}
            value={
              <span className="flex items-baseline gap-2">
                <span className="tabular-nums">{formatBytes(single.outputSizeBytes ?? 0)}</span>
                <SizeDelta from={single.inputSizeBytes} to={single.outputSizeBytes ?? 0} />
              </span>
            }
          />
          <Detail label={t('success.time')} value={formatDuration(single.durationMs ?? 0)} />
          <Detail
            label={t('success.expiresIn', { minutes: minutesUntil(single.expiresAt) })}
            value=""
            spanFull
          />
        </dl>
      )}

      {/* Batch list */}
      {completed.length > 1 && (
        <ul className="mx-auto mt-8 max-w-md space-y-2">
          {completed.map((job) => (
            <li
              key={job.id}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-success/10 text-success">
                <Check size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{job.outputName}</span>
                <span className="block text-xs tabular-nums text-muted">
                  {formatBytes(job.outputSizeBytes ?? 0)} · {formatDuration(job.durationMs ?? 0)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => handleDownload(job)}
                aria-label={t('a11y.downloadFile', { name: job.outputName ?? '' })}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-accent transition-colors hover:bg-accent-soft"
              >
                <Download size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mx-auto mt-8 flex max-w-md flex-col gap-2.5 sm:flex-row">
        {single ? (
          <Button
            size="lg"
            fullWidth
            icon={<Download size={18} />}
            onClick={() => handleDownload(single)}
          >
            {t('success.download')}
          </Button>
        ) : (
          <Button
            size="lg"
            fullWidth
            loading={downloadingAll}
            icon={<Package size={18} />}
            onClick={handleDownloadAll}
          >
            {t('success.downloadAll')}
          </Button>
        )}
      </div>

      <div className="mx-auto mt-2.5 flex max-w-md flex-col gap-2.5 sm:flex-row">
        <Button
          variant="secondary"
          fullWidth
          icon={<RotateCcw size={16} />}
          onClick={onConvertAnother}
        >
          {t('success.convertAnother')}
        </Button>
        <Button variant="outline" fullWidth icon={<Plus size={16} />} onClick={onConvertMore}>
          {t('success.convertMore')}
        </Button>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  truncate,
  spanFull,
}: {
  label: string;
  value: React.ReactNode;
  truncate?: boolean;
  spanFull?: boolean;
}) {
  return (
    <div className={spanFull ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs text-faint">{label}</dt>
      {value !== '' && (
        <dd className={`mt-0.5 text-sm font-medium ${truncate ? 'truncate' : ''}`}>{value}</dd>
      )}
    </div>
  );
}

function SizeDelta({ from, to }: { from: number; to: number }) {
  const { t } = useTranslation();
  const delta = sizeDelta(from, to);
  if (delta === null || delta === 0) return null;

  return (
    <span className={`text-xs ${delta < 0 ? 'text-success' : 'text-muted'}`}>
      {delta < 0
        ? t('success.saved', { percent: Math.abs(delta) })
        : t('success.grew', { percent: delta })}
    </span>
  );
}
