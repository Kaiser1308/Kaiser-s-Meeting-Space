import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { jobRoutes } from './routes.js';
import { bearerAuth } from '../../plugins/bearer-auth.js';
import { JobsMetadataRepository } from '@kms/database';

describe('Job REST API Routes (Isolation)', () => {
  const mockDb = {} as any;

  it('should register routes and require owner authentication', async () => {
    // Mock the get method to return null (not found)
    vi.spyOn(JobsMetadataRepository.prototype, 'get').mockResolvedValue(null);

    const app = Fastify();

    // Register bearerAuth with a mock verifier/resolver
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

    // Verify requesting a job without authorization fails with 401
    const resNoAuth = await app.inject({
      method: 'GET',
      url: '/v1/jobs/job-1',
    });
    expect(resNoAuth.statusCode).toBe(401);

    // Verify requesting with bearer auth calls verifier
    const resAuth = await app.inject({
      method: 'GET',
      url: '/v1/jobs/job-1',
      headers: {
        authorization: 'Bearer valid-token',
      },
    });
    // Should be 404 since repo returned null
    expect(resAuth.statusCode).toBe(404);
  });
});
