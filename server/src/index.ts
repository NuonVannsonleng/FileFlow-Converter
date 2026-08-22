import { createApp } from './app.js';
import { env } from './config/env.js';
import { initEngines } from './services/conversion/registry.js';
import { events } from './services/events.js';
import { jobStore } from './services/jobStore.js';
import { queue } from './services/queue.js';
import {
  initStorage,
  outputPath,
  removeQuietly,
  startCleanupScheduler,
  stopCleanupScheduler,
  uploadPath,
} from './services/storage.js';
import { logger } from './utils/logger.js';

/**
 * Retire records whose TTL has passed. The file sweeper deletes the bytes; this
 * keeps the job history honest about what is still downloadable.
 */
async function expireRecords(): Promise<void> {
  const { uploads, jobs } = await jobStore.findExpired();

  for (const upload of uploads) {
    await removeQuietly(uploadPath(upload.id));
    await jobStore.deleteUpload(upload.id);
  }

  for (const job of jobs) {
    await removeQuietly(outputPath(job.id));
    if (job.status === 'completed') {
      job.status = 'expired';
      job.stage = 'done';
      await jobStore.saveJob(job);
    } else {
      await jobStore.deleteJob(job.id);
    }
  }

  if (uploads.length || jobs.length) {
    logger.info('Expired records cleaned up', { uploads: uploads.length, jobs: jobs.length });
  }
}

async function main(): Promise<void> {
  await initStorage();
  await jobStore.load();

  const engines = await initEngines();
  logger.info('Conversion engines', {
    available: Object.entries(engines)
      .filter(([, value]) => value.available)
      .map(([name]) => name),
    unavailable: Object.entries(engines)
      .filter(([, value]) => !value.available)
      .map(([name]) => name),
  });

  startCleanupScheduler(expireRecords);

  const server = createApp().listen(env.port, () => {
    logger.info(`FileFlow API listening on http://localhost:${env.port}`, {
      env: env.nodeEnv,
      concurrency: env.queueConcurrency,
    });
  });

  // SSE connections are long-lived; without this the process would hang on exit.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down`);

    stopCleanupScheduler();
    events.closeAll();
    server.close();
    await queue.drain();
    await jobStore.flush();

    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason: String(reason) });
  });
}

void main().catch((error) => {
  logger.error('Failed to start server', { error: error instanceof Error ? error.stack : error });
  process.exit(1);
});
