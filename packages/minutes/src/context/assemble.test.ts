import { describe, expect, it } from 'vitest';
import { assembleMinutesContext, reconcileMinutesChunks } from './assemble.js';
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
      { segmentId: 'a', sourceRangeId: 'a', included: true, occurrenceCount: 1 },
      {
        segmentId: 'gap',
        sourceRangeId: 'gap',
        included: false,
        occurrenceCount: 0,
        reason: 'gap',
      },
      { segmentId: 'b', sourceRangeId: 'b', included: true, occurrenceCount: 1 },
    ]);
  });

  it('creates deterministic chunk coverage and detects missing map results', () => {
    const plan = assembleMinutesContext(
      [
        { id: 'a', startMs: 0, endMs: 1, text: 'aaaa' },
        { id: 'b', startMs: 1, endMs: 2, text: 'bbbb' },
        { id: 'c', startMs: 2, endMs: 3, text: 'cccc' },
      ],
      { maxTokens: 2, overlapSegments: 1 },
    );
    expect(plan.mode).toBe('chunked');
    expect(plan.chunks[1]?.overlapSegmentIds).toEqual(['a']);
    expect(
      assembleMinutesContext(
        [
          { id: 'a', startMs: 0, endMs: 1, text: 'aaaa' },
          { id: 'b', startMs: 1, endMs: 2, text: 'bbbb' },
          { id: 'c', startMs: 2, endMs: 3, text: 'cccc' },
        ],
        { maxTokens: 2, overlapSegments: 1 },
      ).replayKey,
    ).toBe(plan.replayKey);
    expect(reconcileMinutesChunks(plan, ['chunk-0']).ok).toBe(false);
  });

  it('rejects duplicate, invalid, oversized and cancelled input', () => {
    expect(() =>
      assembleMinutesContext(
        [
          { id: 'a', startMs: 0, endMs: 1, text: 'a' },
          { id: 'a', startMs: 1, endMs: 2, text: 'b' },
        ],
        { maxTokens: 2, overlapSegments: 0 },
      ),
    ).toThrow('duplicate segment id');
    expect(() =>
      assembleMinutesContext([{ id: 'a', startMs: 0, endMs: 1, text: 'aaaaaa' }], {
        maxTokens: 1,
        overlapSegments: 0,
      }),
    ).toThrow('segment_exceeds_context_limit');
    const controller = new AbortController();
    controller.abort();
    expect(() =>
      assembleMinutesContext([], { maxTokens: 2, overlapSegments: 0, signal: controller.signal }),
    ).toThrow('cancelled');
  });
});
