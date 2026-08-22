import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import sanitize from 'sanitize-filename';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export async function initStorage(): Promise<void> {
  await Promise.all([
    mkdir(env.storage.uploads, { recursive: true }),
    mkdir(env.storage.outputs, { recursive: true }),
    mkdir(env.storage.work, { recursive: true }),
  ]);
  logger.info('Storage ready', { root: env.storage.root });
}

export const newId = (): string => randomUUID();

/**
 * Make a user-supplied filename safe to write and to echo back in a
 * Content-Disposition header. Never used to build a path on its own.
 */
export function safeFilename(original: string, fallback = 'file'): string {
  const cleaned = sanitize(path.basename(original)).replace(/[\r\n"]/g, '').trim();
  const limited = cleaned.slice(0, 120);
  return limited || fallback;
}

/** Strip the extension so converted files can be renamed `<base>.<newExt>`. */
export function baseName(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.tar.gz')) return filename.slice(0, -7);
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(0, dot) : filename;
}

/**
 * Stored files are named purely by id, so a hostile filename can never influence
 * the path we touch. The display name lives in the job record instead.
 */
export const uploadPath = (id: string): string => path.join(env.storage.uploads, id);
export const outputPath = (id: string): string => path.join(env.storage.outputs, id);
export const workDir = (id: string): string => path.join(env.storage.work, id);

export async function createWorkDir(id: string): Promise<string> {
  const dir = workDir(id);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function removeQuietly(target: string): Promise<void> {
  try {
    await rm(target, { recursive: true, force: true });
  } catch (error) {
    logger.warn('Cleanup failed', { target, error: String(error) });
  }
}

export async function fileSize(target: string): Promise<number> {
  try {
    return (await stat(target)).size;
  } catch {
    return 0;
  }
}

export async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete anything in the storage tree older than the TTL. Runs on a timer and
 * acts as the backstop for records the job store already expired.
 */
export async function sweepExpiredFiles(): Promise<number> {
  const cutoff = Date.now() - env.fileTtlMs;
  let removed = 0;

  for (const dir of [env.storage.uploads, env.storage.outputs, env.storage.work]) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const target = path.join(dir, entry);
      try {
        const info = await stat(target);
        if (info.mtimeMs < cutoff) {
          await rm(target, { recursive: true, force: true });
          removed += 1;
        }
      } catch {
        // Raced with another sweep or a download; nothing to do.
      }
    }
  }

  if (removed > 0) logger.info('Swept expired files', { removed });
  return removed;
}

let sweeper: NodeJS.Timeout | null = null;

export function startCleanupScheduler(onSweep?: () => Promise<void> | void): void {
  if (sweeper) return;
  const tick = async () => {
    await sweepExpiredFiles();
    await onSweep?.();
  };
  void tick();
  sweeper = setInterval(() => void tick(), env.cleanupIntervalMs);
  sweeper.unref();
}

export function stopCleanupScheduler(): void {
  if (sweeper) clearInterval(sweeper);
  sweeper = null;
}
