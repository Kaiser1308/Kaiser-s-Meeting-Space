import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { users } from '../src/schema/identity.js';
import { meetings } from '../src/schema/meeting.js';
import {
  transcriptSegments,
  transcriptRevisions,
  speakers,
  translationSegments,
  translationCurrent,
} from '../src/schema/transcript.js';
import { transcriptCompleteness } from '../src/schema/completeness.js';
import { startPostgres, withRollbackTx, type TestDb } from './harness.js';

// ── Synthetic fixtures (no real meeting content) ───────────────────────

const EPOCH = '2026-01-01T00:00:00.000Z';

async function insertUser(
  tx: Parameters<Parameters<TestDb['db']['transaction']>[0]>[0],
): Promise<void> {
  await tx.insert(users).values({ id: 'test-owner' });
}

async function insertMeeting(
  tx: Parameters<Parameters<TestDb['db']['transaction']>[0]>[0],
  overrides: Partial<typeof meetings.$inferInsert> = {},
): Promise<string> {
  const id = (overrides.id as string | undefined) ?? randomUUID();
  await tx.insert(meetings).values({
    id,
    ownerId: 'test-owner',
    title: 'Synthetic Test Meeting',
    language: 'vi',
    mode: 'meeting_only',
    timezone: 'Asia/Ho_Chi_Minh',
    version: 1,
    state: 'checking',
    createdAt: new Date(EPOCH),
    ...overrides,
  });
  return id;
}

async function insertSegment(
  tx: Parameters<Parameters<TestDb['db']['transaction']>[0]>[0],
  meetingId: string,
  overrides: Partial<typeof transcriptSegments.$inferInsert> = {},
): Promise<string> {
  const id = (overrides.id as string | undefined) ?? `seg-${randomUUID()}`;
  await tx.insert(transcriptSegments).values({
    id,
    meetingId,
    ownerId: 'test-owner',
    sequence: 0,
    speakerId: 'speaker-1',
    language: 'vi',
    text: 'Synthetic transcript text',
    startMs: 0,
    endMs: 1000,
    confidence: 0.95,
    source: 'api',
    isGap: false,
    createdAt: new Date(EPOCH),
    ...overrides,
  });
  return id;
}

