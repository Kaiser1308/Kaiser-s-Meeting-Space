import { describe, expect, it, vi } from 'vitest';
import type { Db, OwnerContext } from '@kms/database';
import type { MeetingSettings } from '@kms/domain';
import { MeetingService } from './meeting-service.js';

const owner: OwnerContext = { ownerId: 'owner-123' };
const meeting: MeetingSettings = {
  id: '550e8400-e29b-41d4-a716-446655440000' as MeetingSettings['id'],
  ownerId: owner.ownerId,
  title: 'Synthetic meeting',
  language: 'vi',
  mode: 'meeting_only',
  captureSources: ['mic'],
  speechMode: 'local',
  timezone: 'Asia/Ho_Chi_Minh',
  version: 3,
  createdAt: '2026-07-28T00:00:00.000Z',
  startedAt: '2026-07-28T00:01:00.000Z',
};

describe('MeetingService', () => {
  it('uses the lifecycle-aware owner-scoped read before ending a recording meeting', async () => {
    const repository = {
      get: vi.fn().mockResolvedValue(meeting),
      getLifecycle: vi.fn().mockResolvedValue({ ...meeting, state: 'recording' as const }),
      updateState: vi.fn().mockResolvedValue({
        ...meeting,
        endedAt: '2026-07-28T01:00:00.000Z',
      }),
    };
    const service = new MeetingService({ db: {} as Db });
    Object.defineProperty(service, 'meetingsRepo', { value: repository });

    const result = await service.endMeeting(owner, meeting.id);

    expect(repository.getLifecycle).toHaveBeenCalledWith(owner, expect.anything(), meeting.id);
    expect(repository.get).not.toHaveBeenCalled();
    expect(repository.updateState).toHaveBeenCalledWith(
      owner,
      expect.anything(),
      meeting.id,
      meeting.version,
      expect.objectContaining({ state: 'finalizing' }),
    );
    expect(result.state).toBe('finalizing');
  });

  it('lists lifecycle state and applies the requested state filter', async () => {
    const repository = {
      listLifecycle: vi.fn().mockResolvedValue({
        items: [{ ...meeting, state: 'ready' as const }],
        nextCursor: undefined,
      }),
    };
    const service = new MeetingService({ db: {} as Db });
    Object.defineProperty(service, 'meetingsRepo', { value: repository });

    const result = await service.listMeetings(owner, { limit: 20, state: 'ready' });

    expect(repository.listLifecycle).toHaveBeenCalledWith(
      owner,
      expect.anything(),
      { limit: 20, cursor: undefined },
      { state: 'ready' },
    );
    expect(result.items[0]?.state).toBe('ready');
  });

  it('starts a draft meeting only with a valid persisted policy', async () => {
    const repository = {
      getLifecycle: vi.fn().mockResolvedValue({ ...meeting, state: 'draft' as const }),
      getTranscriptionPolicy: vi.fn().mockResolvedValue({
        version: 1,
        language: 'vi',
        live: 'off',
        final: 'local',
        cloudCheckScope: 'off',
        cloudConsent: 'not_required',
      }),
      updateState: vi.fn().mockResolvedValue(meeting),
    };
    const service = new MeetingService({ db: {} as Db });
    Object.defineProperty(service, 'meetingsRepo', { value: repository });

    await expect(service.startMeeting(owner, meeting.id)).resolves.toMatchObject({
      meetingId: meeting.id,
      state: 'recording',
      policyVersion: 1,
    });
    expect(repository.updateState).toHaveBeenCalledWith(
      owner,
      expect.anything(),
      meeting.id,
      meeting.version,
      expect.objectContaining({ state: 'recording' }),
    );
  });

  it('rejects a cloud start without explicit consent', async () => {
    const repository = {
      getLifecycle: vi.fn().mockResolvedValue({ ...meeting, state: 'draft' as const }),
      getTranscriptionPolicy: vi.fn().mockResolvedValue({
        version: 1,
        language: 'vi',
        live: 'cloud',
        final: 'local',
        cloudCheckScope: 'off',
        cloudConsent: 'required',
      }),
      updateState: vi.fn(),
    };
    const service = new MeetingService({ db: {} as Db });
    Object.defineProperty(service, 'meetingsRepo', { value: repository });

    await expect(service.startMeeting(owner, meeting.id)).rejects.toMatchObject({
      safeCode: 'CLOUD_CONSENT_REQUIRED',
    });
    expect(repository.updateState).not.toHaveBeenCalled();
  });

  it('persists and replays a Start response for the idempotency key', async () => {
    const select = vi.fn().mockReturnValue({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([]) }),
      }),
    });
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      select,
      insert: vi.fn().mockReturnValue({ values: insertValues }),
    };
    const db = {
      transaction: vi.fn(async (callback: (connection: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const repository = {
      getLifecycle: vi.fn().mockResolvedValue({ ...meeting, state: 'draft' as const }),
      getTranscriptionPolicy: vi.fn().mockResolvedValue({
        version: 1,
        language: 'vi',
        live: 'off',
        final: 'local',
        cloudCheckScope: 'off',
        cloudConsent: 'not_required',
      }),
      updateState: vi.fn().mockResolvedValue(meeting),
    };
    const service = new MeetingService({ db: db as unknown as Db });
    Object.defineProperty(service, 'meetingsRepo', { value: repository });

    const result = await service.startMeeting(owner, meeting.id, 'start-key-123');

    expect(result).toMatchObject({
      meetingId: meeting.id,
      state: 'recording',
      policyVersion: 1,
    });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'meeting',
        idempotencyKey: `${meeting.id}:start:start-key-123`,
        responseCode: '200',
      }),
    );

    const stored = insertValues.mock.calls[0]?.[0] as {
      requestId: string;
      responseSummary: unknown;
    };
    select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              { requestId: stored.requestId, responseSummary: stored.responseSummary },
            ]),
        }),
      }),
    });
    await expect(service.startMeeting(owner, meeting.id, 'start-key-123')).resolves.toEqual(result);
    expect(repository.updateState).toHaveBeenCalledTimes(1);
  });
});
