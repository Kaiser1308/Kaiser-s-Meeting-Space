import { describe, expect, it } from 'vitest';
import { assembleMinutesContext } from './assemble.js';
describe('minutes context assembly', () => {
  it('accounts for gaps and preserves every eligible segment', () => {
    const plan = assembleMinutesContext(
      [
        { id: 'a', startMs: 0, endMs: 1, text: 'a' },
        { id: 'gap', startMs: 1, endMs: 2, text: '', isGap: true },
        { id: 'b', startMs: 2, endMs: 3, text: 'b' },
      ],
      { maxChars: 10, overlapSegments: 1 },
    );
    expect(plan.coverage).toEqual([
      { segmentId: 'a', included: true },
      { segmentId: 'gap', included: false, reason: 'gap' },
      { segmentId: 'b', included: true },
    ]);
  });
});
