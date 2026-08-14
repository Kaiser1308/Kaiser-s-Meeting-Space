import { DbError } from '@kms/database';
import { z } from 'zod';

export interface SafeTranslationError {
  code: string;
  message: string;
  statusCode: number;
}

export class TranslationError extends Error {
  constructor(
    public readonly safeCode: string,
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'TranslationError';
  }
}

export function mapTranslationError(error: unknown): SafeTranslationError {
  if (error instanceof z.ZodError) {
    return { code: 'INVALID_REQUEST', message: 'Request validation failed', statusCode: 400 };
  }
  if (error instanceof TranslationError) {
    return { code: error.safeCode, message: error.message, statusCode: error.httpStatus };
  }
  if (error instanceof DbError) {
    switch (error.category) {
      case 'not_found':
        return { code: 'MEETING_NOT_FOUND', message: 'Meeting not found', statusCode: 404 };
      case 'duplicate':
        return { code: 'ALREADY_TRANSLATED', message: 'Translation already recorded', statusCode: 409 };
      default:
        return { code: 'INTERNAL_ERROR', message: 'An internal error occurred', statusCode: 500 };
    }
  }
  return { code: 'INTERNAL_ERROR', message: 'An internal error occurred', statusCode: 500 };
}
