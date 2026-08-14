import { describe, it, expect } from 'vitest';
import { DbError } from './types.js';
import {
  getReviewCommandFingerprint,
  validateReviewCommandOwnership,
  createContentFreeReviewOutboxPayload,
} from './transcript-review.js';

describe('getReviewCommandFingerprint', () => {
  it('is deterministic and sensitive to content', () => {
    const a = { id: 'c1', ownerId: 'o1', meetingId: 'm', segmentId: 's', actorId: 'a', idempotencyKey: 'k' };
    const b = { ...a, segmentId: 's2' };
    expect(getReviewCommandFingerprint(a)).toBe(getReviewCommandFingerprint(a));
    expect(getReviewCommandFingerprint(a)).not.toBe(getReviewCommandFingerprint(b));
    expect(getReviewCommandFingerprint(a)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('validateReviewCommandOwnership', () => {
  it('throws not_found for a mismatched owner', () => {
    expect(() =>
      validateReviewCommandOwnership({ ownerId: 'o1' }, { ownerId: 'o2' }),
    ).toThrowError(DbError);
  });
  it('does not throw for a matching owner', () => {
    expect(() =>
      validateReviewCommandOwnership({ ownerId: 'o1' }, { ownerId: 'o1' }),
    ).not.toThrow();
  });
});

describe('createContentFreeReviewOutboxPayload', () => {
  it('never includes transcript text or audio', () => {
    const payload = createContentFreeReviewOutboxPayload(
      'decision',
      { id: 'c1', ownerId: 'o1', meetingId: 'm', segmentId: 's', actorId: 'a', idempotencyKey: 'k' },
      3,
    );
    expect(payload).toEqual({
      commandType: 'decision',
      commandId: 'c1',
      ownerId: 'o1',
      meetingId: 'm',
      segmentId: 's',
      actorId: 'a',
      projectionVersion: 3,
      idempotencyKey: 'k',
    });
    expect(JSON.stringify(payload)).not.toMatch(/text|audio|transcript/i);
  });
});
