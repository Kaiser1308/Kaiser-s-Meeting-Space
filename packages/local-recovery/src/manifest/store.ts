import type { SqliteConnection, SqliteRow } from '../contracts/sqlite.js';
import { MIGRATIONS } from './schema.js';
import { ManifestError } from '../contracts/errors.js';
import type { FileSystem } from '../contracts/filesystem.js';
import type { AudioSource, MeetingId, Sha256, Milliseconds } from '@kms/domain';

export interface ManifestEntry {
  readonly meetingId: MeetingId;
  readonly source: AudioSource;
  readonly chunkIndex: number;
  readonly filePath: string;
  readonly sha256: Sha256;
  readonly byteLength: number;
  readonly wallClockStart: string;
  readonly wallClockEnd: string;
  readonly monotonicStart: number;
  readonly monotonicEnd: number;
  readonly sampleRate: 48000;
  readonly channels: 1;
  readonly codec: 'opus';
  readonly container: 'webm';
  readonly durationMs: Milliseconds;
  readonly uploadStatus: 'pending' | 'uploading' | 'completed' | 'failed';
  readonly version: number;
}

interface ManifestRow extends SqliteRow {
  id: number;
  meeting_id: string;
  source: string;
  chunk_index: number;
  file_path: string;
  sha256: string;
  byte_length: number;
  wall_clock_start: string;
  wall_clock_end: string;
  monotonic_start: number;
  monotonic_end: number;
  sample_rate: number;
  channels: number;
  codec: string;
  container: string;
  duration_ms: number;
  upload_status: string;
  version: number;
}

function rowToEntry(row: ManifestRow): ManifestEntry {
  return {
    meetingId: row.meeting_id as MeetingId,
    source: row.source as AudioSource,
    chunkIndex: row.chunk_index,
    filePath: row.file_path,
    sha256: row.sha256 as Sha256,
    byteLength: row.byte_length,
    wallClockStart: row.wall_clock_start,
    wallClockEnd: row.wall_clock_end,
    monotonicStart: row.monotonic_start,
    monotonicEnd: row.monotonic_end,
    sampleRate: row.sample_rate as 48000,
    channels: row.channels as 1,
    codec: row.codec as 'opus',
    container: row.container as 'webm',
    durationMs: row.duration_ms as Milliseconds,
    uploadStatus: row.upload_status as ManifestEntry['uploadStatus'],
    version: row.version,
  };
}

export class ManifestStore {
  constructor(private readonly db: SqliteConnection) {}

