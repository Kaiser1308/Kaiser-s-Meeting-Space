import { sql } from 'drizzle-orm';
import { pgTable, pgEnum, text, uuid, bigint, timestamp, index, check } from 'drizzle-orm/pg-core';
import { meetings } from './meeting.js';
import { meetingLanguageEnum } from './meeting.js';
import { minutesTemplateEnum, detailLevelEnum } from './minutes.js';
import { minutesVersions } from './minutes.js';
import { brandPresets } from './brand.js';
import { ExportFormatSchema, ExportStatusSchema } from '@kms/domain';

// ── Enums (values sourced exclusively from P02 — never re-typed literals) ──

export const exportFormatEnum = pgEnum('export_format', [...ExportFormatSchema.options]);
export const exportStatusEnum = pgEnum('export_status', [...ExportStatusSchema.options]);

// ── Tables ──

export const exportJobs = pgTable(
  'export_jobs',
  {
    id: text('id').primaryKey(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    minutesVersionId: text('minutes_version_id')
      .notNull()
      .references(() => minutesVersions.id),
    format: exportFormatEnum('format').notNull(),
    brandPresetId: text('brand_preset_id').references(() => brandPresets.id),
    status: exportStatusEnum('status').notNull().default('pending'),
    downloadUrl: text('download_url'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    // Indexes
    meetingIdIdx: index('export_jobs_meeting_id_idx').on(t.meetingId),
    ownerStatusCreatedIdx: index('export_jobs_owner_status_created_idx').on(
      t.ownerId,
      t.status,
      t.createdAt,
    ),
  }),
);

export const exportManifests = pgTable(
  'export_manifests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    exportJobId: text('export_job_id')
      .notNull()
      .references(() => exportJobs.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    minutesVersionId: text('minutes_version_id').notNull(),
    template: minutesTemplateEnum('template').notNull(),
    detailLevel: detailLevelEnum('detail_level').notNull(),
    outputLanguage: meetingLanguageEnum('output_language').notNull(),
    transcriptProjection: text('transcript_projection').notNull(),
    provider: text('provider'),
    model: text('model'),
    promptVersion: text('prompt_version'),
    brandPresetId: text('brand_preset_id'),
    format: exportFormatEnum('format').notNull(),
    sha256: text('sha256').notNull(),
    byteLength: bigint('byte_length', { mode: 'number' }).notNull(),
    storageKey: text('storage_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    // CHECK constraints per registry
    sha256Format: check('export_manifests_sha256_format', sql`${t.sha256} ~ '^[0-9a-fA-F]{64}$'`),
    byteLengthPositive: check('export_manifests_byte_length_positive', sql`${t.byteLength} > 0`),

    // Indexes
    exportJobIdIdx: index('export_manifests_export_job_id_idx').on(t.exportJobId),
  }),
);
