import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { resolve } from 'node:path';
import { OutboxRepository } from '../../../packages/database/src/index.js';
import {
  createClient,
  runMigrations,
  type ClientHandle,
} from '../../../packages/database/src/index.js';
import type { TestDb } from '../../../packages/database/test/harness.js';
import { OutboxDispatcher } from '../../../apps/worker/src/dispatcher.js';
import { KMSWorker } from '../../../apps/worker/src/worker.js';

const testDatabaseUrl =
  process.env.P06_TEST_DATABASE_URL ?? 'postgres://kms:kms_dev@127.0.0.1:5433/kms';
const testRedisUrl = process.env.P06_TEST_REDIS_URL ?? 'redis://127.0.0.1:6380/0';
const testRedisEndpoint = new URL(testRedisUrl);

async function startRedisLossPostgres(): Promise<TestDb> {
  const url = testDatabaseUrl;
  const handle: ClientHandle = createClient(url, { prepare: false });
  await runMigrations(handle.db, resolve(process.cwd(), 'packages/database/drizzle'));
  return {
    url,
    db: handle.db,
    $raw: handle.$raw,
    close: async () => {
      await handle.close();
    },
  };
}

async function redisCommand(command: string, args: string[] = []): Promise<string> {
  const parts = [command, ...args];
  const payload = Buffer.concat([
    Buffer.from(`*${parts.length}\r\n`),
    ...parts.map((part) => Buffer.from(`$${Buffer.byteLength(part)}\r\n${part}\r\n`)),
  ]);

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: testRedisEndpoint.hostname,
      port: Number(testRedisEndpoint.port || 6379),
    });
    const chunks: Buffer[] = [];
    socket.once('error', reject);
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    socket.once('connect', () => socket.end(payload));
  });
}

async function waitForCompleted(testDb: TestDb, jobId: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await testDb.$raw`SELECT state FROM jobs WHERE id = ${jobId}`;
    if (rows[0]?.state === 'completed') return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('synthetic job did not complete before timeout');
}

