import { createHash } from 'node:crypto';
import {
  JobsMetadataRepository,
  OutboxRepository,
  type Db,
  type OwnerContext,
} from '@kms/database';
import type { GenerateMinutesInput } from '@kms/domain';
import type { MinutesDispatcher } from './minutes-service.js';

interface DispatcherDependencies {
  readonly createId?: (ownerId: string, meetingId: string, idempotencyKey: string) => string;
  readonly now?: () => string;
}

function deterministicJobId(ownerId: string, meetingId: string, idempotencyKey: string): string {
  return createHash('sha256').update(`${ownerId}:${meetingId}:${idempotencyKey}`).digest('hex');
}

export function createDatabaseMinutesDispatcher(
  db: Db,
  dependencies: DispatcherDependencies = {},
): MinutesDispatcher {
  const jobs = new JobsMetadataRepository();
  const outbox = new OutboxRepository();
  const createId = dependencies.createId ?? deterministicJobId;
  const now = dependencies.now ?? (() => new Date().toISOString());

  return {
    async dispatch(
      ctx: OwnerContext,
      meetingId: string,
      idempotencyKey: string,
      input: GenerateMinutesInput,
    ) {
      const jobId = createId(ctx.ownerId, meetingId, idempotencyKey);
      return db.transaction(async (tx) => {
        const existing = await jobs.get(ctx, tx, jobId);
        if (existing) return { jobId: existing.id, meetingId };

        await jobs.create(ctx, tx, {
          id: jobId,
          meetingId,
          type: 'minutes_generation',
          maxAttempts: 3,
        });
        await outbox.saveEvent(ctx, tx, {
          envelopeVersion: '1',
          messageId: jobId,
          correlationId: jobId,
          causationId: null,
          ownerId: ctx.ownerId,
          entityType: 'processing_job',
          entityId: jobId,
          commandType: 'minutes_generation',
          commandVersion: 1,
          idempotencyKey,
          actorId: ctx.ownerId,
          timestamp: now(),
          payload: { ...input, meetingId },
        });
        return { jobId, meetingId };
      });
    },
  };
}
