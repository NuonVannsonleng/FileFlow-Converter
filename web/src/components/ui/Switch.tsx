import { useId } from 'react';
import { cn } from '@/lib/cn';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}

/** A real checkbox under the paint, so it is keyboard and screen-reader native. */
export function Switch({ checked, onChange, label, hint, disabled }: SwitchProps) {
  const id = useId();

  return (
    <div className="flex items-start justify-between gap-6 py-3.5">
      <div className="min-w-0">
        <label htmlFor={id} className={cn('block text-sm font-medium', disabled && 'opacity-60')}>
          {label}
        </label>
        {hint && <p className="mt-0.5 text-sm leading-relaxed text-muted">{hint}</p>}
      </div>

      <label className={cn('relative shrink-0 pt-0.5', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span
          className={cn(
            'block h-6 w-11 rounded-pill transition-colors duration-200',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas',
            checked ? 'bg-accent' : 'bg-line',
            disabled && 'opacity-50',
          )}
        />
        <span
          className={cn(
            'pointer-events-none absolute left-0.5 top-1 h-5 w-5 rounded-full bg-white shadow-soft transition-transform duration-200 ease-smooth',
            checked && 'translate-x-5',
          )}
        />
      </label>
    </div>
  );
}
