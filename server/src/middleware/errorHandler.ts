import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@shared';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const notFoundHandler: RequestHandler = (_req, res) => {
  const body: ApiErrorBody = {
    error: { code: 'NOT_FOUND', message: 'That endpoint does not exist.' },
  };
  res.status(404).json(body);
};

/**
 * Single exit point for every error. Backend detail is logged, never returned:
 * clients only ever see one of our own friendly messages.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (res.headersSent) return;

  if (error instanceof AppError) {
    const body: ApiErrorBody = {
      error: { code: error.code, message: error.message, details: error.details },
    };
    res.status(error.status).json(body);
    return;
  }

  if (error instanceof ZodError) {
    const body: ApiErrorBody = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Some of the details in that request were not valid.',
        details: error.flatten().fieldErrors,
      },
    };
    res.status(400).json(body);
    return;
  }

  if (error instanceof MulterError) {
    const mapped: ApiErrorBody =
      error.code === 'LIMIT_FILE_SIZE'
        ? {
            error: {
              code: 'FILE_TOO_LARGE',
              message: 'This file exceeds the maximum allowed size.',
            },
          }
        : error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE'
          ? {
              error: {
                code: 'TOO_MANY_FILES',
                message: 'You selected more files than we can handle at once.',
              },
            }
          : {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'We could not read that upload. Please try again.',
              },
            };
    res.status(mapped.error.code === 'FILE_TOO_LARGE' ? 413 : 400).json(mapped);
    return;
  }

  logger.error('Unhandled error', {
    method: req.method,
    path: req.path,
    error: error instanceof Error ? error.stack : String(error),
  });

  const body: ApiErrorBody = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side. Please try again.',
    },
  };
  res.status(500).json(body);
};

/** Wrap an async handler so rejected promises reach the error handler. */
export const asyncHandler =
  <T extends RequestHandler>(handler: T): RequestHandler =>
  (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
