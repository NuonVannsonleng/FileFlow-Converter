import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, Check, Download, X } from 'lucide-react';
import type { ConversionJob } from '@shared';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/cn';
import { downloadUrl, triggerDownload } from '@/lib/api';
import { formatBytes, formatDuration } from '@/lib/format';
import type { WorkItem } from '@/store/useConversion';
import { FilePreview } from './FilePreview';
import { FormatBadge } from './FileIcon';
import { Progress } from './ui/Progress';

interface FileCardProps {
  item: WorkItem;
  target: string | null;
  onRemove: (id: string) => void;
  /** Hides the remove button once conversion has started. */
  locked?: boolean;
}

const STAGE_KEY = {
  preparing: 'progress.preparing',
  converting: 'progress.converting',
  finalizing: 'progress.finalizing',
  done: 'progress.finalizing',
  error: 'progress.converting',
} as const;

export function FileCard({ item, target, onRemove, locked }: FileCardProps) {
  const { t } = useTranslation();
  const job = item.job;

  const errorMessage = item.error
    ? t(`errors.${item.error.message}` as 'errors.unsupported')
    : job?.error?.message;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'flex items-center gap-3 rounded-xl border border-line bg-surface p-3 sm:gap-4 sm:p-4',
        (item.error || job?.status === 'failed') && 'border-danger/30 bg-danger/[0.03]',
        job?.status === 'completed' && 'border-success/30',
      )}
    >
      <FilePreview item={item} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={item.name}>
          {item.name}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="tabular-nums">{formatBytes(item.sizeBytes)}</span>

          {item.format && !errorMessage && (
            <>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1.5">
                <FormatBadge format={item.format} />
                {target && (
                  <>
                    <ArrowRight size={11} className="text-faint" aria-hidden="true" />
                    <FormatBadge format={target} tone="accent" />
                  </>
                )}
              </span>
            </>
          )}

          {job?.status === 'completed' && job.outputSizeBytes !== undefined && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums text-success">
                {formatBytes(job.outputSizeBytes)}
              </span>
              {job.durationMs !== undefined && (
                <span className="tabular-nums text-faint">{formatDuration(job.durationMs)}</span>
              )}
            </>
          )}
        </div>

        {errorMessage && (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-danger">
            <AlertCircle size={13} className="mt-px shrink-0" aria-hidden="true" />
            {errorMessage}
          </p>
        )}

        {job && job.status !== 'completed' && job.status !== 'failed' && (
          <div className="mt-2.5 flex items-center gap-2.5">
            <Progress
              value={job.progress}
              size="sm"
              className="flex-1"
              label={t('a11y.progressLabel')}
            />
            <span className="w-9 shrink-0 text-right text-[11px] font-medium tabular-nums text-muted">
              {job.progress}%
            </span>
          </div>
        )}

        {job && job.status === 'queued' && (
          <p className="mt-1 text-[11px] text-faint">{t('progress.queued')}</p>
        )}
        {job && job.status === 'processing' && (
          <p className="mt-1 text-[11px] text-faint">{t(STAGE_KEY[job.stage])}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {job?.status === 'completed' && (
          <>
            <span
              className="grid h-8 w-8 place-items-center rounded-lg bg-success/10 text-success"
              aria-label={t('success.title')}
            >
              <Check size={16} />
            </span>
            <DownloadButton job={job} />
          </>
        )}

        {!locked && (
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label={t('a11y.removeFile', { name: item.name })}
            className="grid h-8 w-8 place-items-center rounded-lg text-faint transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </motion.li>
  );
}

function DownloadButton({ job }: { job: ConversionJob }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => triggerDownload(downloadUrl(job.id), job.outputName)}
      aria-label={t('a11y.downloadFile', { name: job.outputName ?? job.originalName })}
      className="grid h-8 w-8 place-items-center rounded-lg text-accent transition-colors hover:bg-accent-soft"
    >
      <Download size={16} />
    </button>
  );
}
