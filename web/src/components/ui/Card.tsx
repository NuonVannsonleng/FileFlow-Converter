import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds a hover lift. Use only for cards that are themselves interactive. */
  interactive?: boolean;
  padded?: boolean;
  children?: ReactNode;
}

export function Card({ interactive, padded = true, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-line bg-surface shadow-soft',
        padded && 'p-5 sm:p-6',
        interactive &&
          'transition-all duration-200 ease-smooth hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-lift motion-reduce:transform-none',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
