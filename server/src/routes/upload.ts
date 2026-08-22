import { Router } from 'express';
import type { UploadResponse, UploadedFileInfo } from '@shared';
import { env } from '../config/env.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { uploadMiddleware, verifyFileType } from '../middleware/upload.js';
import { categoryOf, mimeTypeOf } from '../services/conversion/formats.js';
import { targetsFor } from '../services/conversion/registry.js';
import { jobStore } from '../services/jobStore.js';
import { removeQuietly, safeFilename, uploadPath } from '../services/storage.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const uploadRouter: Router = Router();

uploadRouter.post(
  '/upload',
  uploadLimiter,
  uploadMiddleware,
  asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      throw AppError.validation('No files were included in this upload.');
    }

    const accepted: UploadedFileInfo[] = [];
    const now = Date.now();
    const expiresAt = new Date(now + env.fileTtlMs).toISOString();

    for (const file of files) {
      try {
        // Trust the bytes, not the extension.
        const { format } = await verifyFileType(file.filename, file.originalname);
        const category = categoryOf(format);
        if (!category) throw AppError.unsupported();

        const info: UploadedFileInfo = {
          id: file.filename,
          originalName: safeFilename(file.originalname),
          format,
          category,
          sizeBytes: file.size,
          mimeType: mimeTypeOf(format),
          uploadedAt: new Date(now).toISOString(),
          expiresAt,
          targets: targetsFor(format),
        };

        await jobStore.saveUpload(info);
        accepted.push(info);
      } catch (error) {
        // One bad file must not discard the whole batch, but it does get removed.
        await removeQuietly(uploadPath(file.filename));
        if (files.length === 1) throw error;
        logger.warn('Rejected one file in a batch upload', {
          name: file.originalname,
          reason: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
        });
      }
    }

    if (accepted.length === 0) {
      throw AppError.unsupported('None of those files are formats we can convert yet.');
    }

    const body: UploadResponse = { files: accepted };
    res.status(201).json(body);
  }),
);
