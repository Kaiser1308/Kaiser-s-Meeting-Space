import { describe, expect, it } from 'vitest';
import { preserveUncertainty } from './uncertainty.js';
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
});
