import { describe, expect, it, vi } from 'vitest';
import type { NativeAudioModule } from '@kms/mobile-audio';
import type { StartMeetingCommand } from './types.js';
import { createNativeCaptureStarter } from './native-capture-starter.js';

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
  let state: 'unconfigured' | 'recording' = 'unconfigured';
  return {
    addEventListener: vi.fn(() => () => {}),
    getStatus: () => ({
      state,
      currentChunkIndex: 0,
      bytesWritten: 0,
      durationMs: 0,
      storageAvailable: 1_000_000,
    }),
    sendCommand: vi.fn(async (input) => {
      if (input.type === 'configure') state = 'unconfigured';
      if (input.type === 'start') state = 'recording';
    }),
  };
}

describe('createNativeCaptureStarter', () => {
  it('starts local capture only after configure succeeds', async () => {
    const native = nativeFake();
    const starter = createNativeCaptureStarter({
      nativeModule: native,
      storageDirectory: '/private/meetings',
    });

    await expect(starter.start({ command })).resolves.toEqual({ started: true });
    expect(native.sendCommand).toHaveBeenCalledTimes(2);
    expect(native.sendCommand).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: 'configure', meetingId: command.settings.id }),
    );
    expect(native.sendCommand).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ type: 'start' }),
    );
  });
});
