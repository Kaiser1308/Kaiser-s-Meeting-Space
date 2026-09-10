import { describe, expect, it, vi } from 'vitest';
import { createMeetingApi, MeetingApiError, LOCAL_POLICY } from './meeting-api.js';

const createdId = '550e8400-e29b-41d4-a716-446655440000';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function sequence(...values: string[]) {
  let index = 0;
  return () => values[index++] ?? `unexpected-key-${index}`;
}

describe('local meeting API adapter', () => {
  it('creates then starts a local meeting with distinct idempotency keys', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(201, {
        id: createdId,
        title: 'Weekly sync',
        language: 'en',
        mode: 'meeting_only',
        captureSources: ['mic', 'system'],
        state: 'draft',
        version: 1,
        createdAt: '2026-09-10T00:00:00.000Z',
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        meetingId: createdId,
        state: 'recording',
        startedAt: '2026-09-10T00:00:01.000Z',
        policyVersion: 1,
      }));
    const api = createMeetingApi({
      fetch: fetchMock,
      newId: sequence('create-key-0001', 'start-key-00002'),
    });

    const created = await api.createLocalMeeting({
      title: 'Weekly sync',
      language: 'en',
      timezone: 'Asia/Ho_Chi_Minh',
    });
    const started = await api.startLocalMeeting(created.id);

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:4310/v1/meetings');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'create-key-0001',
      },
      body: JSON.stringify({
        title: 'Weekly sync',
        language: 'en',
        mode: 'meeting_only',
        timezone: 'Asia/Ho_Chi_Minh',
        captureSources: ['mic', 'system'],
        speechMode: 'local',
        policy: { ...LOCAL_POLICY, language: 'en' },
      }),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`http://127.0.0.1:4310/v1/meetings/${createdId}/start`);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'start-key-00002',
      },
    });
    expect(fetchMock.mock.calls[1]?.[1]).not.toHaveProperty('body');
    expect(started.meetingId).toBe(createdId);
  });

  it.each([401, 409, 500])('maps HTTP %s to a safe error without server text', async (status) => {
    const api = createMeetingApi({
      fetch: vi.fn().mockResolvedValue(jsonResponse(status, { error: { message: 'private server detail' } })),
      newId: () => 'create-key-0001',
    });

    await expect(api.createLocalMeeting({
      title: 'Weekly sync',
      language: 'en',
      timezone: 'Asia/Ho_Chi_Minh',
    })).rejects.toEqual(new MeetingApiError('API_UNAVAILABLE'));
  });

  it('maps network failures to a safe unavailable error', async () => {
    const api = createMeetingApi({
      fetch: vi.fn().mockRejectedValue(new Error('private network detail')),
      newId: () => 'create-key-0001',
    });

    await expect(api.createLocalMeeting({
      title: 'Weekly sync',
      language: 'en',
      timezone: 'Asia/Ho_Chi_Minh',
    })).rejects.toEqual(new MeetingApiError('API_UNAVAILABLE'));
  });

  it('rejects malformed successful responses without exposing response content', async () => {
    const api = createMeetingApi({
      fetch: vi.fn().mockResolvedValue(jsonResponse(201, { id: 'not-a-uuid', secret: 'private detail' })),
      newId: () => 'create-key-0001',
    });

    await expect(api.createLocalMeeting({
      title: 'Weekly sync',
      language: 'en',
      timezone: 'Asia/Ho_Chi_Minh',
    })).rejects.toEqual(new MeetingApiError('INVALID_RESPONSE'));
  });

  it('rejects an invalid meeting ID before making a start request', async () => {
    const fetchMock = vi.fn();
    const api = createMeetingApi({ fetch: fetchMock, newId: () => 'start-key-0001' });

    await expect(api.startLocalMeeting('not-a-uuid')).rejects.toEqual(new MeetingApiError('INVALID_RESPONSE'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
