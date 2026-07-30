import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ManifestStore } from '../../src/manifest/store.js';
import type { ManifestEntry } from '../../src/manifest/store.js';
import { FakeFileSystem } from '../../src/adapters/fake-filesystem.js';
import { createSqlJsConnection } from '../../src/adapters/sqljs-adapter.js';
import type { SqliteConnection } from '../../src/contracts/sqlite.js';

async function createTestDb(): Promise<SqliteConnection> {
  return createSqlJsConnection();
}

function createSampleEntry(overrides?: Partial<ManifestEntry>): ManifestEntry {
  return {
    meetingId: '00000000-0000-0000-0000-000000000001' as never,
    source: 'mic',
    chunkIndex: 0,
    filePath: '/chunks/mic-0.webm',
    sha256: 'a'.repeat(64) as never,
    byteLength: 1024,
    wallClockStart: '2026-07-24T10:00:00.000Z',
    wallClockEnd: '2026-07-24T10:00:10.000Z',
    monotonicStart: 1000,
    monotonicEnd: 11000,
    sampleRate: 48000 as const,
    channels: 1 as const,
    codec: 'opus' as const,
    container: 'webm' as const,
    durationMs: 10000 as never,
    uploadStatus: 'pending' as const,
    version: 1,
    ...overrides,
  };
}

