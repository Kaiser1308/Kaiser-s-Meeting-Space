import { z } from 'zod';
import { MeetingIdSchema } from '../meeting/schemas.js';

const CommandBaseSchema = z
  .object({
    id: z.string().min(1),
    ownerId: z.string().min(1),
    meetingId: MeetingIdSchema,
    segmentId: z.string().min(1),
    actorId: z.string().min(1),
    baseProjectionVersion: z.number().int().nonnegative(),
    idempotencyKey: z.string().min(1).max(256),
    createdAt: z.string().datetime(),
  })
  .strict();

export const ProjectionDecisionCommandSchema = CommandBaseSchema.extend({
  alternativeId: z.string().min(1),
  baseDecisionId: z.string().min(1).nullable(),
}).strict();
export type ProjectionDecisionCommand = z.infer<typeof ProjectionDecisionCommandSchema>;

export const ProjectionRevisionCommandSchema = CommandBaseSchema.extend({
  baseRevisionId: z.string().min(1).nullable(),
  revisedText: z.string().min(1).max(100_000),
  revisedSpeakerId: z.string().min(1).optional(),
  reason: z.string().min(1).max(2_000).optional(),
}).strict();
export type ProjectionRevisionCommand = z.infer<typeof ProjectionRevisionCommandSchema>;

export const TranscriptReviewConflictSchema = z
  .object({
    code: z.literal('TRANSCRIPT_REVISION_CONFLICT'),
    message: z.literal('Transcript projection is stale or already changed'),
    currentProjectionVersion: z.number().int().nonnegative().optional(),
  })
  .strict();
export type TranscriptReviewConflict = z.infer<typeof TranscriptReviewConflictSchema>;

export const TranscriptRunListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).optional(),
  })
  .strict();
export type TranscriptRunListQuery = z.infer<typeof TranscriptRunListQuerySchema>;

export const TranscriptComparisonQuerySchema = z
  .object({
    runIds: z.array(z.string().min(1)).min(2).max(10),
  })
  .strict();
export type TranscriptComparisonQuery = z.infer<typeof TranscriptComparisonQuerySchema>;
