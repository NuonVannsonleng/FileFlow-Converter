import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface FieldProps {
  label: string;
  hint?: string;
  children: (props: { id: string }) => ReactNode;
  className?: string;
  /** Rendered at the end of the label row, e.g. a live value readout. */
  suffix?: ReactNode;
}

/** Label + control + hint, wired together for accessibility. */
export function Field({ label, hint, children, className, suffix }: FieldProps) {
  const id = useId();
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {suffix && <span className="text-xs tabular-nums text-muted">{suffix}</span>}
      </div>
      {children({ id })}
      {hint && <p className="text-xs leading-relaxed text-faint">{hint}</p>}
    </div>
  );
}

const CONTROL =
  'w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink transition-colors ' +
  'placeholder:text-faint hover:border-accent/40 focus:border-accent focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export const inputClass = cn(CONTROL, 'h-10');
export const selectClass = cn(CONTROL, 'h-10 cursor-pointer appearance-none pr-8');

/** Range input styled through the accent colour on both WebKit and Gecko. */
export function Slider({
  id,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  id?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const filled = ((value - min) / (max - min)) * 100;
  return (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-2 w-full cursor-pointer appearance-none rounded-pill bg-line accent-accent"
      style={{
        background: `linear-gradient(to right, rgb(var(--c-accent)) ${filled}%, rgb(var(--c-line)) ${filled}%)`,
      }}
    />
  );
}
