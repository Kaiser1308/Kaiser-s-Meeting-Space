import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import {
  meetings,
  meetingCaptureSources,
  captureIntervals,
  timelineMarkers,
  audioChunks,
  audioManifests,
  audioAssets,
  externalIdentities,
  users,
} from '../src/schema/index.js';
import { startPostgres, withRollbackTx, type TestDb } from './harness.js';

// ── Synthetic fixtures (no real meeting content) ───────────────────────

const VALID_SHA = '0'.repeat(64);
const ALT_SHA = '1'.repeat(64);
const BAD_SHA = 'zzz'; // violates hex64 CHECK
const EPOCH = '2026-01-01T00:00:00.000Z';

async function insertMeeting(
  tx: Parameters<Parameters<TestDb['db']['transaction']>[0]>[0],
  overrides: Partial<typeof meetings.$inferInsert> = {},
): Promise<string> {
  const id = (overrides.id as string | undefined) ?? randomUUID();
  await tx.insert(meetings).values({
    ownerId: 'test-owner',
    title: 'Synthetic Test Meeting',
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

interface ChunkInput {
  meetingId: string;
  source?: 'mic' | 'system';
  chunkIndex?: number;
  sha256?: string;
  sampleRate?: number;
  channels?: number;
}

async function insertChunk(
  tx: Parameters<Parameters<TestDb['db']['transaction']>[0]>[0],
  input: ChunkInput,
): Promise<string> {
  const idx = input.chunkIndex ?? 0;
  const source = input.source ?? 'mic';
  const id = `${input.meetingId}/${source}/${idx}`;
  await tx.insert(audioChunks).values({
    id,
    meetingId: input.meetingId,
    ownerId: 'test-owner',
    source,
    chunkIndex: idx,
    storageKey: 'synthetic/test-key',
    startedAt: new Date(EPOCH),
    durationMs: 1000,
    byteLength: 128,
    codec: 'opus',
    container: 'webm',
    sampleRate: input.sampleRate ?? 48000,
    channels: input.channels ?? 1,
    sha256: input.sha256 ?? VALID_SHA,
    uploadStatus: 'pending',
    wallClockStart: new Date(EPOCH),
    wallClockEnd: new Date('2026-01-01T00:00:01.000Z'),
    monotonicStart: 1,
    monotonicEnd: 2,
  });
  return id;
}

/** Runs a promise expected to reject and returns the postgresjs error code, or null.
 * Drizzle wraps the raw postgresjs error in a DrizzleQueryError (.cause), so we
 * traverse the cause chain. We never read message/detail to satisfy P03-A06. */
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

// ── Existence inventory (P03-A02) ──────────────────────────────────────

describe('T01 schema inventory', () => {
  const T01_TABLES = [
    'users',
    'external_identities',
    'meetings',
    'meeting_capture_sources',
    'capture_intervals',
    'timeline_markers',
    'audio_chunks',
    'audio_manifests',
    'audio_assets',
  ];

  it('creates every T01 table', async () => {
    const result = await testDb.db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const present = new Set(
      (result as unknown as { table_name: string }[]).map((r) => r.table_name),
    );
    for (const t of T01_TABLES) {
      expect(present.has(t), `missing table ${t}`).toBe(true);
    }
  });

  it.each([
    ['meeting_language', ['vi', 'en']],
    ['meeting_mode', ['meeting_only', 'meeting_translate']],
    [
      'meeting_state',
      [
        'draft',
        'checking',
        'recording',
        'paused',
        'finalizing',
        'processing',
        'ready',
        'recovery_required',
        'partial_ready',
        'deleted',
      ],
    ],
    ['audio_source', ['mic', 'system', 'derived_mix']],
    ['speech_mode', ['api', 'local']],
    ['upload_status', ['pending', 'uploading', 'completed', 'failed']],
    ['timeline_marker_type', ['pause', 'gap']],
    ['audio_gap_description', ['source_disconnect', 'buffer_overflow', 'crash_recovery']],
  ])('enum %s has exact P02 values %j', async (name, expected) => {
    const result = await testDb.db.execute(
      sql`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = ${name} ORDER BY e.enumsortorder`,
    );
    const labels = (result as unknown as { enumlabel: string }[]).map((r) => r.enumlabel);
    expect(labels).toEqual(expected);
  });

  it('creates every named index', async () => {
    const expected = [
      'external_identities_issuer_subject_unique',
      'external_identities_user_id_idx',
      'meetings_owner_created_idx',
      'meetings_owner_state_idx',
      'meetings_id_owner_idx',
      'capture_intervals_meeting_source_started_idx',
      'capture_intervals_owner_idx',
      'timeline_markers_unique_event_idx',
      'timeline_markers_owner_idx',
      'audio_chunks_meeting_source_index_unique',
      'audio_chunks_meeting_finalized_idx',
      'audio_chunks_owner_idx',
      'audio_manifests_meeting_source_unique',
      'audio_manifests_owner_idx',
      'audio_assets_owner_idx',
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
      'meetings_version_positive',
      'meetings_title_length',
      'meetings_ended_requires_started',
      'meetings_ended_after_started',
      'meeting_capture_sources_source_capturable',
      'capture_intervals_ended_after_started',
      'capture_intervals_monotonic_ordered',
      'timeline_markers_start_ms_positive',
      'timeline_markers_end_after_start',
      'timeline_markers_duration_positive',
      'timeline_markers_marker_type_description',
      'audio_chunks_chunk_index_positive',
      'audio_chunks_byte_length_positive',
      'audio_chunks_duration_positive',
      'audio_chunks_sample_rate_fixed',
      'audio_chunks_channels_fixed',
      'audio_chunks_codec_fixed',
      'audio_chunks_container_fixed',
      'audio_chunks_wall_clock_ordered',
      'audio_chunks_monotonic_ordered',
      'audio_chunks_sha256_format',
      'audio_manifests_byte_length_positive',
      'audio_manifests_entry_count_positive',
      'audio_manifests_sha256_format',
      'audio_assets_source_is_derived',
      'audio_assets_derived_from_mic',
      'audio_assets_byte_length_positive',
      'audio_assets_sha256_format',
      'audio_assets_mix_version_positive',
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

// ── Valid inserts (P03-A02) ────────────────────────────────────────────

describe('T01 valid inserts', () => {
  it('inserts a user, meeting, capture sources, chunk, and finalizes the chunk', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      await tx.insert(meetingCaptureSources).values([
        { meetingId, source: 'mic' },
        { meetingId, source: 'system' },
      ]);
      await tx
        .insert(externalIdentities)
        .values({ userId: 'test-owner', issuer: 'synthetic-issuer', subject: 'sub-1' });

      const chunkId = await insertChunk(tx, { meetingId });
      // finalize is the only allowed post-insert mutation
      await tx
        .update(audioChunks)
        .set({ finalizedAt: new Date(EPOCH), uploadStatus: 'completed' })
        .where(eq(audioChunks.id, chunkId));
      const finalized = await tx
        .select({ finalizedAt: audioChunks.finalizedAt, status: audioChunks.uploadStatus })
        .from(audioChunks)
        .where(eq(audioChunks.id, chunkId));
      expect(finalized[0]?.status).toBe('completed');
      expect(finalized[0]?.finalizedAt).toBeTruthy();

      // manifest + asset insert
      await tx.insert(audioManifests).values({
        meetingId,
        ownerId: 'test-owner',
        source: 'mic',
        storageKey: 'synthetic/manifest.jsonl',
        sha256: VALID_SHA,
        byteLength: 64,
        entryCount: 1,
        firstChunkIndex: 0,
        lastChunkIndex: 0,
      });
      await tx.insert(audioAssets).values({
        meetingId,
        ownerId: 'test-owner',
        source: 'derived_mix',
        label: 'Synthetic mix',
        storageKey: 'synthetic/mix.webm',
        sha256: VALID_SHA,
        byteLength: 256,
        derivedFrom: ['mic', 'system'],
        mixVersion: 1,
      });

      // capture interval + timeline marker
      await tx.insert(captureIntervals).values({
        meetingId,
        ownerId: 'test-owner',
        source: 'mic',
        startedAt: new Date(EPOCH),
        monotonicStart: 1,
      });
      await tx.insert(timelineMarkers).values({
        meetingId,
        ownerId: 'test-owner',
        source: 'mic',
        markerType: 'pause',
        startMs: 0,
        endMs: 1000,
        durationMs: 1000,
      });
    });
  });
});

// ── Duplicate chunk identity (P03-A02/A04) ─────────────────────────────

describe('T01 duplicate chunk identity', () => {
  it('rejects a duplicate (meeting, source, index) with the same sha256 (23505)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      await insertChunk(tx, { meetingId, chunkIndex: 0, sha256: VALID_SHA });
      const code = await errCode(
        tx.insert(audioChunks).values({
          id: `${meetingId}/mic/0`,
          meetingId,
          ownerId: 'test-owner',
          source: 'mic',
          chunkIndex: 0,
          storageKey: 'synthetic/test-key',
          startedAt: new Date(EPOCH),
          durationMs: 1000,
          byteLength: 128,
          codec: 'opus',
          container: 'webm',
          sampleRate: 48000,
          channels: 1,
          sha256: VALID_SHA,
          uploadStatus: 'pending',
          wallClockStart: new Date(EPOCH),
          wallClockEnd: new Date('2026-01-01T00:00:01.000Z'),
          monotonicStart: 1,
          monotonicEnd: 2,
        }),
      );
      expect(code).toBe('23505');
    });
  });

  it('rejects a duplicate (meeting, source, index) with a different sha256 (23505)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      await insertChunk(tx, { meetingId, chunkIndex: 0, sha256: VALID_SHA });
      const code = await errCode(
        tx.insert(audioChunks).values({
          id: `${meetingId}/mic/0-alt`,
          meetingId,
          ownerId: 'test-owner',
          source: 'mic',
          chunkIndex: 0,
          storageKey: 'synthetic/test-key',
          startedAt: new Date(EPOCH),
          durationMs: 1000,
          byteLength: 128,
          codec: 'opus',
          container: 'webm',
          sampleRate: 48000,
          channels: 1,
          sha256: ALT_SHA,
          uploadStatus: 'pending',
          wallClockStart: new Date(EPOCH),
          wallClockEnd: new Date('2026-01-01T00:00:01.000Z'),
          monotonicStart: 1,
          monotonicEnd: 2,
        }),
      );
      expect(code).toBe('23505');
    });
  });
});

