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

export const finalizationStateEnum = pgEnum('finalization_state', [
  'finalizing',
  'processing',
  'partial_ready',
  'ready',
  'recovery_required',
]);
export const finalizationPrimaryActionEnum = pgEnum('finalization_primary_action', [
  'none',
  'local',
  'cloud',
  'waiting_for_desktop',
  'waiting_for_model',
  'review_required',
]);
export const finalizationRangeClassificationEnum = pgEnum('finalization_range_classification', [
  'verified',
  'missing',
  'corrupt',
  'overlapping',
  'pending',
  'paused',
  'gap',
  'waived',
]);
export const finalizationPartStateEnum = pgEnum('finalization_part_state', [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export const finalizationLocalityEnum = pgEnum('finalization_locality', ['local', 'cloud']);
export const finalizationSourceEnum = pgEnum('finalization_source', ['mic', 'system']);

const hex64Pattern = '^[0-9a-fA-F]{64}$';

export const finalizationManifests = pgTable(
  'finalization_manifests',
  {
    meetingId: uuid('meeting_id')
      .primaryKey()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    manifest: jsonb('manifest').notNull(),
    localManifestHash: char('local_manifest_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    localManifestHashHex64: check(
      'finalization_manifests_local_manifest_hash_hex64',
      sql`${t.localManifestHash} ~ ${hex64Pattern}`,
    ),
    ownerIdx: index('finalization_manifests_owner_idx').on(t.ownerId),
  }),
);

export const finalizationStates = pgTable(
  'finalization_states',
  {
    meetingId: uuid('meeting_id')
      .primaryKey()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    state: finalizationStateEnum('state').notNull(),
    primaryAction: finalizationPrimaryActionEnum('primary_action').notNull(),
    version: integer('version').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    versionPositive: check('finalization_states_version_positive', sql`${t.version} > 0`),
    ownerIdx: index('finalization_states_owner_idx').on(t.ownerId),
  }),
);

/** Durable final-run orchestration (local/cloud), referenced by P16 review. */
export const finalizationRuns = pgTable(
  'finalization_runs',
  {
    id: text('id').primaryKey(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    action: finalizationLocalityEnum('action').notNull(),
    provider: text('provider'),
    planHash: char('plan_hash', { length: 64 }).notNull(),
    state: finalizationPartStateEnum('state').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    planHashHex64: check('finalization_runs_plan_hash_hex64', sql`${t.planHash} ~ ${hex64Pattern}`),
    ownerMeetingIdx: index('finalization_runs_owner_meeting_idx').on(t.ownerId, t.meetingId),
  }),
);

export const finalizationRanges = pgTable(
  'finalization_ranges',
  {
    id: text('id').primaryKey(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    source: finalizationSourceEnum('source').notNull(),
    startMs: bigint('start_ms', { mode: 'number' }).notNull(),
    endMs: bigint('end_ms', { mode: 'number' }).notNull(),
    classification: finalizationRangeClassificationEnum('classification').notNull(),
    actorId: text('actor_id'),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    endMsGreaterThanStartMs: check('finalization_ranges_end_gt_start', sql`${t.endMs} > ${t.startMs}`),
    ownerMeetingIdx: index('finalization_ranges_owner_meeting_idx').on(t.ownerId, t.meetingId),
  }),
);

export const finalizationRunParts = pgTable(
  'finalization_run_parts',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => finalizationRuns.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    partIndex: integer('part_index').notNull(),
    startMs: bigint('start_ms', { mode: 'number' }).notNull(),
    endMs: bigint('end_ms', { mode: 'number' }).notNull(),
    locality: finalizationLocalityEnum('locality').notNull(),
    state: finalizationPartStateEnum('state').notNull(),
    rawResultHash: char('raw_result_hash', { length: 64 }),
    safeError: jsonb('safe_error'),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    endMsGreaterThanStartMs: check('finalization_run_parts_end_gt_start', sql`${t.endMs} > ${t.startMs}`),
    partIndexNonNegative: check('finalization_run_parts_part_index_non_negative', sql`${t.partIndex} >= 0`),
    rawResultHashHex64: check(
      'finalization_run_parts_raw_result_hash_hex64',
      sql`${t.rawResultHash} IS NULL OR (${t.rawResultHash} ~ ${hex64Pattern})`,
    ),
    runPartIndexUnique: uniqueIndex('finalization_run_parts_run_part_index_unique').on(t.runId, t.partIndex),
    ownerMeetingIdx: index('finalization_run_parts_owner_meeting_idx').on(t.ownerId, t.meetingId),
  }),
);