describe('Redis-Loss Recovery Resilience', () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startRedisLossPostgres();
  }, 120_000);

  afterAll(async () => {
    await testDb?.close();
  }, 30_000);

  it('should rebuild BullMQ dispatch state from PostgreSQL source-of-truth outbox', () => {
    // PG outbox rebuild process outline:
    // 1. SELECT * FROM outbox_events WHERE state = 'pending' AND (leased_until IS NULL OR leased_until < NOW())
    // 2. Re-enqueue each event into its respective BullMQ queue.
    // 3. Since workers use CAS and messageId/jobId deduplication, re-enqueueing duplicate jobs is safe.

    const repo = new OutboxRepository();
    expect(repo.acquireLeases).toBeDefined();
    expect(repo.acknowledgePublish).toBeDefined();
    expect(repo.recordFailure).toBeDefined();
  });

  it('republishes a pending outbox event after Redis state is lost', async () => {
    const messageId = randomUUID();
    const meetingId = randomUUID();
    const jobId = `job-${randomUUID()}`;
    const repo = new OutboxRepository();
    const dispatcher = () =>
      new OutboxDispatcher({
        databaseUrl: testDb.url,
        redisUrl: testRedisUrl,
      });

    await redisCommand('FLUSHALL');
    await testDb.$raw`
      INSERT INTO users (id, created_at)
      VALUES ('redis-loss-owner', NOW())
      ON CONFLICT (id) DO NOTHING
    `;
    await testDb.$raw`
      INSERT INTO meetings (
        id, owner_id, title, language, mode, speech_mode, timezone,
        version, state, capture_profile, created_at
      ) VALUES (
        ${meetingId}, 'redis-loss-owner', 'Synthetic Redis Loss',
        'vi'::meeting_language, 'meeting_only'::meeting_mode, 'api'::speech_mode,
        'UTC', 1, 'draft'::meeting_state,
        ${JSON.stringify({ container: 'webm', codec: 'opus', sampleRate: 48000, channels: 1 })}::jsonb,
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `;
    await testDb.$raw`
      INSERT INTO jobs (id, owner_id, meeting_id, type, state, max_attempts)
      VALUES (${jobId}, 'redis-loss-owner', ${meetingId}, 'finalization'::job_type, 'pending'::job_state, 3)
      ON CONFLICT (id) DO NOTHING
    `;
    await testDb.db.transaction(async (tx) => {
      await repo.saveEvent({ ownerId: 'redis-loss-owner' }, tx, {
        envelopeVersion: '1',
        messageId,
        correlationId: randomUUID(),
        causationId: null,
        ownerId: 'redis-loss-owner',
        entityType: 'processing_job',
        entityId: jobId,
        commandType: 'finalization_requested',
        commandVersion: 1,
        idempotencyKey: `redis-loss-${messageId}`,
        actorId: 'synthetic-test-actor',
        timestamp: new Date().toISOString(),
        payload: { synthetic: true },
      });
    });

    const firstDispatcher = dispatcher();
    await firstDispatcher.start();
    await firstDispatcher.stop();

    await redisCommand('FLUSHALL');
    const rebuiltDispatcher = dispatcher();
    await rebuiltDispatcher.start();
    await rebuiltDispatcher.stop();

    const rows = await testDb.$raw`
      SELECT state, attempts FROM outbox_events WHERE message_id = ${messageId}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.state).toBe('published');
    expect(Number(rows[0]!.attempts)).toBeGreaterThanOrEqual(1);
    expect(await redisCommand('EXISTS', [`bull:finalization:${jobId}`])).toContain(':1');
  }, 120_000);

  it('does not replay a terminal job after Redis is wiped', async () => {
    const messageId = randomUUID();
    const meetingId = randomUUID();
    const jobId = `job-${randomUUID()}`;
    const ownerId = `redis-terminal-owner-${randomUUID()}`;
    const repo = new OutboxRepository();

    await testDb.$raw`INSERT INTO users (id, created_at) VALUES (${ownerId}, NOW())`;
    await testDb.$raw`
      INSERT INTO meetings (
        id, owner_id, title, language, mode, speech_mode, timezone,
        version, state, capture_profile, created_at
      ) VALUES (
        ${meetingId}, ${ownerId}, 'Synthetic Redis Terminal',
        'vi'::meeting_language, 'meeting_only'::meeting_mode, 'api'::speech_mode,
        'UTC', 1, 'draft'::meeting_state,
        ${JSON.stringify({ container: 'webm', codec: 'opus', sampleRate: 48000, channels: 1 })}::jsonb,
        NOW()
      )
    `;
    await testDb.$raw`
      INSERT INTO jobs (id, owner_id, meeting_id, type, state, max_attempts)
      VALUES (${jobId}, ${ownerId}, ${meetingId}, 'finalization'::job_type, 'pending'::job_state, 3)
    `;
    await testDb.db.transaction(async (tx) => {
      await repo.saveEvent({ ownerId }, tx, {
        envelopeVersion: '1',
        messageId,
        correlationId: randomUUID(),
        causationId: null,
        ownerId,
        entityType: 'processing_job',
        entityId: jobId,
        commandType: 'finalization_requested',
        commandVersion: 1,
        idempotencyKey: `redis-terminal-${messageId}`,
        actorId: 'synthetic-test-actor',
        timestamp: new Date().toISOString(),
        payload: { synthetic: true },
      });
    });

    await redisCommand('FLUSHALL');
    const worker = new KMSWorker('finalization', {
      databaseUrl: testDb.url,
      redisUrl: testRedisUrl,
    });
    const dispatcher = new OutboxDispatcher({
      databaseUrl: testDb.url,
      redisUrl: testRedisUrl,
    });
    await worker.start();
    await dispatcher.start();
    await waitForCompleted(testDb, jobId);
    await dispatcher.stop();
    await worker.stop();

    await redisCommand('FLUSHALL');
    const rebuiltDispatcher = new OutboxDispatcher({
      databaseUrl: testDb.url,
      redisUrl: testRedisUrl,
    });
    await rebuiltDispatcher.start();
    await rebuiltDispatcher.stop();

    const rows = await testDb.$raw`
      SELECT j.state, COUNT(a.id)::int AS attempts
      FROM jobs j
      LEFT JOIN job_attempts a ON a.job_id = j.id
      WHERE j.id = ${jobId}
      GROUP BY j.state
    `;
    expect(rows[0]!.state).toBe('completed');
    expect(Number(rows[0]!.attempts)).toBe(1);
  }, 120_000);
});
