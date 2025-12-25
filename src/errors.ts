/**
 * Custom error types and error handling utilities.
 * Provides a consistent error handling pattern across the plugin.
 */

import type { ApiError, ErrorCode } from './types';

/**
 * Base error class for all plugin errors.
 * Extends Error with additional context for debugging.
 */
export abstract class PluginError extends Error {
  abstract readonly code: ErrorCode;
  readonly timestamp: Date;
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    this.details = details;

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert to a user-friendly message for display.
   */
  abstract toUserMessage(): string;

  /**
   * Convert to API error format.
   */
  toApiError(): ApiError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Thrown when authentication fails (invalid or missing API key).
 */
export class AuthenticationError extends PluginError {
  readonly code = 'INVALID_API_KEY' as const;

  toUserMessage(): string {
    return 'Authentication failed. Please check your API key in settings.';
  }
}

/**
 * Thrown when a requested resource is not found.
 */
export class NotFoundError extends PluginError {
  readonly code = 'NOT_FOUND' as const;

  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} with ID '${id}' not found` : `${resource} not found`,
      { resource, id }
    );
  }

  toUserMessage(): string {
    return 'The requested resource was not found.';
  }
}

/**
 * Thrown when request validation fails.
 */
export class ValidationError extends PluginError {
  readonly code = 'VALIDATION_ERROR' as const;

  toUserMessage(): string {
    return `Validation error: ${this.message}`;
  }
}

/**
 * Thrown when rate limit is exceeded.
 */
export class RateLimitError extends PluginError {
  readonly code = 'RATE_LIMIT_EXCEEDED' as const;
  readonly retryAfter?: number;

  constructor(retryAfter?: number) {
    super('Rate limit exceeded. Please try again later.', { retryAfter });
    this.retryAfter = retryAfter;
  }

  toUserMessage(): string {
    if (this.retryAfter) {
      const seconds = Math.ceil(this.retryAfter / 1000);
      return `Rate limit exceeded. Please try again in ${seconds} seconds.`;
    }
    return 'Rate limit exceeded. Please try again later.';
  }
}

/**
 * Thrown when uploaded file is too large.
 */
export class FileTooLargeError extends PluginError {
  readonly code = 'FILE_TOO_LARGE' as const;

  constructor(filename: string, size: number, maxSize: number) {
    super(`File '${filename}' is too large (${formatBytes(size)}). Maximum size is ${formatBytes(maxSize)}.`, {
      filename,
      size,
      maxSize,
    });
  }

  toUserMessage(): string {
    return this.message;
  }
}

/**
 * Thrown when file format is not supported.
 */
export class UnsupportedFormatError extends PluginError {
  readonly code = 'UNSUPPORTED_FORMAT' as const;

  constructor(filename: string, format: string) {
    super(`File '${filename}' has unsupported format: ${format}`, {
      filename,
      format,
    });
  }

  toUserMessage(): string {
    return this.message;
  }
}

/**
 * Thrown when trying to retry a job that hasn't failed.
 */
export class JobNotFailedError extends PluginError {
  readonly code = 'JOB_NOT_FAILED' as const;

  constructor(jobId: string, currentStatus: string) {
    super(`Cannot retry job '${jobId}' with status '${currentStatus}'`, {
      jobId,
      currentStatus,
    });
  }

  toUserMessage(): string {
    return 'This job cannot be retried because it has not failed.';
  }
}

/**
 * Thrown when image has expired and been deleted.
 */
export class ImageExpiredError extends PluginError {
  readonly code = 'IMAGE_EXPIRED' as const;

  constructor(jobId: string) {
    super(`Image for job '${jobId}' has expired and been deleted`, { jobId });
  }

  toUserMessage(): string {
    return 'The source image has expired and been deleted. Please upload the image again.';
  }
}

/**
 * Thrown when a network error occurs.
 */
export class NetworkError extends PluginError {
  readonly code = 'NETWORK_ERROR' as const;

  constructor(cause?: Error) {
    super('Network error. Please check your connection.', {
      cause: cause?.message,
    });
  }

  toUserMessage(): string {
    return 'Unable to connect to the server. Please check your internet connection.';
  }
}

/**
 * Thrown when an unexpected internal error occurs.
 */
export class InternalError extends PluginError {
  readonly code = 'INTERNAL_ERROR' as const;

  toUserMessage(): string {
    return 'An unexpected error occurred. Please try again.';
  }
}

// ============================================================================
// Error Utilities
// ============================================================================

/**
 * Parse an API error response into a PluginError.
 */
export function parseApiError(statusCode: number, body: unknown): PluginError {
  const apiError = body as { error?: ApiError };

  if (apiError?.error) {
    const { code, message, details } = apiError.error;

    switch (code) {
      case 'INVALID_API_KEY':
        return new AuthenticationError(message);
      case 'NOT_FOUND':
        return new NotFoundError(message);
      case 'VALIDATION_ERROR':
        return new ValidationError(message, details);
      case 'RATE_LIMIT_EXCEEDED':
        return new RateLimitError(details?.retryAfter as number | undefined);
      case 'FILE_TOO_LARGE':
        return new FileTooLargeError(
          details?.filename as string || 'unknown',
          details?.size as number || 0,
          details?.maxSize as number || 0
        );
      case 'UNSUPPORTED_FORMAT':
        return new UnsupportedFormatError(
          details?.filename as string || 'unknown',
          details?.format as string || 'unknown'
        );
      case 'JOB_NOT_FAILED':
        return new JobNotFailedError(
          details?.jobId as string || 'unknown',
          details?.currentStatus as string || 'unknown'
        );
      case 'IMAGE_EXPIRED':
        return new ImageExpiredError(details?.jobId as string || 'unknown');
      default:
        return new InternalError(message, details);
    }
  }

  // Fallback based on status code
  switch (statusCode) {
    case 401:
      return new AuthenticationError('Invalid API key');
    case 404:
      return new NotFoundError('Resource');
    case 413:
      return new FileTooLargeError('unknown', 0, 0);
    case 429:
      return new RateLimitError();
    default:
      return new InternalError(`Server returned status ${statusCode}`);
  }
}

/**
 * Check if an error is a specific type of PluginError.
 */
export function isPluginError(error: unknown): error is PluginError {
  return error instanceof PluginError;
}

/**
 * Get a user-friendly message from any error.
 */
export function getUserErrorMessage(error: unknown): string {
  if (isPluginError(error)) {
    return error.toUserMessage();
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred.';
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
