import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  uuid,
  integer,
  real,
  timestamp,
  jsonb,
  char,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { meetings, meetingLanguageEnum } from './meeting.js';
import { translationStatusEnum } from './transcript.js';

const hex64Pattern = '^[0-9a-fA-F]{64}$';

/** Append-only versioned derived translation with full provenance. */
export const translationVersions = pgTable(
  'translation_versions',
  {
    id: text('id').primaryKey(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    sourceSegmentId: text('source_segment_id').notNull(),
    sourceRevision: integer('source_revision').notNull(),
    sourceTextHash: char('source_text_hash', { length: 64 }).notNull(),
    sourceLanguage: meetingLanguageEnum('source_language').notNull(),
    targetLanguage: meetingLanguageEnum('target_language').notNull(),
    translatedText: text('translated_text').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    config: jsonb('config').notNull(),
    promptId: text('prompt_id'),
    status: translationStatusEnum('status').notNull(),
    confidence: real('confidence'),
    usage: jsonb('usage'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    sourceRevisionNonNegative: check('translation_versions_source_revision_non_negative', sql`${t.sourceRevision} >= 0`),
    sourceTextHashHex64: check('translation_versions_source_text_hash_hex64', sql`${t.sourceTextHash} ~ ${hex64Pattern}`),
    confidenceRange: check(
      'translation_versions_confidence_range',
      sql`${t.confidence} IS NULL OR (${t.confidence} >= 0 AND ${t.confidence} <= 1)`,
    ),
    ownerMeetingIdx: index('translation_versions_owner_meeting_idx').on(t.ownerId, t.meetingId),
    segmentRevisionIdx: index('translation_versions_segment_revision_idx').on(t.sourceSegmentId, t.sourceRevision),
    idempotencyUnique: uniqueIndex('translation_versions_idempotency_unique').on(
      t.sourceSegmentId,
      t.sourceRevision,
      t.targetLanguage,
    ),
  }),
);

/** Mutable current-version pointer per source segment (never overwrites history). */
export const translationVersionsCurrent = pgTable(
  'translation_versions_current',
  {
    sourceSegmentId: text('source_segment_id').primaryKey(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    targetLanguage: meetingLanguageEnum('target_language').notNull(),
    currentVersionId: text('current_version_id')
      .notNull()
      .references(() => translationVersions.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    versionPositive: check('translation_versions_current_version_positive', sql`${t.version} > 0`),
    ownerIdx: index('translation_versions_current_owner_idx').on(t.ownerId, t.meetingId),
  }),
);
