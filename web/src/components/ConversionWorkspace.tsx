import { useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, Sparkles, Trash2, Wand2 } from 'lucide-react';
import type { Category, ErrorCode } from '@shared';
import { useTranslation } from '@/hooks/useTranslation';
import type { TranslationKey } from '@/i18n';
import { ApiError, downloadUrl, triggerDownload } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import {
  deriveCompletedJobs,
  deriveFailedJobs,
  deriveOverallProgress,
  deriveSources,
  useConversion,
} from '@/store/useConversion';
import { conversionOption, sharedTargets, targetsFor, useFormats } from '@/store/useFormats';
import { usePreferences } from '@/store/usePreferences';
import { toast } from '@/store/useToasts';
import { ConversionProgress } from './ConversionProgress';
import { ConversionSettings } from './ConversionSettings';
import { FileCard } from './FileCard';
import { FormatSelector } from './FormatSelector';
import { SuccessScreen } from './SuccessScreen';
import { UploadDropzone } from './UploadDropzone';
import { Button } from './ui/Button';

/** Targets promoted to the top of the picker, per source category. */
const RECOMMENDED: Record<Category, string[]> = {
  document: ['pdf', 'docx', 'txt'],
  image: ['jpg', 'png', 'webp'],
  audio: ['mp3', 'wav'],
  video: ['mp4', 'mp3', 'webm'],
  archive: ['zip'],
};

interface ConversionWorkspaceProps {
  /** Pre-selected target from the URL, e.g. `/convert?to=png`. */
  initialTarget?: string | null;
}

