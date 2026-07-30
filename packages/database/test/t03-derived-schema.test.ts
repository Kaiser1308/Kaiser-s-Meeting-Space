import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import {
  minutesDocuments,
  minutesVersions,
  minutesSections,
  actionItems,
  evidenceRefs,
  brandPresets,
  brandAssets,
  exportJobs,
  exportManifests,
  meetings,
  meetingCaptureSources,
  users,
  transcriptSegments,
} from '../src/schema/index.js';
import { startPostgres, withRollbackTx, type TestDb } from './harness.js';

// ── Synthetic fixtures (no real meeting content) ───────────────────────

const VALID_SHA = '0'.repeat(64);
const ALT_SHA = '1'.repeat(64);
const EPOCH = '2026-01-01T00:00:00.000Z';

async function insertUser(
  tx: Parameters<Parameters<TestDb['db']['transaction']>[0]>[0],
  id = 'test-owner',
): Promise<void> {
  await tx.insert(users).values({ id });
}

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

async function insertTranscriptSegment(
  tx: Parameters<Parameters<TestDb['db']['transaction']>[0]>[0],
  meetingId: string,
  overrides: Partial<typeof transcriptSegments.$inferInsert> = {},
): Promise<string> {
  const idx = (overrides.sequence as number | undefined) ?? 0;
  const defaultId = `seg-${meetingId}-${idx}`;
  await tx.insert(transcriptSegments).values({
    ...overrides,
    id: overrides.id ?? defaultId,
    meetingId,
    ownerId: 'test-owner',
    sequence: idx,
    speakerId: 'speaker-1',
    language: 'vi',
    text: 'Synthetic transcript segment text.',
    startMs: 0,
    endMs: 1000,
    confidence: 0.95,
    source: 'api',
    isGap: false,
    createdAt: new Date(EPOCH),
  });
  return overrides.id ?? defaultId;
}

async function insertMinutesDocument(
  tx: Parameters<Parameters<TestDb['db']['transaction']>[0]>[0],
  meetingId: string,
  overrides: Partial<typeof minutesDocuments.$inferInsert> = {},
): Promise<string> {
  const defaultId = `doc-${randomUUID()}`;
  await tx.insert(minutesDocuments).values({
    ...overrides,
    id: overrides.id ?? defaultId,
    meetingId,
    ownerId: 'test-owner',
    template: 'team',
    currentVersion: 1,
    createdAt: new Date(EPOCH),
  });
  return overrides.id ?? defaultId;
}

async function insertMinutesVersion(
  tx: Parameters<Parameters<TestDb['db']['transaction']>[0]>[0],
  documentId: string,
  meetingId: string,
  overrides: Partial<typeof minutesVersions.$inferInsert> = {},
): Promise<string> {
  const defaultId = `ver-${randomUUID()}`;
  const ver = (overrides.version as number | undefined) ?? 1;
  await tx.insert(minutesVersions).values({
    ...overrides,
    id: overrides.id ?? defaultId,
    documentId,
    meetingId,
    ownerId: 'test-owner',
    version: ver,
    template: 'team',
    detailLevel: 'detailed',
    outputLanguage: 'vi',
    transcriptProjection: 'current',
    isComplete: true,
    creatorId: 'test-owner',
    createdAt: new Date(EPOCH),
  });
  return overrides.id ?? defaultId;
}

async function insertMinutesSection(
  tx: Parameters<Parameters<TestDb['db']['transaction']>[0]>[0],
  versionId: string,
  meetingId: string,
  overrides: Partial<typeof minutesSections.$inferInsert> = {},
): Promise<string> {
  const defaultId = `sec-${randomUUID()}`;
  await tx.insert(minutesSections).values({
    ...overrides,
    id: overrides.id ?? defaultId,
    versionId,
    meetingId,
    ownerId: 'test-owner',
    kind: 'section',
    heading: 'Test Section',
    content: 'Test content.',
    orderIndex: 0,
  });
  return overrides.id ?? defaultId;
}

