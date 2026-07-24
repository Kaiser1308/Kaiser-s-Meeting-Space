import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { createClient, OutboxRepository, type ClientHandle } from '@kms/database';
import { getJobConfig } from '@kms/jobs';
import { randomUUID } from 'node:crypto';

export class OutboxDispatcher {
  private handle: ClientHandle | null = null;
  private redis: Redis | null = null;
  private queues = new Map<string, Queue>();
  private outboxRepo = new OutboxRepository();
  private dispatcherId = `dispatcher-${randomUUID()}`;
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private unlistenFn: any = null;
  private databaseUrl: string;
  private redisUrl: string;

  constructor(opts: { databaseUrl: string; redisUrl: string }) {
    this.databaseUrl = opts.databaseUrl;
    this.redisUrl = opts.redisUrl;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    this.redis = new Redis(this.redisUrl, { maxRetriesPerRequest: null });
    this.handle = createClient(this.databaseUrl);

    // PostgresJS LISTEN to instant trigger
    this.unlistenFn = await this.handle.$raw.listen('outbox_inserted', () => {
      if (this.isRunning) {
        this.pollAndDispatch().catch(console.error);
      }
    });

    // Fallback polling loop (5-10s interval fallback)
    this.pollInterval = setInterval(() => this.pollAndDispatch(), 5000);

    // Initial poll
    await this.pollAndDispatch();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    if (this.unlistenFn) {
      await this.unlistenFn.unlisten().catch(() => {});
    }
    if (this.handle) {
      await this.handle.close();
    }
    if (this.redis) {
      await this.redis.quit();
    }
    for (const queue of this.queues.values()) {
      await queue.close();
    }
    this.queues.clear();
  }

  async pollAndDispatch(): Promise<void> {
    if (!this.isRunning || !this.handle) return;

    try {
      // Lease events using SKIP LOCKED
      const events = await this.outboxRepo.acquireLeases(this.handle.db, this.dispatcherId, 10);
      if (events.length === 0) return;

      for (const event of events) {
        try {
          const config = getJobConfig(event.entityType as any);
          let queue = this.queues.get(event.entityType);
          if (!queue && this.redis) {
            queue = new Queue(event.entityType, { connection: this.redis });
            this.queues.set(event.entityType, queue);
          }

          if (!queue) throw new Error(`Queue not available for ${event.entityType}`);

          // Publish event to BullMQ
          await queue.add(
            event.eventType,
            {
              jobId: event.messageId,
              meetingId: event.entityId,
              ownerId: event.ownerId,
              payload: event.payload,
            },
            {
              jobId: event.messageId,
              attempts: config.retryPolicy.maxAttempts,
              backoff: {
                type: config.retryPolicy.type,
                delay: config.retryPolicy.delayMs,
              },
            }
          );

          // CAS: state change must match lease_owner, message_id and state
          const acked = await this.outboxRepo.acknowledgePublish(this.handle.db, event.messageId, this.dispatcherId);
          if (!acked) {
            console.warn(`Dispatcher ${this.dispatcherId} failed to acknowledge event ${event.messageId} - lease expired or stolen`);
          }
        } catch (jobErr: any) {
          console.error(`Failed to dispatch event ${event.messageId}:`, jobErr);
          const nextAttemptAt = new Date(Date.now() + 5000);
          const isPermanent = event.attempts >= 5;
          await this.outboxRepo.recordFailure(
            this.handle.db,
            event.messageId,
            this.dispatcherId,
            jobErr.code || 'DISPATCH_ERROR',
            jobErr.message || 'Unknown error',
            nextAttemptAt,
            isPermanent
          );
        }
      }
    } catch (e) {
      console.error('Error in outbox dispatcher poll loop:', e);
    }
  }
}
