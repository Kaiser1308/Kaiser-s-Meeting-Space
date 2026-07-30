import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  apiConventions,
  createRateLimiter,
  requireIdempotencyKey,
} from '../../../apps/api/src/conventions/index.js';

const apps: Array<ReturnType<typeof Fastify>> = [];

async function build(options: Parameters<typeof apiConventions>[0] = {}) {
  const app = Fastify({ logger: false, bodyLimit: options.maxBodyBytes ?? 1024 });
  await app.register(apiConventions, options);
  app.post('/v1/mutate', { preHandler: requireIdempotencyKey }, async () => ({ ok: true }));
  app.post('/v1/limited', async () => ({ ok: true }));
  app.get('/v1/probe', async () => ({ ok: true }));
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('P04-T05 API conventions', () => {
  it('returns a generated request id and echoes a valid client request id', async () => {
    const app = await build();
    const generated = await app.inject({ method: 'GET', url: '/v1/probe' });
    const supplied = await app.inject({
      method: 'GET',
      url: '/v1/probe',
      headers: { 'x-request-id': 'req_client-123' },
    });

    expect(generated.statusCode).toBe(200);
    expect(generated.headers['x-request-id']).toMatch(/^req_[a-f0-9-]{16,}$/);
    expect(supplied.headers['x-request-id']).toBe('req_client-123');
  });

  it('rejects invalid request ids without reflecting attacker-controlled values', async () => {
    const app = await build();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/probe',
      headers: { 'x-request-id': 'secret\r\nX-Leak: yes' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toMatch(/^req_[a-f0-9-]{16,}$/);
    expect(response.headers['x-request-id']).not.toContain('X-Leak');
  });

  it('maps thrown errors to the safe P02 envelope', async () => {
    const app = await build();
    app.get('/v1/failure', async () => {
      throw new Error('provider body: transcript secret');
    });
    const response = await app.inject({ method: 'GET', url: '/v1/failure' });
    const body = response.json();

    expect(response.statusCode).toBe(500);
    expect(body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected internal error occurred',
        requestId: response.headers['x-request-id'],
      },
    });
    expect(JSON.stringify(body)).not.toContain('transcript secret');
  });

  it('rejects non-JSON mutation bodies and oversized payloads safely', async () => {
    const app = await build({ maxBodyBytes: 32 });
    const contentType = await app.inject({
      method: 'POST',
      url: '/v1/limited',
      headers: { 'content-type': 'text/plain' },
      payload: 'hello',
    });
    const oversized = await app.inject({
      method: 'POST',
      url: '/v1/limited',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ value: 'this payload is too large' }),
    });

    expect(contentType.statusCode).toBe(415);
    expect(contentType.json().error.code).toBe('VALIDATION_ERROR');
    expect(oversized.statusCode).toBe(413);
    expect(oversized.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('maps malformed JSON to a safe validation error', async () => {
    const app = await build();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/limited',
      headers: { 'content-type': 'application/json' },
      payload: '{"broken":',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('requires a syntactically valid idempotency key for retryable mutations', async () => {
    const app = await build();
    const missing = await app.inject({ method: 'POST', url: '/v1/mutate', payload: {} });
    const malformed = await app.inject({
      method: 'POST',
      url: '/v1/mutate',
      headers: { 'idempotency-key': 'bad key' },
      payload: {},
    });
    const valid = await app.inject({
      method: 'POST',
      url: '/v1/mutate',
      headers: { 'idempotency-key': 'idem_0123456789abcdef' },
      payload: {},
    });

    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe('VALIDATION_ERROR');
    expect(malformed.statusCode).toBe(400);
    expect(valid.statusCode).toBe(200);
  });

  it('negotiates only supported API versions', async () => {
    const app = await build({ supportedVersions: ['v1'] });
    const absent = await app.inject({ method: 'GET', url: '/v1/probe' });
    const supported = await app.inject({
      method: 'GET',
      url: '/v1/probe',
      headers: { 'accept-version': 'v1' },
    });
    const unsupported = await app.inject({
      method: 'GET',
      url: '/v1/probe',
      headers: { 'accept-version': 'v2' },
    });

    expect(absent.statusCode).toBe(200);
    expect(supported.statusCode).toBe(200);
    expect(supported.headers['x-api-version']).toBe('v1');
    expect(unsupported.statusCode).toBe(400);
    expect(unsupported.json().error.code).toBe('UNSUPPORTED_ENVELOPE_VERSION');
  });

  it('enforces a per-client baseline rate limit and emits retry metadata', async () => {
    const app = await build({ rateLimiter: createRateLimiter({ max: 2, windowMs: 60_000 }) });
    await app.inject({ method: 'GET', url: '/v1/probe', remoteAddress: '10.0.0.1' });
    await app.inject({ method: 'GET', url: '/v1/probe', remoteAddress: '10.0.0.1' });
    const blocked = await app.inject({
      method: 'GET',
      url: '/v1/probe',
      remoteAddress: '10.0.0.1',
    });

    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(blocked.json().error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('sets restrictive security headers and allowlisted CORS defaults', async () => {
    const app = await build({ corsOrigin: 'http://localhost:3000' });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/probe',
      headers: { origin: 'http://localhost:3000' },
    });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });
});
