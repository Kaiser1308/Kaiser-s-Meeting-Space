import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  uuid,
  integer,
  timestamp,
  jsonb,
  char,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { meetings, meetingLanguageEnum } from './meeting.js';

const hex64Pattern = '^[0-9a-fA-F]{64}$';

/** Immutable minutes generation provenance (provider/model/prompt/schema/config/usage/evaluation). */
export const minutesProvenance = pgTable(
  'minutes_provenance',
  {
    id: text('id').primaryKey(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    projectionVersion: integer('projection_version').notNull(),
    completenessVersion: integer('completeness_version').notNull(),
    templateId: text('template_id').notNull(),
    templateVersion: integer('template_version').notNull(),
    detailLevel: text('detail_level').notNull(),
    outputLanguage: meetingLanguageEnum('output_language').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    schemaVersion: text('schema_version').notNull(),
    configVersion: text('config_version').notNull(),
    inputHash: char('input_hash', { length: 64 }).notNull(),
    usage: jsonb('usage').notNull(),
    evaluation: jsonb('evaluation').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    projectionVersionPositive: check('minutes_provenance_projection_version_positive', sql`${t.projectionVersion} > 0`),
    completenessVersionPositive: check('minutes_provenance_completeness_version_positive', sql`${t.completenessVersion} > 0`),
    templateVersionPositive: check('minutes_provenance_template_version_positive', sql`${t.templateVersion} > 0`),
    inputHashHex64: check('minutes_provenance_input_hash_hex64', sql`${t.inputHash} ~ ${hex64Pattern}`),
    ownerMeetingIdx: index('minutes_provenance_owner_meeting_idx').on(t.ownerId, t.meetingId),
  }),
);
