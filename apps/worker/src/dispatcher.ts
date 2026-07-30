import { Queue } from 'bullmq';
import Redis from 'ioredis';
import {
  createClient,
  JobsMetadataRepository,
  OutboxRepository,
  type ClientHandle,
} from '@kms/database';
import { getJobConfig, type JobConfig } from '@kms/jobs';
import { JobTypeSchema, type JobType } from '@kms/domain';
import { randomUUID } from 'node:crypto';

export class OutboxDispatcher {
  private handle: ClientHandle | null = null;
  private redis: Redis | null = null;
  private queues = new Map<string, Queue>();
  private outboxRepo = new OutboxRepository();
  private jobsRepo = new JobsMetadataRepository();
  private dispatcherId = `dispatcher-${randomUUID()}`;
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private unlistenFn: any = null;
  private databaseUrl: string;
  private redisUrl: string;
  private pollInFlight: Promise<void> | null = null;

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
    this.pollInterval = setInterval(() => {
      void this.pollAndDispatch();
    }, 5000);

    // Initial poll
    await this.pollAndDispatch();
    // Redis is only a queue projection. Rebuild all non-terminal jobs from
    // PostgreSQL so a Redis wipe cannot lose work already marked published.
    await this.rebuildDispatchableJobs();
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
    if (!this.isRunning || !this.handle || this.pollInFlight) return;

    const run = this.dispatchBatch();
    this.pollInFlight = run;
    try {
      await run;
    } finally {
      if (this.pollInFlight === run) this.pollInFlight = null;
    }
  }

  private async dispatchBatch(): Promise<void> {
    if (!this.isRunning || !this.handle) return;

    try {
      // Lease events using SKIP LOCKED
      const events = await this.outboxRepo.acquireLeases(this.handle.db, this.dispatcherId, 10);
      if (events.length === 0) return;

      for (const event of events) {
        try {
          const jobType = await this.resolveJobType(
            event.entityType,
            event.entityId,
            event.ownerId,
            event.payload,
          );
          await this.publishJob({
            jobId: event.entityType === 'processing_job' ? event.entityId : event.messageId,
            meetingId: event.entityId,
            ownerId: event.ownerId,
            eventName: event.eventType,
            jobType,
            payload: event.payload,
          });

          // CAS: state change must match lease_owner, message_id and state
          const acked = await this.outboxRepo.acknowledgePublish(
            this.handle.db,
            event.messageId,
            this.dispatcherId,
          );
          if (!acked) {
            console.warn(
              `Dispatcher ${this.dispatcherId} failed to acknowledge event ${event.messageId} - lease expired or stolen`,
            );
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
            isPermanent,
          );
        }
      }
    } catch (e) {
      console.error('Error in outbox dispatcher poll loop:', e);
    }
  }

  private async rebuildDispatchableJobs(): Promise<void> {
    if (!this.isRunning || !this.handle) return;
    const dispatchable = await this.jobsRepo.listDispatchable(this.handle.db);
    for (const job of dispatchable) {
      await this.publishJob({
        jobId: job.id,
        meetingId: job.meetingId,
        ownerId: job.ownerId,
        eventName: 'job_rebuild',
        jobType: job.type,
        payload: { rebuiltFrom: 'postgresql' },
      });
    }
  }

  private async resolveJobType(
    entityType: string,
    entityId: string,
    ownerId: string,
    payload: Record<string, unknown>,
  ): Promise<JobType> {
    if (entityType === 'processing_job') {
      if (!this.handle) throw new Error('Database handle unavailable');
      const job = await this.jobsRepo.get({ ownerId }, this.handle.db, entityId);
      if (!job) throw new Error('Durable job not found');
      return job.type;
    }
    const candidate = payload.jobType;
    const parsed = JobTypeSchema.safeParse(candidate);
    if (!parsed.success) throw new Error('Job type missing from outbox payload');
    return parsed.data;
  }

  private async publishJob(input: {
    jobId: string;
    meetingId: string;
    ownerId: string;
    eventName: string;
    jobType: JobType;
    payload: Record<string, unknown>;
  }): Promise<void> {
    if (!this.redis) throw new Error('Queue connection unavailable');
    const config: JobConfig = getJobConfig(input.jobType);
    let queue = this.queues.get(input.jobType);
    if (!queue) {
      queue = new Queue(input.jobType, { connection: this.redis });
      this.queues.set(input.jobType, queue);
    }
    await queue.add(
      input.eventName,
      {
        jobId: input.jobId,
        meetingId: input.meetingId,
        ownerId: input.ownerId,
        payload: input.payload,
      },
      {
        jobId: input.jobId,
        attempts: config.retryPolicy.maxAttempts,
        backoff: { type: config.retryPolicy.type, delay: config.retryPolicy.delayMs },
      },
    );
  }
}
