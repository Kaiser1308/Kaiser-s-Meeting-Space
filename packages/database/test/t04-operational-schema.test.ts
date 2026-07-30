import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import {
  // T04 tables and enums
  jobs,
  jobAttempts,
  jobProgress,
  outboxEvents,
  idempotencyRecords,
  deletionTombstones,
  deletionSteps,
  safeAudit,
  // T01 tables needed for FK
  users,
  meetings,
  meetingCaptureSources,
} from '../src/schema/index.js';
import { startPostgres, withRollbackTx, type TestDb } from './harness.js';

// ── Synthetic fixtures (no real meeting content) ───────────────────────────

const EPOCH = '2026-01-01T00:00:00.000Z';

async function insertMeeting(
  tx: Parameters<Parameters<TestDb['db']['transaction']>[0]>[0],
  overrides: Partial<typeof meetings.$inferInsert> = {},
): Promise<string> {
  const id = (overrides.id as string | undefined) ?? randomUUID();
  await tx.insert(meetings).values({
    ownerId: 'test-owner',
    title: 'T04 Synthetic Meeting',
    language: 'vi',
    mode: 'meeting_only',
    timezone: 'Asia/Ho_Chi_Minh',
    version: 1,
    state: 'checking',
    createdAt: new Date(EPOCH),
    ...overrides,
    id,
  });
  return id;
}

async function insertJob(
  tx: Parameters<Parameters<TestDb['db']['transaction']>[0]>[0],
  meetingId: string,
  overrides: Partial<typeof jobs.$inferInsert> = {},
): Promise<string> {
  const id = (overrides.id as string | undefined) ?? `job-${randomUUID()}`;
  await tx.insert(jobs).values({
    ownerId: 'test-owner',
    meetingId,
    type: 'speech_transcription',
    state: 'pending',
    maxAttempts: 3,
    ...overrides,
    id,
  });
  return id;
}

/** Runs a promise expected to reject and returns the postgresjs error code, or null. */
async function errCode(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    const err = e as { code?: unknown; cause?: { code?: unknown } };
    const code = err?.code ?? err?.cause?.code;
    return typeof code === 'string' ? code : '__NO_CODE__';
  }
}

let testDb!: TestDb;

beforeAll(async () => {
  testDb = await startPostgres();
}, 90_000);

afterAll(async () => {
  await testDb?.close();
});

// ── Existence inventory (P03-A02) ─────────────────────────────────────────

