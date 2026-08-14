import { describe, it, expect } from 'vitest';
import { shouldContinuePolling, type FinalizationStatus } from './use-finalization-status.js';

const base: FinalizationStatus = {
  meetingId: 'm-1',
  state: 'processing',
  primaryAction: 'local',
  version: 1,
};

describe('shouldContinuePolling', () => {
  it('returns true for null and non-terminal states', () => {
    expect(shouldContinuePolling(null)).toBe(true);
    expect(shouldContinuePolling({ ...base, state: 'finalizing' })).toBe(true);
    expect(shouldContinuePolling({ ...base, state: 'processing' })).toBe(true);
    expect(shouldContinuePolling({ ...base, state: 'recovery_required' })).toBe(true);
  });

  it('returns false for terminal states', () => {
    expect(shouldContinuePolling({ ...base, state: 'ready' })).toBe(false);
    expect(shouldContinuePolling({ ...base, state: 'partial_ready' })).toBe(false);
  });
});
