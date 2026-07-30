import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  boolean,
  jsonb,
  integer,
  timestamp,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { meetings } from './meeting.js';

export const transcriptCompleteness = pgTable(
  'transcript_completeness',
  {
    meetingId: uuid('meeting_id')
      .primaryKey()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    audioComplete: boolean('audio_complete').notNull(),
    transcriptComplete: boolean('transcript_complete').notNull(),
    diarizationComplete: boolean('diarization_complete'),
    translationComplete: boolean('translation_complete'),
    gaps: jsonb('gaps').notNull().default('[]'),
    pendingRanges: jsonb('pending_ranges').notNull().default('[]'),
    version: integer('version').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    // meetingId is the PK
    versionPositive: check('transcript_completeness_version_positive', sql`${t.version} > 0`),
    ownerIdIdx: index('transcript_completeness_owner_id_idx').on(t.ownerId),
  }),
);
