import { DbError } from '@kms/database';
import { z } from 'zod';

export interface SafeFinalizationError {
  code: string;
  message: string;
  statusCode: number;
}

export class FinalizationError extends Error {
  constructor(
    public readonly safeCode: string,
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'FinalizationError';
  }
}

export function mapFinalizationError(error: unknown): SafeFinalizationError {
  if (error instanceof z.ZodError) {
    return { code: 'INVALID_REQUEST', message: 'Request validation failed', statusCode: 400 };
  }
  if (error instanceof FinalizationError) {
    return { code: error.safeCode, message: error.message, statusCode: error.httpStatus };
  }
  if (error instanceof DbError) {
    switch (error.category) {
      case 'not_found':
        return { code: 'MEETING_NOT_FOUND', message: 'Meeting not found', statusCode: 404 };
      case 'version_conflict':
        return { code: 'VERSION_CONFLICT', message: 'Finalization state changed concurrently', statusCode: 409 };
      case 'duplicate':
        return { code: 'ALREADY_FINALIZED', message: 'Meeting is already finalized', statusCode: 409 };
      case 'immutable_violation':
        return { code: 'FINALIZATION_IMMUTABLE', message: 'Finalization data is immutable', statusCode: 409 };
      default:
        return { code: 'INTERNAL_ERROR', message: 'An internal error occurred', statusCode: 500 };
    }
  }
  if (error instanceof Error && error.message.includes('invalid_idempotency_key')) {
    return { code: 'INVALID_IDEMPOTENCY_KEY', message: 'Missing or invalid Idempotency-Key header', statusCode: 400 };
  }
  return { code: 'INTERNAL_ERROR', message: 'An internal error occurred', statusCode: 500 };
}
