import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Job as BullMQJob } from 'bullmq';
import type { AiProvider } from '@kms/ai';
import type { Job, MeetingId } from '@kms/domain';
import { KMSWorker } from './worker.js';

const TEST_MEETING_ID = '00000000-0000-4000-8000-000000000001' as MeetingId;

describe('KMSWorker AI Integration for minutes_generation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function createMockJob(overrides: Partial<Job> = {}): Job {
    return {
      id: 'job-123',
      ownerId: 'owner-456',
      meetingId: TEST_MEETING_ID,
      type: 'minutes_generation',
      state: 'running',
      maxAttempts: 3,
      attempts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  function createWorkerWithMocks(opts: {
    jobType?: string;
    aiProvider?: AiProvider;
    initialJob?: Job;
  }) {
    let currentJob: Job =
      opts.initialJob ?? createMockJob({ type: (opts.jobType ?? 'minutes_generation') as any });

    const mockJobsRepo = {
      get: vi.fn(async (_ctx, _db, _id) => currentJob),
      recordProgress: vi.fn(async () => {}),
      recordAttempt: vi.fn(async (_ctx, _tx, _id, attempt) => {
        currentJob = { ...currentJob, attempts: [...currentJob.attempts, attempt] };
      }),
      markState: vi.fn(async (_ctx, _tx, _id, state, result) => {
        currentJob = { ...currentJob, state, result };
        return currentJob;
      }),
    };

    const mockHandle = {
      db: {
        transaction: async <T>(cb: (tx: any) => Promise<T>): Promise<T> => cb({}),
      },
      close: vi.fn().mockResolvedValue(undefined),
      $raw: {},
    };

    const worker = new KMSWorker(opts.jobType ?? 'minutes_generation', {
      databaseUrl: 'postgres://localhost:5432/kms',
      redisUrl: 'redis://localhost:6379/0',
      aiProvider: opts.aiProvider,
      jobsRepo: mockJobsRepo as any,
      handle: mockHandle as any,
    });

    return { worker, mockJobsRepo, mockHandle, getCurrentJob: () => currentJob };
  }

  it('invokes generateDetailedMinutes and records progress for minutes_generation', async () => {
    const mockGenerate = vi.fn().mockResolvedValue({
      id: 'doc-version-1',
      documentId: `${TEST_MEETING_ID}-doc`,
      version: 1,
      template: 'team',
      detailLevel: 'detailed',
      outputLanguage: 'en',
      transcriptProjection: 'current',
      isComplete: true,
      provider: 'custom-ai',
      model: 'custom-model',
      creatorId: 'system',
      createdAt: new Date().toISOString(),
      sections: [{ id: 'sec-1', heading: 'spk-1', content: 'Discussion' }],
      decisions: [],
      openQuestions: [],
      actionItems: [],
    });

    const mockProvider: AiProvider = {
      id: 'custom-ai',
      model: 'custom-model',
      generateDetailedMinutes: mockGenerate,
      healthcheck: async () => ({ ok: true }),
    };

    const { worker, mockJobsRepo } = createWorkerWithMocks({
      aiProvider: mockProvider,
    });

    const transcriptSegments = [
      {
        id: 'seg-1',
        meetingId: TEST_MEETING_ID,
        sequence: 0,
        speakerId: 'spk-1',
        language: 'en',
        text: 'Hello team, let us discuss the roadmap.',
        startMs: 0,
        endMs: 5000,
        source: 'microphone',
        isGap: false,
        createdAt: new Date().toISOString(),
      },
    ];

    const bullJob = {
      data: {
        jobId: 'job-123',
        ownerId: 'owner-456',
        meetingId: TEST_MEETING_ID,
        payload: {
          transcript: transcriptSegments,
          template: 'team',
          outputLanguage: 'en',
          detailLevel: 'detailed',
        },
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } as unknown as BullMQJob;

    const controller = new AbortController();
    const result = await worker.processJob(bullJob, controller.signal);

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        meeting: expect.objectContaining({ id: TEST_MEETING_ID }),
        transcript: transcriptSegments,
        template: 'team',
        outputLanguage: 'en',
        detailLevel: 'detailed',
      }),
    );

    expect(bullJob.updateProgress).toHaveBeenCalledWith(100);
    expect(mockJobsRepo.recordProgress).toHaveBeenCalledWith(
      { ownerId: 'owner-456' },
      expect.anything(),
      'job-123',
      100,
      expect.any(String),
    );

    expect(result).toMatchObject({
      processed: true,
      handler: 'ai-provider',
      minutes: expect.objectContaining({ id: 'doc-version-1' }),
    });

    expect(mockJobsRepo.markState).toHaveBeenCalledWith(
      { ownerId: 'owner-456' },
      expect.anything(),
      'job-123',
      'completed',
      expect.objectContaining({ handler: 'ai-provider' }),
    );
  });

  it('handles errors when AiProvider rejects and marks attempt failed', async () => {
    const mockProvider: AiProvider = {
      id: 'failing-ai',
      model: 'failing-model',
      generateDetailedMinutes: vi.fn().mockRejectedValue(new Error('AI provider rate limited')),
      healthcheck: async () => ({ ok: false }),
    };

    const { worker, mockJobsRepo } = createWorkerWithMocks({
      aiProvider: mockProvider,
    });

    const bullJob = {
      data: {
        jobId: 'job-123',
        ownerId: 'owner-456',
        meetingId: TEST_MEETING_ID,
        payload: {
          transcript: [],
        },
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } as unknown as BullMQJob;

    const controller = new AbortController();

    await expect(worker.processJob(bullJob, controller.signal)).rejects.toThrow(
      'AI provider rate limited',
    );

    expect(mockJobsRepo.recordAttempt).toHaveBeenCalledWith(
      { ownerId: 'owner-456' },
      expect.anything(),
      'job-123',
      expect.objectContaining({
        attempt: 1,
        success: false,
        error: expect.objectContaining({
          code: 'EXECUTION_FAILED',
        }),
      }),
    );

    // Initial maxAttempts is 3, so first failure should transition to 'retrying'
    expect(mockJobsRepo.markState).toHaveBeenCalledWith(
      { ownerId: 'owner-456' },
      expect.anything(),
      'job-123',
      'retrying',
      undefined,
    );
  });

  it('marks job failed when last attempt fails', async () => {
    const mockProvider: AiProvider = {
      id: 'failing-ai',
      model: 'failing-model',
      generateDetailedMinutes: vi.fn().mockRejectedValue(new Error('Fatal AI failure')),
      healthcheck: async () => ({ ok: false }),
    };

    const { worker, mockJobsRepo } = createWorkerWithMocks({
      aiProvider: mockProvider,
      initialJob: createMockJob({
        maxAttempts: 2,
        attempts: [
          {
            attempt: 1,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            success: false,
          },
        ],
      }),
    });

    const bullJob = {
      data: {
        jobId: 'job-123',
        ownerId: 'owner-456',
        meetingId: TEST_MEETING_ID,
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } as unknown as BullMQJob;

    const controller = new AbortController();

    await expect(worker.processJob(bullJob, controller.signal)).rejects.toThrow('Fatal AI failure');

    expect(mockJobsRepo.markState).toHaveBeenCalledWith(
      { ownerId: 'owner-456' },
      expect.anything(),
      'job-123',
      'failed',
      undefined,
    );
  });

  it('handles fallback gracefully when transcript is not in bullJob.data', async () => {
    const mockGenerate = vi.fn().mockResolvedValue({
      id: 'doc-fallback',
      documentId: `${TEST_MEETING_ID}-doc`,
      version: 1,
      template: 'team',
      detailLevel: 'detailed',
      outputLanguage: 'en',
      transcriptProjection: 'current',
      isComplete: true,
      provider: 'custom-ai',
      model: 'custom-model',
      creatorId: 'system',
      createdAt: new Date().toISOString(),
      sections: [],
      decisions: [],
      openQuestions: [],
      actionItems: [],
    });

    const mockProvider: AiProvider = {
      id: 'custom-ai',
      model: 'custom-model',
      generateDetailedMinutes: mockGenerate,
      healthcheck: async () => ({ ok: true }),
    };

    const { worker } = createWorkerWithMocks({
      aiProvider: mockProvider,
    });

    // bullJob data without payload or transcript
    const bullJob = {
      data: {
        jobId: 'job-123',
        ownerId: 'owner-456',
        meetingId: TEST_MEETING_ID,
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } as unknown as BullMQJob;

    const controller = new AbortController();
    const result = await worker.processJob(bullJob, controller.signal);

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        meeting: expect.objectContaining({ id: TEST_MEETING_ID }),
        transcript: [],
      }),
    );
    expect(result.handler).toBe('ai-provider');
  });

  it('lazy initializes MockAiProvider from environment if none provided', async () => {
    process.env.AI_PROVIDER = 'mock';

    const { worker } = createWorkerWithMocks({});

    const bullJob = {
      data: {
        jobId: 'job-123',
        ownerId: 'owner-456',
        meetingId: TEST_MEETING_ID,
        payload: {
          transcript: [
            {
              id: 'seg-1',
              meetingId: TEST_MEETING_ID,
              sequence: 0,
              speakerId: 'spk-1',
              language: 'en',
              text: 'Discussion item',
              startMs: 0,
              endMs: 1000,
              source: 'microphone',
              isGap: false,
              createdAt: new Date().toISOString(),
            },
          ],
        },
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } as unknown as BullMQJob;

    const controller = new AbortController();
    const result = await worker.processJob(bullJob, controller.signal);

    expect(result).toMatchObject({
      processed: true,
      handler: 'ai-provider',
      minutes: expect.objectContaining({
        provider: 'mock',
        model: 'deterministic-development',
      }),
    });
  });

  it('keeps deterministic mock for non-minutes_generation job types', async () => {
    const { worker } = createWorkerWithMocks({
      jobType: 'speech_transcription',
    });

    const bullJob = {
      data: {
        jobId: 'job-123',
        ownerId: 'owner-456',
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } as unknown as BullMQJob;

    const controller = new AbortController();
    const result = await worker.processJob(bullJob, controller.signal);

    expect(result).toMatchObject({
      processed: true,
      handler: 'deterministic-mock',
    });
  });
});
