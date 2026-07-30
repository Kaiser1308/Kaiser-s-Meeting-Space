import type { SqliteConnection, SqliteRow } from '../contracts/sqlite.js';
import type { MeetingId, AudioSource, Sha256 } from '@kms/domain';
import { QueueError } from '../contracts/errors.js';
import { nextRetryAt } from './backoff.js';

// ── Types ──

export type QueueEntryStatus = 'pending' | 'uploading' | 'completed' | 'failed' | 'cancelled';

export interface QueueEntry {
  readonly id: number;
  readonly meetingId: MeetingId;
  readonly source: AudioSource;
  readonly chunkIndex: number;
  readonly sha256: Sha256;
  readonly byteLength: number;
  readonly storageKey: string;
  readonly status: QueueEntryStatus;
  readonly priority: number;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly nextRetryAt: string | null;
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface QueueConfig {
  readonly maxSize: number;
  readonly maxConcurrent: number;
  readonly maxAttempts: number;
  readonly baseRetryDelayMs: number;
  readonly maxRetryDelayMs: number;
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxSize: 10_000,
  maxConcurrent: 3,
  maxAttempts: 5,
  baseRetryDelayMs: 1000,
  maxRetryDelayMs: 60000,
};

interface QueueRow extends SqliteRow {
  id: number;
  meeting_id: string;
  source: string;
  chunk_index: number;
  sha256: string;
  byte_length: number;
  storage_key: string;
  status: string;
  priority: number;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function rowToEntry(row: QueueRow): QueueEntry {
  return {
    id: row.id,
    meetingId: row.meeting_id as MeetingId,
    source: row.source as AudioSource,
    chunkIndex: row.chunk_index,
    sha256: row.sha256 as Sha256,
    byteLength: row.byte_length,
    storageKey: row.storage_key,
    status: row.status as QueueEntryStatus,
    priority: row.priority,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextRetryAt: row.next_retry_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── UploadQueue ──

export class UploadQueue {
  private config: QueueConfig;

  constructor(
    private readonly db: SqliteConnection,
    config?: Partial<QueueConfig>,
  ) {
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
  }

  /** Initialize the upload queue table. Idempotent. */
  async init(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS upload_queue (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        meeting_id     TEXT    NOT NULL,
        source         TEXT    NOT NULL CHECK(source IN ('mic','system','derived_mix')),
        chunk_index    INTEGER NOT NULL,
        sha256         TEXT    NOT NULL CHECK(length(sha256) = 64),
        byte_length    INTEGER NOT NULL CHECK(byte_length > 0),
        storage_key    TEXT    NOT NULL,
        status         TEXT    NOT NULL DEFAULT 'pending'
                               CHECK(status IN ('pending','uploading','completed','failed','cancelled')),
        priority       INTEGER NOT NULL DEFAULT 0,
        attempt_count  INTEGER NOT NULL DEFAULT 0,
        max_attempts   INTEGER NOT NULL DEFAULT 5,
        next_retry_at  TEXT,
        last_error     TEXT,
        created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        UNIQUE(meeting_id, source, chunk_index)
      );
    `);
    this.db.exec(
      'CREATE INDEX IF NOT EXISTS idx_queue_status ON upload_queue(status, next_retry_at)',
    );
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_queue_meeting ON upload_queue(meeting_id)');
  }

  /** Enqueue a chunk for upload. Throws QueueError if queue is full. */
  async enqueue(entry: {
    meetingId: MeetingId;
    source: AudioSource;
    chunkIndex: number;
    sha256: Sha256;
    byteLength: number;
    storageKey: string;
    priority?: number;
  }): Promise<void> {
    const stats = await this.getStats();
    if (stats.total >= this.config.maxSize) {
      throw new QueueError('queue_full', `Upload queue at capacity: ${this.config.maxSize}`);
    }

    this.db.run(
      `INSERT OR IGNORE INTO upload_queue
       (meeting_id, source, chunk_index, sha256, byte_length, storage_key, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.meetingId,
        entry.source,
        entry.chunkIndex,
        entry.sha256,
        entry.byteLength,
        entry.storageKey,
        entry.priority ?? 0,
      ],
    );
  }

  /** Dequeue the next batch of entries ready for upload (pending + retry-ready). */
  async dequeue(count: number): Promise<QueueEntry[]> {
    const now = new Date().toISOString();

    const rows = this.db.all<QueueRow>(
      `SELECT * FROM upload_queue
       WHERE status = 'pending'
          OR (status = 'failed' AND next_retry_at IS NOT NULL AND next_retry_at <= ?)
       ORDER BY priority DESC, created_at ASC
       LIMIT ?`,
      [now, count],
    );

    for (const row of rows) {
      this.db.run(
        `UPDATE upload_queue SET status = 'uploading', attempt_count = attempt_count + 1,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
        [row.id],
      );
    }

    // Re-read after status update to get updated attempt_count
    const updated: QueueEntry[] = [];
    for (const row of rows) {
      const u = this.db.get<QueueRow>('SELECT * FROM upload_queue WHERE id = ?', [row.id]);
      if (u) updated.push(rowToEntry(u));
    }
    return updated;
  }

  /** Mark entry as completed. */
  async markComplete(entryId: number): Promise<void> {
    const result = this.db.run(
      `UPDATE upload_queue SET status = 'completed',
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`,
      [entryId],
    );

    if (result.changes === 0) {
      throw new QueueError('entry_not_found', `Queue entry ${entryId} not found`);
    }
  }

  /** Mark entry as failed. Computes next retry time using backoff. */
  async markFailed(entryId: number, error: string): Promise<void> {
    const entry = await this.getState(entryId);
    if (!entry) {
      throw new QueueError('entry_not_found', `Queue entry ${entryId} not found`);
    }

    const nextAttempt = entry.attemptCount + 1;
    const nextStatus: QueueEntryStatus = 'failed';
    const nextRetry =
      nextAttempt >= entry.maxAttempts
        ? null
        : nextRetryAt(nextAttempt, this.config.baseRetryDelayMs, this.config.maxRetryDelayMs);

    this.db.run(
      `UPDATE upload_queue SET status = ?, last_error = ?, next_retry_at = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`,
      [nextStatus, error, nextRetry, entryId],
    );
  }

  /** Cancel a single chunk. */
  async cancelChunk(meetingId: MeetingId, source: AudioSource, chunkIndex: number): Promise<void> {
    this.db.run(
      `UPDATE upload_queue SET status = 'cancelled',
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE meeting_id = ? AND source = ? AND chunk_index = ? AND status IN ('pending','uploading','failed')`,
      [meetingId, source, chunkIndex],
    );
  }

  /** Cancel all pending/in-progress chunks for a meeting. */
  async cancelMeeting(meetingId: MeetingId): Promise<void> {
    this.db.run(
      `UPDATE upload_queue SET status = 'cancelled',
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE meeting_id = ? AND status IN ('pending','uploading','failed')`,
      [meetingId],
    );
  }

  /** Get current state of a queue entry. */
  async getState(entryId: number): Promise<QueueEntry | null> {
    const row = this.db.get<QueueRow>('SELECT * FROM upload_queue WHERE id = ?', [entryId]);
    return row ? rowToEntry(row) : null;
  }

  /** Get all pending entries (non-terminal states). */
  async getPending(meetingId?: MeetingId): Promise<QueueEntry[]> {
    let rows: QueueRow[];
    if (meetingId) {
      rows = this.db.all<QueueRow>(
        `SELECT * FROM upload_queue
         WHERE status IN ('pending','uploading','failed')
         AND meeting_id = ?
         ORDER BY priority DESC, created_at ASC`,
        [meetingId],
      );
    } else {
      rows = this.db.all<QueueRow>(
        `SELECT * FROM upload_queue
         WHERE status IN ('pending','uploading','failed')
         ORDER BY priority DESC, created_at ASC`,
      );
    }
    return rows.map(rowToEntry);
  }

  /** Get queue statistics. */
  async getStats(): Promise<{
    total: number;
    pending: number;
    uploading: number;
    completed: number;
    failed: number;
    cancelled: number;
  }> {
    const row = this.db.get<Record<string, number>>(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN status = 'uploading' THEN 1 ELSE 0 END) as uploading,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
         SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
       FROM upload_queue`,
    );

    return {
      total: (row?.total as number) ?? 0,
      pending: (row?.pending as number) ?? 0,
      uploading: (row?.uploading as number) ?? 0,
      completed: (row?.completed as number) ?? 0,
      failed: (row?.failed as number) ?? 0,
      cancelled: (row?.cancelled as number) ?? 0,
    };
  }

  /** Mark all pending/uploading entries as cancelled (for shutdown). */
  async drain(): Promise<void> {
    this.db.run(
      `UPDATE upload_queue SET status = 'cancelled',
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE status IN ('pending','uploading')`,
    );
  }
}
