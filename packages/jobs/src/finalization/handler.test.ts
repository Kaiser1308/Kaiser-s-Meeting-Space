import { describe, it, expect } from 'vitest';
import { runFinalizationJob, validateFinalizationJob, type FinalizationJobRequest } from './handler.js';
import { MeetingIdSchema, Sha256Schema } from '@kms/domain';

const plan = {
  version: 1 as const,
  id: 'plan-1',
  meetingId: MeetingIdSchema.parse('00000000-0000-4000-8000-000000000001'),
  ownerId: 'owner-1',
  primaryAction: 'local' as const,
  manifestHash: Sha256Schema.parse('a'.repeat(64)),
  policy: {
    version: 1 as const,
    language: 'vi' as const,
    live: 'off' as const,
    final: 'local' as const,
    cloudCheckScope: 'off' as const,
    cloudConsent: 'not_required' as const,
  },
  ranges: [{ source: 'mic' as const, startMs: 0, endMs: 1000 }],
};

function makeRequest(): FinalizationJobRequest {
  return { ownerId: 'owner-1', meetingId: plan.meetingId, plan, idempotencyKey: 'k-1' };
}

describe('runFinalizationJob', () => {
  it('rejects missing owner/meeting/idempotency', () => {
    expect(() => validateFinalizationJob({ ...makeRequest(), ownerId: '' })).toThrow(/owner/);
  });

  it('runs local finalization when primaryAction is local', async () => {
    const result = await runFinalizationJob(makeRequest(), {
      runLocal: async () => ({ partsCompleted: 2, outputHash: 'b'.repeat(64) }),
      runCloud: async () => { throw new Error('should not call cloud'); },
    });
    expect(result.partsCompleted).toBe(2);
    expect(result.sourceMutated).toBe(false);
    expect(result.idempotencyKey).toBe('k-1');
  });

  it('runs cloud finalization when primaryAction is cloud', async () => {
    const cloudPlan = { ...plan, primaryAction: 'cloud' as const, policy: { ...plan.policy, cloudConsent: 'granted' as const } };
    const result = await runFinalizationJob({ ...makeRequest(), plan: cloudPlan }, {
      runLocal: async () => { throw new Error('should not call local'); },
      runCloud: async () => ({ partsCompleted: 1, outputHash: 'c'.repeat(64) }),
    });
    expect(result.partsCompleted).toBe(1);
  });

  it('honours cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runFinalizationJob(makeRequest(), { runLocal: async () => ({ partsCompleted: 0, outputHash: 'd'.repeat(64) }), runCloud: async () => ({ partsCompleted: 0, outputHash: 'd'.repeat(64) }) }, controller.signal),
    ).rejects.toThrow(/cancelled/);
  });
});