// ── Invalid value rejection (P03-A02) ──────────────────────────────────

describe('T01 invalid value rejection', () => {
  it('rejects an invalid language enum value', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const code = await errCode(
        tx.execute(
          sql`INSERT INTO meetings (id, owner_id, title, language, mode, timezone, version, state, created_at) VALUES (${randomUUID()}, 'test-owner', 't', 'fr', 'meeting_only', 'UTC', 1, 'draft', ${EPOCH}::timestamptz)`,
        ),
      );
      expect(code).not.toBeNull();
      expect(code).not.toBe('__NO_CODE__');
    });
  });

  it('rejects an invalid meeting state enum value', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const code = await errCode(
        tx.execute(
          sql`INSERT INTO meetings (id, owner_id, title, language, mode, timezone, version, state, created_at) VALUES (${randomUUID()}, 'test-owner', 't', 'vi', 'meeting_only', 'UTC', 1, 'bogus', ${EPOCH}::timestamptz)`,
        ),
      );
      expect(code).not.toBeNull();
      expect(code).not.toBe('__NO_CODE__');
    });
  });

  it('rejects ended_at earlier than started_at (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const code = await errCode(
        tx.insert(meetings).values({
          ownerId: 'test-owner',
          title: 't',
          language: 'vi',
          mode: 'meeting_only',
          timezone: 'UTC',
          version: 1,
          createdAt: new Date(EPOCH),
          startedAt: new Date('2026-01-02T00:00:00.000Z'),
          endedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects a non-positive version (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const code = await errCode(
        tx.insert(meetings).values({
          ownerId: 'test-owner',
          title: 't',
          language: 'vi',
          mode: 'meeting_only',
          timezone: 'UTC',
          version: 0,
          createdAt: new Date(EPOCH),
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects a malformed sha256 checksum (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      const code = await errCode(
        tx.execute(
          sql`INSERT INTO audio_chunks (id, meeting_id, owner_id, source, chunk_index, storage_key, started_at, duration_ms, byte_length, codec, container, sample_rate, channels, sha256, upload_status, wall_clock_start, wall_clock_end, monotonic_start, monotonic_end) VALUES (${'x/mic/0'}, ${meetingId}, 'test-owner', 'mic', 0, 'k', ${EPOCH}::timestamptz, 1000, 128, 'opus', 'webm', 48000, 1, ${BAD_SHA}, 'pending', ${EPOCH}::timestamptz, '2026-01-01T00:00:01.000Z'::timestamptz, 1, 2)`,
        ),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects sample_rate != 48000 (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      const code = await errCode(insertChunk(tx, { meetingId, sampleRate: 44100 }));
      expect(code).toBe('23514');
    });
  });

  it('rejects channels != 1 (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      const code = await errCode(insertChunk(tx, { meetingId, channels: 2 }));
      expect(code).toBe('23514');
    });
  });

  it('rejects wall_clock_end < wall_clock_start (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      const code = await errCode(
        tx.insert(audioChunks).values({
          id: `${meetingId}/mic/0`,
          meetingId,
          ownerId: 'test-owner',
          source: 'mic',
          chunkIndex: 0,
          storageKey: 'k',
          startedAt: new Date(EPOCH),
          durationMs: 1000,
          byteLength: 128,
          codec: 'opus',
          container: 'webm',
          sampleRate: 48000,
          channels: 1,
          sha256: VALID_SHA,
          uploadStatus: 'pending',
          wallClockStart: new Date('2026-01-01T00:00:01.000Z'),
          wallClockEnd: new Date(EPOCH),
          monotonicStart: 1,
          monotonicEnd: 2,
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects monotonic_end < monotonic_start (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      const code = await errCode(
        tx.execute(
          sql`INSERT INTO audio_chunks (id, meeting_id, owner_id, source, chunk_index, storage_key, started_at, duration_ms, byte_length, codec, container, sample_rate, channels, sha256, upload_status, wall_clock_start, wall_clock_end, monotonic_start, monotonic_end) VALUES (${'x/mic/0'}, ${meetingId}, 'test-owner', 'mic', 0, 'k', ${EPOCH}::timestamptz, 1000, 128, 'opus', 'webm', 48000, 1, ${VALID_SHA}, 'pending', ${EPOCH}::timestamptz, '2026-01-01T00:00:01.000Z'::timestamptz, 5, 2)`,
        ),
      );
      expect(code).toBe('23514');
    });
  });
});

// ── Immutability / lock triggers (P03-A04) — SQLSTATE P0311 ────────────

describe('T01 immutability triggers (P0311)', () => {
  it('blocks UPDATE on a finalized audio chunk', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      const chunkId = await insertChunk(tx, { meetingId });
      await tx
        .update(audioChunks)
        .set({ finalizedAt: new Date(EPOCH), uploadStatus: 'completed' })
        .where(eq(audioChunks.id, chunkId));
      const code = await errCode(
        tx.execute(sql`UPDATE audio_chunks SET sha256 = ${ALT_SHA} WHERE id = ${chunkId}`),
      );
      expect(code).toBe('P0311');
    });
  });

  it('blocks DELETE on a finalized audio chunk', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      const chunkId = await insertChunk(tx, { meetingId });
      await tx
        .update(audioChunks)
        .set({ finalizedAt: new Date(EPOCH), uploadStatus: 'completed' })
        .where(eq(audioChunks.id, chunkId));
      const code = await errCode(tx.execute(sql`DELETE FROM audio_chunks WHERE id = ${chunkId}`));
      expect(code).toBe('P0311');
    });
  });

  it('allows the finalize mutation on an unfinalized chunk', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const meetingId = await insertMeeting(tx);
      const chunkId = await insertChunk(tx, { meetingId });
      const code = await errCode(
        tx
          .update(audioChunks)
          .set({ finalizedAt: new Date(EPOCH), uploadStatus: 'completed' })
          .where(eq(audioChunks.id, chunkId)),
      );
      expect(code).toBeNull();
    });
  });

  it('blocks language change after state=recording', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const id = await insertMeeting(tx, { language: 'vi', state: 'recording' });
      const code = await errCode(
        tx.update(meetings).set({ language: 'en' }).where(eq(meetings.id, id)),
      );
      expect(code).toBe('P0311');
    });
  });

  it('blocks mode change after state=recording', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const id = await insertMeeting(tx, { mode: 'meeting_only', state: 'recording' });
      const code = await errCode(
        tx.update(meetings).set({ mode: 'meeting_translate' }).where(eq(meetings.id, id)),
      );
      expect(code).toBe('P0311');
    });
  });

  it('allows language/mode change while state=draft', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const id = await insertMeeting(tx, { language: 'vi', state: 'draft' });
      const code = await errCode(
        tx.update(meetings).set({ language: 'en' }).where(eq(meetings.id, id)),
      );
      expect(code).toBeNull();
    });
  });

  it('blocks capture-source INSERT after state=recording', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const id = await insertMeeting(tx, { state: 'recording' });
      const code = await errCode(
        tx.insert(meetingCaptureSources).values({ meetingId: id, source: 'mic' }),
      );
      expect(code).toBe('P0311');
    });
  });

  it('blocks capture-source DELETE after state=recording', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const id = await insertMeeting(tx, { state: 'checking' });
      await tx.insert(meetingCaptureSources).values({ meetingId: id, source: 'mic' });
      await tx.update(meetings).set({ state: 'recording' }).where(eq(meetings.id, id));
      const code = await errCode(
        tx.execute(
          sql`DELETE FROM meeting_capture_sources WHERE meeting_id = ${id} AND source = 'mic'`,
        ),
      );
      expect(code).toBe('P0311');
    });
  });

  it('allows capture-source INSERT while state=draft', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await tx.insert(users).values({ id: 'test-owner' });
      const id = await insertMeeting(tx, { state: 'draft' });
      const code = await errCode(
        tx.insert(meetingCaptureSources).values({ meetingId: id, source: 'mic' }),
      );
      expect(code).toBeNull();
    });
  });
});
