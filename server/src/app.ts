import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { apiRouter } from './routes/index.js';
import { mountStaticClient } from './middleware/spa.js';
import { logger } from './utils/logger.js';

export function createApp(): Express {
  const app = express();

  // Behind a reverse proxy the client IP arrives in X-Forwarded-For; without
  // this the rate limiter would bucket every visitor into the proxy's address.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API only ever returns JSON and file downloads, so the strict
      // cross-origin defaults would block the browser client for no benefit.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  app.use(
    cors({
      origin(origin, done) {
        // Same-origin and non-browser callers send no Origin header.
        if (!origin || env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) {
          done(null, true);
          return;
        }
        // In development, treat any loopback origin as trusted: localhost and
        // 127.0.0.1 are the same machine, and differing on which one you typed
        // is never a meaningful security boundary.
        if (!env.isProduction && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) {
          done(null, true);
          return;
        }
        // Reject by omitting the CORS headers, not by throwing. Throwing here
        // becomes a 500, which reads to the client as a server outage rather
        // than a policy decision.
        done(null, false);
      },
      credentials: false,
      exposedHeaders: ['Content-Disposition'],
    }),
  );

  app.use(express.json({ limit: '256kb' }));

  if (!env.isProduction) {
    app.use((req, _res, next) => {
      logger.debug(`${req.method} ${req.originalUrl}`);
      next();
    });
  }

  app.use('/api', apiLimiter, apiRouter);

  // Optional: serve the built client from this process when it exists.
  if (env.isProduction) mountStaticClient(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
