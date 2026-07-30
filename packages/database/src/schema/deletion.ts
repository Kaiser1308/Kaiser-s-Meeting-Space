import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { meetings } from './meeting.js';

// ── Storage-only enums (not in P02 domain; P22 lifecycle) ──

const DELETION_STATES = ['pending', 'in_progress', 'completed', 'failed'] as const;
export const deletionStateEnum = pgEnum('deletion_state', [...DELETION_STATES]);

const DELETION_STEP_STATUSES = ['pending', 'running', 'completed', 'failed', 'skipped'] as const;
export const deletionStepStatusEnum = pgEnum('deletion_step_status', [...DELETION_STEP_STATUSES]);

// ── Tables ──

export const deletionTombstones = pgTable(
  'deletion_tombstones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'restrict' }),
    ownerId: text('owner_id').notNull(),
    state: deletionStateEnum('state').notNull().default('pending'),
    requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    // One tombstone per meeting
    meetingIdUnique: uniqueIndex('deletion_tombstones_meeting_id_unique').on(t.meetingId),

    // Indexes
    ownerStateIdx: index('deletion_tombstones_owner_state_idx').on(t.ownerId, t.state),
  }),
);

export const deletionSteps = pgTable(
  'deletion_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tombstoneId: uuid('tombstone_id')
      .notNull()
      .references(() => deletionTombstones.id, { onDelete: 'cascade' }),
    step: text('step').notNull(),
    status: deletionStepStatusEnum('status').notNull().default('pending'),
    attempt: integer('attempt').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    errorCode: text('error_code'),
  },
  (t) => ({
    // Idempotent step completion
    tombstoneIdStepUnique: uniqueIndex('deletion_steps_tombstone_id_step_unique').on(
      t.tombstoneId,
      t.step,
    ),

    // Indexes
    tombstoneIdStatusIdx: index('deletion_steps_tombstone_id_status_idx').on(
      t.tombstoneId,
      t.status,
    ),
  }),
);