async function insertTranslationSegment(
  tx: Parameters<Parameters<TestDb['db']['transaction']>[0]>[0],
  sourceSegmentId: string,
  meetingId: string,
  overrides: Partial<typeof translationSegments.$inferInsert> = {},
): Promise<string> {
  const id = (overrides.id as string | undefined) ?? `trans-${randomUUID()}`;
  await tx.insert(translationSegments).values({
    id,
    sourceSegmentId,
    meetingId,
    ownerId: 'test-owner',
    targetLanguage: 'en',
    translatedText: 'Synthetic translation text',
    status: 'completed',
    createdAt: new Date(EPOCH),
    ...overrides,
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

// ── Existence inventory ─────────────────────────────────────────────────

describe('T02 schema inventory', () => {
  const T02_TABLES = [
    'transcript_segments',
    'transcript_revisions',
    'speakers',
    'translation_segments',
    'translation_current',
    'transcript_completeness',
  ];

  it('creates every T02 table', async () => {
    const result = await testDb.db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const present = new Set(
      (result as unknown as { table_name: string }[]).map((r) => r.table_name),
    );
    for (const t of T02_TABLES) {
      expect(present.has(t), `missing table ${t}`).toBe(true);
    }
  });

  it.each([
    ['transcript_source', ['api', 'local', 'manual']],
    [
      'gap_reason',
      [
        'network_loss',
        'provider_unavailable',
        'buffer_overflow',
        'crash_recovery',
        'source_disconnect',
      ],
    ],
    ['translation_status', ['pending', 'processing', 'completed', 'failed']],
  ])('enum %s has exact P02 values %j', async (name, expected) => {
    const result = await testDb.db.execute(
      sql`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = ${name} ORDER BY e.enumsortorder`,
    );
    const labels = (result as unknown as { enumlabel: string }[]).map((r) => r.enumlabel);
    expect(labels).toEqual(expected);
  });

  it('creates the named CHECK constraints', async () => {
    const expected = [
      'transcript_segments_end_gt_start',
      'transcript_segments_sequence_non_negative',
      'transcript_segments_confidence_range',
      'transcript_segments_gap_requires_reason',
      'transcript_segments_start_ms_non_negative',
      'translation_current_version_positive',
      'transcript_completeness_version_positive',
    ];
    const result = await testDb.db.execute(
      sql`SELECT conname FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace`,
    );
    const present = new Set((result as unknown as { conname: string }[]).map((r) => r.conname));
    for (const c of expected) {
      expect(present.has(c), `missing CHECK ${c}`).toBe(true);
    }
  });

  it('creates every named index', async () => {
    const expected = [
      'transcript_segments_meeting_sequence_unique',
      'transcript_segments_provider_event_partial_unique',
      'transcript_segments_meeting_start_ms_idx',
      'transcript_segments_speaker_id_idx',
      'transcript_segments_owner_id_idx',
      'transcript_revisions_segment_created_at_idx',
      'transcript_revisions_base_revision_id_idx',
      'transcript_revisions_owner_id_idx',
      'speakers_meeting_label_unique',
      'speakers_meeting_id_idx',
      'speakers_owner_id_idx',
      'translation_segments_source_segment_id_idx',
      'translation_segments_meeting_target_language_idx',
      'translation_segments_owner_id_idx',
      'translation_current_owner_id_idx',
      'transcript_completeness_owner_id_idx',
    ];
    const result = await testDb.db.execute(
      sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const present = new Set((result as unknown as { indexname: string }[]).map((r) => r.indexname));
    for (const idx of expected) {
      expect(present.has(idx), `missing index ${idx}`).toBe(true);
    }
  });
});

// ── Valid inserts ──────────────────────────────────────────────────────

describe('T02 valid inserts', () => {
  it('inserts segments, revisions, speakers, translations, and completeness', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);

      // Insert a speaker
      await tx.insert(speakers).values({
        id: 'speaker-1',
        meetingId,
        ownerId: 'test-owner',
        label: 'Speaker A',
      });

      // Insert a transcript segment
      await tx.insert(transcriptSegments).values({
        id: 'seg-1',
        meetingId,
        ownerId: 'test-owner',
        sequence: 0,
        speakerId: 'speaker-1',
        language: 'vi',
        text: 'Xin chao',
        startMs: 0,
        endMs: 1000,
        confidence: 0.95,
        source: 'api',
        isGap: false,
        createdAt: new Date(EPOCH),
      });

      // Insert a revision
      await tx.insert(transcriptRevisions).values({
        id: 'rev-1',
        segmentId: 'seg-1',
        meetingId,
        ownerId: 'test-owner',
        baseRevisionId: null,
        revisedText: 'Xin chao (corrected)',
        actorId: 'test-owner',
        createdAt: new Date(EPOCH),
      });

      // Insert a translation segment
      await tx.insert(translationSegments).values({
        id: 'trans-1',
        sourceSegmentId: 'seg-1',
        meetingId,
        ownerId: 'test-owner',
        targetLanguage: 'en',
        translatedText: 'Hello',
        status: 'completed',
        createdAt: new Date(EPOCH),
      });

      // Insert translation_current pointer
      await tx.insert(translationCurrent).values({
        sourceSegmentId: 'seg-1',
        meetingId,
        ownerId: 'test-owner',
        currentTranslationId: 'trans-1',
        version: 1,
      });

      // Insert completeness
      await tx.insert(transcriptCompleteness).values({
        meetingId,
        ownerId: 'test-owner',
        audioComplete: true,
        transcriptComplete: true,
        diarizationComplete: true,
        translationComplete: false,
        gaps: [],
        pendingRanges: [],
        version: 1,
      });

      // Verify all inserts
      const segments = await tx
        .select()
        .from(transcriptSegments)
        .where(eq(transcriptSegments.meetingId, meetingId));
      expect(segments).toHaveLength(1);

      const revs = await tx
        .select()
        .from(transcriptRevisions)
        .where(eq(transcriptRevisions.segmentId, 'seg-1'));
      expect(revs).toHaveLength(1);

      const sp = await tx.select().from(speakers).where(eq(speakers.meetingId, meetingId));
      expect(sp).toHaveLength(1);

      const trans = await tx
        .select()
        .from(translationSegments)
        .where(eq(translationSegments.sourceSegmentId, 'seg-1'));
      expect(trans).toHaveLength(1);

      const current = await tx
        .select()
        .from(translationCurrent)
        .where(eq(translationCurrent.sourceSegmentId, 'seg-1'));
      expect(current).toHaveLength(1);

      const comp = await tx
        .select()
        .from(transcriptCompleteness)
        .where(eq(transcriptCompleteness.meetingId, meetingId));
      expect(comp).toHaveLength(1);
    });
  });

  it('inserts a gap segment with gap reason', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      await tx.insert(transcriptSegments).values({
        id: 'gap-seg',
        meetingId,
        ownerId: 'test-owner',
        sequence: 0,
        speakerId: 'speaker-1',
        language: 'vi',
        text: '',
        startMs: 0,
        endMs: 500,
        source: 'api',
        isGap: true,
        gapReason: 'network_loss',
        createdAt: new Date(EPOCH),
      });
      const row = await tx
        .select()
        .from(transcriptSegments)
        .where(eq(transcriptSegments.id, 'gap-seg'));
      expect(row[0]?.isGap).toBe(true);
      expect(row[0]?.gapReason).toBe('network_loss');
    });
  });
});

