import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

interface ProgressProps {
  value: number;
  label?: string;
  className?: string;
  tone?: 'accent' | 'success' | 'danger';
  size?: 'sm' | 'md';
}

const TONES = {
  accent: 'bg-accent',
  success: 'bg-success',
  danger: 'bg-danger',
};

/**
 * Progress bar that eases between values rather than snapping, so a jump from
 * 12% to 78% reads as movement instead of a glitch.
 */
export function Progress({ value, label, className, tone = 'accent', size = 'md' }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn(
        'w-full overflow-hidden rounded-pill bg-line/70',
        size === 'sm' ? 'h-1.5' : 'h-2.5',
        className,
      )}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <motion.div
        className={cn('h-full rounded-pill', TONES[tone])}
        initial={false}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}