describe('ManifestStore', () => {
  let db: SqliteConnection;
  let store: ManifestStore;

  beforeEach(async () => {
    db = await createTestDb();
    store = new ManifestStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('schema and migrations', () => {
    it('creates the manifest table on first open', async () => {
      await store.runMigrations();

      const row = db.get<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='manifest_entries'",
      );
      expect(row).toBeTruthy();
    });

    it('returns schema version 1 after initial migration', async () => {
      await store.runMigrations();
      const version = await store.getSchemaVersion();
      expect(version).toBe(1);
    });

    it('runMigrations is idempotent', async () => {
      await store.runMigrations();
      await store.runMigrations();
      const version = await store.getSchemaVersion();
      expect(version).toBe(1);
    });

    it('stores and reads schema version in a version table', async () => {
      await store.runMigrations();
      const row = db.get<{ version: number }>(
        'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
      );
      expect(row).toBeTruthy();
      expect(row!.version).toBe(1);
    });
  });

  describe('appendEntry', () => {
    beforeEach(async () => {
      await store.runMigrations();
    });

    it('appends an entry and makes it retrievable', async () => {
      const entry = createSampleEntry();
      await store.appendEntry(entry);

      const retrieved = await store.getEntry(entry.meetingId, entry.source, entry.chunkIndex);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.sha256).toBe(entry.sha256);
      expect(retrieved!.byteLength).toBe(entry.byteLength);
      expect(retrieved!.chunkIndex).toBe(entry.chunkIndex);
    });

    it('stores wall clock and monotonic times', async () => {
      const entry = createSampleEntry();
      await store.appendEntry(entry);

      const retrieved = await store.getEntry(entry.meetingId, entry.source, 0);
      expect(retrieved!.wallClockStart).toBe('2026-07-24T10:00:00.000Z');
      expect(retrieved!.wallClockEnd).toBe('2026-07-24T10:00:10.000Z');
      expect(retrieved!.monotonicStart).toBe(1000);
      expect(retrieved!.monotonicEnd).toBe(11000);
    });

    it('throws on duplicate (meetingId, source, chunkIndex)', async () => {
      const entry = createSampleEntry();
      await store.appendEntry(entry);
      await expect(store.appendEntry(entry)).rejects.toThrow();
    });

    it('stores multiple entries for different sources', async () => {
      await store.appendEntry(createSampleEntry({ source: 'mic', chunkIndex: 0 }));
      await store.appendEntry(createSampleEntry({ source: 'system', chunkIndex: 0 }));

      const micEntry = await store.getEntry(
        '00000000-0000-0000-0000-000000000001' as never,
        'mic',
        0,
      );
      const sysEntry = await store.getEntry(
        '00000000-0000-0000-0000-000000000001' as never,
        'system',
        0,
      );
      expect(micEntry).not.toBeNull();
      expect(sysEntry).not.toBeNull();
    });

    it('stores sequential chunk indices', async () => {
      await store.appendEntry(createSampleEntry({ chunkIndex: 0 }));
      await store.appendEntry(createSampleEntry({ chunkIndex: 1 }));
      await store.appendEntry(createSampleEntry({ chunkIndex: 2 }));

      const entries = await store.listEntries(
        '00000000-0000-0000-0000-000000000001' as never,
        'mic',
      );
      expect(entries).toHaveLength(3);
      expect(entries.map((e) => e.chunkIndex)).toEqual([0, 1, 2]);
    });
  });

  describe('listEntries', () => {
    beforeEach(async () => {
      await store.runMigrations();
    });

    it('lists all entries for a meeting', async () => {
      await store.appendEntry(createSampleEntry({ source: 'mic', chunkIndex: 0 }));
      await store.appendEntry(createSampleEntry({ source: 'mic', chunkIndex: 1 }));
      await store.appendEntry(createSampleEntry({ source: 'system', chunkIndex: 0 }));

      const all = await store.listEntries('00000000-0000-0000-0000-000000000001' as never);
      expect(all).toHaveLength(3);
    });

    it('filters by source when provided', async () => {
      await store.appendEntry(createSampleEntry({ source: 'mic', chunkIndex: 0 }));
      await store.appendEntry(createSampleEntry({ source: 'system', chunkIndex: 0 }));

      const micEntries = await store.listEntries(
        '00000000-0000-0000-0000-000000000001' as never,
        'mic',
      );
      expect(micEntries).toHaveLength(1);
      expect(micEntries[0]!.source).toBe('mic');
    });

    it('returns empty array for unknown meeting', async () => {
      const entries = await store.listEntries('ffffffff-ffff-ffff-ffff-ffffffffffff' as never);
      expect(entries).toEqual([]);
    });
  });

  describe('listIncomplete', () => {
    beforeEach(async () => {
      await store.runMigrations();
    });

    it('returns entries that are not completed', async () => {
      await store.appendEntry(createSampleEntry({ chunkIndex: 0, uploadStatus: 'pending' }));
      await store.appendEntry(createSampleEntry({ chunkIndex: 1, uploadStatus: 'uploading' }));
      await store.appendEntry(createSampleEntry({ chunkIndex: 2, uploadStatus: 'completed' }));
      await store.appendEntry(createSampleEntry({ chunkIndex: 3, uploadStatus: 'failed' }));

      const incomplete = await store.listIncomplete();
      expect(incomplete).toHaveLength(3); // pending + uploading + failed
      expect(incomplete.every((e) => e.uploadStatus !== 'completed')).toBe(true);
    });
  });

  describe('listMeetings', () => {
    beforeEach(async () => {
      await store.runMigrations();
    });

    it('returns distinct meeting IDs', async () => {
      await store.appendEntry(
        createSampleEntry({ meetingId: 'aaaaaaaa-0000-0000-0000-000000000001' as never }),
      );
      await store.appendEntry(
        createSampleEntry({ meetingId: 'bbbbbbbb-0000-0000-0000-000000000001' as never }),
      );
      await store.appendEntry(
        createSampleEntry({
          meetingId: 'aaaaaaaa-0000-0000-0000-000000000001' as never,
          chunkIndex: 1,
        }),
      );

      const meetings = await store.listMeetings();
      expect(meetings).toHaveLength(2);
    });
  });

  describe('listOrphans', () => {
    beforeEach(async () => {
      await store.runMigrations();
    });

    it('detects entries with missing files', async () => {
      const fs = new FakeFileSystem();
      await store.appendEntry(
        createSampleEntry({ filePath: '/chunks/orphan.webm', chunkIndex: 0 }),
      );
      await store.appendEntry(
        createSampleEntry({ filePath: '/chunks/exists.webm', chunkIndex: 1 }),
      );

      await fs.mkdir('/chunks');
      await fs.atomicWrite('/chunks/exists.webm', new Uint8Array([1]));

      const orphans = await store.listOrphans(fs);
      expect(orphans).toHaveLength(1);
      expect(orphans[0]!.filePath).toBe('/chunks/orphan.webm');
    });
  });

  describe('updateUploadStatus', () => {
    beforeEach(async () => {
      await store.runMigrations();
    });

    it('updates the upload status of an entry', async () => {
      const entry = createSampleEntry();
      await store.appendEntry(entry);
      await store.updateUploadStatus(entry.meetingId, entry.source, 0, 'completed');

      const updated = await store.getEntry(entry.meetingId, entry.source, 0);
      expect(updated!.uploadStatus).toBe('completed');
    });

    it('throws for non-existent entry', async () => {
      await expect(
        store.updateUploadStatus(
          '00000000-0000-0000-0000-000000000001' as never,
          'mic',
          99,
          'completed',
        ),
      ).rejects.toThrow();
    });
  });

  describe('atomic commit', () => {
    beforeEach(async () => {
      await store.runMigrations();
    });

    it('multiple appends maintain consistency', async () => {
      const entry1 = createSampleEntry({ chunkIndex: 0 });
      await store.appendEntry(entry1);

      const entry2 = createSampleEntry({ chunkIndex: 1 });
      await store.appendEntry(entry2);

      const after = await store.listEntries(entry1.meetingId);
      expect(after).toHaveLength(2);
    });

    it('duplicate append leaves state unchanged', async () => {
      const entry = createSampleEntry({ chunkIndex: 0 });
      await store.appendEntry(entry);

      try {
        await store.appendEntry(entry);
      } catch {
        // expected
      }

      const entries = await store.listEntries(entry.meetingId);
      expect(entries).toHaveLength(1);
    });
  });
});