// ── CHECK constraint violations ────────────────────────────────────────

describe('T02 CHECK constraint violations', () => {
  it('rejects endMs <= startMs (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const code = await errCode(
        tx.insert(transcriptSegments).values({
          id: 'seg-bad',
          meetingId,
          ownerId: 'test-owner',
          sequence: 0,
          speakerId: 'speaker-1',
          language: 'vi',
          text: 'text',
          startMs: 1000,
          endMs: 500,
          confidence: 0.5,
          source: 'api',
          isGap: false,
          createdAt: new Date(EPOCH),
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects confidence > 1 (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const code = await errCode(
        tx.insert(transcriptSegments).values({
          id: 'seg-conf',
          meetingId,
          ownerId: 'test-owner',
          sequence: 0,
          speakerId: 'speaker-1',
          language: 'vi',
          text: 'text',
          startMs: 0,
          endMs: 1000,
          confidence: 1.5,
          source: 'api',
          isGap: false,
          createdAt: new Date(EPOCH),
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects gap segment without gap reason (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const code = await errCode(
        tx.insert(transcriptSegments).values({
          id: 'seg-nogapreason',
          meetingId,
          ownerId: 'test-owner',
          sequence: 0,
          speakerId: 'speaker-1',
          language: 'vi',
          text: '',
          startMs: 0,
          endMs: 500,
          source: 'api',
          isGap: true,
          gapReason: null,
          createdAt: new Date(EPOCH),
        }),
      );
      expect(code).toBe('23514');
    });
  });
});

// ── Unique constraint violations ───────────────────────────────────────

describe('T02 unique constraint violations', () => {
  it('rejects duplicate (meetingId, sequence) (23505)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      await insertSegment(tx, meetingId, { sequence: 0, id: 'seg-dup1' });
      const code = await errCode(
        tx.insert(transcriptSegments).values({
          id: 'seg-dup2',
          meetingId,
          ownerId: 'test-owner',
          sequence: 0,
          speakerId: 'speaker-1',
          language: 'vi',
          text: 'duplicate',
          startMs: 0,
          endMs: 1000,
          source: 'api',
          isGap: false,
          createdAt: new Date(EPOCH),
        }),
      );
      expect(code).toBe('23505');
    });
  });

  it('rejects duplicate providerEventId for same meeting (23505)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      await insertSegment(tx, meetingId, {
        sequence: 0,
        id: 'seg-prov1',
        provider: 'deepgram',
        providerEventId: 'evt-1',
      });
      const code = await errCode(
        tx.insert(transcriptSegments).values({
          id: 'seg-prov2',
          meetingId,
          ownerId: 'test-owner',
          sequence: 1,
          speakerId: 'speaker-1',
          language: 'vi',
          text: 'duplicate provider',
          startMs: 0,
          endMs: 1000,
          source: 'api',
          provider: 'deepgram',
          providerEventId: 'evt-1',
          isGap: false,
          createdAt: new Date(EPOCH),
        }),
      );
      expect(code).toBe('23505');
    });
  });

  it('allows duplicate providerEventId across different meetings', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId1 = await insertMeeting(tx);
      const meetingId2 = await insertMeeting(tx, { id: randomUUID() });
      await insertSegment(tx, meetingId1, {
        sequence: 0,
        id: 'seg-cross1',
        provider: 'deepgram',
        providerEventId: 'evt-cross',
      });
      const code = await errCode(
        tx.insert(transcriptSegments).values({
          id: 'seg-cross2',
          meetingId: meetingId2,
          ownerId: 'test-owner',
          sequence: 0,
          speakerId: 'speaker-1',
          language: 'vi',
          text: 'cross meeting',
          startMs: 0,
          endMs: 1000,
          source: 'api',
          provider: 'deepgram',
          providerEventId: 'evt-cross',
          isGap: false,
          createdAt: new Date(EPOCH),
        }),
      );
      expect(code).toBeNull();
    });
  });

  it('rejects duplicate sourceSegmentId on translation_current (23505)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      await insertSegment(tx, meetingId, { sequence: 0, id: 'seg-tc1' });
      const segId = await insertSegment(tx, meetingId, { sequence: 1, id: 'seg-tc2' });
      // Insert a translation segment to reference
      await tx.insert(translationSegments).values({
        id: 'tsl-1',
        sourceSegmentId: segId,
        meetingId,
        ownerId: 'test-owner',
        targetLanguage: 'en',
        translatedText: 'translated',
        status: 'completed',
        createdAt: new Date(EPOCH),
      });
      // First insert succeeds
      await tx.insert(translationCurrent).values({
        sourceSegmentId: segId,
        meetingId,
        ownerId: 'test-owner',
        currentTranslationId: 'tsl-1',
        version: 1,
      });
      // Duplicate sourceSegmentId should be rejected (PK violation)
      const code = await errCode(
        tx.insert(translationCurrent).values({
          sourceSegmentId: segId,
          meetingId,
          ownerId: 'test-owner',
          currentTranslationId: 'tsl-1',
          version: 1,
        }),
      );
      expect(code).toBe('23505');
    });
  });
});

