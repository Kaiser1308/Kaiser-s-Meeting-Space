import { describe, expect, it, vi } from 'vitest';
import type { StartMeetingCommand } from './types.js';
import { AuthenticatedMeetingApi } from './meeting-api.js';

const command: StartMeetingCommand = {
  settings: {
    id: '550e8400-e29b-41d4-a716-446655440000' as never,
    ownerId: 'owner-1',
    title: 'Synthetic',
    language: 'vi',
    mode: 'meeting_only',
    captureSources: ['mic'],
    speechMode: 'local',
    timezone: 'Asia/Ho_Chi_Minh',
    version: 1,
    createdAt: '2026-07-28T00:00:00.000Z',
  },
  policy: {
    version: 1,
    language: 'vi',
    live: 'off',
    final: 'local',
    cloudCheckScope: 'off',
    cloudConsent: 'not_required',
  },
  idempotencyKey: 'start-1',
};

describe('AuthenticatedMeetingApi', () => {
  it('sends the full validated command and stable idempotency key', async () => {
    const post = vi.fn().mockResolvedValue({
      id: command.settings.id,
      title: command.settings.title,
      language: 'vi',
      mode: 'meeting_only',
      captureSources: ['mic'],
      state: 'draft',
      version: 1,
      createdAt: '2026-07-28T00:00:00.000Z',
    });
    const api = new AuthenticatedMeetingApi({} as never, { baseUrl: 'https://api.test' });
    Object.defineProperty(api, 'http', { value: { post } });

    await expect(api.create(command)).resolves.toMatchObject({ id: command.settings.id });
    expect(post).toHaveBeenCalledWith(
      '/v1/meetings',
      expect.objectContaining({ id: command.settings.id, policy: command.policy }),
      { 'Idempotency-Key': command.idempotencyKey },
    );
  });

  it('uses a distinct start idempotency namespace', async () => {
    const post = vi.fn().mockResolvedValue({
      meetingId: command.settings.id,
      state: 'recording',
      startedAt: '2026-07-28T00:01:00.000Z',
      policyVersion: 1,
    });
    const api = new AuthenticatedMeetingApi({} as never, { baseUrl: 'https://api.test' });
    Object.defineProperty(api, 'http', { value: { post } });

    await expect(api.start(command.settings.id, command.idempotencyKey)).resolves.toMatchObject({
      state: 'recording',
    });
    expect(post).toHaveBeenCalledWith(
      `/v1/meetings/${command.settings.id}/start`,
      {},
      { 'Idempotency-Key': 'start-1:start' },
    );
  });
});
