import { describe, expect, it, vi } from 'vitest';
import { endPhysicalMeeting, EndMeetingError } from './end-meeting-workflow.js';
import { MeetingApiError } from './meeting-api.js';

describe('endPhysicalMeeting workflow', () => {
  const meetingId = '550e8400-e29b-41d4-a716-446655440000';

  it('stops native capture then ends API meeting in order (capture_stop before api_end)', async () => {
    const callOrder: string[] = [];
    const deps = {
      api: {
        endLocalMeeting: vi.fn(async (id: string) => {
          callOrder.push('api_end');
          return { meetingId: id, state: 'finalized', finalizedAt: '2026-09-10T01:00:00.000Z' };
        }),
      },
      native: {
        send: vi.fn(async (cmd: string) => {
          callOrder.push(cmd);
          if (cmd === 'capture_stop') {
            return {
              success: true,
              payload: { totalMicChunks: 5, totalSysChunks: 0, commitStatus: 'clean' },
            };
          }
          return { success: true, payload: {} };
        }),
      },
    };

    const result = await endPhysicalMeeting(deps, { meetingId });

    expect(callOrder).toEqual(['capture_stop', 'api_end']);
    expect(result).toEqual({
      meetingId,
      totalMicChunks: 5,
      totalSysChunks: 0,
      commitStatus: 'clean',
      finalizedAt: '2026-09-10T01:00:00.000Z',
    });
    expect(deps.api.endLocalMeeting).toHaveBeenCalledWith(meetingId);
  });

  it('reports recovery_required when native capture commitStatus is recovery_required', async () => {
    const deps = {
      api: {
        endLocalMeeting: vi.fn(async (id: string) => ({
          meetingId: id,
          state: 'finalized',
          finalizedAt: '2026-09-10T01:00:00.000Z',
        })),
      },
      native: {
        send: vi.fn(async (cmd: string) => {
          if (cmd === 'capture_stop') {
            return {
              success: true,
              payload: { totalMicChunks: 3, totalSysChunks: 0, commitStatus: 'recovery_required' },
            };
          }
          return { success: true, payload: {} };
        }),
      },
    };

    const result = await endPhysicalMeeting(deps, { meetingId });
    expect(result).toEqual({
      meetingId,
      totalMicChunks: 3,
      totalSysChunks: 0,
      commitStatus: 'recovery_required',
      finalizedAt: '2026-09-10T01:00:00.000Z',
    });
  });

  it('rejects with EndMeetingError(CAPTURE_STOP_FAILED) when native capture_stop fails, and does not call api.endLocalMeeting', async () => {
    const deps = {
      api: { endLocalMeeting: vi.fn() },
      native: {
        send: vi.fn(async () => ({ success: false, error: { message: 'Stream stopped' } })),
      },
    };

    await expect(endPhysicalMeeting(deps, { meetingId })).rejects.toEqual(
      new EndMeetingError('CAPTURE_STOP_FAILED'),
    );
    expect(deps.api.endLocalMeeting).not.toHaveBeenCalled();
  });

  it('rejects with EndMeetingError(CAPTURE_STOP_FAILED) when native capture_stop throws, and does not call api.endLocalMeeting', async () => {
    const deps = {
      api: { endLocalMeeting: vi.fn() },
      native: {
        send: vi.fn().mockRejectedValue(new Error('IPC disconnected')),
      },
    };

    await expect(endPhysicalMeeting(deps, { meetingId })).rejects.toEqual(
      new EndMeetingError('CAPTURE_STOP_FAILED'),
    );
    expect(deps.api.endLocalMeeting).not.toHaveBeenCalled();
  });

  it('rejects with EndMeetingError(API_END_FAILED) when native stop succeeds but api.endLocalMeeting fails', async () => {
    const deps = {
      api: {
        endLocalMeeting: vi.fn().mockRejectedValue(new MeetingApiError('API_UNAVAILABLE')),
      },
      native: {
        send: vi.fn(async () => ({
          success: true,
          payload: { totalMicChunks: 2, totalSysChunks: 0, commitStatus: 'clean' },
        })),
      },
    };

    await expect(endPhysicalMeeting(deps, { meetingId })).rejects.toEqual(
      new EndMeetingError('API_END_FAILED'),
    );
  });
});
