import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { entityTypeEnum } from './outbox.js';

// ── Tables ──

export const safeAudit = pgTable(
  'safe_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id').notNull(),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    entityType: entityTypeEnum('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    metadata: jsonb('metadata').notNull().default('{}'),
  },
  (t) => ({
    // Indexes
    ownerOccurredIdx: index('safe_audit_owner_occurred_idx').on(t.ownerId, t.occurredAt),
    entityTypeEntityIdIdx: index('safe_audit_entity_type_entity_id_idx').on(
      t.entityType,
      t.entityId,
    ),
  }),
);
