import { describe, expect, it } from 'vitest';
import { reviewErrorStatus } from './service.js';
import { DbError } from '@kms/database';

describe('transcript review service errors', () => {
  it('maps stale projection writes to a safe 409', () => {
    expect(reviewErrorStatus(new DbError('version_conflict'))).toEqual({
      status: 409,
      code: 'TRANSCRIPT_REVISION_CONFLICT',
      message: 'Transcript projection is stale or already changed',
    });
  });
  it('does not expose provider or transcript content', () => {
    const result = reviewErrorStatus(new Error('provider response transcript secret'));
    expect(JSON.stringify(result)).not.toContain('provider response');
    expect(JSON.stringify(result)).not.toContain('transcript secret');
  });
});
