import type { FastifyRequest } from 'fastify';

export type RateLimiter = (key: string) => { allowed: boolean; retryAfterSeconds: number };

export interface ApiConventionsOptions {
  maxBodyBytes?: number;
  supportedVersions?: readonly string[];
  corsOrigin?: string | readonly string[];
  rateLimiter?: RateLimiter;
}

export function requestClientKey(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0]!.trim();
  return request.ip;
}
