import type { Db } from '@kms/database';
import { DbError, TranscriptReviewRepository } from '@kms/database';
import {
  ProjectionDecisionCommandSchema,
  ProjectionRevisionCommandSchema,
  type ProjectionDecisionCommand,
  type ProjectionRevisionCommand,
} from '@kms/domain';
import {
  TranscriptRunComparisonItemSchema,
  TranscriptRunDetailResponseSchema,
  TranscriptRunSummaryResponseSchema,
} from './dto.js';

export class TranscriptReviewService {
  private readonly repository = new TranscriptReviewRepository();

  constructor(private readonly db: Db) {}

  listRuns(ownerId: string, meetingId: string, query: { limit: number; cursor?: string }) {
    const page = await this.repository.listRuns({ ownerId }, this.db, meetingId, query);
    return {
      ...page,
      items: page.items.map((item) => TranscriptRunSummaryResponseSchema.parse(item)),
    };
  }

  getRun(ownerId: string, meetingId: string, runId: string) {
    const result = await this.repository.getRun({ ownerId }, this.db, meetingId, runId);
    return result ? TranscriptRunDetailResponseSchema.parse(result) : null;
  }

  compareRuns(ownerId: string, meetingId: string, runIds: readonly string[]) {
    const result = await this.repository.compareRuns({ ownerId }, this.db, meetingId, runIds);
    return result.map((item) => TranscriptRunComparisonItemSchema.parse(item));
  }

  decide(ownerId: string, meetingId: string, body: unknown, idempotencyKey: string) {
    const parsed = ProjectionDecisionCommandSchema.parse({
      ...(body as object),
      ownerId,
      meetingId,
      idempotencyKey,
    });
    return this.db.transaction((tx) => this.repository.recordDecision({ ownerId }, tx, parsed));
  }

  revise(ownerId: string, meetingId: string, body: unknown, idempotencyKey: string) {
    const parsed = ProjectionRevisionCommandSchema.parse({
      ...(body as object),
      ownerId,
      meetingId,
      idempotencyKey,
    });
    return this.db.transaction((tx) => this.repository.recordRevision({ ownerId }, tx, parsed));
  }
}

export function reviewErrorStatus(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (error instanceof DbError) {
    if (error.category === 'not_found')
      return { status: 404, code: 'NOT_FOUND', message: 'Transcript review resource not found' };
    if (error.category === 'version_conflict')
      return {
        status: 409,
        code: 'TRANSCRIPT_REVISION_CONFLICT',
        message: 'Transcript projection is stale or already changed',
      };
    if (error.category === 'conflict' || error.category === 'duplicate')
      return {
        status: 409,
        code: 'CONFLICT',
        message: 'Transcript review command conflicts with existing history',
      };
  }
  return { status: 400, code: 'VALIDATION_ERROR', message: 'Invalid transcript review request' };
}
