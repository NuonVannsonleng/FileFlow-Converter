import { readFile } from 'node:fs/promises';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { canonicalFormat, formatFromFilename } from '../services/conversion/formats.js';
import { isSupportedSource } from '../services/conversion/registry.js';
import { newId, uploadPath } from '../services/storage.js';

/**
 * Uploads land straight on disk under a generated id. The original name is never
 * part of a filesystem path, so traversal and overwrite attacks have no surface.
 */
const storage = multer.diskStorage({
  destination: (_req, _file, done) => done(null, env.storage.uploads),
  filename: (_req, _file, done) => done(null, newId()),
});

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: env.maxFileSizeBytes,
    files: env.maxFilesPerBatch,
    // Uploads carry no text fields; refusing them shrinks the attack surface.
    fields: 0,
    parts: env.maxFilesPerBatch,
  },
  fileFilter: (_req, file, done) => {
    const format = formatFromFilename(file.originalname);
    if (!format || !isSupportedSource(format)) {
      done(AppError.unsupported(`We can't convert ${file.originalname} yet.`));
      return;
    }
    done(null, true);
  },
}).array('files', env.maxFilesPerBatch);

/**
 * Extensions that magic bytes cannot confirm, either because the format is plain
 * text or because it shares a container signature with something else.
 */
const UNSNIFFABLE = new Set(['txt', 'csv', 'svg']);

/**
 * Signatures that legitimately match a declared format even though the detected
 * extension differs. Container formats share magic bytes with their relatives:
 * every OOXML/ODF file is really a ZIP, every legacy Office file is an OLE
 * compound file, and `.tar.gz` is just gzip as far as the signature goes.
 */
const CONTAINER_EQUIVALENTS: Record<string, string[]> = {
  docx: ['zip'],
  xlsx: ['zip'],
  pptx: ['zip'],
  odt: ['zip'],
  zip: ['zip'],
  'tar.gz': ['gz'],
  doc: ['cfb'],
  xls: ['cfb'],
  ppt: ['cfb'],
  // ISO-BMFF relatives are routinely reported as one another.
  mp4: ['mov', 'm4a', 'mp4'],
  mov: ['mp4', 'mov'],
  m4a: ['mp4', 'm4a'],
  // WebM is a Matroska profile, so it can be reported either way.
  webm: ['mkv', 'webm'],
  mkv: ['webm', 'mkv'],
  ogg: ['ogv', 'oga', 'opus', 'ogx', 'ogg'],
  heic: ['heif', 'heic', 'avif'],
};

/**
 * Confirm the bytes match the claimed extension. This is the check that stops
 * someone renaming an executable to `.png` and relying on the extension alone.
 */
export async function verifyFileType(
  storedId: string,
  originalName: string,
): Promise<{ format: string }> {
  const declared = formatFromFilename(originalName);
  if (!declared) throw AppError.unsupported();

  if (UNSNIFFABLE.has(declared)) return { format: declared };

  // 4 KB is comfortably more than any magic-number signature needs.
  const handle = await readFile(uploadPath(storedId));
  const head = handle.subarray(0, 4096);
  const detected = await fileTypeFromBuffer(head);

  if (!detected) {
    throw AppError.corrupted('This file appears to be damaged or is not the format we expected.');
  }

  const detectedFormat = canonicalFormat(detected.ext);

  if (detectedFormat === declared) return { format: declared };
  if (CONTAINER_EQUIVALENTS[declared]?.includes(detected.ext)) return { format: declared };

  // Media containers are routinely mislabelled between close relatives; ffmpeg
  // reads the real container anyway, so trust the sniff over the extension.
  if (detectedFormat && isSupportedSource(detectedFormat)) {
    logger.warn('Extension did not match content; using detected format', {
      declared,
      detected: detectedFormat,
    });
    return { format: detectedFormat };
  }

  throw AppError.unsupported(
    `This file says it is ${declared.toUpperCase()} but its contents are something else.`,
  );
}