async function insertActionItem(
  tx: Parameters<Parameters<TestDb['db']['transaction']>[0]>[0],
  versionId: string,
  meetingId: string,
  overrides: Partial<typeof actionItems.$inferInsert> = {},
): Promise<string> {
  const defaultId = `ai-${randomUUID()}`;
  await tx.insert(actionItems).values({
    ...overrides,
    id: overrides.id ?? defaultId,
    versionId,
    meetingId,
    ownerId: 'test-owner',
    description: 'Test action item.',
    status: 'open',
    orderIndex: 0,
  });
  return overrides.id ?? defaultId;
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

// ── Existence inventory (P03-A02) ──────────────────────────────────────

describe('T03 schema inventory', () => {
  const T03_TABLES = [
    'minutes_documents',
    'minutes_versions',
    'minutes_sections',
    'action_items',
    'evidence_refs',
    'brand_presets',
    'brand_assets',
    'export_jobs',
    'export_manifests',
  ];

  it('creates every T03 table', async () => {
    const result = await testDb.db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const present = new Set(
      (result as unknown as { table_name: string }[]).map((r) => r.table_name),
    );
    for (const t of T03_TABLES) {
      expect(present.has(t), `missing table ${t}`).toBe(true);
    }
  });

  it.each([
    ['minutes_template', ['team', 'one_on_one', 'direct_report', 'leadership', 'recurring']],
    ['detail_level', ['detailed', 'near_verbatim']],
    ['action_item_status', ['open', 'done', 'needs_confirmation']],
    ['evidence_owner_type', ['section', 'action_item']],
    ['paper_size', ['A4', 'Letter', 'Legal']],
    ['export_format', ['docx', 'pdf', 'markdown', 'txt', 'json', 'audio']],
    ['export_status', ['pending', 'processing', 'completed', 'failed']],
  ])('enum %s has exact P02 values %j', async (name, expected) => {
    const result = await testDb.db.execute(
      sql`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = ${name} ORDER BY e.enumsortorder`,
    );
    const labels = (result as unknown as { enumlabel: string }[]).map((r) => r.enumlabel);
    expect(labels).toEqual(expected);
  });

  it('creates the named CHECK constraints', async () => {
    const expected = [
      'minutes_documents_version_positive',
      'minutes_versions_version_positive',
      'minutes_versions_transcript_projection_valid',
      'minutes_sections_kind_valid',
      'minutes_sections_order_index_non_negative',
      'evidence_refs_exactly_one_owner',
      'evidence_refs_start_ms_non_negative',
      'evidence_refs_end_after_start',
      'evidence_refs_quote_hash_format',
      'brand_presets_primary_color_format',
      'brand_presets_secondary_color_format',
      'brand_presets_version_positive',
      'brand_assets_sha256_format',
      'brand_assets_byte_length_positive',
      'export_manifests_sha256_format',
      'export_manifests_byte_length_positive',
    ];
    const result = await testDb.db.execute(
      sql`SELECT conname FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace`,
    );
    const present = new Set((result as unknown as { conname: string }[]).map((r) => r.conname));
    for (const c of expected) {
      expect(present.has(c), `missing CHECK ${c}`).toBe(true);
    }
  });

  it('creates the unique indexes', async () => {
    const expected = [
      'minutes_versions_document_version_unique',
      'brand_presets_owner_name_unique',
    ];
    const result = await testDb.db.execute(
      sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const present = new Set((result as unknown as { indexname: string }[]).map((r) => r.indexname));
    for (const idx of expected) {
      expect(present.has(idx), `missing unique index ${idx}`).toBe(true);
    }
  });
});

// ── Valid inserts (P03-A02) ────────────────────────────────────────────

describe('T03 valid inserts', () => {
  it('inserts a full chain: document -> version -> section + action item + evidence', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      await tx.insert(meetingCaptureSources).values([{ meetingId, source: 'mic' }]);

      // Create a transcript segment to reference from evidence
      const segId = await insertTranscriptSegment(tx, meetingId);
      const docId = await insertMinutesDocument(tx, meetingId);
      const verId = await insertMinutesVersion(tx, docId, meetingId);

      // Update document to point at the current version
      await tx
        .update(minutesDocuments)
        .set({ currentVersionId: verId })
        .where(eq(minutesDocuments.id, docId));

      // Insert a section with evidence
      const secId = await insertMinutesSection(tx, verId, meetingId);
      await tx.insert(evidenceRefs).values({
        meetingId,
        ownerId: 'test-owner',
        ownerType: 'section',
        sectionId: secId,
        segmentId: segId,
        startMs: 0,
        endMs: 500,
      });

      // Insert an action item with evidence
      const aiId = await insertActionItem(tx, verId, meetingId);
      await tx.insert(evidenceRefs).values({
        meetingId,
        ownerId: 'test-owner',
        ownerType: 'action_item',
        actionItemId: aiId,
        segmentId: segId,
        startMs: 200,
        endMs: 600,
        quoteHash: VALID_SHA,
      });

      // Brand preset + asset
      await tx.insert(brandPresets).values({
        id: 'brand-1',
        ownerId: 'test-owner',
        name: 'Corporate',
        primaryColor: '#2563EB',
        secondaryColor: '#FFF',
        paperSize: 'A4',
      });
      await tx.insert(brandAssets).values({
        brandPresetId: 'brand-1',
        ownerId: 'test-owner',
        storageKey: 'brand/logo.png',
        sha256: VALID_SHA,
        byteLength: 1024,
        kind: 'logo',
      });

      // Export job + manifest
      await tx.insert(exportJobs).values({
        id: 'export-1',
        meetingId,
        ownerId: 'test-owner',
        minutesVersionId: verId,
        format: 'pdf',
        status: 'completed',
        downloadUrl: 'https://storage.example.com/export-1.pdf',
      });
      await tx.insert(exportManifests).values({
        exportJobId: 'export-1',
        ownerId: 'test-owner',
        minutesVersionId: verId,
        template: 'team',
        detailLevel: 'detailed',
        outputLanguage: 'vi',
        transcriptProjection: 'current',
        format: 'pdf',
        sha256: VALID_SHA,
        byteLength: 4096,
        storageKey: 'exports/export-1.pdf',
      });

      // Verify reads
      const doc = await tx.select().from(minutesDocuments).where(eq(minutesDocuments.id, docId));
      expect(doc.length).toBe(1);
      expect(doc[0]?.currentVersionId).toBe(verId);

      const refs = await tx.select().from(evidenceRefs);
      expect(refs.length).toBe(2);
    });
  });
});

