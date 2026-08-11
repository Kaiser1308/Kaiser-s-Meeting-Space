import { describe, expect, it } from 'vitest';
import {
  ProjectionDecisionCommandSchema,
  ProjectionRevisionCommandSchema,
  TranscriptReviewConflictSchema,
} from './commands.js';

describe('transcript review command contracts', () => {
  it('accepts attributable owner-scoped decision and revision commands', () => {
    const common = {
      id: 'command-1',
      ownerId: 'owner-1',
      meetingId: '00000000-0000-4000-8000-000000000001',
      segmentId: 'segment-1',
      actorId: 'actor-1',
      baseProjectionVersion: 3,
      idempotencyKey: 'idem-1',
      createdAt: '2026-08-11T10:00:00.000Z',
    };
    expect(
      ProjectionDecisionCommandSchema.parse({
        ...common,
        alternativeId: 'alternative-1',
        baseDecisionId: null,
      }),
    ).toMatchObject({ id: 'command-1', alternativeId: 'alternative-1' });
    expect(
      ProjectionRevisionCommandSchema.parse({
        ...common,
        revisedText: 'Corrected text',
        baseRevisionId: null,
        reason: 'clarification',
      }),
    ).toMatchObject({ id: 'command-1', revisedText: 'Corrected text' });
  });

  it('rejects raw-content or malformed conflict details', () => {
    expect(() =>
      TranscriptReviewConflictSchema.parse({
        code: 'TRANSCRIPT_REVISION_CONFLICT',
        message: 'safe conflict',
        rawText: 'must not be accepted',
      }),
    ).toThrow();
  });
});
