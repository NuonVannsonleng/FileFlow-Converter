import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/cn';
import { useToasts, type ToastVariant } from '@/store/useToasts';

const ICONS: Record<ToastVariant, typeof Info> = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
};

const TONES: Record<ToastVariant, string> = {
  success: 'text-success',
  info: 'text-accent',
  warning: 'text-warning',
  error: 'text-danger',
};

/**
 * Toast viewport. Anchored bottom-centre on mobile and bottom-right on desktop,
 * where it never covers the primary action.
 */
export function ToastViewport() {
  const { t } = useTranslation();
  const toasts = useToasts((state) => state.toasts);
  const dismiss = useToasts((state) => state.dismiss);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      // Errors interrupt; everything else is announced politely.
      role="region"
      aria-label="Notifications"
    >
      <AnimatePresence initial={false}>
        {toasts.map((item) => {
          const Icon = ICONS[item.variant];
          return (
            <motion.div
              key={item.id}
              layout
              role={item.variant === 'error' ? 'alert' : 'status'}
              aria-live={item.variant === 'error' ? 'assertive' : 'polite'}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-elevated p-3.5 shadow-lift',
              )}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.97, transition: { duration: 0.16 } }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              <Icon size={18} className={cn('mt-0.5 shrink-0', TONES[item.variant])} />
              <p className="flex-1 text-sm leading-relaxed text-ink">{item.message}</p>

              {item.action && (
                <button
                  type="button"
                  onClick={() => {
                    item.action?.onClick();
                    dismiss(item.id);
                  }}
                  className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
                >
                  {item.action.label}
                </button>
              )}

              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label={t('toast.dismiss')}
                className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-faint transition-colors hover:bg-surface hover:text-ink"
              >
                <X size={15} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