export function ConversionWorkspace({ initialTarget }: ConversionWorkspaceProps) {
  const { t } = useTranslation();

  const phase = useConversion((state) => state.phase);
  const items = useConversion((state) => state.items);
  const target = useConversion((state) => state.target);
  const settings = useConversion((state) => state.settings);
  const uploadProgress = useConversion((state) => state.uploadProgress);

  const addFiles = useConversion((state) => state.addFiles);
  const removeItem = useConversion((state) => state.removeItem);
  const clearAll = useConversion((state) => state.clearAll);
  const setTarget = useConversion((state) => state.setTarget);
  const updateSettings = useConversion((state) => state.updateSettings);
  const startConversion = useConversion((state) => state.startConversion);
  const convertAgain = useConversion((state) => state.convertAgain);
  const reset = useConversion((state) => state.reset);

  // Derived from the stable `items` reference. Selecting computed arrays
  // straight from the store would hand React a new snapshot every render.
  const sources = useMemo(() => deriveSources(items), [items]);
  const completed = useMemo(() => deriveCompletedJobs(items), [items]);
  const failed = useMemo(() => deriveFailedJobs(items), [items]);
  const overall = useMemo(() => deriveOverallProgress(items), [items]);

  const data = useFormats((state) => state.data);
  const autoDownload = usePreferences((state) => state.autoDownload);

  const uniqueSources = useMemo(() => [...new Set(sources)], [sources]);
  const available = useMemo(() => sharedTargets(data, uniqueSources), [data, uniqueSources]);

  // "Coming soon" entries only make sense for a single source type; with a mixed
  // batch there is no one gated pair to point at.
  const comingSoon = useMemo(
    () => (uniqueSources.length === 1 ? targetsFor(data, uniqueSources[0]!).comingSoon : []),
    [data, uniqueSources],
  );

  const primaryCategory = items.find((item) => item.category && !item.error)?.category;
  const activeOption =
    uniqueSources.length === 1 && target
      ? conversionOption(data, uniqueSources[0]!, target)
      : undefined;

  const convertible = items.filter((item) => item.uploadId && !item.error);
  const busy = phase === 'uploading';
  const converting = phase === 'converting';

  // Apply the deep-linked target once the batch can actually produce it.
  const appliedInitial = useRef(false);
  useEffect(() => {
    if (appliedInitial.current || !initialTarget || available.length === 0) return;
    if (available.includes(initialTarget)) {
      setTarget(initialTarget);
      appliedInitial.current = true;
    }
  }, [available, initialTarget, setTarget]);

  // Auto-download, when the preference is on and the work is done.
  const downloadedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!autoDownload || phase !== 'complete') return;
    for (const job of completed) {
      if (downloadedRef.current.has(job.id)) continue;
      downloadedRef.current.add(job.id);
      triggerDownload(downloadUrl(job.id), job.outputName);
    }
  }, [autoDownload, completed, phase]);

  // Announce the outcome once, when the batch settles.
  const announcedRef = useRef(false);
  useEffect(() => {
    if (phase !== 'complete') {
      announcedRef.current = false;
      return;
    }
    if (announcedRef.current) return;
    announcedRef.current = true;

    if (completed.length > 0) {
      toast.success(
        completed.length === 1
          ? t('toast.converted')
          : t('toast.convertedPlural', { count: completed.length }),
      );
    }
    if (failed.length > 0 && completed.length === 0) toast.error(t('toast.failed'));
  }, [completed, failed, phase, t]);

  const handleFiles = async (files: File[]) => {
    const capabilities = data?.capabilities;
    if (capabilities && items.length + files.length > capabilities.maxFilesPerBatch) {
      toast.warning(t('errors.tooManyFiles', { count: capabilities.maxFilesPerBatch }));
    }

    // A large file is worth flagging before the wait, not after it.
    const largest = Math.max(...files.map((file) => file.size), 0);
    if (largest > 50 * 1024 * 1024) toast.info(t('toast.largeFile'));

    try {
      await addFiles(files);
    } catch (error) {
      toast.error(messageForError(error, t));
    }
  };

  const handleConvert = async () => {
    try {
      await startConversion();
      toast.info(t('toast.processing'));
    } catch (error) {
      toast.error(messageForError(error, t));
    }
  };

  // ---- Success ----
  if (phase === 'complete') {
    return (
      <SuccessScreen
        completed={completed}
        failed={failed}
        onConvertAnother={() => {
          reset();
          announcedRef.current = false;
        }}
        onConvertMore={() => {
          announcedRef.current = false;
          void convertAgain().catch((error) => toast.error(messageForError(error, t)));
        }}
      />
    );
  }

  // ---- Converting ----
  if (converting && target) {
    return <ConversionProgress items={items} target={target} overall={overall} />;
  }

  // ---- Idle / ready ----
  return (
    <div className="space-y-5">
      <UploadDropzone
        onFiles={handleFiles}
        busy={busy}
        progress={uploadProgress}
        compact={items.length > 0}
      />

      <AnimatePresence>
        {items.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5"
          >
            <section aria-labelledby="file-list-heading">
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <h2 id="file-list-heading" className="text-sm font-medium text-muted">
                  {items.length === 1
                    ? t('workspace.fileCount', { count: items.length })
                    : t('workspace.fileCountPlural', { count: items.length })}
                  <span className="ml-2 text-faint">
                    {formatBytes(items.reduce((sum, item) => sum + item.sizeBytes, 0))}
                  </span>
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={14} />}
                  onClick={clearAll}
                  className="h-8 px-2 text-xs"
                >
                  {t('workspace.removeAll')}
                </Button>
              </div>

              <ul className="space-y-2.5" aria-label={t('a11y.fileList')}>
                <AnimatePresence initial={false}>
                  {items.map((item) => (
                    <FileCard
                      key={item.id}
                      item={item}
                      target={target}
                      onRemove={removeItem}
                      locked={converting}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            </section>

            {convertible.length > 0 && (
              <section className="space-y-4" aria-labelledby="output-heading">
                <div>
                  <h2 id="output-heading" className="mb-2 text-sm font-medium">
                    {t('workspace.outputFormat')}
                  </h2>

                  {available.length === 0 ? (
                    <p className="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/[0.06] p-3.5 text-sm text-warning">
                      <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                      {t('workspace.noSharedFormat')}
                    </p>
                  ) : (
                    <>
                      <FormatSelector
                        available={available}
                        comingSoon={comingSoon}
                        value={target}
                        onChange={setTarget}
                        recommended={primaryCategory ? RECOMMENDED[primaryCategory] : []}
                      />
                      {uniqueSources.length > 1 && (
                        <p className="mt-2 flex items-start gap-1.5 text-xs text-faint">
                          <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                          {t('workspace.mixedTypes')}
                        </p>
                      )}
                      {activeOption?.note && (
                        <p className="mt-2 flex items-start gap-1.5 text-xs text-faint">
                          <Sparkles size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                          {activeOption.note}
                        </p>
                      )}
                    </>
                  )}
                </div>

                <ConversionSettings
                  category={primaryCategory}
                  target={target}
                  settings={settings}
                  onChange={updateSettings}
                />

                <Button
                  size="lg"
                  fullWidth
                  disabled={!target || convertible.length === 0}
                  onClick={handleConvert}
                  icon={<Wand2 size={18} />}
                  className={cn('mt-1', !target && 'opacity-60')}
                >
                  {convertible.length > 1 ? t('workspace.convertAll') : t('workspace.convert')}
                </Button>
              </section>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Map an API error code onto the localized copy for it. */
const ERROR_COPY: Record<ErrorCode, TranslationKey> = {
  UNSUPPORTED_FORMAT: 'errors.unsupported',
  FILE_TOO_LARGE: 'errors.tooLarge',
  TOO_MANY_FILES: 'errors.tooManyFiles',
  CONVERSION_FAILED: 'errors.failed',
  CORRUPTED_FILE: 'errors.corrupted',
  EXPIRED: 'errors.expired',
  RATE_LIMITED: 'errors.rateLimited',
  NOT_FOUND: 'errors.generic',
  VALIDATION_ERROR: 'errors.generic',
  INTERNAL_ERROR: 'errors.network',
};

export function messageForError(
  error: unknown,
  t: (key: TranslationKey, values?: Record<string, string | number>) => string,
): string {
  const code: ErrorCode = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
  // A transport failure while offline is worth naming precisely.
  if (code === 'INTERNAL_ERROR' && typeof navigator !== 'undefined' && !navigator.onLine) {
    return t('errors.offline');
  }
  return t(ERROR_COPY[code]);
}
