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
import { meetings } from './meeting.js';

const hex64Pattern = '^[0-9a-fA-F]{64}$';

/** Immutable minutes editor version snapshots (append-only). */
export const minutesEditorVersions = pgTable(
  'minutes_editor_versions',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id').notNull(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    version: integer('version').notNull(),
    contentHash: char('content_hash', { length: 64 }).notNull(),
    document: jsonb('document').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    versionPositive: check('minutes_editor_versions_version_positive', sql`${t.version} > 0`),
    contentHashHex64: check('minutes_editor_versions_content_hash_hex64', sql`${t.contentHash} ~ ${hex64Pattern}`),
    documentIdx: index('minutes_editor_versions_document_idx').on(t.documentId, t.version),
    ownerMeetingIdx: index('minutes_editor_versions_owner_meeting_idx').on(t.ownerId, t.meetingId),
  }),
);

/** Mutable current-version pointer per document (optimistic). */
export const minutesEditorCurrent = pgTable(
  'minutes_editor_current',
  {
    documentId: text('document_id').primaryKey(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    currentVersionId: text('current_version_id')
      .notNull()
      .references(() => minutesEditorVersions.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    versionPositive: check('minutes_editor_current_version_positive', sql`${t.version} > 0`),
    ownerMeetingIdx: index('minutes_editor_current_owner_meeting_idx').on(t.ownerId, t.meetingId),
  }),
);
