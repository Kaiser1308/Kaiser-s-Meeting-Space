import { describe, expect, it, vi } from 'vitest';
import type { NativeAudioModule } from '@kms/mobile-audio';
import type { StartMeetingCommand } from './types.js';
import type { MeetingApi } from './meeting-api.js';
import { createRemoteCaptureStarter } from './remote-capture-starter.js';

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

function nativeFake(): NativeAudioModule {
  return {
    addEventListener: vi.fn(() => () => {}),
    getStatus: () => ({
      state: 'unconfigured',
      currentChunkIndex: 0,
      bytesWritten: 0,
      durationMs: 0,
      storageAvailable: 1_000_000,
    }),
    sendCommand: vi.fn(async () => {}),
  };
}

describe('createRemoteCaptureStarter', () => {
  it('does not leave local capture running when server start fails', async () => {
    const native = nativeFake();
    const meetingApi: MeetingApi = {
      create: vi.fn().mockResolvedValue({
        id: command.settings.id,
        title: 'Synthetic',
        language: 'vi',
        mode: 'meeting_only',
        captureSources: ['mic'],
        state: 'draft',
        version: 1,
        createdAt: '2026-07-28T00:00:00.000Z',
      }),
      start: vi.fn().mockRejectedValue(new Error('server unavailable')),
    };
    const starter = createRemoteCaptureStarter({
      nativeModule: native,
      meetingApi,
      storageDirectory: '/private/meetings',
    });

    await expect(starter.start({ command })).rejects.toThrow('server unavailable');
    expect(native.sendCommand).toHaveBeenCalledWith(expect.objectContaining({ type: 'cancel' }));
  });
});
