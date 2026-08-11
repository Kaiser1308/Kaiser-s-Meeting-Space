import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  char,
  index,
  uniqueIndex,
  boolean,
  foreignKey,
  check,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { meetings } from './meeting.js';
import { transcriptSegments } from './transcript.js';

const lineageColumns = {
  meetingId: uuid('meeting_id')
    .notNull()
    .references(() => meetings.id, { onDelete: 'restrict' }),
  ownerId: text('owner_id').notNull(),
  segmentId: text('segment_id')
    .notNull()
    .references(() => transcriptSegments.id, { onDelete: 'restrict' }),
  baseProjectionVersion: integer('base_projection_version').notNull(),
  actorId: text('actor_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
};

export const transcriptReviewProjections = pgTable(
  'transcript_review_projections',
  {
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'restrict' }),
    ownerId: text('owner_id').notNull(),
    version: integer('version').notNull().default(0),
    finalizationManifestHash: char('finalization_manifest_hash', { length: 64 }),
    audioManifestHash: char('audio_manifest_hash', { length: 64 }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    ownerMeetingPrimaryKey: primaryKey({ columns: [t.ownerId, t.meetingId] }),
    ownerMeetingUnique: uniqueIndex('transcript_review_projections_owner_meeting_unique').on(
      t.ownerId,
      t.meetingId,
    ),
    versionNonnegative: check(
      'transcript_review_projections_version_nonnegative',
      sql`${t.version} >= 0`,
    ),
  }),
);

// Compatibility names used by the repository contract: the current projection
// row is the owner/meeting lineage anchor for append-only review history.
export const transcriptReviewCurrent = transcriptReviewProjections;
export const transcriptReviewLineage = pgTable(
  'transcript_review_lineage',
  {
    id: text('id').primaryKey(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'restrict' }),
    ownerId: text('owner_id').notNull(),
    runId: text('run_id').notNull(),
    partId: text('part_id').notNull(),
    eventId: text('event_id').notNull(),
    sourceSegmentId: text('source_segment_id')
      .notNull()
      .references(() => transcriptSegments.id, { onDelete: 'restrict' }),
    finalizationManifestHash: char('finalization_manifest_hash', { length: 64 }).notNull(),
    audioManifestHash: char('audio_manifest_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    ownerMeetingSegmentUnique: uniqueIndex(
      'transcript_review_lineage_owner_meeting_segment_unique',
    ).on(t.ownerId, t.meetingId, t.sourceSegmentId),
  }),
);

export const transcriptReviewDecisions = pgTable(
  'transcript_review_decisions',
  {
    id: text('id').primaryKey(),
    ...lineageColumns,
    alternativeId: text('alternative_id').notNull(),
    baseDecisionId: text('base_decision_id'),
  },
  (t) => ({
    ownerMeetingSegmentIdx: index('transcript_review_decisions_owner_meeting_segment_idx').on(
      t.ownerId,
      t.meetingId,
      t.segmentId,
    ),
    ownerKeyUnique: uniqueIndex('transcript_review_decisions_owner_key_unique').on(
      t.ownerId,
      t.idempotencyKey,
    ),
    baseVersionNonnegative: check(
      'transcript_review_decisions_base_version_nonnegative',
      sql`${t.baseProjectionVersion} >= 0`,
    ),
    baseDecisionFk: foreignKey({ columns: [t.baseDecisionId], foreignColumns: [t.id] }),
  }),
);

export const transcriptReviewRevisions = pgTable(
  'transcript_review_revisions',
  {
    id: text('id').primaryKey(),
    ...lineageColumns,
    baseRevisionId: text('base_revision_id'),
    revisedText: text('revised_text').notNull(),
    revisedSpeakerId: text('revised_speaker_id'),
    reason: text('reason'),
  },
  (t) => ({
    ownerMeetingSegmentIdx: index('transcript_review_revisions_owner_meeting_segment_idx').on(
      t.ownerId,
      t.meetingId,
      t.segmentId,
    ),
    ownerKeyUnique: uniqueIndex('transcript_review_revisions_owner_key_unique').on(
      t.ownerId,
      t.idempotencyKey,
    ),
    baseVersionNonnegative: check(
      'transcript_review_revisions_base_version_nonnegative',
      sql`${t.baseProjectionVersion} >= 0`,
    ),
    baseRevisionFk: foreignKey({ columns: [t.baseRevisionId], foreignColumns: [t.id] }),
  }),
);

export const transcriptReviewIdempotency = pgTable(
  'transcript_review_idempotency',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id').notNull(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'restrict' }),
    commandType: text('command_type').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    result: jsonb('result').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    ownerCommandKeyUnique: uniqueIndex('transcript_review_idempotency_owner_command_key_unique').on(
      t.ownerId,
      t.commandType,
      t.idempotencyKey,
    ),
    ownerMeetingIdx: index('transcript_review_idempotency_owner_meeting_idx').on(
      t.ownerId,
      t.meetingId,
    ),
  }),
);

export const transcriptReviewBookmarks = pgTable(
  'transcript_review_bookmarks',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'restrict' }),
    segmentId: text('segment_id')
      .notNull()
      .references(() => transcriptSegments.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    ownerSegmentUnique: uniqueIndex('transcript_review_bookmarks_owner_segment_unique').on(
      t.ownerId,
      t.segmentId,
    ),
    ownerMeetingIdx: index('transcript_review_bookmarks_owner_meeting_idx').on(
      t.ownerId,
      t.meetingId,
    ),
  }),
);

export const transcriptReviewFlags = pgTable(
  'transcript_review_flags',
  {
    ownerId: text('owner_id').notNull(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'restrict' }),
    segmentId: text('segment_id')
      .notNull()
      .references(() => transcriptSegments.id, { onDelete: 'restrict' }),
    disagreement: boolean('disagreement').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    ownerSegmentPrimaryKey: primaryKey({ columns: [t.ownerId, t.segmentId] }),
    ownerMeetingIdx: index('transcript_review_flags_owner_meeting_idx').on(t.ownerId, t.meetingId),
  }),
);
