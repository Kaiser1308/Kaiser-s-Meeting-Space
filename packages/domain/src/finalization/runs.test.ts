import { describe, expect, it } from 'vitest';
import { CompletenessSnapshotV1Schema, FinalRunPlanV1Schema } from './runs.js';

const meetingId = '11111111-1111-4111-8111-111111111111';

describe('finalization run and completeness contracts', () => {
  it('rejects a cloud plan without granted consent', () => {
    expect(
      FinalRunPlanV1Schema.safeParse({
        version: 1,
        id: 'run-1',
        meetingId,
        ownerId: 'owner-1',
        primaryAction: 'cloud',
        manifestHash: 'a'.repeat(64),
        policy: {
          version: 1,
          language: 'en',
          live: 'off',
          final: 'cloud',
          cloudCheckScope: 'off',
          cloudConsent: 'required',
        },
        ranges: [{ source: 'mic', startMs: 0, endMs: 1_000 }],
      }).success,
    ).toBe(false);
  });

  it('rejects downstream eligibility until final completeness is policy-approved', () => {
    expect(
      CompletenessSnapshotV1Schema.safeParse({
        version: 1,
        meetingId,
        state: 'partial_ready',
        policyApproved: false,
        downstreamEligible: true,
        expectedRangeCount: 2,
        classifiedRangeCount: 1,
      }).success,
    ).toBe(false);
  });
});
