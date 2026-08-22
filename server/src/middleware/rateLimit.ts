import rateLimit, { type Options } from 'express-rate-limit';
import type { ApiErrorBody } from '@shared';
import { env } from '../config/env.js';

const shared: Partial<Options> = {
  windowMs: env.rateLimit.windowMs,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    const body: ApiErrorBody = {
      error: {
        code: 'RATE_LIMITED',
        message: 'You are converting a lot right now. Please wait a moment and try again.',
      },
    };
    res.status(429).json(body);
  },
};

/** Broad ceiling for the whole API. */
export const apiLimiter = rateLimit({ ...shared, limit: env.rateLimit.maxRequests });

/** Uploads and conversions are the expensive paths, so they get a tighter budget. */
export const uploadLimiter = rateLimit({ ...shared, limit: env.rateLimit.maxUploads });