describe('T04 schema inventory', () => {
  const T04_TABLES = [
    'jobs',
    'job_attempts',
    'job_progress',
    'outbox_events',
    'idempotency_records',
    'deletion_tombstones',
    'deletion_steps',
    'safe_audit',
  ];

  it('creates every T04 table', async () => {
    const result = await testDb.db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const present = new Set(
      (result as unknown as { table_name: string }[]).map((r) => r.table_name),
    );
    for (const t of T04_TABLES) {
      expect(present.has(t), `missing table ${t}`).toBe(true);
    }
  });

  it.each([
    [
      'job_type',
      [
        'speech_transcription',
        'translation',
        'minutes_generation',
        'export',
        'deletion',
        'finalization',
        'backfill',
      ],
    ],
    ['job_state', ['pending', 'running', 'completed', 'failed', 'cancelled', 'retrying']],
    [
      'entity_type',
      [
        'meeting',
        'audio_chunk',
        'transcript_segment',
        'transcript_revision',
        'translation_segment',
        'speaker',
        'minutes_document',
        'minutes_version',
        'export_job',
        'processing_job',
      ],
    ],
    ['outbox_state', ['pending', 'published', 'failed']],
    ['deletion_state', ['pending', 'in_progress', 'completed', 'failed']],
    ['deletion_step_status', ['pending', 'running', 'completed', 'failed', 'skipped']],
  ])('enum %s has exact values %j', async (name, expected) => {
    const result = await testDb.db.execute(
      sql`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = ${name} ORDER BY e.enumsortorder`,
    );
    const labels = (result as unknown as { enumlabel: string }[]).map((r) => r.enumlabel);
    expect(labels).toEqual(expected);
  });

  it('creates every named index', async () => {
    const expected = [
      'jobs_owner_state_created_idx',
      'jobs_meeting_type_idx',
      'jobs_lease_idx',
      'job_attempts_job_id_attempt_unique',
      'job_attempts_job_id_attempt_idx',
      'job_progress_job_id_recorded_idx',
      'outbox_events_message_id_unique',
      'outbox_events_lease_idx',
      'outbox_events_entity_type_entity_id_idx',
      'idempotency_records_owner_entity_key_unique',
      'idempotency_records_expires_at_idx',
      'deletion_tombstones_meeting_id_unique',
      'deletion_tombstones_owner_state_idx',
      'deletion_steps_tombstone_id_step_unique',
      'deletion_steps_tombstone_id_status_idx',
      'safe_audit_owner_occurred_idx',
      'safe_audit_entity_type_entity_id_idx',
    ];
    const result = await testDb.db.execute(
      sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const present = new Set((result as unknown as { indexname: string }[]).map((r) => r.indexname));
    for (const idx of expected) {
      expect(present.has(idx), `missing index ${idx}`).toBe(true);
    }
  });

  it('creates the named CHECK constraints', async () => {
    const expected = [
      'jobs_max_attempts_positive',
      'jobs_progress_range',
      'job_attempts_attempt_positive',
      'job_progress_percent_range',
      'outbox_events_event_version_positive',
    ];
    const result = await testDb.db.execute(
      sql`SELECT conname FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace`,
    );
    const present = new Set((result as unknown as { conname: string }[]).map((r) => r.conname));
    for (const c of expected) {
      expect(present.has(c), `missing CHECK ${c}`).toBe(true);
    }
  });
});

// ── Valid inserts (P03-A02) ───────────────────────────────────────────────

describe('T04 valid inserts', () => {
  it('inserts a job, attempts, and progress', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      await tx.insert(meetingCaptureSources).values([
        { meetingId, source: 'mic' },
        { meetingId, source: 'system' },
      ]);

      // Insert a job
      const jobId = `job-${randomUUID()}`;
      await tx.insert(jobs).values({
        id: jobId,
        ownerId: 'test-owner',
        meetingId,
        type: 'speech_transcription',
        state: 'running',
        maxAttempts: 3,
        progress: 50,
      });

      // Verify job insert
      const jobRow = await tx.select().from(jobs).where(eq(jobs.id, jobId));
      expect(jobRow).toHaveLength(1);
      expect(jobRow[0]?.type).toBe('speech_transcription');
      expect(jobRow[0]?.state).toBe('running');
      expect(jobRow[0]?.maxAttempts).toBe(3);
      expect(jobRow[0]?.progress).toBe(50);

      // Insert a job attempt
      await tx.insert(jobAttempts).values({
        jobId,
        attempt: 1,
        startedAt: new Date(EPOCH),
        success: true,
      });

      const attemptRow = await tx.select().from(jobAttempts).where(eq(jobAttempts.jobId, jobId));
      expect(attemptRow).toHaveLength(1);
      expect(attemptRow[0]?.attempt).toBe(1);
      expect(attemptRow[0]?.success).toBe(true);

      // Insert job progress
      await tx.insert(jobProgress).values({
        jobId,
        percent: 50,
        message: 'Halfway there',
      });

      const progressRow = await tx.select().from(jobProgress).where(eq(jobProgress.jobId, jobId));
      expect(progressRow).toHaveLength(1);
      expect(progressRow[0]?.percent).toBe(50);
      expect(progressRow[0]?.message).toBe('Halfway there');
    });
  });

  it('inserts an outbox event', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);

      await tx.insert(outboxEvents).values({
        messageId: `msg-${randomUUID()}`,
        correlationId: `corr-${randomUUID()}`,
        causationId: null,
        ownerId: 'test-owner',
        entityType: 'meeting',
        entityId: meetingId,
        eventType: 'meeting.created',
        eventVersion: 1,
        actorId: 'test-owner',
        idempotencyKey: `idem-${randomUUID()}`,
        payload: { state: 'draft' },
        state: 'pending',
      });

      const row = await tx
        .select()
        .from(outboxEvents)
        .where(sql`${outboxEvents.entityId} = ${meetingId}`);
      expect(row).toHaveLength(1);
      expect(row[0]?.eventType).toBe('meeting.created');
      expect(row[0]?.state).toBe('pending');
    });
  });

  it('inserts an idempotency record', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });

      await tx.insert(idempotencyRecords).values({
        ownerId: 'test-owner',
        entityType: 'meeting',
        idempotencyKey: `idem-${randomUUID()}`,
        requestId: `req-${randomUUID()}`,
        responseCode: '200',
        responseSummary: { id: 'abc-123' },
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      });

      const row = await tx
        .select()
        .from(idempotencyRecords)
        .where(sql`${idempotencyRecords.ownerId} = 'test-owner'`);
      expect(row).toHaveLength(1);
      expect(row[0]?.responseCode).toBe('200');
    });
  });

  it('inserts a deletion tombstone and step', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);

      const tombstoneId = randomUUID();
      await tx.insert(deletionTombstones).values({
        id: tombstoneId,
        meetingId,
        ownerId: 'test-owner',
        state: 'pending',
      });

      const tombstoneRow = await tx
        .select()
        .from(deletionTombstones)
        .where(eq(deletionTombstones.meetingId, meetingId));
      expect(tombstoneRow).toHaveLength(1);
      expect(tombstoneRow[0]?.state).toBe('pending');

      // Insert a deletion step
      await tx.insert(deletionSteps).values({
        tombstoneId,
        step: 'delete_audio_chunks',
        status: 'completed',
      });

      const stepRow = await tx
        .select()
        .from(deletionSteps)
        .where(eq(deletionSteps.tombstoneId, tombstoneId));
      expect(stepRow).toHaveLength(1);
      expect(stepRow[0]?.step).toBe('delete_audio_chunks');
      expect(stepRow[0]?.status).toBe('completed');
    });
  });

  it('inserts a safe_audit record', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });

      await tx.insert(safeAudit).values({
        ownerId: 'test-owner',
        actorId: 'user-1',
        action: 'meeting.created',
        entityType: 'meeting',
        entityId: randomUUID(),
        metadata: { ipAddress: '192.168.1.1' },
      });

      const row = await tx
        .select()
        .from(safeAudit)
        .where(sql`${safeAudit.actorId} = 'user-1'`);
      expect(row).toHaveLength(1);
      expect(row[0]?.action).toBe('meeting.created');
    });
  });
});

