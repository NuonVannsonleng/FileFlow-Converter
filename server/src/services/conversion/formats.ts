import type { Category, FormatInfo } from '@shared';

/**
 * Every format the app can describe. `id` is the canonical lowercase extension;
 * `aliases` are alternate extensions that normalise onto it.
 */
export const FORMATS: FormatInfo[] = [
  // ---------- Documents ----------
  { id: 'pdf', label: 'PDF', description: 'Portable Document Format', category: 'document', mimeType: 'application/pdf' },
  { id: 'doc', label: 'DOC', description: 'Legacy Word document', category: 'document', mimeType: 'application/msword' },
  { id: 'docx', label: 'DOCX', description: 'Word document', category: 'document', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { id: 'txt', label: 'TXT', description: 'Plain text', category: 'document', mimeType: 'text/plain' },
  { id: 'rtf', label: 'RTF', description: 'Rich Text Format', category: 'document', mimeType: 'application/rtf' },
  { id: 'odt', label: 'ODT', description: 'OpenDocument text', category: 'document', mimeType: 'application/vnd.oasis.opendocument.text' },
  { id: 'ppt', label: 'PPT', description: 'Legacy PowerPoint slides', category: 'document', mimeType: 'application/vnd.ms-powerpoint' },
  { id: 'pptx', label: 'PPTX', description: 'PowerPoint presentation', category: 'document', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  { id: 'xls', label: 'XLS', description: 'Legacy Excel workbook', category: 'document', mimeType: 'application/vnd.ms-excel' },
  { id: 'xlsx', label: 'XLSX', description: 'Excel workbook', category: 'document', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { id: 'csv', label: 'CSV', description: 'Comma-separated values', category: 'document', mimeType: 'text/csv' },

  // ---------- Images ----------
  { id: 'jpg', label: 'JPG', description: 'Compressed image format', category: 'image', mimeType: 'image/jpeg', aliases: ['jpeg', 'jfif'] },
  { id: 'png', label: 'PNG', description: 'Lossless image format', category: 'image', mimeType: 'image/png' },
  { id: 'webp', label: 'WEBP', description: 'Modern web image format', category: 'image', mimeType: 'image/webp' },
  { id: 'gif', label: 'GIF', description: 'Animated image format', category: 'image', mimeType: 'image/gif' },
  { id: 'bmp', label: 'BMP', description: 'Uncompressed bitmap', category: 'image', mimeType: 'image/bmp' },
  { id: 'tiff', label: 'TIFF', description: 'High quality raster image', category: 'image', mimeType: 'image/tiff', aliases: ['tif'] },
  { id: 'heic', label: 'HEIC', description: 'Apple high-efficiency image', category: 'image', mimeType: 'image/heic', aliases: ['heif'] },
  { id: 'svg', label: 'SVG', description: 'Scalable vector graphic', category: 'image', mimeType: 'image/svg+xml' },
  { id: 'avif', label: 'AVIF', description: 'Next-gen compressed image', category: 'image', mimeType: 'image/avif' },

  // ---------- Audio ----------
  { id: 'mp3', label: 'MP3', description: 'Compressed audio format', category: 'audio', mimeType: 'audio/mpeg' },
  { id: 'wav', label: 'WAV', description: 'Uncompressed audio', category: 'audio', mimeType: 'audio/wav' },
  { id: 'aac', label: 'AAC', description: 'Advanced Audio Coding', category: 'audio', mimeType: 'audio/aac' },
  { id: 'flac', label: 'FLAC', description: 'Lossless audio', category: 'audio', mimeType: 'audio/flac' },
  { id: 'ogg', label: 'OGG', description: 'Open compressed audio', category: 'audio', mimeType: 'audio/ogg' },
  { id: 'm4a', label: 'M4A', description: 'Apple audio container', category: 'audio', mimeType: 'audio/mp4' },

  // ---------- Video ----------
  { id: 'mp4', label: 'MP4', description: 'Universal video format', category: 'video', mimeType: 'video/mp4' },
  { id: 'mov', label: 'MOV', description: 'QuickTime video', category: 'video', mimeType: 'video/quicktime' },
  { id: 'webm', label: 'WEBM', description: 'Open web video format', category: 'video', mimeType: 'video/webm' },
  { id: 'avi', label: 'AVI', description: 'Legacy video container', category: 'video', mimeType: 'video/x-msvideo' },
  { id: 'mkv', label: 'MKV', description: 'Matroska video container', category: 'video', mimeType: 'video/x-matroska' },

  // ---------- Archives ----------
  { id: 'zip', label: 'ZIP', description: 'Compressed archive', category: 'archive', mimeType: 'application/zip' },
  { id: 'tar', label: 'TAR', description: 'Uncompressed archive', category: 'archive', mimeType: 'application/x-tar' },
  { id: 'tar.gz', label: 'TAR.GZ', description: 'Gzip-compressed archive', category: 'archive', mimeType: 'application/gzip', aliases: ['tgz'] },
  { id: 'folder', label: 'Files', description: 'Extracted contents', category: 'archive', mimeType: 'application/zip' },
];

const BY_ID = new Map(FORMATS.map((f) => [f.id, f]));

const ALIAS_TO_ID = new Map<string, string>();
for (const format of FORMATS) {
  ALIAS_TO_ID.set(format.id, format.id);
  for (const alias of format.aliases ?? []) ALIAS_TO_ID.set(alias, format.id);
}

/** Normalise a user-supplied extension or format id onto a canonical format id. */
export function canonicalFormat(value: string): string | undefined {
  return ALIAS_TO_ID.get(value.trim().toLowerCase().replace(/^\./, ''));
}

/** Resolve the canonical format for a filename, honouring double extensions (.tar.gz). */
export function formatFromFilename(filename: string): string | undefined {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.tar.gz')) return 'tar.gz';
  const ext = lower.slice(lower.lastIndexOf('.') + 1);
  if (!ext || ext === lower) return undefined;
  return canonicalFormat(ext);
}

export function getFormat(id: string): FormatInfo | undefined {
  return BY_ID.get(id);
}

export function categoryOf(id: string): Category | undefined {
  return BY_ID.get(id)?.category;
}

export function mimeTypeOf(id: string): string {
  return BY_ID.get(id)?.mimeType ?? 'application/octet-stream';
}

/** File extension to use when naming an output file for this format. */
export function extensionOf(id: string): string {
  return id === 'folder' ? 'zip' : id;
}