// ── FK constraint violations ───────────────────────────────────────────

describe('T02 FK constraint violations', () => {
  it('rejects revision referencing non-existent segment (23503)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const code = await errCode(
        tx.insert(transcriptRevisions).values({
          id: 'rev-bad-fk',
          segmentId: 'non-existent-segment',
          meetingId,
          ownerId: 'test-owner',
          baseRevisionId: null,
          revisedText: 'text',
          actorId: 'test-owner',
          createdAt: new Date(EPOCH),
        }),
      );
      expect(code).toBe('23503');
    });
  });
});

// ── Immutability triggers (P0311) ──────────────────────────────────────

describe('T02 immutability triggers (P0311)', () => {
  it('blocks UPDATE on transcript_segments', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      await insertSegment(tx, meetingId, { id: 'seg-imm', sequence: 0 });
      const code = await errCode(
        tx.execute(sql`UPDATE transcript_segments SET text = 'changed' WHERE id = 'seg-imm'`),
      );
      expect(code).toBe('P0311');
    });
  });

  it('blocks DELETE on transcript_segments', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      await insertSegment(tx, meetingId, { id: 'seg-del', sequence: 0 });
      const code = await errCode(
        tx.execute(sql`DELETE FROM transcript_segments WHERE id = 'seg-del'`),
      );
      expect(code).toBe('P0311');
    });
  });

  it('blocks UPDATE on transcript_revisions', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      await insertSegment(tx, meetingId, { id: 'seg-rev-imm', sequence: 0 });
      await tx.insert(transcriptRevisions).values({
        id: 'rev-imm',
        segmentId: 'seg-rev-imm',
        meetingId,
        ownerId: 'test-owner',
        baseRevisionId: null,
        revisedText: 'original',
        actorId: 'test-owner',
        createdAt: new Date(EPOCH),
      });
      const code = await errCode(
        tx.execute(
          sql`UPDATE transcript_revisions SET revised_text = 'changed' WHERE id = 'rev-imm'`,
        ),
      );
      expect(code).toBe('P0311');
    });
  });

  it('blocks DELETE on transcript_revisions', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      await insertSegment(tx, meetingId, { id: 'seg-rev-del', sequence: 0 });
      await tx.insert(transcriptRevisions).values({
        id: 'rev-del',
        segmentId: 'seg-rev-del',
        meetingId,
        ownerId: 'test-owner',
        baseRevisionId: null,
        revisedText: 'original',
        actorId: 'test-owner',
        createdAt: new Date(EPOCH),
      });
      const code = await errCode(
        tx.execute(sql`DELETE FROM transcript_revisions WHERE id = 'rev-del'`),
      );
      expect(code).toBe('P0311');
    });
  });

  it('blocks UPDATE on translation_segments', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      await insertSegment(tx, meetingId, { id: 'seg-trans-imm', sequence: 0 });
      await insertTranslationSegment(tx, 'seg-trans-imm', meetingId, { id: 'trans-imm' });
      const code = await errCode(
        tx.execute(
          sql`UPDATE translation_segments SET translated_text = 'changed' WHERE id = 'trans-imm'`,
        ),
      );
      expect(code).toBe('P0311');
    });
  });

  it('blocks DELETE on translation_segments', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      await insertSegment(tx, meetingId, { id: 'seg-trans-del', sequence: 0 });
      await insertTranslationSegment(tx, 'seg-trans-del', meetingId, { id: 'trans-del' });
      const code = await errCode(
        tx.execute(sql`DELETE FROM translation_segments WHERE id = 'trans-del'`),
      );
      expect(code).toBe('P0311');
    });
  });
});

