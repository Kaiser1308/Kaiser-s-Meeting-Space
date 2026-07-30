import { createHash, randomUUID } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import {
  AudioRepository,
  createClient,
  MeetingsRepository,
  runMigrations,
  schema,
  type ClientHandle,
  type OwnerContext,
} from '@kms/database';
import type {
  GetResult,
  HeadResult,
  ObjectStore,
  PutOptions,
  PutResult,
  SignUrlOptions,
  SignedUrl,
  StorageKey,
} from '@kms/storage';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { apiConventions } from '../../conventions/index.js';
import { bearerAuth } from '../../plugins/bearer-auth.js';
import { IdentityResolver } from '../identity/identity-resolver.js';
import { MeetingIdSchema } from '@kms/domain';
import { audioRoutes } from './routes.js';

const OWNER_A: OwnerContext = { ownerId: 'owner-a' };
const OWNER_B: OwnerContext = { ownerId: 'owner-b' };
const NOW = new Date('2026-07-23T12:00:00.000Z');

class TestObjectStore implements ObjectStore {
  signCount = 0;
  private readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();

  reset(): void {
    this.signCount = 0;
    this.objects.clear();
  }

  async signUrl(key: StorageKey, opts: SignUrlOptions): Promise<SignedUrl> {
    this.signCount += 1;
    return {
      method: opts.method,
      url: `https://storage.invalid/signed/${this.signCount}`,
      expiresAt: new Date(NOW.getTime() + opts.expiresInSeconds * 1000).toISOString(),
      requiredHeaders: { 'Content-Type': opts.contentType! },
    };
  }

  async put(
    key: StorageKey,
    body: Uint8Array | ReadableStream<Uint8Array>,
    opts: PutOptions,
  ): Promise<PutResult> {
    let bytes: Uint8Array;
    if (body instanceof Uint8Array) {
      bytes = body;
    } else {
      const chunks: Uint8Array[] = [];
      const reader = body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
      bytes = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
    }
    this.objects.set(key, { body: bytes, contentType: opts.contentType });
    return {};
  }

  async head(key: StorageKey): Promise<HeadResult> {
    const obj = this.objects.get(key);
    if (!obj) return { exists: false };
    return {
      exists: true,
      contentLength: obj.body.length,
      contentType: obj.contentType,
    };
  }

  async get(key: StorageKey): Promise<GetResult> {
    const obj = this.objects.get(key);
    if (!obj) throw new Error('Object not found');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(obj.body);
        controller.close();
      },
    });
    return {
      body: stream,
      contentLength: obj.body.length,
      contentType: obj.contentType,
    };
  }

  async delete(key: StorageKey): Promise<void> {
    this.objects.delete(key);
  }
}

const validBody = (overrides: Record<string, unknown> = {}) => ({
  source: 'mic',
  chunkIndex: 0,
  sha256: 'a'.repeat(64),
  byteLength: 12_345,
  startedAt: '2026-07-23T12:00:00.000Z',
  durationMs: 10_000,
  wallClockStart: '2026-07-23T12:00:00.000Z',
  wallClockEnd: '2026-07-23T12:00:10.000Z',
  monotonicStart: 1_000,
  monotonicEnd: 11_000,
  codec: 'opus',
  container: 'webm',
  sampleRate: 48_000,
  channels: 1,
  ...overrides,
});

