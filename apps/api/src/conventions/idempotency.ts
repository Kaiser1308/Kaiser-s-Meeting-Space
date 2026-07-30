import type { FastifyRequest } from 'fastify';
import { ApiConventionError } from './errors.js';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export async function requireIdempotencyKey(request: FastifyRequest): Promise<void> {
  const value = request.headers['idempotency-key'];
  if (typeof value !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new ApiConventionError('VALIDATION_ERROR', 400);
  }
}
