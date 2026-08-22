import { createReadStream } from 'node:fs';
import { Router } from 'express';
import archiver from 'archiver';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { mimeTypeOf } from '../services/conversion/formats.js';
import { jobStore } from '../services/jobStore.js';
import { exists, outputPath } from '../services/storage.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const downloadRouter: Router = Router();

/**
 * RFC 5987 encoding. `filename` keeps a stripped ASCII form for old clients and
 * `filename*` carries the real name, so accents and CJK survive the round trip.
 */
function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

const batchSchema = z.object({
  jobIds: z.array(z.string().uuid()).min(1).max(100),
});

/** Batch download. Streams a ZIP without ever staging it on disk. */
downloadRouter.post(
  '/download/batch',
  asyncHandler(async (req, res) => {
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.validation('That download request is not valid.');

    const ready: { path: string; name: string }[] = [];
    for (const jobId of parsed.data.jobIds) {
      const job = await jobStore.getJob(jobId);
      if (!job || job.status !== 'completed') continue;
      const file = outputPath(job.id);
      if (await exists(file)) {
        ready.push({ path: file, name: job.outputName ?? `${job.id}.${job.to}` });
      }
    }

    if (ready.length === 0) {
      throw AppError.notFound('None of those files are available any more.');
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', contentDisposition('fileflow-converted.zip'));

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (error) => {
      logger.error('Batch archive failed', { error: error.message });
      res.destroy();
    });
    archive.pipe(res);

    // De-duplicate names so two `report.pdf` outputs do not collide in the ZIP.
    const used = new Map<string, number>();
    for (const entry of ready) {
      const seen = used.get(entry.name) ?? 0;
      used.set(entry.name, seen + 1);
      const dot = entry.name.lastIndexOf('.');
      const name =
        seen === 0
          ? entry.name
          : dot > 0
            ? `${entry.name.slice(0, dot)} (${seen})${entry.name.slice(dot)}`
            : `${entry.name} (${seen})`;
      archive.file(entry.path, { name });
    }

    await archive.finalize();
  }),
);

downloadRouter.get(
  '/download/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const job = await jobStore.getJob(id);

    if (!job) throw AppError.notFound();
    if (job.status === 'expired') throw AppError.expired();
    if (job.status === 'failed') {
      throw AppError.conversionFailed('That conversion did not succeed, so there is no file.');
    }
    if (job.status !== 'completed') {
      throw AppError.notFound('That conversion is still running.');
    }

    // The path comes from the job id alone, never from anything user-supplied.
    const file = outputPath(id);
    if (!(await exists(file))) throw AppError.expired();

    const name = job.outputName ?? `converted.${job.to}`;
    res.setHeader('Content-Type', mimeTypeOf(job.to));
    res.setHeader('Content-Disposition', contentDisposition(name));
    res.setHeader('Content-Length', String(job.outputSizeBytes ?? 0));
    // Converted files are private and short-lived; never let a proxy keep one.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const stream = createReadStream(file);
    stream.on('error', () => {
      if (!res.headersSent) res.status(410).end();
      else res.destroy();
    });
    stream.pipe(res);
  }),
);