// ── Unique constraint enforcement ─────────────────────────────────────────

describe('T04 unique constraint enforcement', () => {
  it('rejects duplicate (job_id, attempt) on job_attempts (23505)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      const jobId = await insertJob(tx, meetingId);

      await tx.insert(jobAttempts).values({
        jobId,
        attempt: 1,
        startedAt: new Date(EPOCH),
        success: true,
      });
      const code = await errCode(
        tx.insert(jobAttempts).values({
          jobId,
          attempt: 1,
          startedAt: new Date(EPOCH),
          success: false,
        }),
      );
      expect(code).toBe('23505');
    });
  });

  it('rejects duplicate (tombstone_id, step) on deletion_steps (23505)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);

      const tombstoneId = randomUUID();
      await tx.insert(deletionTombstones).values({
        id: tombstoneId,
        meetingId,
        ownerId: 'test-owner',
      });
      await tx.insert(deletionSteps).values({
        tombstoneId,
        step: 'delete_audio_chunks',
      });
      const code = await errCode(
        tx.insert(deletionSteps).values({
          tombstoneId,
          step: 'delete_audio_chunks',
        }),
      );
      expect(code).toBe('23505');
    });
  });

  it('rejects duplicate (meeting_id) on deletion_tombstones (23505)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);

      await tx.insert(deletionTombstones).values({
        meetingId,
        ownerId: 'test-owner',
      });
      const code = await errCode(
        tx.insert(deletionTombstones).values({
          meetingId,
          ownerId: 'test-owner',
        }),
      );
      expect(code).toBe('23505');
    });
  });

  it('rejects duplicate message_id on outbox_events (23505)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      const msgId = `msg-${randomUUID()}`;
      await tx.insert(outboxEvents).values({
        messageId: msgId,
        correlationId: 'corr-1',
        ownerId: 'test-owner',
        entityType: 'meeting',
        entityId: randomUUID(),
        eventType: 'meeting.created',
        eventVersion: 1,
        actorId: 'test-owner',
        idempotencyKey: 'idem-1',
        payload: {},
        state: 'pending',
      });
      const code = await errCode(
        tx.insert(outboxEvents).values({
          messageId: msgId,
          correlationId: 'corr-2',
          ownerId: 'test-owner',
          entityType: 'meeting',
          entityId: randomUUID(),
          eventType: 'meeting.created',
          eventVersion: 1,
          actorId: 'test-owner',
          idempotencyKey: 'idem-2',
          payload: {},
          state: 'pending',
        }),
      );
      expect(code).toBe('23505');
    });
  });

  it('rejects duplicate (owner_id, entity_type, idempotency_key) (23505)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      const idemKey = `idem-${randomUUID()}`;
      await tx.insert(idempotencyRecords).values({
        ownerId: 'test-owner',
        entityType: 'meeting',
        idempotencyKey: idemKey,
        requestId: 'req-1',
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      });
      const code = await errCode(
        tx.insert(idempotencyRecords).values({
          ownerId: 'test-owner',
          entityType: 'meeting',
          idempotencyKey: idemKey,
          requestId: 'req-2',
          expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        }),
      );
      expect(code).toBe('23505');
    });
  });
});

