import { cn } from '@/lib/cn';

/** FileFlow mark: a document with a download arrow flowing out of it. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('shrink-0', className)} role="img" aria-label="FileFlow">
      <defs>
        <linearGradient id="ff-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgb(var(--c-accent))" stopOpacity="0.95" />
          <stop offset="1" stopColor="rgb(var(--c-accent))" stopOpacity="0.72" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#ff-logo)" />
      <path
        d="M11 9.5h10M11 15h7M11 20.5h4"
        stroke="rgb(var(--c-accent-ink))"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.95"
      />
      <path
        d="M21 17.5v6m0 0 2.6-2.6M21 23.5l-2.6-2.6"
        stroke="rgb(var(--c-accent-ink))"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
