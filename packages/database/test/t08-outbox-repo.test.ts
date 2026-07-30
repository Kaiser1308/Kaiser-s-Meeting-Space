import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { outboxEvents } from '../src/schema/index.js';
import { OutboxRepository } from '../src/repositories/outbox.js';
import { startPostgres, withRollbackTx, type TestDb } from './harness.js';
import { type Envelope } from '@kms/domain';

describe('OutboxRepository Integration', () => {
  let testDb: TestDb;
  let outboxRepo: OutboxRepository;

  beforeAll(async () => {
    // Note: This relies on a running Docker daemon. Will throw/skip if offline.
    testDb = await startPostgres();
    outboxRepo = new OutboxRepository();
  }, 120_000);

  afterAll(async () => {
    if (testDb) {
      await testDb.close();
    }
  });

  it('should successfully store outbox events with incrementing sequences', async () => {
    if (!testDb) return;
    await withRollbackTx(testDb, async (tx) => {
      const ownerCtx = { ownerId: 'owner-a' };
      const envelope: Envelope = {
        envelopeVersion: '1',
        messageId: randomUUID(),
        correlationId: randomUUID(),
        causationId: randomUUID(),
        ownerId: 'owner-a',
        entityType: 'meeting',
        entityId: 'meeting-123',
        eventType: 'meeting_created',
        eventVersion: 1,
        actorId: 'user-123',
        timestamp: new Date().toISOString(),
        data: { title: 'Test Meeting' },
      };

      await outboxRepo.saveEvent(ownerCtx, tx, envelope);

      // Verify sequence starts at 1
      const [event1] = await tx
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.messageId, envelope.messageId));

      expect(event1).toBeDefined();
      expect(event1!.meetingEventSequence).toBe(1);

      // Save second event for same meeting
      const envelope2: Envelope = {
        ...envelope,
        messageId: randomUUID(),
      };
      await outboxRepo.saveEvent(ownerCtx, tx, envelope2);

      const [event2] = await tx
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.messageId, envelope2.messageId));

      expect(event2).toBeDefined();
      expect(event2!.meetingEventSequence).toBe(2);
    });
  });

  it('should lease pending outbox events using SKIP LOCKED and respect CAS on completion', async () => {
    if (!testDb) return;
    await withRollbackTx(testDb, async (tx) => {
      const ownerCtx = { ownerId: 'owner-a' };
      const messageId = randomUUID();
      const envelope: Envelope = {
        envelopeVersion: '1',
        messageId,
        correlationId: randomUUID(),
        causationId: randomUUID(),
        ownerId: 'owner-a',
        entityType: 'meeting',
        entityId: 'meeting-123',
        eventType: 'meeting_created',
        eventVersion: 1,
        actorId: 'user-123',
        timestamp: new Date().toISOString(),
        data: { title: 'Test Meeting' },
      };

      await outboxRepo.saveEvent(ownerCtx, tx, envelope);

      // Acquire lease
      const leases = await outboxRepo.acquireLeases(tx, 'dispatcher-1', 1);
      expect(leases.length).toBe(1);
      expect(leases[0]!.messageId).toBe(messageId);
      expect(leases[0]!.leaseOwner).toBe('dispatcher-1');
      expect(leases[0]!.attempts).toBe(1);

      // CAS Acknowledgement success case
      const acked = await outboxRepo.acknowledgePublish(tx, messageId, 'dispatcher-1');
      expect(acked).toBe(true);

      // CAS Acknowledgement fail case (stale leaseOwner)
      const ackedStale = await outboxRepo.acknowledgePublish(tx, messageId, 'dispatcher-stale');
      expect(ackedStale).toBe(false);
    });
  });
});