// ── CHECK constraint violations (P03-A02) ─────────────────────────────

describe('T03 CHECK constraint violations', () => {
  it('rejects non-positive minutes_documents version (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const code = await errCode(
        tx.insert(minutesDocuments).values({
          id: `doc-${randomUUID()}`,
          meetingId,
          ownerId: 'test-owner',
          template: 'team',
          currentVersion: 0,
          createdAt: new Date(EPOCH),
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects non-positive minutes_versions version (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const docId = await insertMinutesDocument(tx, meetingId);
      const code = await errCode(
        tx.insert(minutesVersions).values({
          id: `ver-${randomUUID()}`,
          documentId: docId,
          meetingId,
          ownerId: 'test-owner',
          version: 0,
          template: 'team',
          detailLevel: 'detailed',
          outputLanguage: 'vi',
          transcriptProjection: 'current',
          isComplete: true,
          creatorId: 'test-owner',
          createdAt: new Date(EPOCH),
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects invalid transcript_projection value (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const docId = await insertMinutesDocument(tx, meetingId);
      const code = await errCode(
        tx.execute(
          sql`INSERT INTO minutes_versions (id, document_id, meeting_id, owner_id, version, template, detail_level, output_language, transcript_projection, is_complete, creator_id, created_at) VALUES (${'ver-' + randomUUID()}, ${docId}, ${meetingId}, 'test-owner', 1, 'team', 'detailed', 'vi', 'invalid_projection', true, 'test-owner', ${EPOCH}::timestamptz)`,
        ),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects an invalid minutes_sections kind (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const docId = await insertMinutesDocument(tx, meetingId);
      const verId = await insertMinutesVersion(tx, docId, meetingId);
      const code = await errCode(
        tx.execute(
          sql`INSERT INTO minutes_sections (id, version_id, meeting_id, owner_id, kind, heading, content, order_index) VALUES (${'sec-' + randomUUID()}, ${verId}, ${meetingId}, 'test-owner', 'bogus', 'H', 'C', 0)`,
        ),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects negative order_index on minutes_sections (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const docId = await insertMinutesDocument(tx, meetingId);
      const verId = await insertMinutesVersion(tx, docId, meetingId);
      const code = await errCode(
        tx.insert(minutesSections).values({
          id: `sec-${randomUUID()}`,
          versionId: verId,
          meetingId,
          ownerId: 'test-owner',
          kind: 'section',
          heading: 'H',
          content: 'C',
          orderIndex: -1,
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects evidence_refs with both section_id and action_item_id null', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const segId = await insertTranscriptSegment(tx, meetingId);
      const code = await errCode(
        tx.insert(evidenceRefs).values({
          meetingId,
          ownerId: 'test-owner',
          ownerType: 'section',
          // both sectionId and actionItemId are null
          segmentId: segId,
          startMs: 0,
          endMs: 500,
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects evidence_refs with both section_id and action_item_id non-null', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const docId = await insertMinutesDocument(tx, meetingId);
      const verId = await insertMinutesVersion(tx, docId, meetingId);
      const secId = await insertMinutesSection(tx, verId, meetingId);
      const aiId = await insertActionItem(tx, verId, meetingId);
      const segId = await insertTranscriptSegment(tx, meetingId);
      const code = await errCode(
        tx.insert(evidenceRefs).values({
          meetingId,
          ownerId: 'test-owner',
          ownerType: 'section',
          sectionId: secId,
          actionItemId: aiId,
          segmentId: segId,
          startMs: 0,
          endMs: 500,
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects evidence_refs end_ms < start_ms (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const docId = await insertMinutesDocument(tx, meetingId);
      const verId = await insertMinutesVersion(tx, docId, meetingId);
      const secId = await insertMinutesSection(tx, verId, meetingId);
      const segId = await insertTranscriptSegment(tx, meetingId);
      const code = await errCode(
        tx.insert(evidenceRefs).values({
          meetingId,
          ownerId: 'test-owner',
          ownerType: 'section',
          sectionId: secId,
          segmentId: segId,
          startMs: 500,
          endMs: 100,
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects a malformed sha256 on brand_assets (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      await tx.insert(brandPresets).values({
        id: 'brand-bad',
        ownerId: 'test-owner',
        name: 'Bad',
      });
      const code = await errCode(
        tx.insert(brandAssets).values({
          brandPresetId: 'brand-bad',
          ownerId: 'test-owner',
          storageKey: 'bad/key',
          sha256: 'zzz',
          byteLength: 64,
          kind: 'logo',
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects a non-positive byte_length on brand_assets (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      await tx.insert(brandPresets).values({
        id: 'brand-bad2',
        ownerId: 'test-owner',
        name: 'Bad2',
      });
      const code = await errCode(
        tx.insert(brandAssets).values({
          brandPresetId: 'brand-bad2',
          ownerId: 'test-owner',
          storageKey: 'bad/key',
          sha256: VALID_SHA,
          byteLength: 0,
          kind: 'logo',
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects a malformed primary_color on brand_presets (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const code = await errCode(
        tx.insert(brandPresets).values({
          id: `brand-${randomUUID()}`,
          ownerId: 'test-owner',
          name: 'Bad Color',
          primaryColor: 'not-a-hex',
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects a malformed sha256 on export_manifests (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const docId = await insertMinutesDocument(tx, meetingId);
      const verId = await insertMinutesVersion(tx, docId, meetingId);
      await tx.insert(exportJobs).values({
        id: 'export-bad',
        meetingId,
        ownerId: 'test-owner',
        minutesVersionId: verId,
        format: 'pdf',
      });
      const code = await errCode(
        tx.insert(exportManifests).values({
          exportJobId: 'export-bad',
          ownerId: 'test-owner',
          minutesVersionId: verId,
          template: 'team',
          detailLevel: 'detailed',
          outputLanguage: 'vi',
          transcriptProjection: 'current',
          format: 'pdf',
          sha256: 'bad',
          byteLength: 100,
          storageKey: 'exports/bad.pdf',
        }),
      );
      expect(code).toBe('23514');
    });
  });

  it('rejects a non-positive byte_length on export_manifests (23514)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const docId = await insertMinutesDocument(tx, meetingId);
      const verId = await insertMinutesVersion(tx, docId, meetingId);
      await tx.insert(exportJobs).values({
        id: 'export-bad2',
        meetingId,
        ownerId: 'test-owner',
        minutesVersionId: verId,
        format: 'pdf',
      });
      const code = await errCode(
        tx.insert(exportManifests).values({
          exportJobId: 'export-bad2',
          ownerId: 'test-owner',
          minutesVersionId: verId,
          template: 'team',
          detailLevel: 'detailed',
          outputLanguage: 'vi',
          transcriptProjection: 'current',
          format: 'pdf',
          sha256: VALID_SHA,
          byteLength: 0,
          storageKey: 'exports/bad2.pdf',
        }),
      );
      expect(code).toBe('23514');
    });
  });
});

// ── Enum value violations (P03-A02) ───────────────────────────────────

describe('T03 enum violations', () => {
  it('rejects an invalid minutes_template enum value', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const code = await errCode(
        tx.execute(
          sql`INSERT INTO minutes_documents (id, meeting_id, owner_id, template, current_version, created_at) VALUES (${'doc-' + randomUUID()}, ${meetingId}, 'test-owner', 'bogus_template', 1, ${EPOCH}::timestamptz)`,
        ),
      );
      expect(code).not.toBeNull();
      expect(code).not.toBe('__NO_CODE__');
    });
  });

  it('rejects an invalid export_format enum value', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const docId = await insertMinutesDocument(tx, meetingId);
      const verId = await insertMinutesVersion(tx, docId, meetingId);
      const code = await errCode(
        tx.execute(
          sql`INSERT INTO export_jobs (id, meeting_id, owner_id, minutes_version_id, format, status) VALUES (${'export-' + randomUUID()}, ${meetingId}, 'test-owner', ${verId}, 'bogus_format', 'pending')`,
        ),
      );
      expect(code).not.toBeNull();
      expect(code).not.toBe('__NO_CODE__');
    });
  });
});

// ── Duplicate / unique constraint violations ──────────────────────────

describe('T03 uniqueness constraints', () => {
  it('rejects duplicate (document_id, version) on minutes_versions (23505)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const docId = await insertMinutesDocument(tx, meetingId);
      await insertMinutesVersion(tx, docId, meetingId, { version: 1 });
      // Try to insert another version with same document+version
      const code = await errCode(
        tx.insert(minutesVersions).values({
          id: `ver-${randomUUID()}`,
          documentId: docId,
          meetingId,
          ownerId: 'test-owner',
          version: 1,
          template: 'team',
          detailLevel: 'detailed',
          outputLanguage: 'vi',
          transcriptProjection: 'current',
          isComplete: true,
          creatorId: 'test-owner',
          createdAt: new Date(EPOCH),
        }),
      );
      expect(code).toBe('23505');
    });
  });

  it('rejects duplicate (owner_id, name) on brand_presets (23505)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      await tx.insert(brandPresets).values({
        id: 'brand-dupe',
        ownerId: 'test-owner',
        name: 'Corporate',
      });
      const code = await errCode(
        tx.insert(brandPresets).values({
          id: 'brand-dupe-2',
          ownerId: 'test-owner',
          name: 'Corporate',
        }),
      );
      expect(code).toBe('23505');
    });
  });
});

// ── FK constraint violations ──────────────────────────────────────────

describe('T03 FK violations', () => {
  it('rejects minutes_document with non-existent meeting (23503)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const code = await errCode(
        tx.insert(minutesDocuments).values({
          id: `doc-${randomUUID()}`,
          meetingId: randomUUID(),
          ownerId: 'test-owner',
          template: 'team',
          createdAt: new Date(EPOCH),
        }),
      );
      expect(code).toBe('23503');
    });
  });

  it('rejects evidence_refs with non-existent segment (23503)', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const docId = await insertMinutesDocument(tx, meetingId);
      const verId = await insertMinutesVersion(tx, docId, meetingId);
      const secId = await insertMinutesSection(tx, verId, meetingId);
      const code = await errCode(
        tx.insert(evidenceRefs).values({
          meetingId,
          ownerId: 'test-owner',
          ownerType: 'section',
          sectionId: secId,
          segmentId: 'non-existent-segment',
          startMs: 0,
          endMs: 500,
        }),
      );
      expect(code).toBe('23503');
    });
  });
});

// ── Immutability triggers (P03-A04) — SQLSTATE P0311 ──────────────────

describe('T03 immutability triggers (P0311)', () => {
  it('blocks UPDATE on minutes_versions', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const docId = await insertMinutesDocument(tx, meetingId);
      const verId = await insertMinutesVersion(tx, docId, meetingId);
      const code = await errCode(
        tx.execute(sql`UPDATE minutes_versions SET template = 'one_on_one' WHERE id = ${verId}`),
      );
      expect(code).toBe('P0311');
    });
  });

  it('blocks DELETE on minutes_versions', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const docId = await insertMinutesDocument(tx, meetingId);
      const verId = await insertMinutesVersion(tx, docId, meetingId);
      const code = await errCode(tx.execute(sql`DELETE FROM minutes_versions WHERE id = ${verId}`));
      expect(code).toBe('P0311');
    });
  });

  it('blocks UPDATE on export_manifests', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const docId = await insertMinutesDocument(tx, meetingId);
      const verId = await insertMinutesVersion(tx, docId, meetingId);
      await tx.insert(exportJobs).values({
        id: 'export-immutable',
        meetingId,
        ownerId: 'test-owner',
        minutesVersionId: verId,
        format: 'pdf',
        status: 'completed',
      });
      await tx.insert(exportManifests).values({
        exportJobId: 'export-immutable',
        ownerId: 'test-owner',
        minutesVersionId: verId,
        template: 'team',
        detailLevel: 'detailed',
        outputLanguage: 'vi',
        transcriptProjection: 'current',
        format: 'pdf',
        sha256: VALID_SHA,
        byteLength: 128,
        storageKey: 'exports/immutable.pdf',
      });
      const code = await errCode(
        tx.execute(
          sql`UPDATE export_manifests SET sha256 = ${ALT_SHA} WHERE export_job_id = 'export-immutable'`,
        ),
      );
      expect(code).toBe('P0311');
    });
  });

  it('blocks DELETE on export_manifests', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const docId = await insertMinutesDocument(tx, meetingId);
      const verId = await insertMinutesVersion(tx, docId, meetingId);
      await tx.insert(exportJobs).values({
        id: 'export-immutable-del',
        meetingId,
        ownerId: 'test-owner',
        minutesVersionId: verId,
        format: 'pdf',
        status: 'completed',
      });
      await tx.insert(exportManifests).values({
        exportJobId: 'export-immutable-del',
        ownerId: 'test-owner',
        minutesVersionId: verId,
        template: 'team',
        detailLevel: 'detailed',
        outputLanguage: 'vi',
        transcriptProjection: 'current',
        format: 'pdf',
        sha256: VALID_SHA,
        byteLength: 128,
        storageKey: 'exports/immutable-del.pdf',
      });
      const code = await errCode(
        tx.execute(sql`DELETE FROM export_manifests WHERE export_job_id = 'export-immutable-del'`),
      );
      expect(code).toBe('P0311');
    });
  });
});

