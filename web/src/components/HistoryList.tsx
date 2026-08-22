import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Clock, Download, Trash2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/cn';
import { deleteJob, downloadUrl, triggerDownload } from '@/lib/api';
import { formatBytes, relativeTime } from '@/lib/format';
import { isDownloadable, useHistory, type HistoryEntry } from '@/store/useHistory';
import { toast } from '@/store/useToasts';
import { FileIcon, FormatBadge } from './FileIcon';

export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  return (
    <ul className="space-y-2.5">
      <AnimatePresence initial={false}>
        {entries.map((entry) => (
          <HistoryRow key={entry.id} entry={entry} />
        ))}
      </AnimatePresence>
    </ul>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const { t, locale } = useTranslation();
  const remove = useHistory((state) => state.remove);

  const downloadable = isDownloadable(entry);
  const failed = entry.status === 'failed';

  const handleDelete = async () => {
    remove(entry.id);
    // Best effort: the file may already be gone, which is not an error here.
    try {
      await deleteJob(entry.id);
    } catch {
      /* Already expired or removed. */
    }
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.18 } }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'flex items-center gap-3 rounded-xl border border-line bg-surface p-3.5 sm:gap-4',
        failed && 'border-danger/25',
      )}
    >
      <FileIcon
        format={entry.to}
        category={entry.category}
        size={18}
        tile
        className={cn('h-11 w-11', !downloadable && 'opacity-60')}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={entry.originalName}>
          {entry.originalName}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <FormatBadge format={entry.from} />
            <ArrowRight size={10} className="text-faint" aria-hidden="true" />
            <FormatBadge format={entry.to} tone={downloadable ? 'accent' : 'neutral'} />
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {relativeTime(entry.createdAt, locale, {
              today: t('history.today'),
              yesterday: t('history.yesterday'),
            })}
          </span>
          {entry.outputSizeBytes !== undefined && !failed && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{formatBytes(entry.outputSizeBytes)}</span>
            </>
          )}
        </div>

        {failed && <p className="mt-1 text-xs text-danger">{t('history.failed')}</p>}
        {!failed && !downloadable && (
          <p className="mt-1 flex items-center gap-1 text-xs text-faint">
            <Clock size={11} aria-hidden="true" />
            {t('history.expiredHint')}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {downloadable && (
          <button
            type="button"
            onClick={() => {
              triggerDownload(downloadUrl(entry.id), entry.outputName);
              toast.success(t('toast.downloaded'));
            }}
            aria-label={t('a11y.downloadFile', { name: entry.outputName })}
            className="grid h-9 w-9 place-items-center rounded-lg text-accent transition-colors hover:bg-accent-soft"
          >
            <Download size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          aria-label={`${t('history.delete')}: ${entry.originalName}`}
          className="grid h-9 w-9 place-items-center rounded-lg text-faint transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </motion.li>
  );
}
