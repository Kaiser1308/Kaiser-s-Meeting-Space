import { describe, expect, it } from 'vitest';
import { physicalRecordingPrerequisiteFailure, runPhysicalRecording } from './windows-physical-recording-runner.js';

describe('Windows physical recording profile', () => {
  it('blocks before launch without explicit real-audio opt-in', () => {
    expect(physicalRecordingPrerequisiteFailure({ durationMs: 300_000, platform: 'win32', allowRealAudio: false })).toBe('real_audio_opt_in_required');
  });

  it('blocks before launch without an explicit microphone device', () => {
    expect(physicalRecordingPrerequisiteFailure({ durationMs: 300_000, platform: 'win32', allowRealAudio: true, micDeviceId: ' ' })).toBe('missing_mic_device');
  });

  it('returns a sanitized BLOCKED result when physical prerequisites are absent', async () => {
    const result = await runPhysicalRecording({ durationMs: 300_000, platform: 'win32', allowRealAudio: false });
    expect(result.status).toBe('BLOCKED');
    expect(result.failureCode).toBe('real_audio_opt_in_required');
  });
});