// ── Cross-meeting evidence trigger (P0311) ────────────────────────────

describe('T03 evidence cross-meeting trigger', () => {
  it('blocks evidence_refs insert when segment belongs to a different meeting', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingA = await insertMeeting(tx, { id: randomUUID() });
      const meetingB = await insertMeeting(tx, { id: randomUUID() });
      const segInA = await insertTranscriptSegment(tx, meetingA);

      const docInB = await insertMinutesDocument(tx, meetingB);
      const verInB = await insertMinutesVersion(tx, docInB, meetingB);
      const secInB = await insertMinutesSection(tx, verInB, meetingB);

      // Try to reference segment from meetingA with an evidence_ref in meetingB
      const code = await errCode(
        tx.insert(evidenceRefs).values({
          meetingId: meetingB,
          ownerId: 'test-owner',
          ownerType: 'section',
          sectionId: secInB,
          segmentId: segInA,
          startMs: 0,
          endMs: 500,
        }),
      );
      expect(code).toBe('P0311');
    });
  });

  it('allows evidence_refs insert when segment belongs to the same meeting', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const segId = await insertTranscriptSegment(tx, meetingId);
      const docId = await insertMinutesDocument(tx, meetingId);
      const verId = await insertMinutesVersion(tx, docId, meetingId);
      const secId = await insertMinutesSection(tx, verId, meetingId);

      const code = await errCode(
        tx.insert(evidenceRefs).values({
          meetingId,
          ownerId: 'test-owner',
          ownerType: 'section',
          sectionId: secId,
          segmentId: segId,
          startMs: 0,
          endMs: 500,
        }),
      );
      expect(code).toBeNull();
    });
  });
});

// ── Content-free errors (P03-A06) ─────────────────────────────────────

describe('T03 content-free errors', () => {
  it('does not leak SQL text or content in error codes', async () => {
    await withRollbackTx(testDb, async (tx) => {
      await insertUser(tx);
      const meetingId = await insertMeeting(tx);
      const docId = await insertMinutesDocument(tx, meetingId);
      const verId = await insertMinutesVersion(tx, docId, meetingId);

      // Try an invalid operation and ensure only the error code is extracted
      const code = await errCode(
        tx.execute(sql`UPDATE minutes_versions SET template = 'one_on_one' WHERE id = ${verId}`),
      );
      expect(code).toBe('P0311');
      // code is just a string like 'P0311' — no SQL text, no content
      expect(typeof code).toBe('string');
      expect(code!.length).toBeLessThan(10);
    });
  });
});
