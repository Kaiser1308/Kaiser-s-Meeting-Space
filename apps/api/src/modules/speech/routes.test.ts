import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import Fastify from 'fastify';
import { speechRoutes } from './routes.js';
import { bearerAuth } from '../../plugins/bearer-auth.js';

describe('POST /v1/meetings/:id/speech-sessions', () => {
  const MEETING_ID = '550e8400-e29b-41d4-a716-446655440000';

  let app: ReturnType<typeof Fastify>;
  const createGrant = async () => ({ accessToken: 'temporary-token', expiresIn: 30 });

  beforeAll(async () => {
    vi.stubEnv('DEEPGRAM_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(
        async () =>
          new Response(JSON.stringify({ access_token: 'temporary-token', expires_in: 30 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    app = Fastify();

    await app.register(async (protectedRoutes: any) => {
      await protectedRoutes.register(bearerAuth, {
        verifier: {
          verify: async () => ({ valid: true, issuer: 'iss', subject: 'sub' }),
        },
        identity: {
          resolve: async () => ({ ownerId: 'owner-123' }),
        } as any,
      });

      await protectedRoutes.register(speechRoutes, {
        createGrant,
        authorize: async (input: {
          ownerId: string;
          meetingId: string;
          language: 'vi' | 'en';
          sourceId: string;
        }) => ({
          language: input.language,
          sourceIds: [input.sourceId],
          liveCloudConsented: true,
        }),
      });
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns 201 with credential for valid request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/meetings/${MEETING_ID}/speech-sessions`,
      payload: { language: 'vi', sourceId: 'source-1', diarization: false },
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.provider).toBe('deepgram');
    expect(body.meetingId).toBe(MEETING_ID);
    expect(body.token).toBe('temporary-token');
    expect(body.config).toEqual({ language: 'vi', diarization: false, model: 'nova-3' });

    const expiresMs = new Date(body.expiresAt).getTime();
    const nowMs = Date.now();
    const diff = expiresMs - nowMs;
    expect(diff).toBeGreaterThan(0);
    expect(diff).toBeLessThanOrEqual(30_000 + 5000);
  });

  it('returns 401 when owner context is missing', async () => {
    const unauthApp = Fastify();
    unauthApp.decorateRequest('authenticatedOwnerContext', null as any);
    await unauthApp.register(speechRoutes);
    await unauthApp.ready();

    const res = await unauthApp.inject({
      method: 'POST',
      url: `/v1/meetings/${MEETING_ID}/speech-sessions`,
      payload: { language: 'vi', sourceId: 'source-1' },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('UNAUTHORIZED');

    await unauthApp.close();
  });

  it('rejects an unsupported language before requesting a provider grant', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/meetings/${MEETING_ID}/speech-sessions`,
      payload: { language: 'fr', sourceId: 'source-1' },
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error.code).toBe('VALIDATION_ERROR');
  });

  it('provider is always deepgram', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/meetings/${MEETING_ID}/speech-sessions`,
      payload: { language: 'en', sourceId: 'src-2', diarization: true },
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.provider).toBe('deepgram');
  });

  it('expiry matches the provider temporary-token lifetime', async () => {
    const before = Date.now();

    const res = await app.inject({
      method: 'POST',
      url: `/v1/meetings/${MEETING_ID}/speech-sessions`,
      payload: { language: 'vi', sourceId: 'src-3', diarization: false },
      headers: { authorization: 'Bearer valid-token' },
    });

    const after = Date.now();
    const body = JSON.parse(res.payload);
    const expiresMs = new Date(body.expiresAt).getTime();
    const expectedExpiry = before + 30_000;

    expect(expiresMs).toBeGreaterThanOrEqual(expectedExpiry - 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + 30_000 + 1000);
  });

  it('does not expose owner or meeting metadata in the Deepgram token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/meetings/${MEETING_ID}/speech-sessions`,
      payload: { language: 'vi', sourceId: 'src-4' },
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.token).toBe('temporary-token');
  });

  it('diarization defaults to false when omitted', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/meetings/${MEETING_ID}/speech-sessions`,
      payload: { language: 'en', sourceId: 'src-5' },
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.config.diarization).toBe(false);
  });

  it('diarization is true when explicitly set', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/meetings/${MEETING_ID}/speech-sessions`,
      payload: { language: 'en', sourceId: 'src-6', diarization: true },
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.config.diarization).toBe(true);
  });

  it('returns 503 when Deepgram is not configured', async () => {
    const unavailableApp = Fastify();
    await unavailableApp.register(async (protectedRoutes: any) => {
      await protectedRoutes.register(bearerAuth, {
        verifier: { verify: async () => ({ valid: true, issuer: 'iss', subject: 'sub' }) },
        identity: { resolve: async () => ({ ownerId: 'owner-123' }) } as any,
      });
      await protectedRoutes.register(speechRoutes, {
        createGrant: async () => {
          throw new Error('Deepgram is not configured');
        },
        authorize: async () => ({
          language: 'en',
          sourceIds: ['src-missing-key'],
          liveCloudConsented: true,
        }),
      });
    });
    await unavailableApp.ready();

    const res = await unavailableApp.inject({
      method: 'POST',
      url: `/v1/meetings/${MEETING_ID}/speech-sessions`,
      payload: { language: 'en', sourceId: 'src-missing-key' },
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.payload).error.code).toBe('SPEECH_PROVIDER_NOT_CONFIGURED');
    await unavailableApp.close();
  });

  it('hides a meeting that is absent or belongs to another owner before requesting a grant', async () => {
    const deniedApp = Fastify();
    const deniedGrant = vi.fn(createGrant);
    await deniedApp.register(async (protectedRoutes: any) => {
      await protectedRoutes.register(bearerAuth, {
        verifier: { verify: async () => ({ valid: true, issuer: 'iss', subject: 'sub' }) },
        identity: { resolve: async () => ({ ownerId: 'owner-123' }) } as any,
      });
      await protectedRoutes.register(speechRoutes, {
        createGrant: deniedGrant,
        authorize: async () => null,
      });
    });
    await deniedApp.ready();

    const res = await deniedApp.inject({
      method: 'POST',
      url: `/v1/meetings/${MEETING_ID}/speech-sessions`,
      payload: { language: 'vi', sourceId: 'source-1' },
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(404);
    expect(deniedGrant).not.toHaveBeenCalled();
    await deniedApp.close();
  });

  it('rejects a session that is not explicitly consented for cloud live', async () => {
    const consentApp = Fastify();
    const deniedGrant = vi.fn(createGrant);
    await consentApp.register(async (protectedRoutes: any) => {
      await protectedRoutes.register(bearerAuth, {
        verifier: { verify: async () => ({ valid: true, issuer: 'iss', subject: 'sub' }) },
        identity: { resolve: async () => ({ ownerId: 'owner-123' }) } as any,
      });
      await protectedRoutes.register(speechRoutes, {
        createGrant: deniedGrant,
        authorize: async () => ({
          language: 'vi',
          sourceIds: ['source-1'],
          liveCloudConsented: false,
        }),
      });
    });
    await consentApp.ready();

    const res = await consentApp.inject({
      method: 'POST',
      url: `/v1/meetings/${MEETING_ID}/speech-sessions`,
      payload: { language: 'vi', sourceId: 'source-1' },
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(res.statusCode).toBe(409);
    expect(deniedGrant).not.toHaveBeenCalled();
    await consentApp.close();
  });
});
