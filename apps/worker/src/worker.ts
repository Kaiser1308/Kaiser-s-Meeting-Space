import { Worker, type Job as BullMQJob } from 'bullmq';
import Redis from 'ioredis';
import { createClient, JobsMetadataRepository, type ClientHandle } from '@kms/database';
import { JobTypeSchema, type JobAttempt, type JobType } from '@kms/domain';
import { getJobConfig } from '@kms/jobs';

export class KMSWorker {
  private worker: Worker | null = null;
  private handle: ClientHandle | null = null;
  private redis: Redis | null = null;
  private jobsRepo = new JobsMetadataRepository();
  private isRunning = false;
  private databaseUrl: string;
  private redisUrl: string;
  private jobType: JobType;

  constructor(jobType: string, opts: { databaseUrl: string; redisUrl: string }) {
    this.jobType = JobTypeSchema.parse(jobType);
    this.databaseUrl = opts.databaseUrl;
    this.redisUrl = opts.redisUrl;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    this.redis = new Redis(this.redisUrl, { maxRetriesPerRequest: null });
    this.handle = createClient(this.databaseUrl);
    const config = getJobConfig(this.jobType);

    this.worker = new Worker(
      this.jobType,
      async (bullJob: BullMQJob) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
        try {
          return await this.processJob(bullJob, controller.signal);
        } finally {
          clearTimeout(timeout);
        }
      },
      {
        connection: this.redis,
        concurrency: config.concurrency,
        lockDuration: config.timeoutMs + 30_000,
      },
    );

    this.worker.on('error', (err) => {
      console.error(`BullMQ worker error on queue ${this.jobType}:`, err);
    });
  }

  async stop(timeoutMs = 15000): Promise<void> {
    this.isRunning = false;
    if (this.worker) {
      // Close worker (stops accepting new jobs and waits for active ones)
      await Promise.race([
        this.worker.close(),
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    }
    if (this.handle) {
      await this.handle.close();
    }
    if (this.redis) {
      await this.redis.quit();
    }
  }

  private async processJob(
    bullJob: BullMQJob,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    if (!this.handle) throw new Error('Database connection not initialized');

    const jobId = bullJob.data.jobId;
    const ownerId = bullJob.data.ownerId;
    const ownerCtx = { ownerId };

    // 1. Read job state prior to execution
    const job = await this.jobsRepo.get(ownerCtx, this.handle.db, jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found in database`);
    }

    // No-op if completed, cancelled, or terminal failed
    if (
      job.state === 'completed' ||
      job.state === 'cancelled' ||
      (job.state === 'failed' && job.attempts.length >= job.maxAttempts)
    ) {
      return { status: 'skipped', state: job.state };
    }

    const nextAttemptNum = job.attempts.length + 1;
    const startedAt = new Date().toISOString();

    let executionError: unknown = null;
    let result: Record<string, unknown> | undefined = undefined;

    try {
      // Mock execution progress
      for (let p = 10; p <= 100; p += 30) {
        if (signal.aborted) throw new Error('JOB_TIMEOUT');
        // Heartbeat check: Query database to see if job was cancelled
        const currentJob = await this.jobsRepo.get(ownerCtx, this.handle.db, jobId);
        if (currentJob?.state === 'cancelled') {
          throw new Error('JOB_CANCELLED');
        }

        await bullJob.updateProgress(p);
        await this.jobsRepo.recordProgress(ownerCtx, this.handle.db, jobId, p, `Processing ${p}%`);
      }

      result = {
        processed: true,
        handler: 'deterministic-mock',
        timestamp: new Date().toISOString(),
      };
    } catch (err: unknown) {
      executionError = err;
    }

    const success = !executionError;
    const completedAt = new Date().toISOString();

    const attemptRecord: JobAttempt = {
      attempt: nextAttemptNum,
      startedAt,
      completedAt,
      success,
      error: executionError
        ? {
            code: this.safeErrorCode(executionError),
            message: this.safeErrorMessage(executionError),
          }
        : undefined,
    };

    // 3. Commit atomically
    await this.handle.db.transaction(async (tx) => {
      const freshJob = await this.jobsRepo.get(ownerCtx, tx, jobId);
      if (!freshJob) throw new Error('Job missing during commit');

      if (freshJob.state === 'completed' || freshJob.state === 'cancelled') {
        throw new Error('STALE_JOB_ATTEMPT');
      }

      await this.jobsRepo.recordAttempt(ownerCtx, tx, jobId, attemptRecord);

      if (success) {
        await this.jobsRepo.markState(ownerCtx, tx, jobId, 'completed', result);
      } else {
        const isCancelled = this.errorMessage(executionError) === 'JOB_CANCELLED';
        const isLastAttempt = nextAttemptNum >= job.maxAttempts;
        const nextState = isCancelled ? 'cancelled' : isLastAttempt ? 'failed' : 'retrying';

        await this.jobsRepo.markState(ownerCtx, tx, jobId, nextState, undefined);
      }
    });

    if (executionError) {
      throw executionError instanceof Error ? executionError : new Error('JOB_EXECUTION_FAILED');
    }

    if (!result) throw new Error('JOB_EXECUTION_FAILED');
    return result;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : '';
  }

  private safeErrorCode(error: unknown): 'CANCELLED' | 'TIMEOUT' | 'EXECUTION_FAILED' {
    const message = this.errorMessage(error);
    if (message === 'JOB_CANCELLED') return 'CANCELLED';
    if (message === 'JOB_TIMEOUT') return 'TIMEOUT';
    return 'EXECUTION_FAILED';
  }

  private safeErrorMessage(error: unknown): string {
    return this.safeErrorCode(error) === 'CANCELLED'
      ? 'Job cancelled'
      : this.safeErrorCode(error) === 'TIMEOUT'
        ? 'Job timed out'
        : 'Job execution failed';
  }
}
