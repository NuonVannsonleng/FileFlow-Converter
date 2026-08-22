import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Serve the built web client from the API process.
 *
 * In development the two run separately (Vite on 5173, API on 4000). In
 * production a single origin removes the CORS hop entirely, so `npm run build`
 * followed by `npm start` gives one deployable process.
 */
export function mountStaticClient(app: Express): void {
  const distDir = path.resolve(process.cwd(), '../web/dist');
  const indexFile = path.join(distDir, 'index.html');

  if (!existsSync(indexFile)) {
    logger.info('No built web client found; API-only mode', { expected: distDir });
    return;
  }

  // Hashed assets are immutable; index.html must never be cached, or a deploy
  // would keep serving the old bundle references.
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );

  // Client-side routing: anything that is not an API call falls back to the app.
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexFile);
  });

  logger.info('Serving built web client', { dir: distDir });
}
