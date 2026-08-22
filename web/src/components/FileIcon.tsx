import {
  Archive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
  type LucideIcon,
} from 'lucide-react';
import type { Category } from '@shared';
import { cn } from '@/lib/cn';
import { CATEGORY_TONE } from '@/lib/format';

/** Format-specific icons win; otherwise fall back to the category icon. */
const BY_FORMAT: Record<string, LucideIcon> = {
  pdf: FileText,
  doc: FileText,
  docx: FileText,
  odt: FileText,
  rtf: FileText,
  txt: FileText,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
  ppt: Presentation,
  pptx: Presentation,
  svg: FileCode,
};

const BY_CATEGORY: Record<Category, LucideIcon> = {
  document: FileText,
  image: FileImage,
  audio: FileAudio,
  video: FileVideo,
  archive: Archive,
};

interface FileIconProps {
  format?: string;
  category?: Category;
  size?: number;
  className?: string;
  /** Wraps the glyph in a tinted rounded tile. */
  tile?: boolean;
}

export function FileIcon({ format, category, size = 20, className, tile }: FileIconProps) {
  const resolved: Category = category ?? 'document';
  const Icon = (format && BY_FORMAT[format]) || BY_CATEGORY[resolved];
  const tone = CATEGORY_TONE[resolved];

  if (!tile) return <Icon size={size} className={cn(tone.text, className)} aria-hidden="true" />;

  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-xl ring-1',
        tone.bg,
        tone.ring,
        className,
      )}
      aria-hidden="true"
    >
      <Icon size={size} className={tone.text} />
    </span>
  );
}

/** Short uppercase format chip, e.g. `PNG`. */
export function FormatBadge({
  format,
  className,
  tone = 'neutral',
}: {
  format: string;
  className?: string;
  tone?: 'neutral' | 'accent';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        tone === 'accent' ? 'bg-accent-soft text-accent' : 'bg-elevated text-muted ring-1 ring-line',
        className,
      )}
    >
      {format === 'folder' ? 'FILES' : format}
    </span>
  );
}
