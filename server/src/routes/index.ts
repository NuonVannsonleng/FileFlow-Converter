import { Router } from 'express';
import { events } from '../services/events.js';
import { queue } from '../services/queue.js';
import { conversionRouter } from './conversion.js';
import { downloadRouter } from './download.js';
import { formatsRouter } from './formats.js';
import { uploadRouter } from './upload.js';

export const apiRouter: Router = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', queueDepth: queue.depth, uptimeSeconds: Math.round(process.uptime()) });
});

/** Live conversion progress. One stream serves every job the client is watching. */
apiRouter.get('/events', (req, res) => {
  const unsubscribe = events.subscribe(res);
  req.on('close', unsubscribe);
});

apiRouter.use(formatsRouter);
apiRouter.use(uploadRouter);
apiRouter.use(conversionRouter);
apiRouter.use(downloadRouter);