describe('POST /v1/meetings/:id/audio/chunks/register', () => {
  let container: StartedPostgreSqlContainer;
  let client: ClientHandle;
  let app: FastifyInstance;
  const objectStore = new TestObjectStore();
  const meetings = new MeetingsRepository();
  const audio = new AudioRepository();

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('kms_audio_t03')
      .withStartupTimeout(60_000)
      .start();
    client = createClient(container.getConnectionUri(), { prepare: false });
    await runMigrations(client.db, '../../packages/database/drizzle');

    app = Fastify({ logger: false });
    await app.register(apiConventions, {
      rateLimiter: () => ({ allowed: true, retryAfterSeconds: 0 }),
    });
    await app.register(async (protectedRoutes) => {
      await protectedRoutes.register(bearerAuth, {
        verifier: {
          async verify({ token }) {
            return { valid: true, issuer: 'synthetic-issuer', subject: token };
          },
        },
        identity: new IdentityResolver({
          async upsert({ subject }) {
            return {
              ownerId: subject === 'owner-b' ? OWNER_B.ownerId : OWNER_A.ownerId,
              userStatus: 'active',
              sessionStatus: 'active',
            };
          },
        }),
      });
      await protectedRoutes.register(audioRoutes, {
        db: client.db,
        objectStore,
        now: () => new Date(NOW),
      });
    });
    await app.ready();
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    await client?.close();
    await container?.stop();
  });

  beforeEach(() => {
    objectStore.reset();
  });

  async function seedMeeting(owner: OwnerContext, sources: ('mic' | 'system')[] = ['mic']) {
    const meetingId = randomUUID();
    await meetings.create(
      owner,
      client.db,
      {
        id: MeetingIdSchema.parse(meetingId),
        ownerId: owner.ownerId,
        title: 'Synthetic registration fixture',
        language: 'en',
        mode: 'meeting_only',
        captureSources: sources,
        speechMode: 'api',
        timezone: 'UTC',
        version: 1,
        createdAt: NOW.toISOString(),
        startedAt: NOW.toISOString(),
      },
      'draft',
    );
    return meetingId;
  }

  function register(
    meetingId: string,
    idempotencyKey?: string,
    body = validBody(),
    owner = 'owner-a',
  ) {
    return app.inject({
      method: 'POST',
      url: `/v1/meetings/${meetingId}/audio/chunks/register`,
      headers: {
        authorization: `Bearer ${owner}`,
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      payload: body,
    });
  }

  it('registers metadata, returns a scoped upload URL, and never returns storageKey', async () => {
    const meetingId = await seedMeeting(OWNER_A);

    const response = await register(meetingId, 'register-happy-0001');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      chunkId: `${meetingId}/mic/0`,
      created: true,
      upload: {
        method: 'PUT',
        url: 'https://storage.invalid/signed/1',
        expiresAt: '2026-07-23T12:05:00.000Z',
        requiredHeaders: { 'Content-Type': 'audio/webm' },
      },
    });
    expect(response.body).not.toContain('storageKey');

    const stored = await audio.getChunk(OWNER_A, client.db, `${meetingId}/mic/0` as never);
    expect(stored).toMatchObject({
      meetingId,
      source: 'mic',
      chunkIndex: 0,
      sha256: 'a'.repeat(64),
      uploadStatus: 'pending',
    });
    expect(stored?.storageKey).toBe(`audio/${OWNER_A.ownerId}/${meetingId}/mic/0.webm`);
  });

  it('returns the exact canonical response for an idempotent replay without re-signing', async () => {
    const meetingId = await seedMeeting(OWNER_A);

    const first = await register(meetingId, 'register-replay-0001');
    const replay = await register(meetingId, 'register-replay-0001');

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    expect(objectStore.signCount).toBe(1);
  });

  it.each([
    ['checksum', { sha256: 'b'.repeat(64) }],
    ['shape', { byteLength: 12_346 }],
  ])(
    'returns AUDIO_CHUNK_CONFLICT when the same idempotency key changes %s',
    async (_label, override) => {
      const meetingId = await seedMeeting(OWNER_A);
      await register(meetingId, 'register-conflict-0001');

      const conflict = await register(meetingId, 'register-conflict-0001', validBody(override));

      expect(conflict.statusCode).toBe(409);
      expect(conflict.json().error.code).toBe('AUDIO_CHUNK_CONFLICT');
      expect(conflict.body).not.toContain('storageKey');
    },
  );

  it('returns AUDIO_CHUNK_CONFLICT for the same chunk ID and different shape under a new key', async () => {
    const meetingId = await seedMeeting(OWNER_A);
    await register(meetingId, 'register-shape-0001');

    const conflict = await register(
      meetingId,
      'register-shape-0002',
      validBody({ durationMs: 9_999 }),
    );

    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('AUDIO_CHUNK_CONFLICT');
    const stored = await audio.getChunk(OWNER_A, client.db, `${meetingId}/mic/0` as never);
    expect(stored?.durationMs).toBe(10_000);
  });

  it('serializes concurrent same-key registration to one canonical row and one signature', async () => {
    const meetingId = await seedMeeting(OWNER_A);

    const [left, right] = await Promise.all([
      register(meetingId, 'register-concurrent-0001'),
      register(meetingId, 'register-concurrent-0001'),
    ]);

    expect(left.statusCode).toBe(200);
    expect(right.statusCode).toBe(200);
    expect(right.json()).toEqual(left.json());
    expect(objectStore.signCount).toBe(1);

    const rows = await client.db
      .select({ id: schema.audioChunks.id })
      .from(schema.audioChunks)
      .where(
        and(
          eq(schema.audioChunks.meetingId, meetingId),
          eq(schema.audioChunks.ownerId, OWNER_A.ownerId),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it('accepts out-of-order indices while maintaining one reconciliation version per state change', async () => {
    const meetingId = await seedMeeting(OWNER_A);

    const indexTwo = await register(
      meetingId,
      'register-order-0002',
      validBody({
        chunkIndex: 2,
        startedAt: '2026-07-23T12:00:20.000Z',
        wallClockStart: '2026-07-23T12:00:20.000Z',
        wallClockEnd: '2026-07-23T12:00:30.000Z',
        monotonicStart: 21_000,
        monotonicEnd: 31_000,
      }),
    );
    await register(meetingId, 'register-order-0002');
    const indexOne = await register(
      meetingId,
      'register-order-0001',
      validBody({
        chunkIndex: 1,
        startedAt: '2026-07-23T12:00:10.000Z',
        wallClockStart: '2026-07-23T12:00:10.000Z',
        wallClockEnd: '2026-07-23T12:00:20.000Z',
        monotonicStart: 11_000,
        monotonicEnd: 21_000,
      }),
    );

    expect(indexTwo.statusCode).toBe(200);
    expect(indexOne.statusCode).toBe(200);
    const [version] = await client.db
      .select({ version: schema.audioReconciliation.version })
      .from(schema.audioReconciliation)
      .where(eq(schema.audioReconciliation.meetingId, meetingId));
    expect(version?.version).toBe(2);
  });

  it('returns owner-indistinguishable 404 and does not sign for another owner', async () => {
    const meetingId = await seedMeeting(OWNER_A);

    const response = await register(meetingId, 'register-owner-0001', validBody(), 'owner-b');

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('RESOURCE_NOT_FOUND');
    expect(objectStore.signCount).toBe(0);
  });

  it('rejects a source not enabled by the meeting capture profile', async () => {
    const meetingId = await seedMeeting(OWNER_A, ['mic']);

    const response = await register(
      meetingId,
      'register-source-0001',
      validBody({ source: 'system' }),
    );

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('RESOURCE_NOT_FOUND');
    expect(objectStore.signCount).toBe(0);
  });

  it('requires a valid Idempotency-Key header', async () => {
    const meetingId = await seedMeeting(OWNER_A);

    const missing = await register(meetingId);
    const invalid = await register(meetingId, 'short');

    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe('VALIDATION_ERROR');
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('VALIDATION_ERROR');
    expect(objectStore.signCount).toBe(0);
  });

  describe('POST /v1/meetings/:id/audio/chunks/:source/:chunkIndex/complete', () => {
    function complete(
      meetingId: string,
      source: string,
      chunkIndex: number,
      idempotencyKey?: string,
      body = { sha256: 'a'.repeat(64) },
      owner = 'owner-a',
    ) {
      return app.inject({
        method: 'POST',
        url: `/v1/meetings/${meetingId}/audio/chunks/${source}/${chunkIndex}/complete`,
        headers: {
          authorization: `Bearer ${owner}`,
          ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        },
        payload: body,
      });
    }

    it('completes chunk registration successfully when the object exists with correct size and hash', async () => {
      const meetingId = await seedMeeting(OWNER_A);
      // Put the object in our test store and register its actual digest.
      const storageKey = `audio/${OWNER_A.ownerId}/${meetingId}/mic/0.webm`;
      const objectBody = new Uint8Array(12345);
      const objectSha256 = createHash('sha256').update(objectBody).digest('hex');
      await register(meetingId, 'reg-complete-0001', validBody({ sha256: objectSha256 }));
      await objectStore.put(storageKey as any, objectBody, {
        contentLength: objectBody.byteLength,
        contentType: 'audio/webm',
      });

      const response = await complete(meetingId, 'mic', 0, 'comp-0001', { sha256: objectSha256 });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        chunkId: `${meetingId}/mic/0`,
        completed: true,
      });

      const stored = await audio.getChunk(OWNER_A, client.db, `${meetingId}/mic/0` as never);
      expect(stored?.uploadStatus).toBe('completed');
      expect(stored?.finalizedAt).toBeDefined();
    });

    it('returns 409 STORAGE_CHECKSUM_MISMATCH if the size is wrong', async () => {
      const meetingId = await seedMeeting(OWNER_A);
      await register(meetingId, 'reg-complete-0002');

      const storageKey = `audio/${OWNER_A.ownerId}/${meetingId}/mic/0.webm`;
      // Put wrong size (100 instead of 12345)
      await objectStore.put(storageKey as any, new Uint8Array(100), {
        contentLength: 100,
        contentType: 'audio/webm',
      });

      const response = await complete(meetingId, 'mic', 0, 'comp-0002', { sha256: 'a'.repeat(64) });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('STORAGE_CHECKSUM_MISMATCH');
    });

    it('returns 404 STORAGE_OBJECT_NOT_FOUND if the object does not exist', async () => {
      const meetingId = await seedMeeting(OWNER_A);
      await register(meetingId, 'reg-complete-0003');

      const response = await complete(meetingId, 'mic', 0, 'comp-0003', { sha256: 'a'.repeat(64) });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('STORAGE_OBJECT_NOT_FOUND');
    });
  });

  describe('GET /v1/meetings/:id/audio/manifest', () => {
    it('returns the authoritative manifest for the meeting', async () => {
      const meetingId = await seedMeeting(OWNER_A);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/meetings/${meetingId}/audio/manifest`,
        headers: {
          authorization: `Bearer owner-a`,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.meetingId).toBe(meetingId);
      expect(data.reconciliationVersion).toBeDefined();
      expect(data.sources).toHaveLength(2); // mic & system
    });
  });
});
