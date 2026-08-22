import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const numeric = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: numeric(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  STORAGE_DIR: z.string().default('./storage'),
  MAX_FILE_SIZE_MB: numeric(200),
  MAX_FILES_PER_BATCH: numeric(20),
  FILE_TTL_MINUTES: numeric(60),
  CLEANUP_INTERVAL_MINUTES: numeric(5),
  QUEUE_CONCURRENCY: numeric(2),
  RATE_LIMIT_WINDOW_MINUTES: numeric(15),
  RATE_LIMIT_MAX_UPLOADS: numeric(100),
  RATE_LIMIT_MAX_REQUESTS: numeric(1000),
  LIBREOFFICE_PATH: z.string().optional(),
  PDF_FONT_PATH: z.string().optional(),
  PDF_FONT_BOLD_PATH: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const raw = parsed.data;
const storageRoot = path.resolve(process.cwd(), raw.STORAGE_DIR);

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === 'production',
  port: raw.PORT,
  /** Comma-separated list of allowed origins. */
  corsOrigins: raw.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
  storage: {
    root: storageRoot,
    uploads: path.join(storageRoot, 'uploads'),
    outputs: path.join(storageRoot, 'outputs'),
    work: path.join(storageRoot, 'work'),
    db: path.join(storageRoot, 'jobs.json'),
  },
  maxFileSizeBytes: raw.MAX_FILE_SIZE_MB * 1024 * 1024,
  maxFilesPerBatch: raw.MAX_FILES_PER_BATCH,
  fileTtlMs: raw.FILE_TTL_MINUTES * 60_000,
  fileTtlMinutes: raw.FILE_TTL_MINUTES,
  cleanupIntervalMs: raw.CLEANUP_INTERVAL_MINUTES * 60_000,
  queueConcurrency: raw.QUEUE_CONCURRENCY,
  rateLimit: {
    windowMs: raw.RATE_LIMIT_WINDOW_MINUTES * 60_000,
    maxUploads: raw.RATE_LIMIT_MAX_UPLOADS,
    maxRequests: raw.RATE_LIMIT_MAX_REQUESTS,
  },
  libreOfficePath: raw.LIBREOFFICE_PATH?.trim() || undefined,
  /** TrueType font embedded in generated PDFs, for scripts beyond Latin-1. */
  pdfFontPath: raw.PDF_FONT_PATH?.trim() || undefined,
  pdfFontBoldPath: raw.PDF_FONT_BOLD_PATH?.trim() || undefined,
} as const;
