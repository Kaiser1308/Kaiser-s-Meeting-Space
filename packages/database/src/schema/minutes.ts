import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  text,
  uuid,
  integer,
  boolean,
  bigint,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { meetings } from './meeting.js';
import { meetingLanguageEnum } from './meeting.js';
import { transcriptSegments } from './transcript.js';
import { ALL_TEMPLATES, DetailLevelSchema, ActionItemStatusSchema } from '@kms/domain';

// ── Enums (values sourced exclusively from P02 — never re-typed literals) ──

export const minutesTemplateEnum = pgEnum('minutes_template', [...ALL_TEMPLATES]);
export const detailLevelEnum = pgEnum('detail_level', [...DetailLevelSchema.options]);
export const actionItemStatusEnum = pgEnum('action_item_status', [
  ...ActionItemStatusSchema.options,
]);

// evidence_owner_type is derived from EvidenceRef usage in P02 (section / action_item)
export const evidenceOwnerTypeEnum = pgEnum('evidence_owner_type', ['section', 'action_item']);

// ── Tables ──

// Note: minutesVersions, minutesSections, and actionItems are defined later in
// this file. Lazy arrow-function references (() => Table.column) are used for
// forward-referencing FKs so they resolve at DDL-generation time, not at
// module-evaluation time.
//
// minutesDocuments.currentVersionId FK to minutesVersions.id creates a circular
// type reference (minutesVersions.documentId -> minutesDocuments.id <- currentVersionId).
// The FK is enforced at the DB level via the generated migration SQL; the Drizzle
// type-level reference is omitted to break the cycle.

export const minutesDocuments = pgTable(
  'minutes_documents',
  {
    id: text('id').primaryKey(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    template: minutesTemplateEnum('template').notNull(),
    currentVersionId: text('current_version_id'),
    currentVersion: integer('current_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => ({
    // CHECK constraints per registry
    currentVersionPositive: check(
      'minutes_documents_version_positive',
      sql`${t.currentVersion} > 0`,
    ),

    // Indexes
    meetingIdIdx: index('minutes_documents_meeting_id_idx').on(t.meetingId),
    ownerCreatedIdx: index('minutes_documents_owner_created_idx').on(t.ownerId, t.createdAt),
  }),
);

export const minutesVersions = pgTable(
  'minutes_versions',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => minutesDocuments.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    version: integer('version').notNull(),
    template: minutesTemplateEnum('template').notNull(),
    detailLevel: detailLevelEnum('detail_level').notNull(),
    outputLanguage: meetingLanguageEnum('output_language').notNull(),
    provider: text('provider'),
    model: text('model'),
    promptVersion: text('prompt_version'),
    transcriptProjection: text('transcript_projection').notNull().default('current'),
    isComplete: boolean('is_complete').notNull().default(true),
    creatorId: text('creator_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => ({
    // CHECK constraints per registry
    versionPositive: check('minutes_versions_version_positive', sql`${t.version} > 0`),
    transcriptProjectionValid: check(
      'minutes_versions_transcript_projection_valid',
      sql`${t.transcriptProjection} IN ('source', 'current')`,
    ),

    // Unique (document_id, version)
    documentVersionUnique: uniqueIndex('minutes_versions_document_version_unique').on(
      t.documentId,
      t.version,
    ),

    // Indexes
    meetingIdIdx: index('minutes_versions_meeting_id_idx').on(t.meetingId),
  }),
);

export const minutesSections = pgTable(
  'minutes_sections',
  {
    id: text('id').primaryKey(),
    versionId: text('version_id')
      .notNull()
      .references(() => minutesVersions.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id').notNull(),
    ownerId: text('owner_id').notNull(),
    kind: text('kind').notNull(),
    heading: text('heading').notNull(),
    content: text('content').notNull(),
    orderIndex: integer('order_index').notNull(),
  },
  (t) => ({
    // CHECK constraints per registry
    kindValid: check(
      'minutes_sections_kind_valid',
      sql`${t.kind} IN ('section', 'decisions', 'open_questions')`,
    ),
    orderIndexNonNegative: check(
      'minutes_sections_order_index_non_negative',
      sql`${t.orderIndex} >= 0`,
    ),

    // Indexes
    versionOrderIdx: index('minutes_sections_version_order_idx').on(t.versionId, t.orderIndex),
  }),
);

export const actionItems = pgTable(
  'action_items',
  {
    id: text('id').primaryKey(),
    versionId: text('version_id')
      .notNull()
      .references(() => minutesVersions.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id').notNull(),
    ownerId: text('owner_id').notNull(),
    description: text('description').notNull(),
    owner: text('owner'),
    dueDate: text('due_date'),
    status: actionItemStatusEnum('status').notNull(),
    orderIndex: integer('order_index').notNull(),
  },
  (t) => ({
    // Indexes
    versionIdIdx: index('action_items_version_id_idx').on(t.versionId),
    meetingStatusIdx: index('action_items_meeting_status_idx').on(t.meetingId, t.status),
  }),
);

export const evidenceRefs = pgTable(
  'evidence_refs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    ownerType: evidenceOwnerTypeEnum('owner_type').notNull(),
    sectionId: text('section_id').references(() => minutesSections.id, { onDelete: 'cascade' }),
    actionItemId: text('action_item_id').references(() => actionItems.id, { onDelete: 'cascade' }),
    segmentId: text('segment_id')
      .notNull()
      .references(() => transcriptSegments.id),
    startMs: bigint('start_ms', { mode: 'number' }).notNull(),
    endMs: bigint('end_ms', { mode: 'number' }).notNull(),
    quoteHash: text('quote_hash'),
  },
  (t) => ({
    // CHECK constraints per registry
    exactlyOneOwner: check(
      'evidence_refs_exactly_one_owner',
      sql`(${t.sectionId} IS NOT NULL) <> (${t.actionItemId} IS NOT NULL)`,
    ),
    startMsNonNegative: check('evidence_refs_start_ms_non_negative', sql`${t.startMs} >= 0`),
    endAfterStart: check('evidence_refs_end_after_start', sql`${t.endMs} >= ${t.startMs}`),
    quoteHashFormat: check(
      'evidence_refs_quote_hash_format',
      sql`${t.quoteHash} IS NULL OR ${t.quoteHash} ~ '^[0-9a-fA-F]{64}$'`,
    ),

    // Indexes
    sectionIdIdx: index('evidence_refs_section_id_idx').on(t.sectionId),
    actionItemIdIdx: index('evidence_refs_action_item_id_idx').on(t.actionItemId),
    segmentIdIdx: index('evidence_refs_segment_id_idx').on(t.segmentId),
  }),
);
