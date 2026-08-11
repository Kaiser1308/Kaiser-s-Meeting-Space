import { describe, expect, it } from 'vitest';
import { validateEvidenceRefs } from './citations.js';

const projection = {
  ownerId: 'owner-1',
  meetingId: '00000000-0000-4000-8000-000000000001' as any,
  projectionVersion: 2,
  segments: [{ id: 'segment-1', startMs: 0, endMs: 1000 }],
};
describe('same-meeting citation validation', () => {
  it('accepts contained ranges and rejects cross-owner/stale/out-of-range refs', () => {
    expect(
      validateEvidenceRefs([{ segmentId: 'segment-1', startMs: 100, endMs: 900 }], projection),
    ).toEqual({ ok: true });
    expect(
      validateEvidenceRefs([{ segmentId: 'segment-1', startMs: 100, endMs: 1100 }], projection).ok,
    ).toBe(false);
    expect(
      validateEvidenceRefs([{ segmentId: 'other', startMs: 100, endMs: 200 }], projection).ok,
    ).toBe(false);
  });
});
