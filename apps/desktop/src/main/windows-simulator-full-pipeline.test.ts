import { describe, expect, it } from 'vitest';
import { simulatorFullPrerequisiteFailure, runSimulatorFullPipeline } from './windows-simulator-full-pipeline-runner.js';

describe('Windows simulated full pipeline profile', () => {
  it('blocks when the local speech model is not available', () => {
    expect(simulatorFullPrerequisiteFailure({ durationMs: 300_000, platform: 'win32', modelPath: 'missing-model.bin', exePath: 'missing.exe' })).toBe('packaged_executable_unavailable');
  });

  it('returns BLOCKED instead of substituting a transcript provider', async () => {
    const result = await runSimulatorFullPipeline({ durationMs: 300_000, platform: 'win32', exePath: 'missing.exe' });
    expect(result.status).toBe('BLOCKED');
    expect(result.failureCode).toBe('packaged_executable_unavailable');
  });
});
