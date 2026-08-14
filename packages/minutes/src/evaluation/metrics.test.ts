import { describe, expect, it } from 'vitest';
import { evaluateMinutes, scoreMinutes } from './metrics.js';
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

  it('scores evidence spans, completeness and category coverage', () => {
    const draft: any = {
      discussion: [
        {
          id: 'd1',
          text: 'migration plan',
          citations: [{ segmentId: 's1', startMs: 0, endMs: 5 }],
          needsConfirmation: false,
        },
      ],
      viewpoints: [],
      proposals: [],
      agreements: [],
      unresolvedItems: [],
      risks: [],
      followUps: [],
      decisions: [
        {
          id: 'dec',
          text: 'approve migration plan',
          citations: [{ segmentId: 's1', startMs: 0, endMs: 5 }],
          needsConfirmation: false,
        },
      ],
      actions: [
        {
          id: 'act',
          text: 'review owner',
          citations: [{ segmentId: 'bad', startMs: 0, endMs: 5 }],
          needsConfirmation: true,
        },
      ],
    };
    const result = evaluateMinutes(draft, [{ id: 's1', startMs: 0, endMs: 5 }], {
      topics: ['migration plan'],
      decisions: ['approve migration plan'],
      actions: ['review owner'],
      expectedConfirmations: 1,
    });
    expect(result.topicCoverage).toBe(1);
    expect(result.decisionCoverage).toBe(1);
    expect(result.actionCoverage).toBe(1);
    expect(result.evidenceSpanValidity).toBe(2 / 3);
    expect(result.invalidCitationClaimCount).toBe(1);
  });
});
