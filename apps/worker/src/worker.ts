import { Worker, type Job as BullMQJob } from 'bullmq';
import Redis from 'ioredis';
import { createClient, JobsMetadataRepository, type ClientHandle } from '@kms/database';
import {
  JobTypeSchema,
  type GenerateMinutesInput,
  type JobAttempt,
  type JobType,
  type MeetingId,
  type MeetingLanguage,
  type MeetingSettings,
  type MinutesTemplate,
  type TranscriptSegment,
} from '@kms/domain';
import { getJobConfig } from '@kms/jobs';
import { createAiProvider, type AiProvider } from '@kms/ai';

export interface KMSWorkerOptions {
  databaseUrl: string;
  redisUrl: string;
  aiProvider?: AiProvider;
  jobsRepo?: JobsMetadataRepository;
  handle?: ClientHandle;
}

export class KMSWorker {
  private worker: Worker | null = null;
  private handle: ClientHandle | null = null;
  private redis: Redis | null = null;
  private jobsRepo = new JobsMetadataRepository();
  private isRunning = false;
  private databaseUrl: string;
  private redisUrl: string;
  private jobType: JobType;
  private aiProvider?: AiProvider;

  constructor(jobType: string, opts: KMSWorkerOptions) {
    this.jobType = JobTypeSchema.parse(jobType);
    this.databaseUrl = opts.databaseUrl;
    this.redisUrl = opts.redisUrl;
    this.aiProvider = opts.aiProvider;
    if (opts.jobsRepo) {
      this.jobsRepo = opts.jobsRepo;
    }
    if (opts.handle) {
      this.handle = opts.handle;
    }
  }

  private getAiProvider(): AiProvider {
    if (this.aiProvider) {
      return this.aiProvider;
    }
    const provider = (process.env.AI_PROVIDER as 'mock' | 'openai-compatible') || 'mock';
    this.aiProvider = createAiProvider({
      provider,
      apiKey: process.env.AI_API_KEY,
      baseUrl: process.env.AI_BASE_URL,
      model: process.env.AI_MODEL,
    });
    return this.aiProvider;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    if (!this.redis) {
      this.redis = new Redis(this.redisUrl, { maxRetriesPerRequest: null });
    }
    if (!this.handle) {
      this.handle = createClient(this.databaseUrl);
    }
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

  async processJob(
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
      if (this.jobType === 'minutes_generation') {
        if (signal.aborted) throw new Error('JOB_TIMEOUT');
        const initialCheck = await this.jobsRepo.get(ownerCtx, this.handle.db, jobId);
        if (initialCheck?.state === 'cancelled') {
          throw new Error('JOB_CANCELLED');
        }

        await bullJob.updateProgress(10);
        await this.jobsRepo.recordProgress(
          ownerCtx,
          this.handle.db,
          jobId,
          10,
          'Initializing AI provider',
        );

        const provider = this.getAiProvider();

        const rawPayload = bullJob.data?.payload;
        const payload = (
          typeof rawPayload === 'object' && rawPayload !== null ? rawPayload : {}
        ) as Record<string, unknown>;

        const meetingId = (payload.meetingId ??
          bullJob.data?.meetingId ??
          job.meetingId ??
          'unknown-meeting') as string;

        const rawTranscript = payload.transcript ?? bullJob.data?.transcript;
        const transcript: readonly TranscriptSegment[] = Array.isArray(rawTranscript)
          ? rawTranscript
          : [];

        const template = (payload.template ?? bullJob.data?.template ?? 'team') as MinutesTemplate;
        const outputLanguage = (payload.outputLanguage ??
          bullJob.data?.outputLanguage ??
          'en') as MeetingLanguage;
        const detailLevel = (payload.detailLevel ??
          bullJob.data?.detailLevel ??
          'detailed') as 'detailed' | 'near_verbatim';

        const defaultMeeting: MeetingSettings = {
          id: meetingId as MeetingId,
          ownerId,
          title: (payload.title ?? bullJob.data?.title ?? `Meeting ${meetingId}`) as string,
          language: (outputLanguage === 'vi' ? 'vi' : 'en') as MeetingLanguage,
          mode: 'meeting_only',
          captureSources: ['mic'],
          speechMode: 'api',
          timezone: 'UTC',
          version: 1,
          createdAt: new Date().toISOString(),
        };

        const meeting = (payload.meeting ??
          bullJob.data?.meeting ??
          defaultMeeting) as MeetingSettings;

        const input: GenerateMinutesInput = {
          meeting,
          transcript,
          template,
          outputLanguage,
          detailLevel,
        };

        await bullJob.updateProgress(30);
        await this.jobsRepo.recordProgress(
          ownerCtx,
          this.handle.db,
          jobId,
          30,
          'Generating minutes via AI provider',
        );

        if (signal.aborted) throw new Error('JOB_TIMEOUT');
        const midCheck = await this.jobsRepo.get(ownerCtx, this.handle.db, jobId);
        if (midCheck?.state === 'cancelled') {
          throw new Error('JOB_CANCELLED');
        }

        const minutes = await provider.generateDetailedMinutes(input);

        if (signal.aborted) throw new Error('JOB_TIMEOUT');
        const postCheck = await this.jobsRepo.get(ownerCtx, this.handle.db, jobId);
        if (postCheck?.state === 'cancelled') {
          throw new Error('JOB_CANCELLED');
        }

        await bullJob.updateProgress(100);
        await this.jobsRepo.recordProgress(
          ownerCtx,
          this.handle.db,
          jobId,
          100,
          'Minutes generated successfully',
        );

        result = {
          processed: true,
          handler: 'ai-provider',
          minutes,
          timestamp: new Date().toISOString(),
        };
      } else {
        // Mock execution progress
        for (let p = 10; p <= 100; p += 30) {
          if (signal.aborted) throw new Error('JOB_TIMEOUT');
          // Heartbeat check: Query database to see if job was cancelled
          const currentJob = await this.jobsRepo.get(ownerCtx, this.handle.db, jobId);
          if (currentJob?.state === 'cancelled') {
            throw new Error('JOB_CANCELLED');
          }

          await bullJob.updateProgress(p);
          await this.jobsRepo.recordProgress(
            ownerCtx,
            this.handle.db,
            jobId,
            p,
            `Processing ${p}%`,
          );
        }

        result = {
          processed: true,
          handler: 'deterministic-mock',
          timestamp: new Date().toISOString(),
        };
      }
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
    const code = this.safeErrorCode(error);
    if (code === 'CANCELLED') return 'Job cancelled';
    if (code === 'TIMEOUT') return 'Job timed out';
    return this.errorMessage(error) || 'Job execution failed';
  }
}
