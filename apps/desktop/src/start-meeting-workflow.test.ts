import { describe, expect, it, vi } from 'vitest';
import { startPhysicalMeeting, StartMeetingError } from './start-meeting-workflow.js';

const meetingId = '550e8400-e29b-41d4-a716-446655440000';
const input = {
  title: 'Weekly sync',
  language: 'en' as const,
  timezone: 'Asia/Ho_Chi_Minh',
  micDeviceId: 'mic-1',
  systemDeviceId: 'system-1',
};

function successfulDeps() {
  const calls: string[] = [];
  const native = {
    send: vi.fn(async (command: string, payload?: Record<string, unknown>) => {
      calls.push(command);
      if (command === 'capture_start') {
        expect(payload).toMatchObject({ meetingId, micDeviceId: 'mic-1', systemDeviceId: 'system-1' });
      }
      return { success: true, payload: {} };
    }),
  };
  return {
    calls,
    deps: {
      api: {
        createLocalMeeting: vi.fn(async () => {
          calls.push('create');
          return { id: meetingId };
        }),
        startLocalMeeting: vi.fn(async () => {
          calls.push('start');
          return { meetingId, state: 'recording' as const };
        }),
      },
      native,
    },
  };
}

describe('physical meeting start workflow', () => {
  it('starts physical capture with the UUID returned by the API in exact order', async () => {
    const { calls, deps } = successfulDeps();

    await expect(startPhysicalMeeting(deps, input)).resolves.toEqual({ meetingId });
    expect(calls).toEqual(['create', 'start', 'storage_init', 'capture_start']);
  });

  it.each(['create', 'start', 'storage_init', 'capture_start'] as const)(
    'rejects safely when %s fails',
    async (failingStep) => {
      const { deps } = successfulDeps();
      if (failingStep === 'create') {
        deps.api.createLocalMeeting.mockRejectedValueOnce(new Error('private detail'));
      } else if (failingStep === 'start') {
        deps.api.startLocalMeeting.mockRejectedValueOnce(new Error('private detail'));
      } else {
        deps.native.send.mockImplementation(async (command) => {
          if (command === failingStep) return { success: false, payload: {} };
          return { success: true, payload: {} };
        });
      }

      await expect(startPhysicalMeeting(deps, input)).rejects.toEqual(new StartMeetingError('START_FAILED'));
    },
  );

  it('does not capture when API start returns a different meeting ID', async () => {
    const { deps } = successfulDeps();
    deps.api.startLocalMeeting.mockResolvedValueOnce({ meetingId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', state: 'recording' });

    await expect(startPhysicalMeeting(deps, input)).rejects.toEqual(new StartMeetingError('START_FAILED'));
    expect(deps.native.send).not.toHaveBeenCalled();
  });
});
