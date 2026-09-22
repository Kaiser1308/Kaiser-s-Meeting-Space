import { describe, expect, it } from 'vitest';
import { physicalFullPrerequisiteFailure, runPhysicalFullPipeline } from './windows-physical-full-pipeline-runner.js';

describe('Windows physical full pipeline profile', () => {
  it('blocks before capture when real audio is not explicitly enabled', () => {
    expect(physicalFullPrerequisiteFailure({ durationMs: 300_000, platform: 'win32', allowRealAudio: false })).toBe('real_audio_opt_in_required');
  });

  it('does not claim a full pipeline pass when the captured-source reader is unavailable', async () => {
    const result = await runPhysicalFullPipeline({ durationMs: 300_000, platform: 'win32', allowRealAudio: false });
    expect(result.status).toBe('BLOCKED');
    expect(result.failureCode).toBe('real_audio_opt_in_required');
  });
});
