import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ApiConventionError, errorPlugin } from './errors.js';
import { requestIdPlugin } from './request-id.js';
import { requestClientKey, type ApiConventionsOptions } from './types.js';
import { createRateLimiter } from './rate-limit.js';

export { ApiConventionError } from './errors.js';
export { requireIdempotencyKey } from './idempotency.js';
export { createRateLimiter } from './rate-limit.js';
export type { ApiConventionsOptions, RateLimiter } from './types.js';

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const DEFAULT_VERSIONS = ['v1'] as const;

const apiConventionsPlugin: FastifyPluginAsync<ApiConventionsOptions> = async (
  app,
  options: ApiConventionsOptions,
) => {
  const maxBodyBytes = options.maxBodyBytes ?? 1_048_576;
  const supportedVersions = options.supportedVersions ?? DEFAULT_VERSIONS;
  const rateLimiter = options.rateLimiter ?? createRateLimiter({ max: 60, windowMs: 60_000 });

  await app.register(requestIdPlugin);
  await app.register(errorPlugin);

  app.addHook('onRequest', async (request, reply) => {
    const result = rateLimiter(requestClientKey(request));
    if (!result.allowed) {
      reply.header('retry-after', String(result.retryAfterSeconds));
      throw new ApiConventionError('RATE_LIMIT_EXCEEDED', 429);
    }

    const requestedVersion = request.headers['accept-version'] ?? request.headers['x-api-version'];
    const version =
      typeof requestedVersion === 'string' && requestedVersion.length > 0 ? requestedVersion : 'v1';
    if (!supportedVersions.includes(version)) {
      throw new ApiConventionError('UNSUPPORTED_ENVELOPE_VERSION', 400);
    }
    reply.header('x-api-version', version);

    if (BODY_METHODS.has(request.method)) {
      const contentType = request.headers['content-type'];
      if (
        typeof contentType !== 'string' ||
        !contentType.toLowerCase().startsWith('application/json')
      ) {
        throw new ApiConventionError('VALIDATION_ERROR', 415);
      }
      const contentLength = Number(request.headers['content-length']);
      if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
        throw new ApiConventionError('VALIDATION_ERROR', 413);
      }
    }
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=()');

    const origin = request.headers.origin;
    const allowed =
      options.corsOrigin === undefined
        ? undefined
        : Array.isArray(options.corsOrigin)
          ? options.corsOrigin
          : [options.corsOrigin];
    if (typeof origin === 'string' && allowed?.includes(origin)) {
      reply.header('access-control-allow-origin', origin);
      reply.header('vary', 'Origin');
      reply.header('access-control-allow-credentials', 'true');
    }
  });
};

export const apiConventions = fp(apiConventionsPlugin);
