import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ConversionJob, UploadedFileInfo } from '@shared';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Persistence boundary for uploads and jobs.
 *
 * The default implementation keeps everything in memory with a JSON snapshot on
 * disk, which suits an app whose artefacts expire within the hour and keeps the
 * project runnable with no external services. Swapping in PostgreSQL means
 * writing one more class against this interface - nothing else changes.
 */
export interface JobStore {
  saveUpload(upload: UploadedFileInfo): Promise<void>;
  getUpload(id: string): Promise<UploadedFileInfo | undefined>;
  deleteUpload(id: string): Promise<void>;
  saveJob(job: ConversionJob): Promise<void>;
  getJob(id: string): Promise<ConversionJob | undefined>;
  deleteJob(id: string): Promise<void>;
  listJobs(limit?: number): Promise<ConversionJob[]>;
  /** Records whose `expiresAt` has passed, so callers can settle them. */
  findExpired(now?: number): Promise<{ uploads: UploadedFileInfo[]; jobs: ConversionJob[] }>;
}

interface Snapshot {
  uploads: UploadedFileInfo[];
  jobs: ConversionJob[];
}

export class FileJobStore implements JobStore {
  private uploads = new Map<string, UploadedFileInfo>();
  private jobs = new Map<string, ConversionJob>();
  private flushTimer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> = Promise.resolve();

  constructor(private readonly file: string = env.storage.db) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.file, 'utf8');
      const snapshot = JSON.parse(raw) as Snapshot;
      for (const upload of snapshot.uploads ?? []) this.uploads.set(upload.id, upload);
      for (const job of snapshot.jobs ?? []) {
        // A job left mid-flight by a restart can never finish; mark it honestly.
        if (job.status === 'processing' || job.status === 'queued') {
          job.status = 'failed';
          job.stage = 'error';
          job.error = {
            code: 'CONVERSION_FAILED',
            message: 'This conversion was interrupted. Please try again.',
          };
        }
        this.jobs.set(job.id, job);
      }
      logger.info('Job store loaded', { uploads: this.uploads.size, jobs: this.jobs.size });
    } catch {
      logger.info('Job store starting empty');
    }
  }

  /** Debounced write-behind: conversions update progress far too often to fsync each time. */
  private schedulePersist(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushing = this.persist();
    }, 400);
    this.flushTimer.unref();
  }

  async persist(): Promise<void> {
    const snapshot: Snapshot = {
      uploads: [...this.uploads.values()],
      jobs: [...this.jobs.values()],
    };
    const temporary = `${this.file}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(snapshot), 'utf8');
      // Rename is atomic on both POSIX and NTFS, so a crash never leaves a torn file.
      await rename(temporary, this.file);
    } catch (error) {
      logger.warn('Could not persist job store', { error: String(error) });
    }
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flushing;
    await this.persist();
  }

  async saveUpload(upload: UploadedFileInfo): Promise<void> {
    this.uploads.set(upload.id, upload);
    this.schedulePersist();
  }

  async getUpload(id: string): Promise<UploadedFileInfo | undefined> {
    return this.uploads.get(id);
  }

  async deleteUpload(id: string): Promise<void> {
    this.uploads.delete(id);
    this.schedulePersist();
  }

  async saveJob(job: ConversionJob): Promise<void> {
    this.jobs.set(job.id, job);
    this.schedulePersist();
  }

  async getJob(id: string): Promise<ConversionJob | undefined> {
    return this.jobs.get(id);
  }

  async deleteJob(id: string): Promise<void> {
    this.jobs.delete(id);
    this.schedulePersist();
  }

  async listJobs(limit = 50): Promise<ConversionJob[]> {
    return [...this.jobs.values()]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit);
  }

  async findExpired(now = Date.now()) {
    return {
      uploads: [...this.uploads.values()].filter((u) => Date.parse(u.expiresAt) <= now),
      jobs: [...this.jobs.values()].filter(
        (j) => j.status !== 'expired' && Date.parse(j.expiresAt) <= now,
      ),
    };
  }
}

export const jobStore = new FileJobStore(path.resolve(env.storage.db));
