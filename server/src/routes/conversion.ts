import { Router } from 'express';
import { z } from 'zod';
import type { ConversionJob, ConvertResponse, HistoryResponse } from '@shared';
import { env } from '../config/env.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { canonicalFormat } from '../services/conversion/formats.js';
import { resolveConversion } from '../services/conversion/registry.js';
import { events } from '../services/events.js';
import { jobStore } from '../services/jobStore.js';
import { queue } from '../services/queue.js';
import { newId, outputPath, removeQuietly, uploadPath } from '../services/storage.js';
import { AppError } from '../utils/errors.js';

export const conversionRouter: Router = Router();

/** Settings are bounded here so a hostile value can never reach an encoder. */
const settingsSchema = z
  .object({
    quality: z.number().int().min(1).max(100).optional(),
    width: z.number().int().min(1).max(10_000).optional(),
    height: z.number().int().min(1).max(10_000).optional(),
    maintainAspectRatio: z.boolean().optional(),
    compressionLevel: z.number().int().min(0).max(9).optional(),
    backgroundColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #ffffff')
      .optional(),
    audioBitrate: z.number().int().min(32).max(512).optional(),
    sampleRate: z.number().int().min(8_000).max(192_000).optional(),
    channels: z.number().int().min(1).max(2).optional(),
    resolution: z
      .string()
      .regex(/^(original|\d{2,5}x\d{2,5})$/, 'Use a size like 1280x720')
      .optional(),
    fps: z.number().int().min(1).max(120).optional(),
    videoBitrate: z.number().int().min(100).max(50_000).optional(),
    // Codec names go straight to ffmpeg, so only allow a known-safe alphabet.
    videoCodec: z.string().regex(/^[a-z0-9_-]{2,24}$/).optional(),
    audioCodec: z.string().regex(/^[a-z0-9_-]{2,24}$/).optional(),
    extractAudioOnly: z.boolean().optional(),
  })
  .strict();

const convertSchema = z.object({
  uploadIds: z.array(z.string().uuid()).min(1).max(env.maxFilesPerBatch),
  to: z.string().min(1).max(16),
  settings: settingsSchema.optional(),
});

conversionRouter.post(
  '/convert',
  uploadLimiter,
  asyncHandler(async (req, res) => {
    const parsed = convertSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.validation(
        'Those conversion options are not valid.',
        parsed.error.flatten().fieldErrors,
      );
    }

    const target = canonicalFormat(parsed.data.to);
    if (!target) throw AppError.unsupported();

    const jobs: ConversionJob[] = [];
    const now = Date.now();

    for (const uploadId of parsed.data.uploadIds) {
      const upload = await jobStore.getUpload(uploadId);
      if (!upload) throw AppError.notFound('That upload has expired. Please upload it again.');

      // Throws with a user-facing message when the pair is not offered.
      resolveConversion(upload.format, target);

      const job: ConversionJob = {
        id: newId(),
        uploadId: upload.id,
        originalName: upload.originalName,
        from: upload.format,
        to: target,
        category: upload.category,
        status: 'queued',
        progress: 0,
        stage: 'preparing',
        inputSizeBytes: upload.sizeBytes,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + env.fileTtlMs).toISOString(),
        settings: parsed.data.settings,
      };

      await jobStore.saveJob(job);
      queue.enqueue(job.id);
      events.emitJob(job);
      jobs.push(job);
    }

    const body: ConvertResponse = { jobs };
    res.status(202).json(body);
  }),
);

conversionRouter.get(
  '/conversion/:id',
  asyncHandler(async (req, res) => {
    const job = await jobStore.getJob(String(req.params.id));
    if (!job) throw AppError.notFound();
    res.json(job);
  }),
);

conversionRouter.delete(
  '/conversion/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const job = await jobStore.getJob(id);
    if (!job) throw AppError.notFound();

    await Promise.all([
      removeQuietly(outputPath(id)),
      removeQuietly(uploadPath(job.uploadId)),
    ]);
    await jobStore.deleteJob(id);
    await jobStore.deleteUpload(job.uploadId);

    res.status(204).end();
  }),
);

const historySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

conversionRouter.get(
  '/history',
  asyncHandler(async (req, res) => {
    const { limit } = historySchema.parse(req.query);
    const body: HistoryResponse = { jobs: await jobStore.listJobs(limit) };
    res.json(body);
  }),
);
