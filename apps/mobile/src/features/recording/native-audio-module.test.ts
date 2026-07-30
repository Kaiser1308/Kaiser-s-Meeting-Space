import { describe, expect, it, vi } from 'vitest';
import { requireNativeModule } from 'expo-modules-core';
import { createNativeAudioModule } from './native-audio-module.js';

vi.mock('expo-modules-core', () => ({
  requireNativeModule: vi.fn(),
}));

function nativeRecorder() {
  return {
    configure: vi.fn().mockResolvedValue('{"status":"ok"}'),
    start: vi.fn().mockResolvedValue('{"status":"ok"}'),
    pause: vi.fn().mockResolvedValue('{"status":"ok"}'),
    resume: vi.fn().mockResolvedValue('{"status":"ok"}'),
    stop: vi.fn().mockResolvedValue('{"status":"ok"}'),
    status: vi.fn().mockResolvedValue(
      JSON.stringify({
        type: 'status',
        correlationId: '550e8400-e29b-41d4-a716-446655440000',
        state: 'configured',
        currentChunkIndex: 0,
        bytesWritten: 0,
        durationMs: 0,
        storageAvailable: 100,
      }),
    ),
    cancel: vi.fn().mockResolvedValue('{"status":"ok"}'),
  };
}

describe('createNativeAudioModule', () => {
  it('uses the Expo module registry and preserves its failure detail', () => {
    vi.mocked(requireNativeModule).mockImplementation(() => {
      throw new Error('Cannot find native module AudioRecorder');
    });

    expect(() => createNativeAudioModule()).toThrow(
      'AudioRecorder native module is unavailable: Cannot find native module AudioRecorder',
    );
  });

  it('maps versioned commands to the native positional bridge', async () => {
    const native = nativeRecorder();
    const module = createNativeAudioModule({ native, emitter: { addListener: vi.fn() } });

    await module.sendCommand({
      type: 'configure',
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      profile: {
        sampleRate: 48000,
        channels: 1,
        codec: 'opus',
        container: 'webm',
        bitrate: 96000,
        opusFrameDurationMs: 20,
        complexity: 5,
      },
      storageDirectory: '/private/recordings',
      meetingId: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(native.configure).toHaveBeenCalledWith(
      expect.stringContaining('"sampleRate":48000'),
      '/private/recordings',
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('accepts a durable raw PCM chunk without hiding its storage format', () => {
    const native = nativeRecorder();
    const emitter = { addListener: vi.fn().mockReturnValue({ remove: vi.fn() }) };
    const module = createNativeAudioModule({ native, emitter });
    const listener = vi.fn();
    const unsubscribe = module.addEventListener(listener);

    const callback = emitter.addListener.mock.calls.find(([name]) => name === 'onChunk')?.[1];
    callback?.({
      type: 'chunk',
      meetingId: '550e8400-e29b-41d4-a716-446655440000',
      chunkIndex: 0,
      filePath: '/private/recordings/chunk-0000.pcm',
      sha256: 'a'.repeat(64),
      byteLength: 4,
      wallClockStart: '2026-07-30T00:00:00.000Z',
      wallClockEnd: '2026-07-30T00:00:00.020Z',
      monotonicStart: 1,
      monotonicEnd: 2,
      durationMs: 20,
      sampleRate: 48000,
      channels: 1,
      codec: 'pcm',
      container: 'raw',
      format: 'pcm',
    });

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'chunk', codec: 'pcm', container: 'raw' }));
    unsubscribe();
    expect(emitter.addListener.mock.results[0]?.value.remove).toHaveBeenCalledTimes(6);
  });
});
