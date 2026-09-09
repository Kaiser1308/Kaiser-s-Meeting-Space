import { afterEach, describe, expect, it, vi } from 'vitest';
import { JobsMetadataRepository, OutboxRepository } from '@kms/database';
import { MeetingIdSchema, type GenerateMinutesInput } from '@kms/domain';
import { createDatabaseMinutesDispatcher } from './database-minutes-dispatcher.js';

const OWNER_ID = 'local-owner';
const MEETING_ID = MeetingIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');

const input: GenerateMinutesInput = {
  meeting: {
    id: MEETING_ID,
    ownerId: OWNER_ID,
    title: 'Synthetic local meeting',
    language: 'en',
    mode: 'meeting_only',
    captureSources: ['mic'],
    speechMode: 'api',
    timezone: 'UTC',
    version: 1,
    createdAt: '2026-09-09T00:00:00.000Z',
  },
  transcript: [
    {
      id: 'segment-1',
      meetingId: MEETING_ID,
      sequence: 0,
      speakerId: 'speaker-1',
      text: 'Synthetic transcript only.',
      language: 'en',
      isGap: false,
      startMs: 0,
      endMs: 1000,
      source: 'api',
      createdAt: '2026-09-09T00:00:00.000Z',
    },
  ],
  template: 'team',
  outputLanguage: 'en',
  detailLevel: 'detailed',
};

describe('createDatabaseMinutesDispatcher', () => {
  afterEach(() => vi.restoreAllMocks());

  it('creates one durable minutes job and outbox command for a request', async () => {
    const tx = {};
    const db = {
      transaction: vi.fn(async (callback: (connection: unknown) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    vi.spyOn(JobsMetadataRepository.prototype, 'get').mockResolvedValue(null);
    const create = vi.spyOn(JobsMetadataRepository.prototype, 'create').mockResolvedValue({
      id: 'job-1',
    } as never);
    const saveEvent = vi.spyOn(OutboxRepository.prototype, 'saveEvent').mockResolvedValue();

    const dispatcher = createDatabaseMinutesDispatcher(db as never, {
      createId: () => 'job-1',
      now: () => '2026-09-09T00:00:00.000Z',
    });

    await expect(
      dispatcher.dispatch({ ownerId: OWNER_ID }, MEETING_ID, 'request-1', input),
    ).resolves.toEqual({
      jobId: 'job-1',
      meetingId: MEETING_ID,
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      { ownerId: OWNER_ID },
      tx,
      expect.objectContaining({
        id: 'job-1',
        meetingId: MEETING_ID,
        type: 'minutes_generation',
        maxAttempts: 3,
      }),
    );
    expect(saveEvent).toHaveBeenCalledWith(
      { ownerId: OWNER_ID },
      tx,
      expect.objectContaining({
        entityType: 'processing_job',
        entityId: 'job-1',
        commandType: 'minutes_generation',
        idempotencyKey: 'request-1',
      }),
    );
  });

  it('returns the existing owner-scoped job without a second outbox command', async () => {
    const tx = {};
    const db = {
      transaction: vi.fn(async (callback: (connection: unknown) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    vi.spyOn(JobsMetadataRepository.prototype, 'get').mockResolvedValue({
      id: 'existing-job',
    } as never);
    const create = vi.spyOn(JobsMetadataRepository.prototype, 'create');
    const saveEvent = vi.spyOn(OutboxRepository.prototype, 'saveEvent');
    const dispatcher = createDatabaseMinutesDispatcher(db as never, {
      createId: () => 'existing-job',
      now: () => '2026-09-09T00:00:00.000Z',
    });

    await expect(
      dispatcher.dispatch({ ownerId: OWNER_ID }, MEETING_ID, 'request-1', input),
    ).resolves.toEqual({
      jobId: 'existing-job',
      meetingId: MEETING_ID,
    });
    expect(create).not.toHaveBeenCalled();
    expect(saveEvent).not.toHaveBeenCalled();
  });
});
