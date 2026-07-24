import { and, eq, sql } from 'drizzle-orm';
import type { Connection } from '../client.js';
import { outboxEvents } from '../schema/index.js';
import { type Envelope } from '@kms/domain';
import { type OwnerContext } from './types.js';
import { toDomain, mapDbError } from './base.js';

export interface OutboxEvent {
  id: string;
  messageId: string;
  correlationId: string;
  causationId: string | null;
  ownerId: string;
  entityType: string;
  entityId: string;
  eventType: string;
  eventVersion: number;
  actorId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  state: 'pending' | 'published' | 'failed';
  leaseOwner: string | null;
  leasedUntil: Date | null;
  attempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  nextAttemptAt: Date | null;
  meetingEventSequence: number | null;
  createdAt: Date;
  publishedAt: Date | null;
}

export class OutboxRepository {
  async saveEvent(
    ctx: OwnerContext,
    conn: Connection,
    envelope: Envelope
  ): Promise<void> {
    try {
      // Monotonic sequence generation per meeting:
      const [seqRow] = await conn
        .select({
          maxSeq: sql<number>`COALESCE(MAX(${outboxEvents.meetingEventSequence}), 0) + 1`
        })
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.entityId, envelope.entityId),
            eq(outboxEvents.ownerId, ctx.ownerId)
          )
        );

      const meetingEventSequence = seqRow?.maxSeq ?? 1;

      await conn.insert(outboxEvents).values({
        messageId: envelope.messageId,
        correlationId: envelope.correlationId,
        causationId: envelope.causationId,
        ownerId: ctx.ownerId,
        entityType: envelope.entityType,
        entityId: envelope.entityId,
        eventType: 'commandType' in envelope ? envelope.commandType : envelope.eventType,
        eventVersion: 'commandVersion' in envelope ? envelope.commandVersion : envelope.eventVersion,
        actorId: envelope.actorId,
        idempotencyKey: 'idempotencyKey' in envelope ? envelope.idempotencyKey : '',
        payload: 'payload' in envelope ? envelope.payload : envelope.data,
        state: 'pending',
        attempts: 0,
        meetingEventSequence,
      });
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  async acquireLeases(
    conn: Connection,
    leaseOwner: string,
    limit: number,
    leaseDurationMs = 30000
  ): Promise<OutboxEvent[]> {
    try {
      const leaseDurationSec = leaseDurationMs / 1000;
      
      const rows: any[] = await conn.execute(sql`
        WITH targets AS (
          SELECT id FROM ${outboxEvents}
          WHERE state = 'pending'
            AND (leased_until IS NULL OR leased_until < NOW())
            AND (next_attempt_at IS NULL OR next_attempt_at < NOW())
          ORDER BY created_at ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE ${outboxEvents}
        SET lease_owner = ${leaseOwner},
            leased_until = NOW() + INTERVAL '${sql.raw(leaseDurationSec.toString())} seconds',
            attempts = attempts + 1
        FROM targets
        WHERE ${outboxEvents}.id = targets.id
        RETURNING *
      `);

      return rows.map(row => this.toOutboxEvent(row));
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  async acknowledgePublish(
    conn: Connection,
    messageId: string,
    leaseOwner: string
  ): Promise<boolean> {
    try {
      const result = await conn
        .update(outboxEvents)
        .set({
          state: 'published',
          publishedAt: new Date(),
          leasedUntil: null,
          leaseOwner: null,
        })
        .where(
          and(
            eq(outboxEvents.messageId, messageId),
            eq(outboxEvents.leaseOwner, leaseOwner),
            eq(outboxEvents.state, 'pending')
          )
        )
        .returning({ id: outboxEvents.id });

      return result.length > 0;
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  async recordFailure(
    conn: Connection,
    messageId: string,
    leaseOwner: string,
    errorCode: string,
    errorMessage: string,
    nextAttemptAt: Date | null,
    isPermanent = false
  ): Promise<boolean> {
    try {
      const result = await conn
        .update(outboxEvents)
        .set({
          state: isPermanent ? 'failed' : 'pending',
          lastErrorCode: errorCode,
          lastErrorMessage: errorMessage,
          nextAttemptAt,
          leasedUntil: null,
          leaseOwner: null,
        })
        .where(
          and(
            eq(outboxEvents.messageId, messageId),
            eq(outboxEvents.leaseOwner, leaseOwner)
          )
        )
        .returning({ id: outboxEvents.id });

      return result.length > 0;
    } catch (e: unknown) {
      throw mapDbError(e);
    }
  }

  private toOutboxEvent(row: any): OutboxEvent {
    return {
      id: row.id,
      messageId: row.message_id,
      correlationId: row.correlation_id,
      causationId: row.causation_id,
      ownerId: row.owner_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      eventType: row.event_type,
      eventVersion: row.event_version,
      actorId: row.actor_id,
      idempotencyKey: row.idempotency_key,
      payload: row.payload,
      state: row.state,
      leaseOwner: row.lease_owner,
      leasedUntil: row.leased_until instanceof Date ? row.leased_until : row.leased_until ? new Date(row.leased_until) : null,
      attempts: row.attempts,
      lastErrorCode: row.last_error_code,
      lastErrorMessage: row.last_error_message,
      nextAttemptAt: row.next_attempt_at instanceof Date ? row.next_attempt_at : row.next_attempt_at ? new Date(row.next_attempt_at) : null,
      meetingEventSequence: row.meeting_event_sequence,
      createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
      publishedAt: row.published_at instanceof Date ? row.published_at : row.published_at ? new Date(row.published_at) : null,
    };
  }
}
