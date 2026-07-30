import { z } from 'zod';
import { MeetingIdSchema, MeetingLanguageSchema, Sha256Schema } from '../meeting/schemas.js';
import { TranscriptionPolicyV1Schema } from '../transcription/policy.js';
import { SpeechProviderNameSchema } from './capability.js';
import { SpeechSafeErrorSchema } from './events.js';

// ── Enums ──

// RunProviderSchema shares the provider allowlist with SpeechProviderNameSchema
// (single source of truth in capability.ts). Aliased under the run-specific name.
export const RunProviderSchema = SpeechProviderNameSchema;
export type RunProvider = z.infer<typeof RunProviderSchema>;

export const RunKindSchema = z.enum(['live', 'final', 'cloud_check']);
export type RunKind = z.infer<typeof RunKindSchema>;

export const RunLocalitySchema = z.enum(['local', 'cloud']);
export type RunLocality = z.infer<typeof RunLocalitySchema>;

export const RunLifecycleStateSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export type RunLifecycleState = z.infer<typeof RunLifecycleStateSchema>;

// ── Run / part / segment ──

export const TranscriptRunSchema = z
  .object({
    id: z.string().min(1),
    meetingId: MeetingIdSchema,
    ownerId: z.string().min(1),
    kind: RunKindSchema,
    locality: RunLocalitySchema,
    provider: RunProviderSchema,
    language: MeetingLanguageSchema,
    sourceId: z.string().min(1),
    policySnapshot: TranscriptionPolicyV1Schema,
    planHash: Sha256Schema.optional(),
    lifecycleState: RunLifecycleStateSchema,
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime().optional(),
    safeError: SpeechSafeErrorSchema.optional(),
    createdAt: z.string().datetime(),
  })
  .strict()
  .refine(
    (d) =>
      d.completedAt === undefined ||
      new Date(d.completedAt).getTime() >= new Date(d.startedAt).getTime(),
    {
      message: 'completedAt requires startedAt and must be >= startedAt',
      path: ['completedAt'],
    },
  );
export type TranscriptRun = z.infer<typeof TranscriptRunSchema>;

export const TranscriptRunPartSchema = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    meetingId: MeetingIdSchema,
    ownerId: z.string().min(1),
    index: z.number().int().nonnegative(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    overlapMs: z.number().int().nonnegative().default(0),
    locality: RunLocalitySchema,
    provider: RunProviderSchema,
    modelId: z.string().min(1).optional(),
    rawResultHash: Sha256Schema,
    lifecycleState: RunLifecycleStateSchema,
    completedAt: z.string().datetime().optional(),
    safeError: SpeechSafeErrorSchema.optional(),
    createdAt: z.string().datetime(),
  })
  .strict()
  .refine((d) => d.endMs > d.startMs, {
    message: 'endMs must be greater than startMs',
    path: ['endMs'],
  });
export type TranscriptRunPart = z.infer<typeof TranscriptRunPartSchema>;

export const TranscriptRunSegmentSchema = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    partId: z.string().min(1),
    meetingId: MeetingIdSchema,
    ownerId: z.string().min(1),
    sequenceInPart: z.number().int().nonnegative(),
    speakerId: z.string().min(1),
    language: MeetingLanguageSchema,
    text: z.string(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1).optional(),
    occurredAt: z.string().datetime(),
  })
  .strict()
  .refine((d) => d.endMs > d.startMs, {
    message: 'endMs must be greater than startMs',
    path: ['endMs'],
  });
export type TranscriptRunSegment = z.infer<typeof TranscriptRunSegmentSchema>;
