import { describe, expect, it } from 'vitest';
import { preserveUncertainty, routeConflict } from './uncertainty.js';
describe('minutes uncertainty', () => {
  it('does not invent missing owner/date facts', () => {
    expect(
      preserveUncertainty({
        id: 'a',
        text: 'synthetic action',
        citations: [],
        needsConfirmation: false,
      }).needsConfirmation,
    ).toBe(true);
  });

  it('keeps cited alternatives explicit for conflicts', () => {
    const result = routeConflict(
      {
        id: 'a',
        text: 'synthetic action',
        citations: [],
        needsConfirmation: false,
        status: 'supported',
      },
      'owner',
      [
        { value: 'Mai', evidenceIds: ['s1'] },
        { value: 'Nam', evidenceIds: ['s2'] },
      ],
    );
    expect(result.status).toBe('conflicted');
    expect(result.needsConfirmation).toBe(true);
    expect(result.unknownFields).toContain('owner');
  });
});
