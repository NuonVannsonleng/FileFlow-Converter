import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FileUp, Loader2, UploadCloud } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { acceptAttribute, useFormats } from '@/store/useFormats';
import { Button } from './ui/Button';
import { Progress } from './ui/Progress';

interface UploadDropzoneProps {
  onFiles: (files: File[]) => void;
  busy?: boolean;
  /** 0-100 while an upload is in flight. */
  progress?: number;
  compact?: boolean;
  className?: string;
}

/**
 * Drag-and-drop upload area with a keyboard-and-click path that does exactly the
 * same thing, so dragging is never the only way to add a file.
 */
export function UploadDropzone({
  onFiles,
  busy,
  progress = 0,
  compact,
  className,
}: UploadDropzoneProps) {
  const { t } = useTranslation();
  const data = useFormats((state) => state.data);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // Drag events fire per child element, so depth-count instead of a boolean.
  const dragDepth = useRef(0);

  const capabilities = data?.capabilities;
  const accept = acceptAttribute(data);

  const emit = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      onFiles([...list]);
    },
    [onFiles],
  );

  const openPicker = () => inputRef.current?.click();

  useEffect(() => {
    // Stop the browser from navigating to a file dropped outside the zone.
    const prevent = (event: DragEvent) => event.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  return (
    <div className={className}>
      <motion.div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-label={t('upload.dropHere')}
        aria-describedby="dropzone-hint"
        aria-disabled={busy}
        onClick={busy ? undefined : openPicker}
        onKeyDown={(event) => {
          if (busy) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          if (!busy) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          if (!busy) emit(event.dataTransfer.files);
        }}
        animate={dragging ? { scale: 1.015 } : { scale: 1 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          'group relative flex w-full cursor-pointer flex-col items-center justify-center overflow-hidden',
          'rounded-card border-2 border-dashed text-center transition-colors duration-200',
          compact ? 'px-6 py-8' : 'px-6 py-14 sm:py-16',
          dragging
            ? 'border-accent bg-accent-soft'
            : 'border-line bg-surface hover:border-accent/50 hover:bg-elevated',
          busy && 'cursor-wait opacity-90',
          'motion-reduce:transform-none',
        )}
      >
        {/* Animated border sheen while dragging */}
        {dragging && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-card ring-2 ring-accent/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.35, 0.85, 0.35] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        <motion.div
          animate={dragging ? { y: -6, scale: 1.08 } : { y: 0, scale: 1 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            'mb-4 grid place-items-center rounded-2xl transition-colors',
            compact ? 'h-12 w-12' : 'h-16 w-16',
            dragging ? 'bg-accent text-accent-ink' : 'bg-accent-soft text-accent',
          )}
        >
          {busy ? (
            <Loader2
              size={compact ? 22 : 28}
              className="animate-spin motion-reduce:animate-none"
            />
          ) : dragging ? (
            <FileUp size={compact ? 22 : 28} />
          ) : (
            <UploadCloud size={compact ? 22 : 28} />
          )}
        </motion.div>

        <p className={cn('font-semibold text-balance', compact ? 'text-base' : 'text-lg sm:text-xl')}>
          {busy ? t('upload.uploading') : dragging ? t('hero.dropNow') : t('hero.dropTitle')}
        </p>

        {!busy && !dragging && (
          <>
            <p className="mt-1.5 text-sm text-muted">{t('hero.dropSubtitle')}</p>
            <Button
              type="button"
              variant="secondary"
              size={compact ? 'sm' : 'md'}
              className="mt-3"
              // The wrapper already opens the picker; this must not fire twice.
              onClick={(event) => {
                event.stopPropagation();
                openPicker();
              }}
              icon={<FileUp size={16} />}
            >
              {t('hero.browse')}
            </Button>
          </>
        )}

        {busy && progress > 0 && (
          <div className="mt-5 w-full max-w-xs">
            <Progress value={progress} size="sm" label={t('upload.uploading')} />
          </div>
        )}

        <p id="dropzone-hint" className="mt-5 text-xs leading-relaxed text-faint">
          {capabilities
            ? t('upload.limits', {
                size: formatBytes(capabilities.maxFileSizeBytes, 0),
                count: capabilities.maxFilesPerBatch,
              })
            : t('hero.formatsLine')}
        </p>
        <span className="sr-only">{t('upload.keyboardHint')}</span>
      </motion.div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept || undefined}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          emit(event.target.files);
          // Reset so picking the same file twice still fires a change event.
          event.target.value = '';
        }}
      />
    </div>
  );
}
