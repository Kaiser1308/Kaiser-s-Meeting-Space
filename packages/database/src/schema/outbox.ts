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
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { EntityTypeSchema } from '@kms/domain';

// ── Storage-only enums (not in P02 domain) ──

const OUTBOX_STATES = ['pending', 'published', 'failed'] as const;
export const outboxStateEnum = pgEnum('outbox_state', [...OUTBOX_STATES]);

// ── Enum sourced from P02 ──

export const entityTypeEnum = pgEnum('entity_type', [...EntityTypeSchema.options]);

// ── Tables ──

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: text('message_id').notNull(),
    correlationId: text('correlation_id').notNull(),
    causationId: text('causation_id'),
    ownerId: text('owner_id').notNull(),
    entityType: entityTypeEnum('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    eventType: text('event_type').notNull(),
    eventVersion: integer('event_version').notNull(),
    actorId: text('actor_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    payload: jsonb('payload').notNull(),
    state: outboxStateEnum('state').notNull().default('pending'),
    leaseOwner: text('lease_owner'),
    leasedUntil: timestamp('leased_until', { withTimezone: true, mode: 'date' }),
    attempts: integer('attempts').notNull().default(0),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
    meetingEventSequence: integer('meeting_event_sequence'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    // CHECK constraints
    eventVersionPositive: check('outbox_events_event_version_positive', sql`${t.eventVersion} > 0`),

    // Unique and indexes
    messageIdUnique: uniqueIndex('outbox_events_message_id_unique').on(t.messageId),
    leaseIdx: index('outbox_events_lease_idx')
      .on(t.state, t.leasedUntil)
      .where(sql`${t.state} = 'pending'`),
    entityTypeEntityIdIdx: index('outbox_events_entity_type_entity_id_idx').on(
      t.entityType,
      t.entityId,
    ),
  }),
);
