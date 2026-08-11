import { z } from 'zod';
import {
  ProjectionDecisionCommandSchema,
  ProjectionRevisionCommandSchema,
  TranscriptComparisonQuerySchema,
  TranscriptRunListQuerySchema,
} from '@kms/domain';

export const ReviewDecisionBodySchema = ProjectionDecisionCommandSchema.omit({
  ownerId: true,
}).strict();
export const ReviewRevisionBodySchema = ProjectionRevisionCommandSchema.omit({
  ownerId: true,
}).strict();
export const ReviewRunListQuerySchema = TranscriptRunListQuerySchema;
export const ReviewCompareQuerySchema = z
  .object({ runIds: z.string().min(1) })
  .strict()
  .transform((value) =>
    TranscriptComparisonQuerySchema.parse({ runIds: value.runIds.split(',').filter(Boolean) }),
  );

export const SafeReviewErrorSchema = z
  .object({
    error: z
      .object({ code: z.string(), message: z.string(), requestId: z.string().optional() })
      .strict(),
  })
  .strict();

export const TranscriptRunSummaryResponseSchema = z
  .object({
    id: z.string(),
    meetingId: z.string(),
    ownerId: z.string(),
    action: z.string(),
    provider: z.string().nullable(),
    planHash: z.string(),
    state: z.string(),
    createdAt: z.date(),
  })
  .strict();

export const TranscriptRunDetailResponseSchema = TranscriptRunSummaryResponseSchema.extend({
  parts: z.array(
    z
      .object({
        id: z.string(),
        runId: z.string(),
        partIndex: z.number().int(),
        startMs: z.number().int(),
        endMs: z.number().int(),
        state: z.string(),
      })
      .strict(),
  ),
  lineage: z.array(
    z
      .object({
        id: z.string(),
        runId: z.string(),
        partId: z.string(),
        eventId: z.string(),
        sourceSegmentId: z.string(),
        finalizationManifestHash: z.string(),
        audioManifestHash: z.string(),
      })
      .strict(),
  ),
}).strict();

export const TranscriptRunComparisonItemSchema = z
  .object({
    id: z.string(),
    meetingId: z.string(),
    provider: z.string().nullable(),
    finalizationManifestHash: z.string(),
    audioManifestHash: z.string(),
    state: z.string(),
  })
  .strict();