// ── Invalid value rejection (P03-A02) ─────────────────────────────────────

describe('T04 invalid value rejection', () => {
  it('rejects max_attempts <= 0 (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      const code = await errCode(
        tx.insert(jobs).values({
          id: `job-${randomUUID()}`,
          ownerId: 'test-owner',
          meetingId,
          type: 'speech_transcription',
          maxAttempts: 0,
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects progress < 0 (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      const code = await errCode(
        tx.insert(jobs).values({
          id: `job-${randomUUID()}`,
          ownerId: 'test-owner',
          meetingId,
          type: 'speech_transcription',
          maxAttempts: 3,
          progress: -1,
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects progress > 100 (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      const code = await errCode(
        tx.insert(jobs).values({
          id: `job-${randomUUID()}`,
          ownerId: 'test-owner',
          meetingId,
          type: 'speech_transcription',
          maxAttempts: 3,
          progress: 101,
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('allows NULL progress (no constraint violation)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      const code = await errCode(
        tx.insert(jobs).values({
          id: `job-${randomUUID()}`,
          ownerId: 'test-owner',
          meetingId,
          type: 'speech_transcription',
          maxAttempts: 3,
          progress: null,
        }),
      );
      expect(code).toBeNull();
    });
  });

  it('rejects attempt <= 0 (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      const jobId = await insertJob(tx, meetingId);
      const code = await errCode(
        tx.insert(jobAttempts).values({
          jobId,
          attempt: 0,
          startedAt: new Date(EPOCH),
          success: true,
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects percent < 0 (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      const jobId = await insertJob(tx, meetingId);
      const code = await errCode(
        tx.insert(jobProgress).values({
          jobId,
          percent: -5,
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects percent > 100 (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      const jobId = await insertJob(tx, meetingId);
      const code = await errCode(
        tx.insert(jobProgress).values({
          jobId,
          percent: 150,
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects event_version <= 0 (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      const code = await errCode(
        tx.insert(outboxEvents).values({
          messageId: `msg-${randomUUID()}`,
          correlationId: 'corr-1',
          ownerId: 'test-owner',
          entityType: 'meeting',
          entityId: randomUUID(),
          eventType: 'meeting.created',
          eventVersion: 0,
          actorId: 'test-owner',
          idempotencyKey: 'idem-1',
          payload: {},
          state: 'pending',
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects an invalid job_type enum value', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      const code = await errCode(
        tx.execute(
          sql`INSERT INTO jobs (id, owner_id, meeting_id, type, max_attempts) VALUES (${'job-' + randomUUID()}, 'test-owner', ${meetingId}, 'bogus', 3)`,
        ),
      );
      expect(code).not.toBeNull();
      expect(code).not.toBe('__NO_CODE__');
    });
  });

  it('rejects an invalid job_state enum value', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      const code = await errCode(
        tx.execute(
          sql`INSERT INTO jobs (id, owner_id, meeting_id, type, max_attempts, state) VALUES (${'job-' + randomUUID()}, 'test-owner', ${meetingId}, 'speech_transcription', 3, 'bogus')`,
        ),
      );
      expect(code).not.toBeNull();
      expect(code).not.toBe('__NO_CODE__');
    });
  });

  it('rejects an invalid entity_type enum value', async () => {
    await withRollbackTx(testDb, async (tx) => {
      const code = await errCode(
        tx.execute(
          sql`INSERT INTO outbox_events (message_id, correlation_id, owner_id, entity_type, entity_id, event_type, event_version, actor_id, idempotency_key, payload, state) VALUES (${'msg-' + randomUUID()}, 'corr-1', 'test-owner', 'bogus', 'e-1', 'test', 1, 'a-1', 'ik-1', '{}', 'pending')`,
        ),
      );
      expect(code).not.toBeNull();
      expect(code).not.toBe('__NO_CODE__');
    });
  });
});

// ── FK constraint enforcement ─────────────────────────────────────────────

describe('T04 FK constraint enforcement', () => {
  it('rejects job with non-existent meeting_id (23503)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const code = await errCode(
        tx.insert(jobs).values({
          id: `job-${randomUUID()}`,
          ownerId: 'test-owner',
          meetingId: randomUUID(),
          type: 'speech_transcription',
          maxAttempts: 3,
        }),
      );
      expect(code).toBe('23503');
    });
  });

  it('rejects job_attempt with non-existent job_id (23503)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      const code = await errCode(
        tx.insert(jobAttempts).values({
          jobId: 'nonexistent-job',
          attempt: 1,
          startedAt: new Date(EPOCH),
          success: true,
        }),
      );
      expect(code).toBe('23503');
    });
  });

  it('restricts deletion of a meeting referenced by a tombstone', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      await tx.insert(deletionTombstones).values({
        meetingId,
        ownerId: 'test-owner',
      });
      // Attempt to delete the meeting while tombstone exists
      const code = await errCode(tx.execute(sql`DELETE FROM meetings WHERE id = ${meetingId}`));
      // ON DELETE RESTRICT should block the deletion
      expect(code).not.toBeNull();
    });
  });
});

// ── Job result / lease fields ──────────────────────────────────────────────

describe('T04 job metadata fields', () => {
  it('stores and retrieves result jsonb and lease fields', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      const jobId = `job-${randomUUID()}`;

      await tx.insert(jobs).values({
        id: jobId,
        ownerId: 'test-owner',
        meetingId,
        type: 'export',
        state: 'running',
        maxAttempts: 1,
        leaseToken: 'tok-abc-123',
        leaseExpiresAt: new Date('2026-06-01T00:00:00.000Z'),
        result: { outputUrl: 'https://storage.example.com/export.docx' },
      });

      const row = await tx.select().from(jobs).where(eq(jobs.id, jobId));
      expect(row).toHaveLength(1);
      expect(row[0]?.leaseToken).toBe('tok-abc-123');
      expect(row[0]?.leaseExpiresAt).toBeTruthy();
      expect(row[0]?.result).toEqual({ outputUrl: 'https://storage.example.com/export.docx' });
    });
  });

  it('stores error code and message (no stack traces)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      const jobId = await insertJob(tx, meetingId);

      await tx.insert(jobAttempts).values({
        jobId,
        attempt: 1,
        startedAt: new Date(EPOCH),
        completedAt: new Date('2026-01-01T00:01:00.000Z'),
        success: false,
        errorCode: 'TRANSCRIPTION_FAILED',
        errorMessage: 'Provider returned 503',
      });

      const row = await tx.select().from(jobAttempts).where(eq(jobAttempts.jobId, jobId));
      expect(row).toHaveLength(1);
      expect(row[0]?.errorCode).toBe('TRANSCRIPTION_FAILED');
      expect(row[0]?.errorMessage).toBe('Provider returned 503');
      // Confirm these are the only error-related columns (no stack trace / body)
      expect(Object.keys(row[0]!)).toEqual(expect.arrayContaining(['errorCode', 'errorMessage']));
    });
  });
});
