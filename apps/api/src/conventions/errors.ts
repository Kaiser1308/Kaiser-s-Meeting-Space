import type { FastifyError, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

export class ApiConventionError extends Error {
  constructor(
    public readonly code:
      'VALIDATION_ERROR' | 'UNSUPPORTED_ENVELOPE_VERSION' | 'RATE_LIMIT_EXCEEDED',
    public readonly statusCode: 400 | 413 | 415 | 429,
    message = 'The request contains invalid data',
  ) {
    super(message);
    this.name = 'ApiConventionError';
  }
}

const safeMessages = {
  VALIDATION_ERROR: 'The request contains invalid data',
  UNSUPPORTED_ENVELOPE_VERSION: 'The envelope version is not supported',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later.',
  INTERNAL_ERROR: 'An unexpected internal error occurred',
} as const;

export const errorPlugin: FastifyPluginAsync = fp(async (app) => {
  app.setErrorHandler((error: FastifyError | ApiConventionError, request, reply) => {
    const conventionError = error instanceof ApiConventionError ? error : undefined;
    const statusCode =
      conventionError?.statusCode ??
      (error.statusCode === 413
        ? 413
        : error.statusCode === 415
          ? 415
          : error.statusCode === 400
            ? 400
            : 500);
    const code =
      conventionError?.code ??
      (statusCode === 400 || statusCode === 413 || statusCode === 415
        ? 'VALIDATION_ERROR'
        : 'INTERNAL_ERROR');
    const message = safeMessages[code];
    reply
      .code(statusCode)
      .type('application/json')
      .send({
        error: {
          code,
          message,
          requestId: request.id,
        },
      });
  });
});
