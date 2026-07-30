import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { bearerAuth } from '../../../apps/api/src/plugins/bearer-auth.js';
import {
  IdentityResolver,
  type IdentityRecord,
} from '../../../apps/api/src/modules/identity/identity-resolver.js';

const valid = (issuer = 'https://issuer.test', subject = 'subject-1') => ({
  valid: true as const,
  issuer,
  subject,
  payload: { iss: issuer, sub: subject },
});

function buildApp(options: {
  verify: (token: string) => Promise<unknown>;
  resolve: IdentityResolver;
}) {
  const app = Fastify();
  app.register(bearerAuth, {
    verifier: { verify: ({ token }: { token: string }) => options.verify(token) },
    identity: options.resolve,
  });
  app.get('/protected', async (request) => ({
    ownerId: request.authenticatedOwnerContext.ownerId,
  }));
  return app;
}

describe('P04-T02 bearer authentication', () => {
  it('maps issuer and subject to an authenticated owner context', async () => {
    const persistence = vi.fn(async (): Promise<IdentityRecord> => ({
      ownerId: 'owner-1',
      userStatus: 'active',
      sessionStatus: 'active',
    }));
    const app = buildApp({
      verify: async () => valid(),
      resolve: new IdentityResolver({ upsert: persistence }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer token-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ownerId: 'owner-1' });
    expect(persistence).toHaveBeenCalledWith({
      issuer: 'https://issuer.test',
      subject: 'subject-1',
    });
  });

  it('deduplicates concurrent login mapping for the same issuer and subject', async () => {
    let release!: () => void;
    const persistence = vi.fn(
      () =>
        new Promise<IdentityRecord>((resolve) => {
          release = () =>
            resolve({ ownerId: 'owner-1', userStatus: 'active', sessionStatus: 'active' });
        }),
    );
    const resolver = new IdentityResolver({ upsert: persistence });
    const first = resolver.resolve({ issuer: 'https://issuer.test', subject: 'subject-1' });
    const second = resolver.resolve({ issuer: 'https://issuer.test', subject: 'subject-1' });
    release();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { ownerId: 'owner-1', issuer: 'https://issuer.test', subject: 'subject-1' },
      { ownerId: 'owner-1', issuer: 'https://issuer.test', subject: 'subject-1' },
    ]);
    expect(persistence).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed authorization without querying identity persistence', async () => {
    const persistence = vi.fn(async (): Promise<IdentityRecord> => ({
      ownerId: 'owner-1',
      userStatus: 'active',
      sessionStatus: 'active',
    }));
    const verify = vi.fn(async () => valid());
    const app = buildApp({ verify, resolve: new IdentityResolver({ upsert: persistence }) });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Basic abc' },
    });

    expect(response.statusCode).toBe(401);
    expect(verify).not.toHaveBeenCalled();
    expect(persistence).not.toHaveBeenCalled();
  });

  it('rejects invalid tokens before any identity database query', async () => {
    const persistence = vi.fn(async (): Promise<IdentityRecord> => ({
      ownerId: 'owner-1',
      userStatus: 'active',
      sessionStatus: 'active',
    }));
    const app = buildApp({
      verify: async () => ({ valid: false, error: 'invalid' }),
      resolve: new IdentityResolver({ upsert: persistence }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer invalid' },
    });

    expect(response.statusCode).toBe(401);
    expect(persistence).not.toHaveBeenCalled();
  });

  it.each([
    ['disabled user', { userStatus: 'disabled', sessionStatus: 'active' }],
    ['revoked session', { userStatus: 'active', sessionStatus: 'revoked' }],
  ] as const)('rejects a %s without exposing identity state', async (_label, status) => {
    const persistence = vi.fn(async (): Promise<IdentityRecord> => ({
      ownerId: 'owner-1',
      ...status,
    }));
    const app = buildApp({
      verify: async () => valid(),
      resolve: new IdentityResolver({ upsert: persistence }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer token-1' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'UNAUTHENTICATED' });
  });

  it('rejects an unknown issuer returned by the verifier without identity lookup', async () => {
    const persistence = vi.fn(async (): Promise<IdentityRecord> => ({
      ownerId: 'owner-1',
      userStatus: 'active',
      sessionStatus: 'active',
    }));
    const app = buildApp({
      verify: async () => ({ valid: false, error: 'unknown issuer' }),
      resolve: new IdentityResolver({ upsert: persistence }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer token-1' },
    });

    expect(response.statusCode).toBe(401);
    expect(persistence).not.toHaveBeenCalled();
  });
});
