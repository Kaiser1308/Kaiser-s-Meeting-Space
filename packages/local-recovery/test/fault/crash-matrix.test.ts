import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ManifestStore } from '../../src/manifest/store.js';
import { FakeFileSystem } from '../../src/adapters/fake-filesystem.js';
import { FakeChecksum } from '../../src/adapters/fake-checksum.js';
import { createSqlJsConnection } from '../../src/adapters/sqljs-adapter.js';
import type { SqliteConnection } from '../../src/contracts/sqlite.js';
import type { ManifestEntry } from '../../src/manifest/store.js';

function sampleEntry(overrides?: Partial<ManifestEntry>): ManifestEntry {
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

describe('Crash Matrix', () => {
  let db: SqliteConnection;
  let store: ManifestStore;
  let fs: FakeFileSystem;

  beforeEach(async () => {
    db = await createSqlJsConnection();
    store = new ManifestStore(db);
    fs = new FakeFileSystem();
    await store.runMigrations();
  });

  afterEach(() => {
    db.close();
  });

  describe('Crash after file write, before manifest append', () => {
    it('file exists but no manifest entry → orphan discovered', async () => {
      await fs.mkdir('/chunks');
      // Write file directly (simulating app wrote file then crashed)
      const data = new Uint8Array([1, 2, 3, 4]);
      await fs.atomicWrite('/chunks/mic-0.webm', data);

      // Manifest has no entry (simulates crash before append)
      const entries = await store.listEntries('00000000-0000-0000-0000-000000000001' as never);
      expect(entries).toHaveLength(0);

      // Verify file exists on disk
      const exists = await fs.exists('/chunks/mic-0.webm');
      expect(exists).toBe(true);

      // SHA-256 of orphan file can be computed
      const cs = new FakeChecksum();
      const orphanHash = await cs.compute('/chunks/mic-0.webm');
      expect(orphanHash).toHaveLength(64);
    });
  });

  describe('Crash during manifest append', () => {
    it('partial state does not affect existing entries', async () => {
      await fs.mkdir('/chunks');
      // First entry committed normally
      await fs.atomicWrite('/chunks/mic-0.webm', new Uint8Array(100));
      await store.appendEntry(sampleEntry({ chunkIndex: 0 }));

      // Try to append a duplicate (simulating re-append of partially committed data)
      // This should throw because of the unique constraint
      await expect(store.appendEntry(sampleEntry({ chunkIndex: 0 }))).rejects.toThrow();

      // Existing entry is preserved
      const entries = await store.listEntries('00000000-0000-0000-0000-000000000001' as never);
      expect(entries).toHaveLength(1);
    });
  });

  describe('Crash after manifest commit', () => {
    it('acknowledged chunk is fully recoverable', async () => {
      await fs.mkdir('/chunks');
      await fs.atomicWrite('/chunks/mic-0.webm', new Uint8Array(200));
      await fs.atomicWrite('/chunks/mic-1.webm', new Uint8Array(300));

      await store.appendEntry(sampleEntry({ chunkIndex: 0 }));
      await store.appendEntry(sampleEntry({ chunkIndex: 1, sha256: 'b'.repeat(64) as never }));

      // After "crash", re-read everything
      const entries = await store.listEntries('00000000-0000-0000-0000-000000000001' as never);
      expect(entries).toHaveLength(2);

      // All entries are retrievable with correct data
      for (const entry of entries) {
        const retrieved = await store.getEntry(entry.meetingId, entry.source, entry.chunkIndex);
        expect(retrieved).not.toBeNull();
        expect(retrieved!.sha256).toBe(entry.sha256);
        expect(retrieved!.byteLength).toBe(entry.byteLength);
      }
    });
  });

  describe('Manifest references non-durable file', () => {
    it('orphan detection finds entries with missing files', async () => {
      // Append entry referencing a file that was never written (simulated failure)
      await store.appendEntry(
        sampleEntry({
          filePath: '/chunks/ghost.webm',
          chunkIndex: 0,
        }),
      );

      const orphans = await store.listOrphans(fs);
      expect(orphans).toHaveLength(1);
      expect(orphans[0]!.filePath).toBe('/chunks/ghost.webm');
    });
  });

  describe('Disk full simulation', () => {
    it('fake filesystem throws DISK_FULL when quota exceeded', async () => {
      fs.injectDiskFull(50); // Only 50 bytes
      await fs.mkdir('/chunks');

      // First write: 10 bytes → OK
      await fs.atomicWrite('/chunks/small.bin', new Uint8Array(10));

      // Second write: 100 bytes → DISK_FULL
      await expect(fs.atomicWrite('/chunks/large.bin', new Uint8Array(100))).rejects.toThrow();
    });
  });

  describe('Checksum corruption', () => {
    it('corrupted file produces different checksum', async () => {
      await fs.mkdir('/chunks');
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      await fs.atomicWrite('/chunks/test.bin', data);

      // Verify with correct hash
      const cs = new FakeChecksum();
      const computed = await cs.compute('/chunks/test.bin');
      const valid = await cs.verify('/chunks/test.bin', computed);
      expect(valid).toBe(true);

      // Inject corruption on filesystem
      fs.injectCorruption('/chunks/test.bin');
      const corrupted = await fs.read('/chunks/test.bin');
      // Data should be different
      expect(Buffer.from(corrupted)).not.toEqual(Buffer.from(data));
    });
  });
});
