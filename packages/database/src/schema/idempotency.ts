import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { entityTypeEnum } from './outbox.js';

// ── Tables ──

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id').notNull(),
    entityType: entityTypeEnum('entity_type').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestId: text('request_id').notNull(),
    responseCode: text('response_code'),
    responseSummary: jsonb('response_summary'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => ({
    // Unique index for idempotency deduplication
    ownerEntityKeyUnique: uniqueIndex('idempotency_records_owner_entity_key_unique').on(
      t.ownerId,
      t.entityType,
      t.idempotencyKey,
    ),

    // Index for expiry sweep
    expiresAtIdx: index('idempotency_records_expires_at_idx').on(t.expiresAt),
  }),
);
