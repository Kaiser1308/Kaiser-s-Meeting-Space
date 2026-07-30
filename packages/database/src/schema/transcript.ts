import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  text,
  uuid,
  integer,
  boolean,
  bigint,
  doublePrecision,
  timestamp,
  index,
  uniqueIndex,
  foreignKey,
  check,
} from 'drizzle-orm/pg-core';
import { meetings } from './meeting.js';
import { meetingLanguageEnum } from './meeting.js';
import { TranscriptSourceSchema, GapReasonSchema, TranslationStatusSchema } from '@kms/domain';

// ── Enums (values sourced exclusively from P02 — never re-typed literals) ──

export const transcriptSourceEnum = pgEnum('transcript_source', [
  ...TranscriptSourceSchema.options,
]);
export const gapReasonEnum = pgEnum('gap_reason', [...GapReasonSchema.options]);
export const translationStatusEnum = pgEnum('translation_status', [
  ...TranslationStatusSchema.options,
]);

// ── Tables ──

export const transcriptSegments = pgTable(
  'transcript_segments',
  {
    id: text('id').primaryKey(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    sequence: integer('sequence').notNull(),
    speakerId: text('speaker_id').notNull(),
    language: meetingLanguageEnum('language').notNull(),
    text: text('text').notNull(),
    startMs: bigint('start_ms', { mode: 'number' }).notNull(),
    endMs: bigint('end_ms', { mode: 'number' }).notNull(),
    confidence: doublePrecision('confidence'),
    source: transcriptSourceEnum('source').notNull(),
    provider: text('provider'),
    providerEventId: text('provider_event_id'),
    isGap: boolean('is_gap').notNull().default(false),
    gapReason: gapReasonEnum('gap_reason'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => ({
    // CHECK constraints per registry
    endMsGreaterThanStartMs: check(
      'transcript_segments_end_gt_start',
      sql`${t.endMs} > ${t.startMs}`,
    ),
    sequenceNonNegative: check(
      'transcript_segments_sequence_non_negative',
      sql`${t.sequence} >= 0`,
    ),
    confidenceRange: check(
      'transcript_segments_confidence_range',
      sql`${t.confidence} IS NULL OR (${t.confidence} >= 0 AND ${t.confidence} <= 1)`,
    ),
    gapRequiresReason: check(
      'transcript_segments_gap_requires_reason',
      sql`${t.isGap} = false OR ${t.gapReason} IS NOT NULL`,
    ),
    startMsNonNegative: check('transcript_segments_start_ms_non_negative', sql`${t.startMs} >= 0`),

    // Unique index (meetingId, sequence)
    meetingSequenceUnique: uniqueIndex('transcript_segments_meeting_sequence_unique').on(
      t.meetingId,
      t.sequence,
    ),

    // Partial unique index (meetingId, provider, providerEventId) WHERE providerEventId IS NOT NULL
    providerEventPartialUnique: uniqueIndex('transcript_segments_provider_event_partial_unique')
      .on(t.meetingId, t.provider, t.providerEventId)
      .where(sql`${t.providerEventId} IS NOT NULL`),

    // Indexes
    meetingStartMsIdx: index('transcript_segments_meeting_start_ms_idx').on(t.meetingId, t.startMs),
    speakerIdIdx: index('transcript_segments_speaker_id_idx').on(t.speakerId),
    ownerIdIdx: index('transcript_segments_owner_id_idx').on(t.ownerId),
  }),
);

export const transcriptRevisions = pgTable(
  'transcript_revisions',
  {
    id: text('id').primaryKey(),
    segmentId: text('segment_id')
      .notNull()
      .references(() => transcriptSegments.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    baseRevisionId: text('base_revision_id'),
    revisedText: text('revised_text').notNull(),
    revisedSpeakerId: text('revised_speaker_id'),
    actorId: text('actor_id').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => ({
    // Self-referencing FK for baseRevisionId (nullable)
    baseRevisionRef: foreignKey({
      columns: [t.baseRevisionId],
      foreignColumns: [t.id],
    }),
    // Indexes
    segmentCreatedAtIdx: index('transcript_revisions_segment_created_at_idx').on(
      t.segmentId,
      t.createdAt,
    ),
    baseRevisionIdIdx: index('transcript_revisions_base_revision_id_idx').on(t.baseRevisionId),
    ownerIdIdx: index('transcript_revisions_owner_id_idx').on(t.ownerId),
  }),
);

export const speakers = pgTable(
  'speakers',
  {
    id: text('id').primaryKey(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    label: text('label').notNull().default('Unknown Speaker'),
    displayName: text('display_name'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    meetingLabelUnique: uniqueIndex('speakers_meeting_label_unique').on(t.meetingId, t.label),
    meetingIdIdx: index('speakers_meeting_id_idx').on(t.meetingId),
    ownerIdIdx: index('speakers_owner_id_idx').on(t.ownerId),
  }),
);

export const translationSegments = pgTable(
  'translation_segments',
  {
    id: text('id').primaryKey(),
    sourceSegmentId: text('source_segment_id')
      .notNull()
      .references(() => transcriptSegments.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    targetLanguage: meetingLanguageEnum('target_language').notNull(),
    translatedText: text('translated_text').notNull(),
    provider: text('provider'),
    model: text('model'),
    status: translationStatusEnum('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => ({
    sourceSegmentIdIdx: index('translation_segments_source_segment_id_idx').on(t.sourceSegmentId),
    meetingTargetLanguageIdx: index('translation_segments_meeting_target_language_idx').on(
      t.meetingId,
      t.targetLanguage,
    ),
    ownerIdIdx: index('translation_segments_owner_id_idx').on(t.ownerId),
  }),
);

export const translationCurrent = pgTable(
  'translation_current',
  {
    sourceSegmentId: text('source_segment_id')
      .primaryKey()
      .references(() => transcriptSegments.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    currentTranslationId: text('current_translation_id')
      .notNull()
      .references(() => translationSegments.id),
    version: integer('version').notNull(),
  },
  (t) => ({
    versionPositive: check('translation_current_version_positive', sql`${t.version} > 0`),
    ownerIdIdx: index('translation_current_owner_id_idx').on(t.ownerId),
  }),
);
