import { DbError } from '@kms/database';
import { z } from 'zod';

export interface SafeMinutesEditorError {
  code: string;
  message: string;
  statusCode: number;
}

export class MinutesEditorError extends Error {
  constructor(public readonly safeCode: string, message: string, public readonly httpStatus: number) {
    super(message);
    this.name = 'MinutesEditorError';
  }
}

export function mapMinutesEditorError(error: unknown): SafeMinutesEditorError {
  if (error instanceof z.ZodError) {
    return { code: 'INVALID_REQUEST', message: 'Request validation failed', statusCode: 400 };
  }
  if (error instanceof MinutesEditorError) {
    return { code: error.safeCode, message: error.message, statusCode: error.httpStatus };
  }
  if (error instanceof DbError) {
    switch (error.category) {
      case 'not_found':
        return { code: 'NOT_FOUND', message: 'Document not found', statusCode: 404 };
      case 'version_conflict':
        return { code: 'VERSION_CONFLICT', message: 'Document changed concurrently', statusCode: 409 };
      case 'duplicate':
        return { code: 'DUPLICATE_SAVE', message: 'Content already saved', statusCode: 409 };
      default:
        return { code: 'INTERNAL_ERROR', message: 'An internal error occurred', statusCode: 500 };
    }
  }
  return { code: 'INTERNAL_ERROR', message: 'An internal error occurred', statusCode: 500 };
}
