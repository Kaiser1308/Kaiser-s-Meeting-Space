import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { startPostgres, withRollbackTx, type TestDb } from '../test/harness.js';
import { type Connection } from '../src/client.js';
import { users, meetings } from '../src/schema/index.js';
import {
  MeetingsRepository,
  AudioRepository,
  TranscriptRepository,
  MinutesRepository,
  JobsMetadataRepository,
  DbError,
  updateWithVersion,
  encodeCursor,
  decodeCursor,
} from '../src/repositories/index.js';
import { formatChunkId, type MeetingSettings } from '@kms/domain';
import type { OwnerContext } from '../src/repositories/types.js';

// ── Shared test data ──

const OWNER_A: OwnerContext = { ownerId: 'user-a' };
const WRONG_OWNER: OwnerContext = { ownerId: 'wrong-owner' };

const MEETING_ID_A = '00000000-0000-0000-0000-000000000001';

const NOW = new Date().toISOString();

describe('P03-T05: Transactional owner-ready repositories', () => {
  let testDb: TestDb;
  let meetingRepo: MeetingsRepository;
  let audioRepo: AudioRepository;
  let transcriptRepo: TranscriptRepository;
  let minutesRepo: MinutesRepository;
  let jobsRepo: JobsMetadataRepository;

  beforeAll(async () => {
    testDb = await startPostgres();
    meetingRepo = new MeetingsRepository();
    audioRepo = new AudioRepository();
    transcriptRepo = new TranscriptRepository();
    minutesRepo = new MinutesRepository();
    jobsRepo = new JobsMetadataRepository();
  }, 120_000);

  afterAll(async () => {
    await testDb.close();
  });

  // ── Helpers ──

  async function seedUser(conn: Connection, ownerId: string): Promise<void> {
    await conn.insert(users).values({ id: ownerId }).onConflictDoNothing();
  }

  async function seedMeeting(
    conn: Connection,
    ctx: OwnerContext,
    id: string,
  ): Promise<MeetingSettings> {
    return meetingRepo.create(
      ctx,
      conn,
      {
        id,
        ownerId: ctx.ownerId,
        title: 'Test Meeting',
        language: 'en',
        mode: 'meeting_only',
        captureSources: ['mic'],
        speechMode: 'api',
        timezone: 'UTC',
        version: 1,
        createdAt: NOW,
      } as any,
      'draft',
    );
  }

  // ═══════════════════════════════════════════════
  //  MeetingsRepository
  // ═══════════════════════════════════════════════

  describe('MeetingsRepository', () => {
    it('create — persists meeting and returns MeetingSettings', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        const result = await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        expect(result.id).toBe(MEETING_ID_A);
        expect(result.title).toBe('Test Meeting');
        expect(result.captureSources).toEqual(['mic']);
        expect(result.version).toBe(1);
      });
    });

    it('get — returns meeting for correct owner', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        const result = await meetingRepo.get(OWNER_A, tx, MEETING_ID_A);
        expect(result).not.toBeNull();
        expect(result!.id).toBe(MEETING_ID_A);
      });
    });

    it('get — returns null for wrong owner (indistinguishable from missing)', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedUser(tx, WRONG_OWNER.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        const result = await meetingRepo.get(WRONG_OWNER, tx, MEETING_ID_A);
        expect(result).toBeNull();
      });
    });

    it('get — returns null for non-existent id (same as wrong owner)', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        const result = await meetingRepo.get(OWNER_A, tx, '00000000-0000-0000-0000-000000000099');
        expect(result).toBeNull();
      });
    });

    it('list — paginates correctly', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        // Create 3 meetings
        for (let i = 1; i <= 3; i++) {
          const id = `00000000-0000-0000-0000-00000000001${i}`;
          await meetingRepo.create(
            OWNER_A,
            tx,
            {
              id,
              ownerId: OWNER_A.ownerId,
              title: `Meeting ${i}`,
              language: 'en',
              mode: 'meeting_only',
              captureSources: ['mic'],
              speechMode: 'api',
              timezone: 'UTC',
              version: 1,
              createdAt: new Date(Date.now() + i * 1000).toISOString(),
            } as any,
            'draft',
          );
        }

        // First page: limit 2
        const page1 = await meetingRepo.list(OWNER_A, tx, { limit: 2 });
        expect(page1.items.length).toBe(2);
        expect(page1.nextCursor).not.toBeNull();

        // Second page: limit 2, should get remaining 1
        const page2 = await meetingRepo.list(OWNER_A, tx, { limit: 2, cursor: page1.nextCursor! });
        expect(page2.items.length).toBe(1);
        expect(page2.nextCursor).toBeNull();
      });
    });

    it('updateState — optimistically updates and returns new settings', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        const created = await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        const result = await meetingRepo.updateState(OWNER_A, tx, MEETING_ID_A, created.version, {
          state: 'checking',
        });

        expect(result).not.toBeNull();
      });
    });

    it('updateState — stale version throws version_conflict', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        const created = await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        // Update once to bump version
        await meetingRepo.updateState(OWNER_A, tx, MEETING_ID_A, created.version, {
          state: 'checking',
        });

        // Try with stale version
        await expect(
          meetingRepo.updateState(OWNER_A, tx, MEETING_ID_A, created.version, {
            state: 'recording',
          }),
        ).rejects.toThrow(DbError);

        await expect(
          meetingRepo.updateState(OWNER_A, tx, MEETING_ID_A, created.version, {
            state: 'recording',
          }),
        ).rejects.toMatchObject({ category: 'version_conflict' });
      });
    });

    it('updateState — wrong owner throws not_found', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedUser(tx, WRONG_OWNER.ownerId);
        const created = await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        await expect(
          meetingRepo.updateState(WRONG_OWNER, tx, MEETING_ID_A, created.version, {
            state: 'checking',
          }),
        ).rejects.toMatchObject({ category: 'not_found' });
      });
    });

    it('softDelete — marks meeting as deleted', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        const created = await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        const result = await meetingRepo.softDelete(OWNER_A, tx, MEETING_ID_A, created.version);
        expect(result).not.toBeNull();
      });
    });

    it('restore — restores a deleted meeting', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        const created = await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        expect(
          await meetingRepo.softDelete(OWNER_A, tx, MEETING_ID_A, created.version),
        ).not.toBeNull();
        const restored = await meetingRepo.restore(OWNER_A, tx, MEETING_ID_A, 2, 'draft');
        expect(restored).not.toBeNull();
      });
    });
  });

  // ═══════════════════════════════════════════════
  //  AudioRepository (manifests)
  // ═══════════════════════════════════════════════

  describe('AudioRepository', () => {
    const CHUNK_SHA = 'a'.repeat(64);
    const CHUNK_BASE_MS = Date.UTC(2026, 6, 23, 12, 0, 0);

    function makeChunk(index: number, overrides: Record<string, any> = {}): any {
      const startedAt = new Date(CHUNK_BASE_MS + (index + 1) * 30000).toISOString();
      return {
        id: formatChunkId(MEETING_ID_A, 'mic', index),
        meetingId: MEETING_ID_A,
        source: 'mic',
        chunkIndex: index,
        storageKey: `chunks/${MEETING_ID_A}/mic/${index}.webm`,
        startedAt,
        durationMs: 30000,
        byteLength: 5000,
        codec: 'opus',
        container: 'webm',
        sampleRate: 48000,
        channels: 1,
        sha256: CHUNK_SHA,
        uploadStatus: 'pending',
        wallClockStart: startedAt,
        wallClockEnd: new Date(CHUNK_BASE_MS + (index + 2) * 30000).toISOString(),
        monotonicStart: (index + 1) * 30000,
        monotonicEnd: (index + 2) * 30000,
        ...overrides,
      };
    }

    it('registerChunk — creates a new chunk', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        const result = await audioRepo.registerChunk(OWNER_A, tx, makeChunk(0));
        expect(result.created).toBe(true);
      });
    });

    it('registerChunk — idempotent same sha256 returns created=false', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        await audioRepo.registerChunk(OWNER_A, tx, makeChunk(0));
        const result = await audioRepo.registerChunk(OWNER_A, tx, makeChunk(0));
        expect(result.created).toBe(false);
      });
    });

    it('registerChunk — same ID with a different shape preserves the original and conflicts', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        await audioRepo.registerChunk(OWNER_A, tx, makeChunk(0));

        await expect(
          audioRepo.registerChunk(OWNER_A, tx, makeChunk(0, { byteLength: 5001 })),
        ).rejects.toMatchObject({ category: 'conflict' });

        expect(await audioRepo.getChunk(OWNER_A, tx, makeChunk(0).id)).toMatchObject({
          byteLength: 5000,
          sha256: CHUNK_SHA,
        });
      });
    });

    it('registerChunk — different sha256 throws conflict', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        await audioRepo.registerChunk(OWNER_A, tx, makeChunk(0));
        const different = makeChunk(0, { sha256: 'b'.repeat(64) });
        await expect(audioRepo.registerChunk(OWNER_A, tx, different)).rejects.toMatchObject({
          category: 'conflict',
        });
      });
    });

    it('finalizeChunk — finalizes a pending chunk', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        await audioRepo.registerChunk(OWNER_A, tx, makeChunk(0));
        const result = await audioRepo.finalizeChunk(
          OWNER_A,
          tx,
          makeChunk(0).id,
          CHUNK_SHA,
          new Date().toISOString(),
        );
        expect(result.uploadStatus).toBe('completed');
      });
    });

    it('getChunk — returns chunk for correct owner', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        await audioRepo.registerChunk(OWNER_A, tx, makeChunk(0));
        const result = await audioRepo.getChunk(OWNER_A, tx, makeChunk(0).id);
        expect(result).not.toBeNull();
        expect(result!.chunkIndex).toBe(0);
      });
    });

    it('getChunk — returns null for wrong owner', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedUser(tx, WRONG_OWNER.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        await audioRepo.registerChunk(OWNER_A, tx, makeChunk(0));
        const result = await audioRepo.getChunk(WRONG_OWNER, tx, makeChunk(0).id);
        expect(result).toBeNull();
      });
    });

    it('listChunks — paginates chunks for a meeting+source', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        for (let i = 0; i < 3; i++) {
          await audioRepo.registerChunk(OWNER_A, tx, makeChunk(i));
        }

        const page1 = await audioRepo.listChunks(OWNER_A, tx, MEETING_ID_A, 'mic', { limit: 2 });
        expect(page1.items.length).toBe(2);
        expect(page1.nextCursor).not.toBeNull();

        const page2 = await audioRepo.listChunks(OWNER_A, tx, MEETING_ID_A, 'mic', {
          limit: 2,
          cursor: page1.nextCursor!,
        });
        expect(page2.items.length).toBe(1);
        expect(page2.nextCursor).toBeNull();
      });
    });

    it('upsertManifest — inserts and can be updated', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        await audioRepo.upsertManifest(OWNER_A, tx, MEETING_ID_A, 'mic', {
          storageKey: 'manifests/manifest.jsonl',
          sha256: 'c'.repeat(64),
          byteLength: 1000,
          entryCount: 5,
          firstChunkIndex: 0,
          lastChunkIndex: 4,
        });

        const manifest = await audioRepo.getManifest(OWNER_A, tx, MEETING_ID_A, 'mic');
        expect(manifest).not.toBeNull();
        expect(manifest!.entryCount).toBe(5);
      });
    });

    it('createAsset — creates an audio asset', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        const asset = await audioRepo.createAsset(OWNER_A, tx, MEETING_ID_A, {
          source: 'derived_mix',
          label: 'Full Mix',
          storageKey: 'assets/full-mix.webm',
          sha256: 'd'.repeat(64),
          byteLength: 50000,
          derivedFrom: ['mic', 'system'],
          mixVersion: 1,
        });

        expect(asset).not.toBeNull();
        expect(asset.label).toBe('Full Mix');
      });
    });

    it('listAssets — lists assets for a meeting', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        await audioRepo.createAsset(OWNER_A, tx, MEETING_ID_A, {
          source: 'derived_mix',
          label: 'Mix 1',
          storageKey: 'assets/mix1.webm',
          sha256: 'e'.repeat(64),
          byteLength: 50000,
          derivedFrom: ['mic'],
          mixVersion: 1,
        });

        const assets = await audioRepo.listAssets(OWNER_A, tx, MEETING_ID_A);
        expect(assets.length).toBe(1);
      });
    });
  });

  // ═══════════════════════════════════════════════
  //  TranscriptRepository
  // ═══════════════════════════════════════════════

  describe('TranscriptRepository', () => {
    function makeSegment(seq: number, overrides: Record<string, any> = {}): any {
      return {
        id: `seg-${seq}`,
        meetingId: MEETING_ID_A,
        sequence: seq,
        speakerId: 'speaker-1',
        language: 'en',
        text: `Segment ${seq} text`,
        startMs: seq * 10000,
        endMs: (seq + 1) * 10000,
        confidence: 0.95,
        source: 'api',
        provider: 'test-provider',
        providerEventId: `event-${seq}`,
        isGap: false,
        createdAt: new Date(Date.now() + seq * 1000).toISOString(),
        ...overrides,
      };
    }

    it('appendSegments — appends new segments', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        await transcriptRepo.appendSegments(OWNER_A, tx, MEETING_ID_A, [
          makeSegment(0),
          makeSegment(1),
        ]);

        const seg0 = await transcriptRepo.getSegment(OWNER_A, tx, 'seg-0');
        expect(seg0).not.toBeNull();
        expect(seg0!.sequence).toBe(0);

        const seg1 = await transcriptRepo.getSegment(OWNER_A, tx, 'seg-1');
        expect(seg1).not.toBeNull();
      });
    });

    it('appendSegments — duplicate provider event throws duplicate', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        await transcriptRepo.appendSegments(OWNER_A, tx, MEETING_ID_A, [makeSegment(0)]);

        // Same providerEventId but different sequence
        await expect(
          transcriptRepo.appendSegments(OWNER_A, tx, MEETING_ID_A, [
            makeSegment(1, { providerEventId: 'event-0' }),
          ]),
        ).rejects.toMatchObject({ category: 'duplicate' });
      });
    });

    it('getSegment — returns null for wrong owner', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedUser(tx, WRONG_OWNER.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        await transcriptRepo.appendSegments(OWNER_A, tx, MEETING_ID_A, [makeSegment(0)]);
        const result = await transcriptRepo.getSegment(WRONG_OWNER, tx, 'seg-0');
        expect(result).toBeNull();
      });
    });

    it('listSegments — paginates segments for a meeting', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        await transcriptRepo.appendSegments(OWNER_A, tx, MEETING_ID_A, [
          makeSegment(0),
          makeSegment(1),
          makeSegment(2),
        ]);

        const page1 = await transcriptRepo.listSegments(OWNER_A, tx, MEETING_ID_A, { limit: 2 });
        expect(page1.items.length).toBe(2);
        expect(page1.nextCursor).not.toBeNull();
      });
    });

    it('addRevision — creates a revision', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);
        await transcriptRepo.appendSegments(OWNER_A, tx, MEETING_ID_A, [makeSegment(0)]);

        const revision = await transcriptRepo.addRevision(OWNER_A, tx, {
          id: 'rev-1',
          segmentId: 'seg-0',
          baseRevisionId: null,
          revisedText: 'Corrected text',
          actorId: 'user-a',
          reason: 'correction',
          createdAt: NOW,
        });

        expect(revision).not.toBeNull();
        expect(revision.revisedText).toBe('Corrected text');
      });
    });

    it('listRevisions — lists all revisions for a segment', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);
        await transcriptRepo.appendSegments(OWNER_A, tx, MEETING_ID_A, [makeSegment(0)]);

        await transcriptRepo.addRevision(OWNER_A, tx, {
          id: 'rev-1',
          segmentId: 'seg-0',
          baseRevisionId: null,
          revisedText: 'Version 1',
          actorId: 'user-a',
          createdAt: NOW,
        });

        const revisions = await transcriptRepo.listRevisions(OWNER_A, tx, 'seg-0');
        expect(revisions.length).toBe(1);
      });
    });

    it('upsertSpeaker — inserts or updates a speaker', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        const speaker = await transcriptRepo.upsertSpeaker(OWNER_A, tx, {
          id: 'spk-1',
          meetingId: MEETING_ID_A,
          label: 'Speaker 1',
        } as any);

        expect(speaker.label).toBe('Speaker 1');

        // Update display name
        const updated = await transcriptRepo.upsertSpeaker(OWNER_A, tx, {
          id: 'spk-1',
          meetingId: MEETING_ID_A,
          label: 'Speaker 1',
          displayName: 'John Doe',
        } as any);
        expect(updated.displayName).toBe('John Doe');
      });
    });

    it('listSpeakers — lists speakers for a meeting', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        await transcriptRepo.upsertSpeaker(OWNER_A, tx, {
          id: 'spk-1',
          meetingId: MEETING_ID_A,
          label: 'Speaker 1',
        } as any);

        const speakers = await transcriptRepo.listSpeakers(OWNER_A, tx, MEETING_ID_A);
        expect(speakers.length).toBe(1);
      });
    });

    it('upsertTranslation — inserts translation and updates current pointer', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);
        await transcriptRepo.appendSegments(OWNER_A, tx, MEETING_ID_A, [makeSegment(0)]);

        const translation = await transcriptRepo.upsertTranslation(OWNER_A, tx, {
          id: 'trans-1',
          sourceSegmentId: 'seg-0',
          meetingId: MEETING_ID_A,
          targetLanguage: 'vi',
          translatedText: 'Van ban da dich',
          status: 'completed',
          createdAt: NOW,
        } as any);

        expect(translation).not.toBeNull();
        expect(translation.translatedText).toBe('Van ban da dich');

        const current = await transcriptRepo.getCurrentTranslation(OWNER_A, tx, 'seg-0');
        expect(current).not.toBeNull();
        expect(current!.translatedText).toBe('Van ban da dich');
      });
    });

    it('setCompleteness — sets completeness with version check', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        // Create initial completeness
        const initial = await transcriptRepo.setCompleteness(
          OWNER_A,
          tx,
          MEETING_ID_A,
          {
            audioComplete: true,
            transcriptComplete: false,
            gaps: [],
            pendingRanges: [],
          },
          0,
        );
        expect(initial).not.toBeNull();

        // Update with correct version
        const updated = await transcriptRepo.setCompleteness(
          OWNER_A,
          tx,
          MEETING_ID_A,
          {
            audioComplete: true,
            transcriptComplete: true,
            gaps: [],
            pendingRanges: [],
          },
          1,
        );
        expect(updated.transcriptComplete).toBe(true);
      });
    });
  });

  // ═══════════════════════════════════════════════
  //  MinutesRepository
  // ═══════════════════════════════════════════════

  describe('MinutesRepository', () => {
    const DOC_ID = 'doc-1';
    const VER_ID = 'ver-1';

    it('createDocument — creates a minutes document', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        const doc = await minutesRepo.createDocument(OWNER_A, tx, MEETING_ID_A, 'team', DOC_ID);
        expect(doc.id).toBe(DOC_ID);
        expect(doc.template).toBe('team');
      });
    });

    it('createVersion — atomically inserts version, sections, action items, and advances pointer', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);
        await minutesRepo.createDocument(OWNER_A, tx, MEETING_ID_A, 'team', DOC_ID);

        const version = await minutesRepo.createVersion(OWNER_A, tx, {
          id: VER_ID,
          documentId: DOC_ID,
          meetingId: MEETING_ID_A,
          version: 1,
          template: 'team',
          detailLevel: 'detailed',
          outputLanguage: 'en',
          creatorId: OWNER_A.ownerId,
          createdAt: NOW,
          sections: [
            {
              id: 'sec-1',
              heading: 'Key Discussion',
              content: 'Discussed project timeline',
              evidence: [],
            },
          ],
          decisions: [],
          openQuestions: [],
          actionItems: [
            {
              id: 'ai-1',
              description: 'Review timeline',
              status: 'open',
              evidence: [],
            },
          ],
        });

        expect(version).not.toBeNull();
        expect(version.sections.length).toBe(1);
        expect(version.actionItems.length).toBe(1);

        // Check current pointer
        const current = await minutesRepo.getCurrentVersion(OWNER_A, tx, DOC_ID);
        expect(current).not.toBeNull();
        expect(current!.id).toBe(VER_ID);
      });
    });

    it('getVersion — retrieves full version aggregate', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);
        await minutesRepo.createDocument(OWNER_A, tx, MEETING_ID_A, 'team', DOC_ID);
        await minutesRepo.createVersion(OWNER_A, tx, {
          id: VER_ID,
          documentId: DOC_ID,
          meetingId: MEETING_ID_A,
          version: 1,
          template: 'team',
          detailLevel: 'detailed',
          outputLanguage: 'en',
          creatorId: OWNER_A.ownerId,
          createdAt: NOW,
          sections: [
            {
              id: 'sec-1',
              heading: 'Discussion',
              content: 'Content',
              evidence: [],
            },
          ],
          decisions: [],
          openQuestions: [],
          actionItems: [],
        });

        const version = await minutesRepo.getVersion(OWNER_A, tx, VER_ID);
        expect(version).not.toBeNull();
        expect(version!.sections.length).toBe(1);
      });
    });

    it('listVersions — paginates versions', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);
        await minutesRepo.createDocument(OWNER_A, tx, MEETING_ID_A, 'team', DOC_ID);
        await minutesRepo.createVersion(OWNER_A, tx, {
          id: VER_ID,
          documentId: DOC_ID,
          meetingId: MEETING_ID_A,
          version: 1,
          template: 'team',
          detailLevel: 'detailed',
          outputLanguage: 'en',
          creatorId: OWNER_A.ownerId,
          createdAt: NOW,
          sections: [],
          decisions: [],
          openQuestions: [],
          actionItems: [],
        });

        const page = await minutesRepo.listVersions(OWNER_A, tx, DOC_ID, { limit: 10 });
        expect(page.items.length).toBe(1);
      });
    });

    it('upsertBrandPreset — creates a brand preset without expectedVersion', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);

        const preset = await minutesRepo.upsertBrandPreset(OWNER_A, tx, {
          id: 'bp-1',
          name: 'Corporate',
          primaryColor: '#2563EB',
        });

        expect(preset).not.toBeNull();
        expect(preset.name).toBe('Corporate');

        const list = await minutesRepo.listBrandPresets(OWNER_A, tx);
        expect(list.length).toBe(1);
      });
    });

    it('createExportJob and completeExportJob — creates and completes an export', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);
        await minutesRepo.createDocument(OWNER_A, tx, MEETING_ID_A, 'team', DOC_ID);
        await minutesRepo.createVersion(OWNER_A, tx, {
          id: VER_ID,
          documentId: DOC_ID,
          meetingId: MEETING_ID_A,
          version: 1,
          template: 'team',
          detailLevel: 'detailed',
          outputLanguage: 'en',
          creatorId: OWNER_A.ownerId,
          createdAt: NOW,
          sections: [],
          decisions: [],
          openQuestions: [],
          actionItems: [],
        });

        const job = await minutesRepo.createExportJob(OWNER_A, tx, {
          id: 'export-1',
          meetingId: MEETING_ID_A,
          minutesVersionId: VER_ID,
          format: 'pdf',
          status: 'pending',
          createdAt: NOW,
        } as any);
        expect(job).not.toBeNull();

        const completed = await minutesRepo.completeExportJob(OWNER_A, tx, 'export-1', {
          minutesVersionId: VER_ID,
          template: 'team',
          detailLevel: 'detailed',
          outputLanguage: 'en',
          transcriptProjection: 'current',
          format: 'pdf',
          sha256: 'f'.repeat(64),
          byteLength: 1000,
          storageKey: 'https://storage.example.com/exports/report.pdf',
        });
        expect(completed.status).toBe('completed');
      });
    });

    it('getExportJob — returns null for wrong owner', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedUser(tx, WRONG_OWNER.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);
        await minutesRepo.createDocument(OWNER_A, tx, MEETING_ID_A, 'team', DOC_ID);
        await minutesRepo.createVersion(OWNER_A, tx, {
          id: VER_ID,
          documentId: DOC_ID,
          meetingId: MEETING_ID_A,
          version: 1,
          template: 'team',
          detailLevel: 'detailed',
          outputLanguage: 'en',
          creatorId: OWNER_A.ownerId,
          createdAt: NOW,
          sections: [],
          decisions: [],
          openQuestions: [],
          actionItems: [],
        });
        await minutesRepo.createExportJob(OWNER_A, tx, {
          id: 'export-1',
          meetingId: MEETING_ID_A,
          minutesVersionId: VER_ID,
          format: 'pdf',
          status: 'pending',
          createdAt: NOW,
        } as any);

        const result = await minutesRepo.getExportJob(WRONG_OWNER, tx, 'export-1');
        expect(result).toBeNull();
      });
    });

    it('listExportJobs — paginates export jobs for a meeting', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);
        await minutesRepo.createDocument(OWNER_A, tx, MEETING_ID_A, 'team', DOC_ID);
        await minutesRepo.createVersion(OWNER_A, tx, {
          id: VER_ID,
          documentId: DOC_ID,
          meetingId: MEETING_ID_A,
          version: 1,
          template: 'team',
          detailLevel: 'detailed',
          outputLanguage: 'en',
          creatorId: OWNER_A.ownerId,
          createdAt: NOW,
          sections: [],
          decisions: [],
          openQuestions: [],
          actionItems: [],
        });
        await minutesRepo.createExportJob(OWNER_A, tx, {
          id: 'export-1',
          meetingId: MEETING_ID_A,
          minutesVersionId: VER_ID,
          format: 'pdf',
          status: 'pending',
          createdAt: NOW,
        } as any);

        const page = await minutesRepo.listExportJobs(OWNER_A, tx, MEETING_ID_A, { limit: 10 });
        expect(page.items.length).toBe(1);
      });
    });
  });

  // ═══════════════════════════════════════════════
  //  JobsMetadataRepository
  // ═══════════════════════════════════════════════

  describe('JobsMetadataRepository', () => {
    const JOB_ID = 'job-1';

    it('create — creates a job', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        const job = await jobsRepo.create(OWNER_A, tx, {
          id: JOB_ID,
          meetingId: MEETING_ID_A,
          type: 'speech_transcription',
          maxAttempts: 3,
        });

        expect(job.id).toBe(JOB_ID);
        expect(job.state).toBe('pending');
        expect(job.maxAttempts).toBe(3);
      });
    });

    it('get — returns job for correct owner', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);
        await jobsRepo.create(OWNER_A, tx, {
          id: JOB_ID,
          meetingId: MEETING_ID_A,
          type: 'translation',
          maxAttempts: 1,
        });

        const job = await jobsRepo.get(OWNER_A, tx, JOB_ID);
        expect(job).not.toBeNull();
        expect(job!.type).toBe('translation');
      });
    });

    it('get — returns null for wrong owner', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedUser(tx, WRONG_OWNER.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);
        await jobsRepo.create(OWNER_A, tx, {
          id: JOB_ID,
          meetingId: MEETING_ID_A,
          type: 'translation',
          maxAttempts: 1,
        });

        const job = await jobsRepo.get(WRONG_OWNER, tx, JOB_ID);
        expect(job).toBeNull();
      });
    });

    it('list — paginates and filters jobs', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);

        for (let i = 1; i <= 3; i++) {
          await jobsRepo.create(OWNER_A, tx, {
            id: `job-${i}`,
            meetingId: MEETING_ID_A,
            type: 'speech_transcription',
            maxAttempts: 1,
            createdAt: new Date(Date.now() + i * 1000).toISOString(),
          });
        }

        const page1 = await jobsRepo.list(OWNER_A, tx, { limit: 2 });
        expect(page1.items.length).toBe(2);
        expect(page1.nextCursor).not.toBeNull();

        const page2 = await jobsRepo.list(OWNER_A, tx, { limit: 2, cursor: page1.nextCursor! });
        expect(page2.items.length).toBe(1);
        expect(page2.nextCursor).toBeNull();
      });
    });

    it('lease — leases a pending job', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);
        await jobsRepo.create(OWNER_A, tx, {
          id: JOB_ID,
          meetingId: MEETING_ID_A,
          type: 'minutes_generation',
          maxAttempts: 1,
        });

        const leased = await jobsRepo.lease(
          OWNER_A,
          tx,
          JOB_ID,
          'token-123',
          new Date(Date.now() + 60000).toISOString(),
        );
        expect(leased).not.toBeNull();
      });
    });

    it('recordAttempt — records an attempt', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);
        await jobsRepo.create(OWNER_A, tx, {
          id: JOB_ID,
          meetingId: MEETING_ID_A,
          type: 'export',
          maxAttempts: 1,
        });

        await jobsRepo.recordAttempt(OWNER_A, tx, JOB_ID, {
          attempt: 1,
          startedAt: NOW,
          success: false,
          error: { code: 'PROVIDER_TIMEOUT', message: 'Provider timed out' },
        });

        const job = await jobsRepo.get(OWNER_A, tx, JOB_ID);
        expect(job!.attempts.length).toBe(1);
      });
    });

    it('recordProgress — records progress', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);
        await jobsRepo.create(OWNER_A, tx, {
          id: JOB_ID,
          meetingId: MEETING_ID_A,
          type: 'backfill',
          maxAttempts: 1,
        });

        await jobsRepo.recordProgress(OWNER_A, tx, JOB_ID, 50, 'Halfway there');
        // No error expected — progress is append-only
      });
    });

    it('markState — transitions job to completed', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);
        await jobsRepo.create(OWNER_A, tx, {
          id: JOB_ID,
          meetingId: MEETING_ID_A,
          type: 'finalization',
          maxAttempts: 1,
        });

        const completed = await jobsRepo.markState(OWNER_A, tx, JOB_ID, 'completed');
        expect(completed.state).toBe('completed');
      });
    });

    it('markState — throws not_found for wrong owner', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await seedUser(tx, OWNER_A.ownerId);
        await seedUser(tx, WRONG_OWNER.ownerId);
        await seedMeeting(tx, OWNER_A, MEETING_ID_A);
        await jobsRepo.create(OWNER_A, tx, {
          id: JOB_ID,
          meetingId: MEETING_ID_A,
          type: 'finalization',
          maxAttempts: 1,
        });

        await expect(
          jobsRepo.markState(WRONG_OWNER, tx, JOB_ID, 'completed'),
        ).rejects.toMatchObject({ category: 'not_found' });
      });
    });
  });

  // ═══════════════════════════════════════════════
  //  Core infrastructure tests
  // ═══════════════════════════════════════════════

  describe('Core infrastructure', () => {
    it('encodeCursor / decodeCursor — round-trips correctly', () => {
      const now = new Date();
      const id = 'test-id-123';
      const cursor = encodeCursor(now, id);
      const decoded = decodeCursor(cursor);

      expect(decoded.id).toBe(id);
      // Compare timestamps within 1ms tolerance (ISO truncation)
      expect(Math.abs(decoded.createdAt.getTime() - now.getTime())).toBeLessThan(2);
    });

    it('updateWithVersion — throws not_found for non-existent row', async () => {
      await withRollbackTx(testDb, async (tx) => {
        await expect(
          updateWithVersion(
            tx,
            meetings,
            '00000000-0000-0000-0000-000000000099',
            OWNER_A.ownerId,
            1,
            { title: 'New' },
          ),
        ).rejects.toMatchObject({ category: 'not_found' });
      });
    });

    it('DbError — carries category without leaking SQL', () => {
      const err = new DbError('not_found');
      expect(err.category).toBe('not_found');
      expect(err.message).toBe('not_found');
      expect(err.name).toBe('DbError');

      const versionErr = new DbError('version_conflict');
      expect(versionErr.category).toBe('version_conflict');
      // Ensure no SQL or content leaked into the message
      expect(err.message).not.toMatch(/SELECT|UPDATE|DELETE|INSERT|FROM|WHERE/i);
    });

    it('rollback — no writes persist after rollback', async () => {
      // This test verifies that withRollbackTx truly rolls back
      let preCount = 0;
      await testDb.db.transaction(async (tx) => {
        const rows: any[] = await tx.select().from(users);
        preCount = rows.length;
      });

      await withRollbackTx(testDb, async (tx) => {
        await tx.insert(users).values({ id: 'rollback-test-user' });
      });

      let postCount = 0;
      await testDb.db.transaction(async (tx) => {
        const rows: any[] = await tx.select().from(users);
        postCount = rows.length;
      });

      expect(postCount).toBe(preCount);
    });
  });
});
