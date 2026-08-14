import { DbError } from '@kms/database';
import { z } from 'zod';

export interface SafeAiError {
  code: string;
  message: string;
  statusCode: number;
}

export class AiError extends Error {
  constructor(
    public readonly safeCode: string,
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export function mapAiError(error: unknown): SafeAiError {
  if (error instanceof z.ZodError) {
    return { code: 'INVALID_REQUEST', message: 'Request validation failed', statusCode: 400 };
  }
  if (error instanceof AiError) {
    return { code: error.safeCode, message: error.message, statusCode: error.httpStatus };
  }
  if (error instanceof DbError) {
    return { code: 'INTERNAL_ERROR', message: 'An internal error occurred', statusCode: 500 };
  }
  return { code: 'INTERNAL_ERROR', message: 'An internal error occurred', statusCode: 500 };
}
