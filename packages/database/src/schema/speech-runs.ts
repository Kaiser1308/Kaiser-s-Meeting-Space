import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  text,
  uuid,
  integer,
  bigint,
  timestamp,
  jsonb,
  char,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { meetings } from './meeting.js';
import { meetingLanguageEnum } from './meeting.js';
import {
  RunKindSchema,
  RunLocalitySchema,
  RunProviderSchema,
  RunLifecycleStateSchema,
  SpeechEventKindSchema,
} from '@kms/domain';

// ── Enums (values sourced exclusively from @kms/domain — never re-typed literals) ──

export const runKindEnum = pgEnum('run_kind', [...RunKindSchema.options]);
export const runLocalityEnum = pgEnum('run_locality', [...RunLocalitySchema.options]);
export const runProviderEnum = pgEnum('run_provider', [...RunProviderSchema.options]);
export const runLifecycleStateEnum = pgEnum('run_lifecycle_state', [
  ...RunLifecycleStateSchema.options,
]);
export const speechEventKindEnum = pgEnum('speech_event_kind', [...SpeechEventKindSchema.options]);

const hex64Pattern = '^[0-9a-fA-F]{64}$';

// ── Tables ──

export const transcriptRuns = pgTable(
  'transcript_runs',
  {
    id: text('id').primaryKey(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    kind: runKindEnum('kind').notNull(),
    locality: runLocalityEnum('locality').notNull(),
    provider: runProviderEnum('provider').notNull(),
    language: meetingLanguageEnum('language').notNull(),
    sourceId: text('source_id').notNull(),
    policySnapshot: jsonb('policy_snapshot').notNull(),
    planHash: text('plan_hash'),
    lifecycleState: runLifecycleStateEnum('lifecycle_state').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    safeError: jsonb('safe_error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    completedAfterStarted: check(
      'transcript_runs_completed_after_started',
      sql`${t.completedAt} IS NULL OR ${t.completedAt} >= ${t.startedAt}`,
    ),
    planHashHex64: check(
      'transcript_runs_plan_hash_hex64',
      sql`${t.planHash} IS NULL OR (${t.planHash} ~ ${hex64Pattern})`,
    ),
    ownerMeetingIdx: index('transcript_runs_owner_meeting_idx').on(t.ownerId, t.meetingId),
    lifecycleIdx: index('transcript_runs_lifecycle_idx').on(t.lifecycleState),
  }),
);

export const transcriptRunParts = pgTable(
  'transcript_run_parts',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => transcriptRuns.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    index: integer('index').notNull(),
    startMs: bigint('start_ms', { mode: 'number' }).notNull(),
    endMs: bigint('end_ms', { mode: 'number' }).notNull(),
    overlapMs: bigint('overlap_ms', { mode: 'number' }).notNull().default(0),
    locality: runLocalityEnum('locality').notNull(),
    provider: runProviderEnum('provider').notNull(),
    modelId: text('model_id'),
    rawResultHash: char('raw_result_hash', { length: 64 }).notNull(),
    lifecycleState: runLifecycleStateEnum('lifecycle_state').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    safeError: jsonb('safe_error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    endMsGreaterThanStartMs: check(
      'transcript_run_parts_end_gt_start',
      sql`${t.endMs} > ${t.startMs}`,
    ),
    indexNonNegative: check('transcript_run_parts_index_non_negative', sql`${t.index} >= 0`),
    rawResultHashHex64: check(
      'transcript_run_parts_raw_result_hash_hex64',
      sql`${t.rawResultHash} ~ ${hex64Pattern}`,
    ),
    runIndexUnique: uniqueIndex('transcript_run_parts_run_index_unique').on(t.runId, t.index),
    ownerMeetingIdx: index('transcript_run_parts_owner_meeting_idx').on(t.ownerId, t.meetingId),
  }),
);

export const transcriptRawEvents = pgTable(
  'transcript_raw_events',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => transcriptRuns.id, { onDelete: 'cascade' }),
    partId: text('part_id'),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id'),
    eventType: speechEventKindEnum('event_type').notNull(),
    sequenceInPart: integer('sequence_in_part'),
    contentHash: char('content_hash', { length: 64 }).notNull(),
    payload: jsonb('payload').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    contentHashHex64: check(
      'transcript_raw_events_content_hash_hex64',
      sql`${t.contentHash} ~ ${hex64Pattern}`,
    ),
    // Idempotency: identical provider event (same run/part/provider/eventId/type/sequence)
    // may be inserted only once when all dedupe columns are present. Replays of a row
    // with the same content_hash are a no-op; a conflicting content_hash is rejected
    // by the unique index at the persistence layer (P13-T05).
    idempotencyUnique: uniqueIndex('transcript_raw_events_idempotency_unique')
      .on(t.runId, t.partId, t.provider, t.providerEventId, t.eventType, t.sequenceInPart)
      .where(
        sql`${t.partId} IS NOT NULL AND ${t.providerEventId} IS NOT NULL AND ${t.sequenceInPart} IS NOT NULL`,
      ),
    ownerIdx: index('transcript_raw_events_owner_idx').on(t.ownerId),
    meetingIdx: index('transcript_raw_events_meeting_idx').on(t.meetingId),
    runOccurredIdx: index('transcript_raw_events_run_occurred_idx').on(t.runId, t.occurredAt),
  }),
);