  /** Run all pending migrations. Idempotent. */
  async runMigrations(): Promise<number[]> {
    const applied: number[] = [];

    // Ensure schema_version table exists (pre-migration check)
    this.db.exec('PRAGMA foreign_keys=ON');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version   INTEGER PRIMARY KEY,
        name      TEXT    NOT NULL,
        appliedAt TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
    `);

    for (const migration of MIGRATIONS) {
      const existing = this.db.get<{ version: number }>(
        'SELECT version FROM schema_version WHERE version = ?',
        [migration.version],
      );

      if (!existing) {
        // Run migration statements one by one (sql.js doesn't support multi-statement exec well)
        const statements = migration.up
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        for (const stmt of statements) {
          this.db.exec(stmt);
        }
        this.db.run('INSERT OR IGNORE INTO schema_version (version, name) VALUES (?, ?)', [
          migration.version,
          migration.name,
        ]);
        applied.push(migration.version);
      }
    }

    return applied;
  }

  /** Get current schema version. */
  async getSchemaVersion(): Promise<number> {
    try {
      const row = this.db.get<{ version: number | null }>(
        'SELECT MAX(version) as version FROM schema_version',
      );
      return row?.version ?? 0;
    } catch {
      return 0;
    }
  }

  /** Append a new manifest entry. */
  async appendEntry(entry: ManifestEntry): Promise<void> {
    const existing = this.db.get<{ id: number }>(
      'SELECT id FROM manifest_entries WHERE meeting_id = ? AND source = ? AND chunk_index = ?',
      [entry.meetingId, entry.source, entry.chunkIndex],
    );

    if (existing) {
      throw new ManifestError(
        'duplicate_entry',
        `Entry already exists: ${entry.meetingId}/${entry.source}/${entry.chunkIndex}`,
      );
    }

    this.db.run(
      `INSERT INTO manifest_entries (
         meeting_id, source, chunk_index, file_path,
         sha256, byte_length, wall_clock_start, wall_clock_end,
         monotonic_start, monotonic_end, sample_rate, channels,
         codec, container, duration_ms, upload_status, version
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.meetingId,
        entry.source,
        entry.chunkIndex,
        entry.filePath,
        entry.sha256,
        entry.byteLength,
        entry.wallClockStart,
        entry.wallClockEnd,
        entry.monotonicStart,
        entry.monotonicEnd,
        entry.sampleRate,
        entry.channels,
        entry.codec,
        entry.container,
        entry.durationMs,
        entry.uploadStatus,
        entry.version,
      ],
    );
  }

  /** Get a single entry by (meetingId, source, chunkIndex). */
  async getEntry(
    meetingId: MeetingId,
    source: AudioSource,
    chunkIndex: number,
  ): Promise<ManifestEntry | null> {
    const row = this.db.get<ManifestRow>(
      'SELECT * FROM manifest_entries WHERE meeting_id = ? AND source = ? AND chunk_index = ?',
      [meetingId, source, chunkIndex],
    );
    return row ? rowToEntry(row) : null;
  }

  /** List all entries for a meeting, optionally filtered by source. */
  async listEntries(meetingId: MeetingId, source?: AudioSource): Promise<ManifestEntry[]> {
    let rows: ManifestRow[];
    if (source) {
      rows = this.db.all<ManifestRow>(
        'SELECT * FROM manifest_entries WHERE meeting_id = ? AND source = ? ORDER BY chunk_index',
        [meetingId, source],
      );
    } else {
      rows = this.db.all<ManifestRow>(
        'SELECT * FROM manifest_entries WHERE meeting_id = ? ORDER BY source, chunk_index',
        [meetingId],
      );
    }
    return rows.map(rowToEntry);
  }

  /** List all entries that are not fully uploaded. */
  async listIncomplete(meetingId?: MeetingId): Promise<ManifestEntry[]> {
    let rows: ManifestRow[];
    if (meetingId) {
      rows = this.db.all<ManifestRow>(
        "SELECT * FROM manifest_entries WHERE upload_status != 'completed' AND meeting_id = ? ORDER BY source, chunk_index",
        [meetingId],
      );
    } else {
      rows = this.db.all<ManifestRow>(
        "SELECT * FROM manifest_entries WHERE upload_status != 'completed' ORDER BY meeting_id, source, chunk_index",
      );
    }
    return rows.map(rowToEntry);
  }

  /** List all distinct meeting IDs in the manifest. */
  async listMeetings(): Promise<MeetingId[]> {
    const rows = this.db.all<{ meeting_id: string }>(
      'SELECT DISTINCT meeting_id FROM manifest_entries ORDER BY meeting_id',
    );
    return rows.map((r) => r.meeting_id as MeetingId);
  }

  /** List entries whose file paths do not exist on the given filesystem. */
  async listOrphans(fs: FileSystem): Promise<ManifestEntry[]> {
    const allRows = this.db.all<ManifestRow>(
      'SELECT * FROM manifest_entries ORDER BY meeting_id, source, chunk_index',
    );

    const orphans: ManifestEntry[] = [];
    for (const row of allRows) {
      if (!(await fs.exists(row.file_path))) {
        orphans.push(rowToEntry(row));
      }
    }
    return orphans;
  }

  /** Update upload status for an entry. */
  async updateUploadStatus(
    meetingId: MeetingId,
    source: AudioSource,
    chunkIndex: number,
    status: ManifestEntry['uploadStatus'],
  ): Promise<void> {
    const result = this.db.run(
      `UPDATE manifest_entries
       SET upload_status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE meeting_id = ? AND source = ? AND chunk_index = ?`,
      [status, meetingId, source, chunkIndex],
    );

    if (result.changes === 0) {
      throw new ManifestError(
        'entry_not_found',
        `Entry not found: ${meetingId}/${source}/${chunkIndex}`,
      );
    }
  }

  /** Close the underlying database connection. */
  async close(): Promise<void> {
    this.db.close();
  }
}
