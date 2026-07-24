import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { jobRoutes } from './routes.js';
import { bearerAuth } from '../../plugins/bearer-auth.js';

describe('Resumable SSE Endpoint (Isolation)', () => {
  const mockDb = {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => []
        })
      })
    })
  } as any;

  it('should return 400 EVENT_CURSOR_EXPIRED if the Last-Event-ID header is invalid', async () => {
    const app = Fastify();
    await app.register(async (protectedRoutes) => {
      await protectedRoutes.register(bearerAuth, {
        verifier: {
          verify: async () => ({ valid: true, issuer: 'iss', subject: 'sub' }),
        },
        identity: {
          resolve: async () => ({ ownerId: 'owner-123' }),
        } as any,
      });

      await protectedRoutes.register(jobRoutes, { db: mockDb });
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/meetings/meeting-123/events',
      headers: {
        authorization: 'Bearer valid-token',
        'last-event-id': 'invalid-nan-cursor',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('EVENT_CURSOR_EXPIRED');
    expect(body.error.details.recovery).toBe('RELOAD_SNAPSHOT');
  });
});
