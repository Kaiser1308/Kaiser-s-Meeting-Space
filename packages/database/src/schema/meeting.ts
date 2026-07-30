import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import {
  MeetingLanguageSchema,
  MeetingModeSchema,
  AudioSourceSchema,
  SpeechModeSchema,
  DEFAULT_CAPTURE_PROFILE,
  MEETING_STATES,
} from '@kms/domain';

// ── Enums (values sourced exclusively from P02 — never re-typed literals) ──

export const meetingLanguageEnum = pgEnum('meeting_language', [...MeetingLanguageSchema.options]);
export const meetingModeEnum = pgEnum('meeting_mode', [...MeetingModeSchema.options]);
export const meetingStateEnum = pgEnum('meeting_state', [...MEETING_STATES]);
export const speechModeEnum = pgEnum(
  'speech_mode',
  // SpeechModeSchema is wrapped in `.default('api')`; unwrap to read the enum options.
  [...SpeechModeSchema.removeDefault().options],
);
export const audioSourceEnum = pgEnum('audio_source', [...AudioSourceSchema.options]);

// ── Tables ──

export const meetings = pgTable(
  'meetings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    title: text('title').notNull(),
    language: meetingLanguageEnum('language').notNull(),
    mode: meetingModeEnum('mode').notNull(),
    speechMode: speechModeEnum('speech_mode').notNull().default('api'),
    // Additive policy snapshot. Legacy rows remain null and must not imply consent.
    transcriptionPolicy: jsonb('transcription_policy'),
    timezone: text('timezone').notNull(),
    version: integer('version').notNull(),
    state: meetingStateEnum('state').notNull().default('draft'),
    captureProfile: jsonb('capture_profile').notNull().default(DEFAULT_CAPTURE_PROFILE),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    versionPositive: check('meetings_version_positive', sql`${t.version} > 0`),
    titleLength: check('meetings_title_length', sql`char_length(${t.title}) BETWEEN 1 AND 500`),
    endedRequiresStarted: check(
      'meetings_ended_requires_started',
      sql`${t.endedAt} IS NULL OR ${t.startedAt} IS NOT NULL`,
    ),
    endedAfterStarted: check(
      'meetings_ended_after_started',
      sql`${t.endedAt} IS NULL OR ${t.startedAt} IS NULL OR ${t.endedAt} >= ${t.startedAt}`,
    ),
    ownerCreatedIdx: index('meetings_owner_created_idx').on(t.ownerId, t.createdAt, t.id),
    ownerStateIdx: index('meetings_owner_state_idx').on(t.ownerId, t.state),
    idOwnerIdx: index('meetings_id_owner_idx').on(t.id, t.ownerId),
  }),
);

export const meetingCaptureSources = pgTable(
  'meeting_capture_sources',
  {
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    source: audioSourceEnum('source').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.meetingId, t.source] }),
    sourceIsCapturable: check(
      'meeting_capture_sources_source_capturable',
      sql`${t.source} IN ('mic', 'system')`,
    ),
  }),
);
