import { pgTable, text, timestamp, uuid, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    statusCheck: check('users_status_check', sql`${t.status} IN ('active', 'disabled')`),
  }),
);

export const externalIdentities = pgTable(
  'external_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    issuerSubjectKey: uniqueIndex('external_identities_issuer_subject_unique').on(
      t.issuer,
      t.subject,
    ),
    userIdIdx: index('external_identities_user_id_idx').on(t.userId),
  }),
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    statusCheck: check('sessions_status_check', sql`${t.status} IN ('active', 'revoked')`),
    issuerSubjectKey: uniqueIndex('sessions_issuer_subject_unique').on(t.issuer, t.subject),
    userIdIdx: index('sessions_user_id_idx').on(t.userId),
  }),
);
