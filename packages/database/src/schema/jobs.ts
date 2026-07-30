import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  text,
  uuid,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { meetings } from './meeting.js';
import { JobTypeSchema, JobStateSchema } from '@kms/domain';

// ── Enums (values sourced exclusively from P02 — never re-typed literals) ──

export const jobTypeEnum = pgEnum('job_type', [...JobTypeSchema.options]);
export const jobStateEnum = pgEnum('job_state', [...JobStateSchema.options]);

// ── Tables ──

export const jobs = pgTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    type: jobTypeEnum('type').notNull(),
    state: jobStateEnum('state').notNull().default('pending'),
    maxAttempts: integer('max_attempts').notNull(),
    progress: integer('progress'),
    result: jsonb('result'),
    leaseToken: text('lease_token'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    // CHECK constraints per registry
    maxAttemptsPositive: check('jobs_max_attempts_positive', sql`${t.maxAttempts} > 0`),
    progressRange: check(
      'jobs_progress_range',
      sql`${t.progress} IS NULL OR (${t.progress} BETWEEN 0 AND 100)`,
    ),

    // Indexes
    ownerStateCreatedIdx: index('jobs_owner_state_created_idx').on(t.ownerId, t.state, t.createdAt),
    meetingTypeIdx: index('jobs_meeting_type_idx').on(t.meetingId, t.type),
    leaseIdx: index('jobs_lease_idx')
      .on(t.state, t.leaseExpiresAt)
      .where(sql`${t.state} IN ('pending', 'running', 'retrying')`),
  }),
);

export const jobAttempts = pgTable(
  'job_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    attempt: integer('attempt').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    success: boolean('success').notNull(),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
  },
  (t) => ({
    // CHECK constraints per registry
    attemptPositive: check('job_attempts_attempt_positive', sql`${t.attempt} > 0`),

    // Unique and indexes
    jobIdAttemptUnique: uniqueIndex('job_attempts_job_id_attempt_unique').on(t.jobId, t.attempt),
    jobIdAttemptIdx: index('job_attempts_job_id_attempt_idx').on(t.jobId, t.attempt),
  }),
);

export const jobProgress = pgTable(
  'job_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    percent: integer('percent').notNull(),
    message: text('message'),
  },
  (t) => ({
    // CHECK constraint
    percentRange: check('job_progress_percent_range', sql`${t.percent} BETWEEN 0 AND 100`),

    // Indexes
    jobIdRecordedIdx: index('job_progress_job_id_recorded_idx').on(t.jobId, t.recordedAt),
  }),
);
