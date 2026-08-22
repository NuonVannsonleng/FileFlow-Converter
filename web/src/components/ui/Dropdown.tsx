import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';

interface DropdownProps {
  trigger: (props: { open: boolean; toggle: () => void; id: string }) => ReactNode;
  children: (props: { close: () => void }) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
  label?: string;
}

/**
 * Accessible popover menu. Closes on Escape, on outside click, and whenever
 * focus leaves the group, so it never strands a keyboard user inside.
 */
export function Dropdown({ trigger, children, align = 'right', className, label }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        containerRef.current?.querySelector('button')?.focus();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {trigger({ open, toggle: () => setOpen((value) => !value), id })}
      <AnimatePresence>
        {open && (
          <motion.div
            id={id}
            role="menu"
            aria-label={label}
            className={cn(
              'absolute top-[calc(100%+8px)] z-40 min-w-[11rem] overflow-hidden rounded-xl border border-line bg-elevated p-1.5 shadow-lift',
              align === 'right' ? 'right-0' : 'left-0',
              className,
            )}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            {children({ close: () => setOpen(false) })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface DropdownItemProps {
  onClick: () => void;
  active?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  /** Renders a router link instead of a button. */
  to?: string;
}

const ITEM_CLASS =
  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors';

export function DropdownItem({ onClick, active, icon, children, to }: DropdownItemProps) {
  const className = cn(
    ITEM_CLASS,
    active ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-surface hover:text-ink',
  );

  if (to) {
    return (
      <Link
        to={to}
        role="menuitem"
        aria-current={active ? 'page' : undefined}
        onClick={onClick}
        className={className}
      >
        {icon}
        <span className="flex-1">{children}</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={onClick}
      className={className}
    >
      {icon}
      <span className="flex-1">{children}</span>
    </button>
  );
}
