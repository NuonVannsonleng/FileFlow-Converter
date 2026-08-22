import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { Category } from '@shared';
import { cn } from '@/lib/cn';
import { CATEGORY_TONE } from '@/lib/format';
import { FileIcon } from './FileIcon';

interface ConverterCardProps {
  from: string;
  to: string;
  category: Category;
  className?: string;
}

/** Landing-page shortcut into the converter with a target pre-selected. */
export function ConverterCard({ from, to, category, className }: ConverterCardProps) {
  const tone = CATEGORY_TONE[category];

  return (
    <Link
      to={`/convert?to=${encodeURIComponent(to)}`}
      className={cn(
        'group flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-soft',
        'transition-all duration-200 ease-smooth hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-lift',
        'motion-reduce:transform-none',
        className,
      )}
    >
      <FileIcon format={from} category={category} size={18} tile className="h-10 w-10" />

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="uppercase">{from}</span>
          <ArrowRight size={13} className={cn('shrink-0', tone.text)} aria-hidden="true" />
          <span className="uppercase">{to}</span>
        </span>
      </span>

      <ArrowRight
        size={16}
        className="shrink-0 text-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-accent motion-reduce:transform-none"
        aria-hidden="true"
      />
    </Link>
  );
}
