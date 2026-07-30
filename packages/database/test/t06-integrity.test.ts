/**
 * P03-T06: Database integrity adversarial tests.
 *
 * Every test uses testDb.$raw (raw postgresjs SQL) and validates the exact
 * SQLSTATE returned by PostgreSQL. No Drizzle ORM or repository layer is used.
 *
 * Coverage: DESIGN §6.2 tests #1-20 plus trigger-function existence checks.
 *
 * Key SQLSTATE codes used in assertions:
 *   23505  – unique violation
 *   23503  – foreign-key violation
 *   23514  – CHECK constraint violation
 *   22P02  – invalid text representation (invalid enum values, UUID format etc.)
 *   P0311  – custom immutable_violation raised by BEFORE-row triggers
 *   00000  – success (no error)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startPostgres, type TestDb } from './harness.js';

// ── Test-level constants ───────────────────────────────────────────────

const OWNER_1 = 'owner-1';
const OWNER_2 = 'owner-2';
const VALID_SHA = '0'.repeat(64);
const VALID_SHA_2 = '1'.repeat(64);
const EPOCH = '2026-01-01T00:00:00.000Z';
const EPOCH_2 = '2026-01-01T01:00:00.000Z';

// ── Global container lifecycle ─────────────────────────────────────────

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startPostgres();
}, 120_000);

afterAll(async () => {
  if (testDb) await testDb.close();
}, 30_000);

// Use TRUNCATE CASCADE before each test so each test starts with a clean DB
// while retaining the schema / migrations / triggers from beforeAll.
beforeEach(async () => {
  await testDb.$raw.unsafe(`
    TRUNCATE
      safe_audit,
      idempotency_records,
      outbox_events,
      deletion_steps,
      deletion_tombstones,
      job_progress,
      job_attempts,
      jobs,
      export_manifests,
      export_jobs,
      brand_assets,
      brand_presets,
      evidence_refs,
      action_items,
      minutes_sections,
      minutes_versions,
      minutes_documents,
      translation_current,
      translation_segments,
      transcript_completeness,
      transcript_revisions,
      transcript_segments,
      speakers,
      audio_assets,
      audio_manifests,
      audio_chunks,
      timeline_markers,
      capture_intervals,
      meeting_capture_sources,
      meetings,
      external_identities,
      users
    CASCADE
  `);
});

// ── Fixture helpers ────────────────────────────────────────────────────

async function insertUser(id: string = OWNER_1): Promise<void> {
  await testDb.$raw`INSERT INTO users (id, created_at) VALUES (${id}, ${EPOCH})`;
}

interface MeetingOpts {
  id?: string;
  ownerId?: string;
  state?: string;
  version?: number;
  language?: string;
  mode?: string;
}

async function insertMeeting(opts: MeetingOpts = {}): Promise<string> {
  const id = opts.id ?? randomUUID();
  const ownerId = opts.ownerId ?? OWNER_1;
  const state = opts.state ?? 'draft';
  const version = opts.version ?? 1;
  const language = opts.language ?? 'vi';
  const mode = opts.mode ?? 'meeting_only';
  await testDb.$raw`
    INSERT INTO meetings
      (id, owner_id, title, language, mode, speech_mode, timezone,
       version, state, capture_profile, created_at)
    VALUES
      (${id}, ${ownerId}, 'Synthetic Meeting',
       ${language}::meeting_language, ${mode}::meeting_mode,
       'api'::speech_mode, 'Asia/Ho_Chi_Minh',
       ${version}, ${state}::meeting_state, '{}', ${EPOCH})
  `;
  return id;
}

interface ChunkOpts {
  meetingId: string;
  id?: string;
  source?: string;
  chunkIndex?: number;
  sha256?: string;
  finalizedAt?: Date | null;
  ownerId?: string;
}

async function insertChunk(opts: ChunkOpts): Promise<string> {
  const idx = opts.chunkIndex ?? 0;
  const source = opts.source ?? 'mic';
  const id = opts.id ?? `${opts.meetingId}/${source}/${idx}`;
  const sha256 = opts.sha256 ?? VALID_SHA;
  await testDb.$raw`
    INSERT INTO audio_chunks
      (id, meeting_id, owner_id, source, chunk_index, storage_key,
       started_at, duration_ms, byte_length, codec, container,
       sample_rate, channels, sha256, upload_status, finalized_at,
       wall_clock_start, wall_clock_end,
       monotonic_start, monotonic_end)
    VALUES
      (${id}, ${opts.meetingId}, ${opts.ownerId ?? OWNER_1},
       ${source}::audio_source, ${idx}, 'storage-key-ok',
       ${EPOCH}, 30000, 48000, 'opus', 'webm',
       48000, 1, ${sha256}, 'completed'::upload_status,
       ${opts.finalizedAt ?? null},
       ${EPOCH}, ${EPOCH_2},
       0, 30000)
  `;
  return id;
}

interface SegmentOpts {
  meetingId: string;
  id?: string;
  sequence?: number;
  provider?: string;
  providerEventId?: string | null;
  startMs?: number;
  endMs?: number;
  confidence?: number | null;
  ownerId?: string;
}

async function insertSegment(opts: SegmentOpts): Promise<string> {
  const id = opts.id ?? randomUUID();
  const seq = opts.sequence ?? 0;
  const startMs = opts.startMs ?? 0;
  const endMs = opts.endMs ?? 1000;
  await testDb.$raw`
    INSERT INTO transcript_segments
      (id, meeting_id, owner_id, sequence, speaker_id, language,
       text, start_ms, end_ms, confidence, source, provider,
       provider_event_id, created_at)
    VALUES
      (${id}, ${opts.meetingId}, ${opts.ownerId ?? OWNER_1},
       ${seq}, 'speaker-1', 'vi'::meeting_language,
       'test text', ${startMs}, ${endMs},
       ${opts.confidence ?? 1.0}, 'api'::transcript_source,
       ${opts.provider ?? null}, ${opts.providerEventId ?? null},
       ${EPOCH})
  `;
  return id;
}

async function insertTranslationSegment(opts: {
  id?: string;
  sourceSegmentId: string;
  meetingId: string;
  ownerId?: string;
}): Promise<string> {
  const id = opts.id ?? randomUUID();
  await testDb.$raw`
    INSERT INTO translation_segments
      (id, source_segment_id, meeting_id, owner_id,
       target_language, translated_text, status, created_at)
    VALUES
      (${id}, ${opts.sourceSegmentId}, ${opts.meetingId},
       ${opts.ownerId ?? OWNER_1},
       'en'::meeting_language, 'translated text',
       'completed'::translation_status, ${EPOCH})
  `;
  return id;
}

// ── Tests ──────────────────────────────────────────────────────────────

// ── 0. Trigger-function existence verification (DESIGN §6) ─────────────

describe('P03-T06: Database integrity adversarial tests', () => {
  /* ---------- Trigger function existence ---------- */
  describe('Trigger functions exist', () => {
    const EXPECTED_TRIGGERS: string[] = [
      'fn_audio_chunks_immutable',
      'fn_meeting_language_mode_lock',
      'fn_meeting_capture_sources_lock',
      'fn_transcript_segments_immutable',
      'fn_transcript_revisions_appendonly',
      'fn_translation_segments_immutable',
      'fn_minutes_versions_immutable',
      'fn_export_manifests_immutable',
      'fn_evidence_same_meeting',
    ];

    for (const fnName of EXPECTED_TRIGGERS) {
      it(`function "${fnName}" exists`, async () => {
        const rows = await testDb.$raw`
          SELECT 1 AS found
          FROM pg_proc
          WHERE proname = ${fnName}
            AND pronamespace = 'public'::regnamespace
        `;
        expect(rows.length).toBeGreaterThanOrEqual(1);
      });
    }

    it('all expected trigger functions are present (count check)', async () => {
      const rows = await testDb.$raw`
        SELECT proname FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
          AND proname LIKE 'fn\\_%\\_%'
        ORDER BY proname
      `;
      const names = rows.map((r: any) => r.proname);
      for (const expected of EXPECTED_TRIGGERS) {
        expect(names).toContain(expected);
      }
    });
  });

  /* ---------- #1: Duplicate chunk (same sha256) → 23505 ---------- */
  describe('#01–#02: Duplicate chunk detection', () => {
    it('#01: duplicate chunk with same sha256 → 23505', async () => {
      await insertUser();
      const meetingId = await insertMeeting();

      await insertChunk({ meetingId, chunkIndex: 0, sha256: VALID_SHA });

      // Insert the same (meeting, source, index) again with identical sha256
      const promise = insertChunk({ meetingId, chunkIndex: 0, sha256: VALID_SHA });
      await expect(promise).rejects.toMatchObject({ code: '23505' });
    });

    it('#02: duplicate chunk with different sha256 → 23505', async () => {
      await insertUser();
      const meetingId = await insertMeeting();

      await insertChunk({ meetingId, chunkIndex: 0, sha256: VALID_SHA });

      // Same (meeting, source, index) but different sha256 → still 23505 at DB level
      const promise = insertChunk({ meetingId, chunkIndex: 0, sha256: VALID_SHA_2 });
      await expect(promise).rejects.toMatchObject({ code: '23505' });
    });
  });

  /* ---------- #3–#4: audio_chunks finalized immutability ---------- */
  describe('#03–#04: Audio chunk finalized immutability', () => {
    it('#03: UPDATE finalized audio_chunk → P0311', async () => {
      await insertUser();
      const meetingId = await insertMeeting();

      // Insert unfinalized chunk
      const chunkId = await insertChunk({ meetingId, finalizedAt: null, sha256: VALID_SHA });

      // Finalize it (the one allowed mutation)
      await testDb.$raw`
        UPDATE audio_chunks
        SET finalized_at = ${EPOCH}, upload_status = 'completed'::upload_status
        WHERE id = ${chunkId}
      `;

      // Now try a second UPDATE — trigger should fire
      const promise = testDb.$raw`
        UPDATE audio_chunks SET sha256 = ${VALID_SHA_2} WHERE id = ${chunkId}
      `;
      await expect(promise).rejects.toMatchObject({ code: 'P0311' });
    });

    it('#04: DELETE finalized audio_chunk → P0311', async () => {
      await insertUser();
      const meetingId = await insertMeeting();

      const chunkId = await insertChunk({ meetingId, finalizedAt: null, sha256: VALID_SHA });

      // Finalize it
      await testDb.$raw`
        UPDATE audio_chunks
        SET finalized_at = ${EPOCH}, upload_status = 'completed'::upload_status
        WHERE id = ${chunkId}
      `;

      // DELETE should be blocked
      const promise = testDb.$raw`DELETE FROM audio_chunks WHERE id = ${chunkId}`;
      await expect(promise).rejects.toMatchObject({ code: 'P0311' });
    });
  });

  /* ---------- #5–#6: Immutability triggers on transcript & derived tables ---------- */
  describe('#05–#06: Immutability on transcript / revision / translation / minutes / export', () => {
    it('#05: UPDATE transcript_segments → P0311', async () => {
      await insertUser();
      const meetingId = await insertMeeting();
      const segId = await insertSegment({ meetingId });

      await expect(
        testDb.$raw`UPDATE transcript_segments SET text = 'changed' WHERE id = ${segId}`,
      ).rejects.toMatchObject({ code: 'P0311' });
    });

    it('#05: DELETE transcript_segments → P0311', async () => {
      await insertUser();
      const meetingId = await insertMeeting();
      const segId = await insertSegment({ meetingId });

      await expect(
        testDb.$raw`DELETE FROM transcript_segments WHERE id = ${segId}`,
      ).rejects.toMatchObject({ code: 'P0311' });
    });

    it('#06: UPDATE transcript_revisions → P0311', async () => {
      await insertUser();
      const meetingId = await insertMeeting();
      const segId = await insertSegment({ meetingId });
      const revId = randomUUID();
      await testDb.$raw`
        INSERT INTO transcript_revisions
          (id, segment_id, meeting_id, owner_id, revised_text, actor_id, created_at)
        VALUES (${revId}, ${segId}, ${meetingId}, ${OWNER_1}, 'revised', 'actor-1', ${EPOCH})
      `;

      await expect(
        testDb.$raw`UPDATE transcript_revisions SET revised_text = 'x' WHERE id = ${revId}`,
      ).rejects.toMatchObject({ code: 'P0311' });
    });

    it('#06: DELETE transcript_revisions → P0311', async () => {
      await insertUser();
      const meetingId = await insertMeeting();
      const segId = await insertSegment({ meetingId });
      const revId = randomUUID();
      await testDb.$raw`
        INSERT INTO transcript_revisions
          (id, segment_id, meeting_id, owner_id, revised_text, actor_id, created_at)
        VALUES (${revId}, ${segId}, ${meetingId}, ${OWNER_1}, 'revised', 'actor-1', ${EPOCH})
      `;

      await expect(
        testDb.$raw`DELETE FROM transcript_revisions WHERE id = ${revId}`,
      ).rejects.toMatchObject({ code: 'P0311' });
    });

    it('#06: UPDATE translation_segments → P0311', async () => {
      await insertUser();
      const meetingId = await insertMeeting();
      const segId = await insertSegment({ meetingId });
      const transId = await insertTranslationSegment({ sourceSegmentId: segId, meetingId });

      await expect(
        testDb.$raw`UPDATE translation_segments SET translated_text = 'x' WHERE id = ${transId}`,
      ).rejects.toMatchObject({ code: 'P0311' });
    });

    it('#06: DELETE translation_segments → P0311', async () => {
      await insertUser();
      const meetingId = await insertMeeting();
      const segId = await insertSegment({ meetingId });
      const transId = await insertTranslationSegment({ sourceSegmentId: segId, meetingId });

      await expect(
        testDb.$raw`DELETE FROM translation_segments WHERE id = ${transId}`,
      ).rejects.toMatchObject({ code: 'P0311' });
    });

    it('#06: UPDATE minutes_versions → P0311', async () => {
      await insertUser();
      const meetingId = await insertMeeting();
      const docId = randomUUID();
      await testDb.$raw`
        INSERT INTO minutes_documents
          (id, meeting_id, owner_id, template, created_at)
        VALUES (${docId}, ${meetingId}, ${OWNER_1}, 'team'::minutes_template, ${EPOCH})
      `;
      const verId = randomUUID();
      await testDb.$raw`
        INSERT INTO minutes_versions
          (id, document_id, meeting_id, owner_id, version,
           template, detail_level, output_language,
           transcript_projection, is_complete, creator_id, created_at)
        VALUES (${verId}, ${docId}, ${meetingId}, ${OWNER_1}, 1,
                'team'::minutes_template, 'detailed'::detail_level,
                'vi'::meeting_language, 'current', true, 'creator-1', ${EPOCH})
      `;

      await expect(
        testDb.$raw`UPDATE minutes_versions SET version = 2 WHERE id = ${verId}`,
      ).rejects.toMatchObject({ code: 'P0311' });
    });

    it('#06: DELETE minutes_versions → P0311', async () => {
      await insertUser();
      const meetingId = await insertMeeting();
      const docId = randomUUID();
      await testDb.$raw`
        INSERT INTO minutes_documents
          (id, meeting_id, owner_id, template, created_at)
        VALUES (${docId}, ${meetingId}, ${OWNER_1}, 'team'::minutes_template, ${EPOCH})
      `;
      const verId = randomUUID();
      await testDb.$raw`
        INSERT INTO minutes_versions
          (id, document_id, meeting_id, owner_id, version,
           template, detail_level, output_language,
           transcript_projection, is_complete, creator_id, created_at)
        VALUES (${verId}, ${docId}, ${meetingId}, ${OWNER_1}, 1,
                'team'::minutes_template, 'detailed'::detail_level,
                'vi'::meeting_language, 'current', true, 'creator-1', ${EPOCH})
      `;

      await expect(
        testDb.$raw`DELETE FROM minutes_versions WHERE id = ${verId}`,
      ).rejects.toMatchObject({ code: 'P0311' });
    });

    it('#06: UPDATE export_manifests → P0311', async () => {
      await insertUser();
      const meetingId = await insertMeeting();
      await insertSegment({ meetingId });
      const docId = randomUUID();
      await testDb.$raw`
        INSERT INTO minutes_documents
          (id, meeting_id, owner_id, template, created_at)
        VALUES (${docId}, ${meetingId}, ${OWNER_1}, 'team'::minutes_template, ${EPOCH})
      `;
      const verId = randomUUID();
      await testDb.$raw`
        INSERT INTO minutes_versions
          (id, document_id, meeting_id, owner_id, version,
           template, detail_level, output_language,
           transcript_projection, is_complete, creator_id, created_at)
        VALUES (${verId}, ${docId}, ${meetingId}, ${OWNER_1}, 1,
                'team'::minutes_template, 'detailed'::detail_level,
                'vi'::meeting_language, 'current', true, 'creator-1', ${EPOCH})
      `;
      const jobId = randomUUID();
      await testDb.$raw`
        INSERT INTO export_jobs
          (id, meeting_id, owner_id, minutes_version_id, format)
        VALUES (${jobId}, ${meetingId}, ${OWNER_1}, ${verId}, 'pdf'::export_format)
      `;
      const manId = randomUUID();
      await testDb.$raw`
        INSERT INTO export_manifests
          (id, export_job_id, owner_id, minutes_version_id,
           template, detail_level, output_language,
           transcript_projection, format, sha256, byte_length, storage_key)
        VALUES (${manId}, ${jobId}, ${OWNER_1}, ${verId},
                'team'::minutes_template, 'detailed'::detail_level,
                'vi'::meeting_language, 'current', 'pdf'::export_format,
                ${VALID_SHA}, 1000, 'storage-key')
      `;

      await expect(
        testDb.$raw`UPDATE export_manifests SET byte_length = 2000 WHERE id = ${manId}`,
      ).rejects.toMatchObject({ code: 'P0311' });
    });

    it('#06: DELETE export_manifests → P0311', async () => {
      await insertUser();
      const meetingId = await insertMeeting();
      await insertSegment({ meetingId });
      const docId = randomUUID();
      await testDb.$raw`
        INSERT INTO minutes_documents
          (id, meeting_id, owner_id, template, created_at)
        VALUES (${docId}, ${meetingId}, ${OWNER_1}, 'team'::minutes_template, ${EPOCH})
      `;
      const verId = randomUUID();
      await testDb.$raw`
        INSERT INTO minutes_versions
          (id, document_id, meeting_id, owner_id, version,
           template, detail_level, output_language,
           transcript_projection, is_complete, creator_id, created_at)
        VALUES (${verId}, ${docId}, ${meetingId}, ${OWNER_1}, 1,
                'team'::minutes_template, 'detailed'::detail_level,
                'vi'::meeting_language, 'current', true, 'creator-1', ${EPOCH})
      `;
      const jobId = randomUUID();
      await testDb.$raw`
        INSERT INTO export_jobs
          (id, meeting_id, owner_id, minutes_version_id, format)
        VALUES (${jobId}, ${meetingId}, ${OWNER_1}, ${verId}, 'pdf'::export_format)
      `;
      const manId = randomUUID();
      await testDb.$raw`
        INSERT INTO export_manifests
          (id, export_job_id, owner_id, minutes_version_id,
           template, detail_level, output_language,
           transcript_projection, format, sha256, byte_length, storage_key)
        VALUES (${manId}, ${jobId}, ${OWNER_1}, ${verId},
                'team'::minutes_template, 'detailed'::detail_level,
                'vi'::meeting_language, 'current', 'pdf'::export_format,
                ${VALID_SHA}, 1000, 'storage-key')
      `;

      await expect(
        testDb.$raw`DELETE FROM export_manifests WHERE id = ${manId}`,
      ).rejects.toMatchObject({ code: 'P0311' });
    });
  });

  /* ---------- #7: Wrong-owner isolation ---------- */
  describe('#07: Wrong-owner isolation', () => {
    it('wrong-owner SELECT returns zero rows', async () => {
      await insertUser(OWNER_1);
      const meetingId = await insertMeeting({ ownerId: OWNER_1 });

      // Query with wrong owner
      const rows = await testDb.$raw`
        SELECT 1 FROM meetings WHERE id = ${meetingId} AND owner_id = ${OWNER_2}
      `;
      expect(rows.length).toBe(0);
    });

    it('wrong-owner UPDATE returns zero rows (indistinguishable from missing)', async () => {
      await insertUser(OWNER_1);
      const meetingId = await insertMeeting({ ownerId: OWNER_1, version: 1 });

      // Attempt UPDATE with wrong owner — expect 0 rows affected
      const result = await testDb.$raw`
        UPDATE meetings
        SET version = version + 1
        WHERE id = ${meetingId} AND owner_id = ${OWNER_2} AND version = 1
      `;
      expect(result.count).toBe(0);
    });

    it('wrong-owner UPDATE with correct version still yields 0 rows', async () => {
      await insertUser(OWNER_1);
      const meetingId = await insertMeeting({ ownerId: OWNER_1, version: 5 });

      // Correct version but wrong owner → 0 rows, indistinguishable from stale-version
      const result = await testDb.$raw`
        UPDATE meetings
        SET version = version + 1
        WHERE id = ${meetingId} AND owner_id = ${OWNER_2} AND version = 5
      `;
      expect(result.count).toBe(0);
    });
  });

  /* ---------- #8: Stale-version update ---------- */
  describe('#08: Stale-version optimistic lock', () => {
    it('stale-version UPDATE affects 0 rows, row unchanged', async () => {
      await insertUser();
      const meetingId = await insertMeeting({ version: 1 });

      // First UPDATE with correct version succeeds
      const r1 = await testDb.$raw`
        UPDATE meetings SET version = version + 1
        WHERE id = ${meetingId} AND owner_id = ${OWNER_1} AND version = 1
      `;
      expect(r1.count).toBe(1);

      // Verify version is now 2
      const rows = await testDb.$raw`
        SELECT version FROM meetings WHERE id = ${meetingId}
      `;
      expect(rows[0]!.version).toBe(2);

      // Second UPDATE with stale version (1) — affects 0 rows
      const r2 = await testDb.$raw`
        UPDATE meetings SET version = version + 1
        WHERE id = ${meetingId} AND owner_id = ${OWNER_1} AND version = 1
      `;
      expect(r2.count).toBe(0);

      // Row still has version = 2 (unchanged)
      const rows2 = await testDb.$raw`
        SELECT version FROM meetings WHERE id = ${meetingId}
      `;
      expect(rows2[0]!.version).toBe(2);
    });
  });

  /* ---------- #9: Cross-meeting evidence_refs ---------- */
  describe('#09: Cross-meeting evidence guard', () => {
    it('evidence_refs pointing to segment from another meeting → P0311', async () => {
      await insertUser();
      const meetingA = await insertMeeting({ state: 'ready' });
      const meetingB = await insertMeeting({ state: 'ready' });

      // Insert segment in meetingA
      const segId = await insertSegment({ meetingId: meetingA });

      // Try evidence_refs with meeting_id = meetingB but segment from meetingA
      const evId = randomUUID();
      const promise = testDb.$raw`
        INSERT INTO evidence_refs
          (id, meeting_id, owner_id, owner_type, section_id, segment_id, start_ms, end_ms)
        VALUES (${evId}, ${meetingB}, ${OWNER_1}, 'section'::evidence_owner_type,
                NULL, ${segId}, 0, 500)
      `;
      await expect(promise).rejects.toMatchObject({ code: 'P0311' });
    });

    it('same-meeting evidence_refs succeeds', async () => {
      await insertUser();
      const meetingId = await insertMeeting({ state: 'ready' });

      const segId = await insertSegment({ meetingId });
      const verId = randomUUID();
      const docId = randomUUID();
      await testDb.$raw`
        INSERT INTO minutes_documents
          (id, meeting_id, owner_id, template, created_at)
        VALUES (${docId}, ${meetingId}, ${OWNER_1}, 'team'::minutes_template, ${EPOCH})
      `;
      await testDb.$raw`
        INSERT INTO minutes_versions
          (id, document_id, meeting_id, owner_id, version,
           template, detail_level, output_language,
           transcript_projection, is_complete, creator_id, created_at)
        VALUES (${verId}, ${docId}, ${meetingId}, ${OWNER_1}, 1,
                'team'::minutes_template, 'detailed'::detail_level,
                'vi'::meeting_language, 'current', true, 'creator-1', ${EPOCH})
      `;
      const secId = randomUUID();
      await testDb.$raw`
        INSERT INTO minutes_sections
          (id, version_id, meeting_id, owner_id, kind, heading, content, order_index)
        VALUES (${secId}, ${verId}, ${meetingId}, ${OWNER_1},
                'section', 'Heading', 'Content', 0)
      `;

      const evId = randomUUID();
      await testDb.$raw`
        INSERT INTO evidence_refs
          (id, meeting_id, owner_id, owner_type, section_id, segment_id, start_ms, end_ms)
        VALUES (${evId}, ${meetingId}, ${OWNER_1}, 'section'::evidence_owner_type,
                ${secId}, ${segId}, 0, 500)
      `;

      const found = await testDb.$raw`
        SELECT 1 FROM evidence_refs WHERE id = ${evId}
      `;
      expect(found.length).toBe(1);
    });
  });

  /* ---------- #10: Invalid enum ---------- */
  describe('#10: Invalid enum value', () => {
    it('insert meeting with invalid language → 22P02', async () => {
      await insertUser();
      const id = randomUUID();
      const promise = testDb.$raw`
        INSERT INTO meetings
          (id, owner_id, title, language, mode, speech_mode, timezone,
           version, state, capture_profile, created_at)
        VALUES
          (${id}, ${OWNER_1}, 'Bad Lang',
           'fr'::meeting_language, 'meeting_only'::meeting_mode,
           'api'::speech_mode, 'UTC',
           1, 'draft'::meeting_state, '{}', ${EPOCH})
      `;
      await expect(promise).rejects.toMatchObject({ code: '22P02' });
    });
  });

  /* ---------- #11: CHECK violations ---------- */
  describe('#11: CHECK constraint violations → 23514', () => {
    it('transcript end_ms <= start_ms → 23514', async () => {
      await insertUser();
      const meetingId = await insertMeeting();
      const promise = testDb.$raw`
        INSERT INTO transcript_segments
          (id, meeting_id, owner_id, sequence, speaker_id, language,
           text, start_ms, end_ms, source, created_at)
        VALUES (${randomUUID()}, ${meetingId}, ${OWNER_1}, 0, 'speaker-1',
                'vi'::meeting_language, 'bad', 2000, 1000,
                'api'::transcript_source, ${EPOCH})
      `;
      await expect(promise).rejects.toMatchObject({ code: '23514' });
    });

    it('audio_chunks wall_clock_end < wall_clock_start → 23514', async () => {
      await insertUser();
      const meetingId = await insertMeeting();
      const promise = testDb.$raw`
        INSERT INTO audio_chunks
          (id, meeting_id, owner_id, source, chunk_index, storage_key,
           started_at, duration_ms, byte_length, codec, container,
           sample_rate, channels, sha256, upload_status,
           wall_clock_start, wall_clock_end, monotonic_start, monotonic_end)
        VALUES (${randomUUID()}, ${meetingId}, ${OWNER_1}, 'mic'::audio_source, 0, 'sk',
                ${EPOCH}, 30000, 48000, 'opus', 'webm',
                48000, 1, ${VALID_SHA}, 'pending'::upload_status,
                ${EPOCH_2}, ${EPOCH}, 0, 30000)
      `;
      await expect(promise).rejects.toMatchObject({ code: '23514' });
    });

    it('audio_chunks monotonic_end < monotonic_start → 23514', async () => {
      await insertUser();
      const meetingId = await insertMeeting();
      const promise = testDb.$raw`
        INSERT INTO audio_chunks
          (id, meeting_id, owner_id, source, chunk_index, storage_key,
           started_at, duration_ms, byte_length, codec, container,
           sample_rate, channels, sha256, upload_status,
           wall_clock_start, wall_clock_end, monotonic_start, monotonic_end)
        VALUES (${randomUUID()}, ${meetingId}, ${OWNER_1}, 'mic'::audio_source, 0, 'sk',
                ${EPOCH}, 30000, 48000, 'opus', 'webm',
                48000, 1, ${VALID_SHA}, 'pending'::upload_status,
                ${EPOCH}, ${EPOCH_2}, 500, 100)
      `;
      await expect(promise).rejects.toMatchObject({ code: '23514' });
    });

    it('meeting ended_at < started_at → 23514', async () => {
      await insertUser();
      const promise = testDb.$raw`
        INSERT INTO meetings
          (id, owner_id, title, language, mode, speech_mode, timezone,
           version, state, capture_profile, created_at, started_at, ended_at)
        VALUES (${randomUUID()}, ${OWNER_1}, 'Bad End',
                'vi'::meeting_language, 'meeting_only'::meeting_mode,
                'api'::speech_mode, 'UTC',
                1, 'ready'::meeting_state, '{}',
                ${EPOCH}, ${EPOCH_2}, ${EPOCH})
      `;
      await expect(promise).rejects.toMatchObject({ code: '23514' });
    });

    it('audio_chunks duration_ms <= 0 → 23514', async () => {
      await insertUser();
      const meetingId = await insertMeeting();
      const promise = testDb.$raw`
        INSERT INTO audio_chunks
          (id, meeting_id, owner_id, source, chunk_index, storage_key,
           started_at, duration_ms, byte_length, codec, container,
           sample_rate, channels, sha256, upload_status,
           wall_clock_start, wall_clock_end, monotonic_start, monotonic_end)
        VALUES (${randomUUID()}, ${meetingId}, ${OWNER_1}, 'mic'::audio_source, 0, 'sk',
                ${EPOCH}, 0, 48000, 'opus', 'webm',
                48000, 1, ${VALID_SHA}, 'pending'::upload_status,
                ${EPOCH}, ${EPOCH_2}, 0, 30000)
      `;
      await expect(promise).rejects.toMatchObject({ code: '23514' });
    });

    it('audio_chunks byte_length <= 0 → 23514', async () => {
      await insertUser();
      const meetingId = await insertMeeting();
      const promise = testDb.$raw`
        INSERT INTO audio_chunks
          (id, meeting_id, owner_id, source, chunk_index, storage_key,
           started_at, duration_ms, byte_length, codec, container,
           sample_rate, channels, sha256, upload_status,
           wall_clock_start, wall_clock_end, monotonic_start, monotonic_end)
        VALUES (${randomUUID()}, ${meetingId}, ${OWNER_1}, 'mic'::audio_source, 0, 'sk',
                ${EPOCH}, 30000, 0, 'opus', 'webm',
                48000, 1, ${VALID_SHA}, 'pending'::upload_status,
                ${EPOCH}, ${EPOCH_2}, 0, 30000)
      `;
      await expect(promise).rejects.toMatchObject({ code: '23514' });
    });

    it('transcript_segments confidence > 1 → 23514', async () => {
      await insertUser();
      const meetingId = await insertMeeting();
      const promise = testDb.$raw`
        INSERT INTO transcript_segments
          (id, meeting_id, owner_id, sequence, speaker_id, language,
           text, start_ms, end_ms, confidence, source, created_at)
        VALUES (${randomUUID()}, ${meetingId}, ${OWNER_1}, 0, 'speaker-1',
                'vi'::meeting_language, 'bad confidence', 0, 1000,
                1.5, 'api'::transcript_source, ${EPOCH})
      `;
      await expect(promise).rejects.toMatchObject({ code: '23514' });
    });

    it('meetings version <= 0 → 23514', async () => {
      await insertUser();
      const promise = testDb.$raw`
        INSERT INTO meetings
          (id, owner_id, title, language, mode, speech_mode, timezone,
           version, state, capture_profile, created_at)
        VALUES (${randomUUID()}, ${OWNER_1}, 'Zero Version',
                'vi'::meeting_language, 'meeting_only'::meeting_mode,
                'api'::speech_mode, 'UTC',
                0, 'draft'::meeting_state, '{}', ${EPOCH})
      `;
      await expect(promise).rejects.toMatchObject({ code: '23514' });
    });
  });

  /* ---------- #12: Duplicate provider_event_id ---------- */
  describe('#12: Duplicate provider_event_id', () => {
    it('duplicate (meeting_id, provider, provider_event_id) → 23505', async () => {
      await insertUser();
      const meetingId = await insertMeeting();

      // Insert first segment with provider_event_id
      const segId1 = randomUUID();
      await testDb.$raw`
        INSERT INTO transcript_segments
          (id, meeting_id, owner_id, sequence, speaker_id, language,
           text, start_ms, end_ms, confidence, source, provider,
           provider_event_id, created_at)
        VALUES (${segId1}, ${meetingId}, ${OWNER_1}, 0, 'speaker-1',
                'vi'::meeting_language, 'first', 0, 1000, 1.0,
                'api'::transcript_source, 'google', 'evt-001', ${EPOCH})
      `;

      // Second segment with same (meeting_id, provider, provider_event_id)
      const segId2 = randomUUID();
      const promise = testDb.$raw`
        INSERT INTO transcript_segments
          (id, meeting_id, owner_id, sequence, speaker_id, language,
           text, start_ms, end_ms, confidence, source, provider,
           provider_event_id, created_at)
        VALUES (${segId2}, ${meetingId}, ${OWNER_1}, 1, 'speaker-1',
                'vi'::meeting_language, 'second', 1000, 2000, 1.0,
                'api'::transcript_source, 'google', 'evt-001', ${EPOCH})
      `;
      await expect(promise).rejects.toMatchObject({ code: '23505' });
    });

    it('null provider_event_id does not trigger duplicate check', async () => {
      await insertUser();
      const meetingId = await insertMeeting();

      // Two segments with null provider_event_id should succeed (partial index has WHERE clause)
      const segId1 = randomUUID();
      await testDb.$raw`
        INSERT INTO transcript_segments
          (id, meeting_id, owner_id, sequence, speaker_id, language,
           text, start_ms, end_ms, source, created_at)
        VALUES (${segId1}, ${meetingId}, ${OWNER_1}, 0, 'speaker-1',
                'vi'::meeting_language, 'first', 0, 1000,
                'api'::transcript_source, ${EPOCH})
      `;
      const segId2 = randomUUID();
      await testDb.$raw`
        INSERT INTO transcript_segments
          (id, meeting_id, owner_id, sequence, speaker_id, language,
           text, start_ms, end_ms, source, created_at)
        VALUES (${segId2}, ${meetingId}, ${OWNER_1}, 1, 'speaker-1',
                'vi'::meeting_language, 'second', 1000, 2000,
                'api'::transcript_source, ${EPOCH})
      `;

      const rows = await testDb.$raw`
        SELECT COUNT(*)::int AS cnt FROM transcript_segments WHERE meeting_id = ${meetingId}
      `;
      expect(rows[0]!.cnt).toBe(2);
    });
  });

  /* ---------- #13: Invalid sha256 ---------- */
  describe('#13: Invalid sha256 format', () => {
    it('audio_chunks invalid sha256 → 23514', async () => {
      await insertUser();
      const meetingId = await insertMeeting();
      const promise = testDb.$raw`
        INSERT INTO audio_chunks
          (id, meeting_id, owner_id, source, chunk_index, storage_key,
           started_at, duration_ms, byte_length, codec, container,
           sample_rate, channels, sha256, upload_status,
           wall_clock_start, wall_clock_end, monotonic_start, monotonic_end)
        VALUES (${randomUUID()}, ${meetingId}, ${OWNER_1}, 'mic'::audio_source, 0, 'sk',
                ${EPOCH}, 30000, 48000, 'opus', 'webm',
                48000, 1, 'not-a-hex-string', 'pending'::upload_status,
                ${EPOCH}, ${EPOCH_2}, 0, 30000)
      `;
      await expect(promise).rejects.toMatchObject({ code: '23514' });
    });
  });

  /* ---------- #14: Concurrent duplicate insert ---------- */
  describe('#14: Concurrent duplicate provider_event_id', () => {
    it('two parallel txns inserting same provider_event_id; one wins', async () => {
      await insertUser();
      const meetingId = await insertMeeting();

      // Insert a base segment so the meeting seq is primed
      await insertSegment({ meetingId, sequence: 0, provider: 'google', providerEventId: null });

      // Now attempt two concurrent inserts with the same provider_event_id
      const segId2 = randomUUID();
      const segId3 = randomUUID();

      const tx1 = testDb.$raw.begin(async (tx) => {
        await tx`
          INSERT INTO transcript_segments
            (id, meeting_id, owner_id, sequence, speaker_id, language,
             text, start_ms, end_ms, confidence, source, provider,
             provider_event_id, created_at)
          VALUES (${segId2}, ${meetingId}, ${OWNER_1}, 1, 'speaker-1',
                  'vi'::meeting_language, 'concurrent-a', 1000, 2000, 1.0,
                  'api'::transcript_source, 'google', 'evt-999', ${EPOCH})
        `;
      });

      const tx2 = testDb.$raw.begin(async (tx) => {
        await tx`
          INSERT INTO transcript_segments
            (id, meeting_id, owner_id, sequence, speaker_id, language,
             text, start_ms, end_ms, confidence, source, provider,
             provider_event_id, created_at)
          VALUES (${segId3}, ${meetingId}, ${OWNER_1}, 2, 'speaker-1',
                  'vi'::meeting_language, 'concurrent-b', 2000, 3000, 1.0,
                  'api'::transcript_source, 'google', 'evt-999', ${EPOCH})
        `;
      });

      const results = await Promise.allSettled([tx1, tx2]);

      // One must succeed (fulfilled), one must fail (rejected with 23505)
      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);
      expect((failures[0]!.reason as { code: string }).code).toBe('23505');

      // Exactly one row with evt-999 was committed
      const rows = await testDb.$raw`
        SELECT COUNT(*)::int AS cnt FROM transcript_segments
        WHERE meeting_id = ${meetingId} AND provider = 'google' AND provider_event_id = 'evt-999'
      `;
      expect(rows[0]!.cnt).toBe(1);
    });
  });

  /* ---------- #15: Transaction rollback ---------- */
  describe('#15: Transaction rollback on error', () => {
    it('error mid-transaction rolls back all writes', async () => {
      await insertUser();
      await insertMeeting();

      // Count rows before
      const before = await testDb.$raw`
        SELECT COUNT(*)::int AS cnt FROM meetings
      `;
      const beforeCount = before[0]!.cnt;

      // Attempt a transaction that inserts then violates a constraint
      const promise = testDb.$raw.begin(async (tx) => {
        // Insert a valid meeting
        await tx`
          INSERT INTO meetings
            (id, owner_id, title, language, mode, speech_mode, timezone,
             version, state, capture_profile, created_at)
          VALUES (${randomUUID()}, ${OWNER_1}, 'Rollback Test',
                  'vi'::meeting_language, 'meeting_only'::meeting_mode,
                  'api'::speech_mode, 'UTC',
                  1, 'draft'::meeting_state, '{}', ${EPOCH})
        `;

        // Then violate a CHECK constraint
        await tx`
          INSERT INTO meetings
            (id, owner_id, title, language, mode, speech_mode, timezone,
             version, state, capture_profile, created_at)
          VALUES (${randomUUID()}, ${OWNER_1}, '',
                  'vi'::meeting_language, 'meeting_only'::meeting_mode,
                  'api'::speech_mode, 'UTC',
                  1, 'draft'::meeting_state, '{}', ${EPOCH})
        `;
      });

      await expect(promise).rejects.toThrow();

      // Count rows after — should be exactly the same
      const after = await testDb.$raw`
        SELECT COUNT(*)::int AS cnt FROM meetings
      `;
      expect(after[0]!.cnt).toBe(beforeCount);
    });
  });

  /* ---------- #16: Evidence range beyond segment (app-only / DB CHECK) ---------- */
  describe('#16: Evidence constraints', () => {
    it('evidence_refs with end_ms < start_ms → 23514 (CHECK violation)', async () => {
      await insertUser();
      const meetingId = await insertMeeting();
      const segId = await insertSegment({ meetingId });

      const promise = testDb.$raw`
        INSERT INTO evidence_refs
          (id, meeting_id, owner_id, owner_type, segment_id, start_ms, end_ms)
        VALUES (${randomUUID()}, ${meetingId}, ${OWNER_1},
                'section'::evidence_owner_type, ${segId}, 500, 100)
      `;
      await expect(promise).rejects.toMatchObject({ code: '23514' });
    });

    it('evidence_refs range beyond segment duration succeeds (app-only check)', async () => {
      await insertUser();
      const meetingId = await insertMeeting({ state: 'ready' });
      const segId = await insertSegment({ meetingId, startMs: 0, endMs: 1000 });

      // DB has no CHECK that evidence range must be within segment range
      // (that's an app-level assertion). So this should succeed at DB level.
      // But we must satisfy evidence_refs_exactly_one_owner CHECK by providing
      // either section_id or action_item_id.
      const docId = randomUUID();
      await testDb.$raw`
        INSERT INTO minutes_documents
          (id, meeting_id, owner_id, template, created_at)
        VALUES (${docId}, ${meetingId}, ${OWNER_1}, 'team'::minutes_template, ${EPOCH})
      `;
      const verId = randomUUID();
      await testDb.$raw`
        INSERT INTO minutes_versions
          (id, document_id, meeting_id, owner_id, version,
           template, detail_level, output_language,
           transcript_projection, is_complete, creator_id, created_at)
        VALUES (${verId}, ${docId}, ${meetingId}, ${OWNER_1}, 1,
                'team'::minutes_template, 'detailed'::detail_level,
                'vi'::meeting_language, 'current', true, 'creator-1', ${EPOCH})
      `;
      const secId = randomUUID();
      await testDb.$raw`
        INSERT INTO minutes_sections
          (id, version_id, meeting_id, owner_id, kind, heading, content, order_index)
        VALUES (${secId}, ${verId}, ${meetingId}, ${OWNER_1},
                'section', 'Heading', 'Content', 0)
      `;

      const evId = randomUUID();
      await testDb.$raw`
        INSERT INTO evidence_refs
          (id, meeting_id, owner_id, owner_type, section_id, segment_id, start_ms, end_ms)
        VALUES (${evId}, ${meetingId}, ${OWNER_1},
                'section'::evidence_owner_type, ${secId}, ${segId}, 0, 50000)
      `;

      const found = await testDb.$raw`SELECT 1 FROM evidence_refs WHERE id = ${evId}`;
      expect(found.length).toBe(1);

      // Cleanup
      await testDb.$raw`DELETE FROM evidence_refs WHERE id = ${evId}`;
    });

    it('evidence_refs exactly_one_owner CHECK', async () => {
      await insertUser();
      const meetingId = await insertMeeting();
      const segId = await insertSegment({ meetingId });

      // Both section_id and action_item_id NULL should fail
      const promise = testDb.$raw`
        INSERT INTO evidence_refs
          (id, meeting_id, owner_id, owner_type, segment_id, start_ms, end_ms)
        VALUES (${randomUUID()}, ${meetingId}, ${OWNER_1},
                'section'::evidence_owner_type, ${segId}, 0, 100)
      `;
      await expect(promise).rejects.toMatchObject({ code: '23514' });
    });
  });

  /* ---------- #17: FK violation ---------- */
  describe('#17: Foreign-key violations → 23503', () => {
    it('transcript_revision FK to non-existent segment → 23503', async () => {
      await insertUser();
      const meetingId = await insertMeeting();

      const promise = testDb.$raw`
        INSERT INTO transcript_revisions
          (id, segment_id, meeting_id, owner_id, revised_text, actor_id, created_at)
        VALUES (${randomUUID()}, 'nonexistent-seg', ${meetingId},
                ${OWNER_1}, 'text', 'actor-1', ${EPOCH})
      `;
      await expect(promise).rejects.toMatchObject({ code: '23503' });
    });

    it('audio_chunk FK to non-existent meeting → 23503', async () => {
      await insertUser();

      const promise = testDb.$raw`
        INSERT INTO audio_chunks
          (id, meeting_id, owner_id, source, chunk_index, storage_key,
           started_at, duration_ms, byte_length, codec, container,
           sample_rate, channels, sha256, upload_status,
           wall_clock_start, wall_clock_end, monotonic_start, monotonic_end)
        VALUES (${randomUUID()}, ${randomUUID()}, ${OWNER_1}, 'mic'::audio_source, 0, 'sk',
                ${EPOCH}, 30000, 48000, 'opus', 'webm',
                48000, 1, ${VALID_SHA}, 'pending'::upload_status,
                ${EPOCH}, ${EPOCH_2}, 0, 30000)
      `;
      await expect(promise).rejects.toMatchObject({ code: '23503' });
    });
  });

  /* ---------- #18: Idempotency replay ---------- */
  describe('#18: Idempotency replay', () => {
    it('same (owner, entity_type, idempotency_key) twice → 23505 on second', async () => {
      await insertUser();

      // First insert → should succeed
      await testDb.$raw`
        INSERT INTO idempotency_records
          (owner_id, entity_type, idempotency_key, request_id, response_code, response_summary, expires_at)
        VALUES (${OWNER_1}, 'meeting'::entity_type, 'idem-key-1', 'req-1', '200',
                '{"status":"ok"}'::jsonb, '2027-01-01T00:00:00.000Z'::timestamptz)
      `;

      // Second insert with same (owner, entity_type, idempotency_key) → 23505
      const promise = testDb.$raw`
        INSERT INTO idempotency_records
          (owner_id, entity_type, idempotency_key, request_id, response_code, response_summary, expires_at)
        VALUES (${OWNER_1}, 'meeting'::entity_type, 'idem-key-1', 'req-2', '200',
                '{"status":"ok"}'::jsonb, '2027-01-01T00:00:00.000Z'::timestamptz)
      `;
      await expect(promise).rejects.toMatchObject({ code: '23505' });

      // Verify only one row exists
      const rows = await testDb.$raw`
        SELECT COUNT(*)::int AS cnt FROM idempotency_records
        WHERE owner_id = ${OWNER_1} AND entity_type = 'meeting'::entity_type AND idempotency_key = 'idem-key-1'
      `;
      expect(rows[0]!.cnt).toBe(1);
    });
  });

  /* ---------- #19: safe_audit with forbidden metadata key ---------- */
  describe('#19: safe_audit forbidden metadata key', () => {
    it('DB-level allows forbidden keys in metadata (app-level check only)', async () => {
      await insertUser();

      // The DB schema has no CHECK constraint on metadata jsonb keys.
      // Raw SQL insert with a forbidden key should succeed at DB level.
      const auditId = randomUUID();
      await testDb.$raw`
        INSERT INTO safe_audit
          (id, owner_id, actor_id, action, entity_type, entity_id, metadata)
        VALUES (${auditId}, ${OWNER_1}, 'actor-1', 'view',
                'meeting'::entity_type, 'entity-1',
                '{"accessToken":"secret123"}'::jsonb)
      `;

      const found = await testDb.$raw`
        SELECT 1 FROM safe_audit WHERE id = ${auditId}
      `;
      expect(found.length).toBe(1);

      // Cleanup
      await testDb.$raw`DELETE FROM safe_audit WHERE id = ${auditId}`;
    });
  });

  /* ---------- #20: Language/mode lock after recording ---------- */
  describe('#20: Language/mode lock after recording started', () => {
    it('update meeting language after state=recording → P0311', async () => {
      await insertUser();
      const meetingId = await insertMeeting({ state: 'recording', language: 'vi' });

      // Try to change language after recording has started
      const promise = testDb.$raw`
        UPDATE meetings SET language = 'en'::meeting_language WHERE id = ${meetingId}
      `;
      await expect(promise).rejects.toMatchObject({ code: 'P0311' });
    });

    it('update meeting mode after state=recording → P0311', async () => {
      await insertUser();
      const meetingId = await insertMeeting({ state: 'recording', mode: 'meeting_only' });

      // Try to change mode after recording has started
      const promise = testDb.$raw`
        UPDATE meetings SET mode = 'meeting_translate'::meeting_mode WHERE id = ${meetingId}
      `;
      await expect(promise).rejects.toMatchObject({ code: 'P0311' });
    });

    it('change language while state=draft succeeds (no lock)', async () => {
      await insertUser();
      const meetingId = await insertMeeting({ state: 'draft', language: 'vi' });

      // Draft allows language change
      const r = await testDb.$raw`
        UPDATE meetings SET language = 'en'::meeting_language WHERE id = ${meetingId} AND owner_id = ${OWNER_1}
      `;
      expect(r.count).toBe(1);

      const rows = await testDb.$raw`
        SELECT language::text FROM meetings WHERE id = ${meetingId}
      `;
      expect(rows[0]!.language).toBe('en');
    });

    it('insert meeting_capture_sources after recording → P0311', async () => {
      await insertUser();
      const meetingId = await insertMeeting({ state: 'recording' });

      const promise = testDb.$raw`
        INSERT INTO meeting_capture_sources (meeting_id, source)
        VALUES (${meetingId}, 'system'::audio_source)
      `;
      await expect(promise).rejects.toMatchObject({ code: 'P0311' });
    });

    it('delete meeting_capture_sources after recording → P0311', async () => {
      await insertUser();
      const meetingId = await insertMeeting({ state: 'draft' });

      // Insert capture source while in draft
      await testDb.$raw`
        INSERT INTO meeting_capture_sources (meeting_id, source)
        VALUES (${meetingId}, 'mic'::audio_source)
      `;

      // Move state to recording
      await testDb.$raw`
        UPDATE meetings SET state = 'recording'::meeting_state WHERE id = ${meetingId}
      `;

      // Try to delete capture source — should be locked
      const promise = testDb.$raw`
        DELETE FROM meeting_capture_sources WHERE meeting_id = ${meetingId} AND source = 'mic'::audio_source
      `;
      await expect(promise).rejects.toMatchObject({ code: 'P0311' });
    });
  });
});
