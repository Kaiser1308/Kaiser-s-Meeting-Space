/** Current schema version. Increment when adding migrations. */
export const CURRENT_SCHEMA_VERSION = 1;

/** SQL statements for schema version 1. */
export const MIGRATION_V1 = `
-- Create schema version tracking table
CREATE TABLE IF NOT EXISTS schema_version (
  version   INTEGER PRIMARY KEY,
  name      TEXT    NOT NULL,
  appliedAt TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Create manifest entries table
CREATE TABLE IF NOT EXISTS manifest_entries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id      TEXT    NOT NULL,
  source          TEXT    NOT NULL CHECK(source IN ('mic','system','derived_mix')),
  chunk_index     INTEGER NOT NULL,
  file_path       TEXT    NOT NULL,
  sha256          TEXT    NOT NULL CHECK(length(sha256) = 64),
  byte_length     INTEGER NOT NULL CHECK(byte_length > 0),
  wall_clock_start TEXT    NOT NULL,
  wall_clock_end  TEXT    NOT NULL,
  monotonic_start REAL    NOT NULL,
  monotonic_end   REAL    NOT NULL,
  sample_rate     INTEGER NOT NULL CHECK(sample_rate = 48000),
  channels        INTEGER NOT NULL CHECK(channels = 1),
  codec           TEXT    NOT NULL CHECK(codec = 'opus'),
  container       TEXT    NOT NULL CHECK(container = 'webm'),
  duration_ms     INTEGER NOT NULL CHECK(duration_ms > 0),
  upload_status   TEXT    NOT NULL DEFAULT 'pending'
                          CHECK(upload_status IN ('pending','uploading','completed','failed')),
  version         INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  UNIQUE(meeting_id, source, chunk_index)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_manifest_meeting ON manifest_entries(meeting_id, source);
CREATE INDEX IF NOT EXISTS idx_manifest_upload_status ON manifest_entries(upload_status);
CREATE INDEX IF NOT EXISTS idx_manifest_meeting_source_chunk ON manifest_entries(meeting_id, source, chunk_index);
`;

/** All migrations in version order. */
export const MIGRATIONS: Array<{ version: number; name: string; up: string }> = [
  { version: 1, name: 'initial-manifest-schema', up: MIGRATION_V1 },
];
