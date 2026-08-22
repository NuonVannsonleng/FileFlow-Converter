import type { ErrorCode } from '@shared';

/**
 * The only error type that is allowed to reach the client verbatim.
 * Anything else is mapped to a generic message so backend internals never leak.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  static unsupported(message = "This file format isn't supported yet.") {
    return new AppError('UNSUPPORTED_FORMAT', message, 415);
  }

  static tooLarge(message = 'This file exceeds the maximum allowed size.') {
    return new AppError('FILE_TOO_LARGE', message, 413);
  }

  static notFound(message = 'We could not find that file or conversion.') {
    return new AppError('NOT_FOUND', message, 404);
  }

  static expired(message = 'This file has expired and was automatically deleted.') {
    return new AppError('EXPIRED', message, 410);
  }

  static corrupted(message = 'This file appears to be damaged or invalid.') {
    return new AppError('CORRUPTED_FILE', message, 422);
  }

  static conversionFailed(message = "We couldn't convert this file. Please try again.") {
    return new AppError('CONVERSION_FAILED', message, 422);
  }

  static validation(message: string, details?: unknown) {
    return new AppError('VALIDATION_ERROR', message, 400, details);
  }
}
