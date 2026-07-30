import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  index,
  uniqueIndex,
  check,
  jsonb,
} from 'drizzle-orm/pg-core';
import { meetings } from './meeting.js';
import { audioSourceEnum } from './meeting.js';
import { UploadStatusSchema } from '@kms/domain';

// ── Enums (values sourced exclusively from P02) ──

export const uploadStatusEnum = pgEnum('upload_status', [...UploadStatusSchema.options]);

const HEX64 = '^[0-9a-fA-F]{64}$';

// ── Tables ──

export const audioChunks = pgTable(
  'audio_chunks',
  {
    id: text('id').primaryKey(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    source: audioSourceEnum('source').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    storageKey: text('storage_key').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
    durationMs: bigint('duration_ms', { mode: 'number' }).notNull(),
    byteLength: bigint('byte_length', { mode: 'number' }).notNull(),
    codec: text('codec').notNull(),
    container: text('container').notNull(),
    sampleRate: integer('sample_rate').notNull(),
    channels: integer('channels').notNull(),
    sha256: text('sha256').notNull(),
    uploadStatus: uploadStatusEnum('upload_status').notNull(),
    finalizedAt: timestamp('finalized_at', { withTimezone: true, mode: 'date' }),
    wallClockStart: timestamp('wall_clock_start', { withTimezone: true, mode: 'date' }).notNull(),
    wallClockEnd: timestamp('wall_clock_end', { withTimezone: true, mode: 'date' }).notNull(),
    monotonicStart: bigint('monotonic_start', { mode: 'number' }).notNull(),
    monotonicEnd: bigint('monotonic_end', { mode: 'number' }).notNull(),
  },
  (t) => ({
    chunkIndexPositive: check('audio_chunks_chunk_index_positive', sql`${t.chunkIndex} >= 0`),
    byteLengthPositive: check('audio_chunks_byte_length_positive', sql`${t.byteLength} > 0`),
    durationPositive: check('audio_chunks_duration_positive', sql`${t.durationMs} > 0`),
    sampleRateFixed: check('audio_chunks_sample_rate_fixed', sql`${t.sampleRate} = 48000`),
    channelsFixed: check('audio_chunks_channels_fixed', sql`${t.channels} = 1`),
    codecFixed: check('audio_chunks_codec_fixed', sql`${t.codec} = 'opus'`),
    containerFixed: check('audio_chunks_container_fixed', sql`${t.container} = 'webm'`),
    wallClockOrdered: check(
      'audio_chunks_wall_clock_ordered',
      sql`${t.wallClockEnd} >= ${t.wallClockStart}`,
    ),
    monotonicOrdered: check(
      'audio_chunks_monotonic_ordered',
      sql`${t.monotonicEnd} >= ${t.monotonicStart}`,
    ),
    sha256Format: check('audio_chunks_sha256_format', sql`${t.sha256} ~ '${sql.raw(HEX64)}'`),
    meetingSourceIndexUnique: uniqueIndex('audio_chunks_meeting_source_index_unique').on(
      t.meetingId,
      t.source,
      t.chunkIndex,
    ),
    meetingFinalizedIdx: index('audio_chunks_meeting_finalized_idx').on(t.meetingId, t.finalizedAt),
    ownerIdx: index('audio_chunks_owner_idx').on(t.ownerId),
  }),
);

export const audioManifests = pgTable(
  'audio_manifests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    source: audioSourceEnum('source').notNull(),
    storageKey: text('storage_key').notNull(),
    sha256: text('sha256').notNull(),
    byteLength: bigint('byte_length', { mode: 'number' }).notNull(),
    entryCount: integer('entry_count').notNull(),
    firstChunkIndex: integer('first_chunk_index').notNull(),
    lastChunkIndex: integer('last_chunk_index').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    byteLengthPositive: check('audio_manifests_byte_length_positive', sql`${t.byteLength} > 0`),
    entryCountPositive: check('audio_manifests_entry_count_positive', sql`${t.entryCount} >= 0`),
    sha256Format: check('audio_manifests_sha256_format', sql`${t.sha256} ~ '${sql.raw(HEX64)}'`),
    meetingSourceUnique: uniqueIndex('audio_manifests_meeting_source_unique').on(
      t.meetingId,
      t.source,
    ),
    ownerIdx: index('audio_manifests_owner_idx').on(t.ownerId),
  }),
);

// ── Orphan / reconciliation tables (P05-T03, migration 0005) ──

export const audioOrphanStatusEnum = pgEnum('audio_orphan_status', [
  'pending_object',
  'size_mismatch',
  'corrupt_object',
  'missing_completion',
  'reconciled',
  'abandoned',
]);

export const audioReconciliation = pgTable(
  'audio_reconciliation',
  {
    meetingId: uuid('meeting_id')
      .primaryKey()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    version: bigint('version', { mode: 'number' }).notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    versionPositive: check('audio_reconciliation_version_positive', sql`${t.version} > 0`),
    ownerIdx: index('audio_reconciliation_owner_idx').on(t.ownerId),
  }),
);

export const audioOrphanRecords = pgTable(
  'audio_orphan_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    source: audioSourceEnum('source').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    storageKey: text('storage_key').notNull(),
    sha256: text('sha256'),
    byteLength: bigint('byte_length', { mode: 'number' }),
    status: audioOrphanStatusEnum('status').notNull(),
    detectedAt: timestamp('detected_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    statusCheck: check(
      'audio_orphans_status_check',
      sql`${t.status} IN ('pending_object','size_mismatch','corrupt_object','missing_completion','reconciled','abandoned')`,
    ),
    byteLengthPositive: check(
      'audio_orphans_byte_length_positive',
      sql`${t.byteLength} IS NULL OR ${t.byteLength} > 0`,
    ),
    meetingSourceIndexUnique: uniqueIndex('audio_orphan_records_meeting_source_index_unique').on(
      t.meetingId,
      t.source,
      t.chunkIndex,
    ),
    ownerStatusIdx: index('audio_orphan_records_owner_status_idx').on(
      t.ownerId,
      t.status,
      t.detectedAt,
    ),
  }),
);

export const audioAssets = pgTable(
  'audio_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    source: audioSourceEnum('source').notNull(),
    label: text('label').notNull(),
    storageKey: text('storage_key').notNull(),
    sha256: text('sha256').notNull(),
    byteLength: bigint('byte_length', { mode: 'number' }).notNull(),
    derivedFrom: jsonb('derived_from').notNull(),
    mixVersion: integer('mix_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    sourceIsDerived: check('audio_assets_source_is_derived', sql`${t.source} = 'derived_mix'`),
    derivedFromMic: check('audio_assets_derived_from_mic', sql`${t.derivedFrom} ?& array['mic']`),
    byteLengthPositive: check('audio_assets_byte_length_positive', sql`${t.byteLength} > 0`),
    sha256Format: check('audio_assets_sha256_format', sql`${t.sha256} ~ '${sql.raw(HEX64)}'`),
    mixVersionPositive: check('audio_assets_mix_version_positive', sql`${t.mixVersion} > 0`),
    ownerIdx: index('audio_assets_owner_idx').on(t.ownerId),
  }),
);
