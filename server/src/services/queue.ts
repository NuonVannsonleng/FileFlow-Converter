import type { ConversionJob } from '@shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { events } from './events.js';
import { jobStore } from './jobStore.js';
import { extensionOf } from './conversion/formats.js';
import { resolveConversion } from './conversion/registry.js';
import {
  baseName,
  createWorkDir,
  fileSize,
  outputPath,
  removeQuietly,
  safeFilename,
  uploadPath,
} from './storage.js';

/**
 * In-process job queue with bounded concurrency.
 *
 * Conversions are CPU and IO heavy, so running them unbounded would starve the
 * HTTP server. The interface here (enqueue + events) is deliberately the same
 * shape a Redis/BullMQ worker would expose, so moving to a separate worker
 * process later does not touch the routes.
 */
class ConversionQueue {
  private pending: string[] = [];
  private running = new Set<string>();
  private draining = false;

  constructor(private readonly concurrency: number) {}

  get depth(): number {
    return this.pending.length + this.running.size;
  }

  enqueue(jobId: string): void {
    this.pending.push(jobId);
    this.pump();
  }

  private pump(): void {
    if (this.draining) return;
    while (this.running.size < this.concurrency && this.pending.length > 0) {
      const jobId = this.pending.shift();
      if (!jobId) break;
      this.running.add(jobId);
      void this.process(jobId).finally(() => {
        this.running.delete(jobId);
        this.pump();
      });
    }
  }

  private async publish(job: ConversionJob): Promise<void> {
    await jobStore.saveJob(job);
    events.emitJob(job);
  }

  private async process(jobId: string): Promise<void> {
    const job = await jobStore.getJob(jobId);
    if (!job || job.status !== 'queued') return;

    const startedAt = Date.now();
    const input = uploadPath(job.uploadId);
    const output = outputPath(job.id);
    const work = await createWorkDir(job.id);

    job.status = 'processing';
    job.stage = 'preparing';
    job.progress = 2;
    await this.publish(job);

    // Progress arrives far faster than anyone can read it, so only emit on a
    // meaningful change. Without this a 4-minute encode floods the SSE stream.
    let lastEmitted = 0;
    const onProgress = (percent: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(percent)));
      if (clamped <= lastEmitted && clamped !== 100) return;
      if (clamped - lastEmitted < 2 && clamped !== 100) return;
      lastEmitted = clamped;
      job.progress = clamped;
      job.stage = clamped >= 100 ? 'finalizing' : 'converting';
      events.emitJob(job);
    };

    let outputName = `${baseName(safeFilename(job.originalName))}.${extensionOf(job.to)}`;

    try {
      const definition = resolveConversion(job.from, job.to);

      job.stage = 'converting';
      await this.publish(job);

      await definition.handler({
        inputPath: input,
        outputPath: output,
        workDir: work,
        from: job.from,
        to: job.to,
        originalName: safeFilename(job.originalName),
        settings: job.settings ?? {},
        onProgress,
        setOutputName: (name) => {
          outputName = safeFilename(name, outputName);
        },
      });

      const size = await fileSize(output);
      if (size === 0) throw AppError.conversionFailed();

      job.status = 'completed';
      job.stage = 'done';
      job.progress = 100;
      job.outputName = outputName;
      job.outputSizeBytes = size;
      job.durationMs = Date.now() - startedAt;
      job.completedAt = new Date().toISOString();
      // The clock on a finished file starts when it is ready to download.
      job.expiresAt = new Date(Date.now() + env.fileTtlMs).toISOString();

      logger.info('Conversion completed', {
        id: job.id,
        from: job.from,
        to: job.to,
        ms: job.durationMs,
      });
    } catch (error) {
      const appError =
        error instanceof AppError ? error : AppError.conversionFailed();

      if (!(error instanceof AppError)) {
        // Log the real cause, return the friendly one.
        logger.error('Conversion threw an unexpected error', {
          id: job.id,
          from: job.from,
          to: job.to,
          error: error instanceof Error ? error.stack : String(error),
        });
      }

      job.status = 'failed';
      job.stage = 'error';
      job.progress = 0;
      job.durationMs = Date.now() - startedAt;
      job.completedAt = new Date().toISOString();
      job.error = { code: appError.code, message: appError.message };

      await removeQuietly(output);
    } finally {
      await removeQuietly(work);
      // The source file is no longer needed once the job has settled.
      await removeQuietly(input);
      await jobStore.deleteUpload(job.uploadId);
    }

    await this.publish(job);
  }

  /** Stop accepting work and wait for in-flight jobs, for a clean shutdown. */
  async drain(timeoutMs = 15_000): Promise<void> {
    this.draining = true;
    this.pending = [];
    const deadline = Date.now() + timeoutMs;
    while (this.running.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

export const queue = new ConversionQueue(env.queueConcurrency);