// ── Completeness basic CRUD ────────────────────────────────────────────

describe('T02 completeness CRUD', () => {
  it('inserts and updates completeness with optimistic version', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);

      // Insert
      await tx.insert(transcriptCompleteness).values({
        meetingId,
        ownerId: 'test-owner',
        audioComplete: false,
        transcriptComplete: false,
        gaps: [],
        pendingRanges: [],
        version: 1,
      });

      let row = await tx
        .select()
        .from(transcriptCompleteness)
        .where(eq(transcriptCompleteness.meetingId, meetingId));
      expect(row[0]?.audioComplete).toBe(false);
      expect(row[0]?.version).toBe(1);

      // Optimistic update
      await tx
        .update(transcriptCompleteness)
        .set({
          audioComplete: true,
          transcriptComplete: true,
          version: 2,
        })
        .where(
          sql`${transcriptCompleteness.meetingId} = ${meetingId} AND ${transcriptCompleteness.version} = 1`,
        );
      // Verify update occurred
      row = await tx
        .select()
        .from(transcriptCompleteness)
        .where(eq(transcriptCompleteness.meetingId, meetingId));
      expect(row[0]?.audioComplete).toBe(true);
      expect(row[0]?.transcriptComplete).toBe(true);
    });
  });

  it('rejects version <= 0 (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const code = await errCode(
        tx.insert(transcriptCompleteness).values({
          meetingId,
          ownerId: 'test-owner',
          audioComplete: false,
          transcriptComplete: false,
          gaps: [],
          pendingRanges: [],
          version: 0,
        }),
      );
      expect(code).toBe('23514');
    });
  });
});

// ── Immutability error code (P03-A06 boundary) ─────────────────────────
// Content safety (no SQL text or meeting content in errors) is enforced at
// the repository layer (T05 mapDbError). At the DB trigger level, we only
// verify that the correct custom SQLSTATE (P0311) is raised.

describe('T02 immutability error code', () => {
  it('immutability violation raises P0311 not a generic code', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      await tx.insert(transcriptSegments).values({
        id: 'seg-code-test',
        meetingId,
        ownerId: 'test-owner',
        sequence: 0,
        speakerId: 'speaker-1',
        language: 'vi',
        text: 'Some text',
        startMs: 0,
        endMs: 1000,
        confidence: 0.95,
        source: 'api',
        isGap: false,
        createdAt: new Date(EPOCH),
      });
      const code = await errCode(
        tx.execute(sql`UPDATE transcript_segments SET text = 'changed' WHERE id = 'seg-code-test'`),
      );
      expect(code).toBe('P0311');
    });
  });
});
