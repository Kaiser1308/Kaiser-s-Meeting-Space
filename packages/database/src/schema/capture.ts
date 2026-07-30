import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  bigint,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { meetings } from './meeting.js';
import { audioSourceEnum } from './meeting.js';
import { PauseIntervalSchema, GapMarkerSchema } from '@kms/domain';

// ── Enums (values sourced exclusively from P02) ──

// GapMarkerSchema is `z.object(...).strict().refine(...)` (a ZodEffects wrapper),
// so its inner object shape is reached via _def.schema. PauseIntervalSchema is a
// plain strict object and exposes .shape directly. Both read P02 data, no literals duplicated.
type Literal<T extends string> = { value: T };
type EnumOptions<T extends readonly string[]> = { options: T };
const gapMarkerShape = (
  GapMarkerSchema as unknown as {
    _def: {
      schema: {
        shape: {
          type: Literal<'gap'>;
          description: EnumOptions<
            readonly ['source_disconnect', 'buffer_overflow', 'crash_recovery']
          >;
        };
      };
    };
  }
)._def.schema.shape;

// Timeline marker type is the discriminator of the P02 TimelineEvent union
// (PauseInterval.type literal 'pause' ∪ GapMarker.type literal 'gap').
const TIMELINE_MARKER_TYPES = [
  PauseIntervalSchema.shape.type.value,
  gapMarkerShape.type.value,
] as const;

export const timelineMarkerTypeEnum = pgEnum('timeline_marker_type', [...TIMELINE_MARKER_TYPES]);
export const audioGapDescriptionEnum = pgEnum('audio_gap_description', [
  ...gapMarkerShape.description.options,
]);

// ── Tables ──

export const captureIntervals = pgTable(
  'capture_intervals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    source: audioSourceEnum('source').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
    monotonicStart: bigint('monotonic_start', { mode: 'number' }).notNull(),
    monotonicEnd: bigint('monotonic_end', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    endedAfterStarted: check(
      'capture_intervals_ended_after_started',
      sql`${t.endedAt} IS NULL OR ${t.endedAt} >= ${t.startedAt}`,
    ),
    monotonicOrdered: check(
      'capture_intervals_monotonic_ordered',
      sql`${t.monotonicEnd} IS NULL OR ${t.monotonicEnd} >= ${t.monotonicStart}`,
    ),
    meetingSourceStartedIdx: index('capture_intervals_meeting_source_started_idx').on(
      t.meetingId,
      t.source,
      t.startedAt,
    ),
    ownerIdx: index('capture_intervals_owner_idx').on(t.ownerId),
  }),
);

export const timelineMarkers = pgTable(
  'timeline_markers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    source: audioSourceEnum('source').notNull(),
    markerType: timelineMarkerTypeEnum('marker_type').notNull(),
    description: audioGapDescriptionEnum('description'),
    startMs: bigint('start_ms', { mode: 'number' }).notNull(),
    endMs: bigint('end_ms', { mode: 'number' }).notNull(),
    durationMs: bigint('duration_ms', { mode: 'number' }).notNull(),
  },
  (t) => ({
    startMsPositive: check('timeline_markers_start_ms_positive', sql`${t.startMs} >= 0`),
    endAfterStart: check('timeline_markers_end_after_start', sql`${t.endMs} >= ${t.startMs}`),
    durationPositive: check('timeline_markers_duration_positive', sql`${t.durationMs} > 0`),
    markerTypeDescription: check(
      'timeline_markers_marker_type_description',
      sql`${t.markerType} = 'pause' OR (${t.markerType} = 'gap' AND ${t.description} IS NOT NULL)`,
    ),
    uniqueEvent: uniqueIndex('timeline_markers_unique_event_idx').on(
      t.meetingId,
      t.source,
      t.markerType,
      t.startMs,
    ),
    ownerIdx: index('timeline_markers_owner_idx').on(t.ownerId),
  }),
);
