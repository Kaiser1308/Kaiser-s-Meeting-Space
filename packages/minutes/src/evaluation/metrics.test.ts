import { describe, expect, it } from 'vitest';
import { scoreMinutes } from './metrics.js';
describe('minutes metrics', () => {
  it('scores citations and unsupported claims deterministically', () => {
    const draft: any = {
      discussion: [
        {
          text: 'a',
          citations: [{ segmentId: 's1', startMs: 0, endMs: 1 }],
          needsConfirmation: false,
        },
      ],
      decisions: [],
      actions: [
        {
          text: 'b',
          citations: [{ segmentId: 'bad', startMs: 0, endMs: 1 }],
          needsConfirmation: true,
        },
      ],
      risks: [],
      followUps: [],
    };
    expect(scoreMinutes(draft, ['s1'])).toEqual({
      claimCount: 2,
      citedClaimCount: 2,
      citationCoverage: 1,
      confirmationCount: 1,
      unsupportedClaimCount: 1,
    });
  });
});
