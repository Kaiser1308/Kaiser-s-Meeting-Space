import { z } from 'zod';
import { MeetingIdSchema, MeetingLanguageSchema } from '../meeting/schemas.js';

// ── Transcript source ──

export const TranscriptSourceSchema = z.enum(['api', 'local', 'manual']);
export type TranscriptSource = z.infer<typeof TranscriptSourceSchema>;

// ── Gap reason ──

export const GapReasonSchema = z.enum([
  'network_loss',
  'provider_unavailable',
  'buffer_overflow',
  'crash_recovery',
  'source_disconnect',
]);
export type GapReason = z.infer<typeof GapReasonSchema>;

// ── Transcript segment ──

export const TranscriptSegmentSchema = z
  .object({
    id: z.string().min(1),
    meetingId: MeetingIdSchema,
    sequence: z.number().int().nonnegative(),
    speakerId: z.string().min(1),
    language: MeetingLanguageSchema,
    text: z.string(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1).optional(),
    source: TranscriptSourceSchema,
    provider: z.string().min(1).optional(),
    providerEventId: z.string().min(1).optional(),
    isGap: z.boolean().default(false),
    gapReason: GapReasonSchema.optional(),
    createdAt: z.string().datetime(),
  })
  .strict()
  .refine((data) => data.endMs > data.startMs, {
    message: 'endMs must be greater than startMs',
    path: ['endMs'],
  })
  .refine((data) => !data.isGap || data.gapReason !== undefined, {
    message: 'gapReason is required when isGap is true',
    path: ['gapReason'],
  });
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;

export function isSourceSegment(seg: TranscriptSegment): boolean {
  return !seg.isGap;
}

export function isGapSegment(seg: TranscriptSegment): boolean {
  return seg.isGap === true;
}

// ── Transcript revision ──

export const TranscriptRevisionSchema = z
  .object({
    id: z.string().min(1),
    segmentId: z.string().min(1),
    baseRevisionId: z.string().min(1).nullable(),
    revisedText: z.string().min(1),
    revisedSpeakerId: z.string().min(1).optional(),
    actorId: z.string().min(1),
    reason: z.string().optional(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type TranscriptRevision = z.infer<typeof TranscriptRevisionSchema>;

// ── Translation status ──

export const TranslationStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);
export type TranslationStatus = z.infer<typeof TranslationStatusSchema>;

// ── Translation segment ──

export const TranslationSegmentSchema = z
  .object({
    id: z.string().min(1),
    sourceSegmentId: z.string().min(1),
    targetLanguage: MeetingLanguageSchema,
    translatedText: z.string(),
    provider: z.string().min(1).optional(),
    model: z.string().optional(),
    status: TranslationStatusSchema,
    createdAt: z.string().datetime(),
  })
  .strict();
export type TranslationSegment = z.infer<typeof TranslationSegmentSchema>;

// ── Speaker ──

export const SpeakerSchema = z
  .object({
    id: z.string().min(1),
    meetingId: MeetingIdSchema,
    label: z.string().min(1).default('Unknown Speaker'),
    displayName: z.string().optional(),
  })
  .strict();
export type Speaker = z.infer<typeof SpeakerSchema>;

// ── Evidence reference ──

export const EvidenceRefSchema = z
  .object({
    segmentId: z.string().min(1),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    quoteHash: z
      .string()
      .length(64)
      .regex(/^[0-9a-fA-F]{64}$/)
      .optional(),
  })
  .strict()
  .refine((data) => data.endMs >= data.startMs, {
    message: 'endMs must be >= startMs',
    path: ['endMs'],
  });
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

// ── Gap entry ──

export const GapEntrySchema = z
  .object({
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    reason: GapReasonSchema,
  })
  .strict()
  .refine((data) => data.endMs >= data.startMs, {
    message: 'endMs must be >= startMs',
    path: ['endMs'],
  });
export type GapEntry = z.infer<typeof GapEntrySchema>;

// ── Pending range ──

export const PendingRangeSchema = z
  .object({
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
  })
  .strict()
  .refine((data) => data.endMs >= data.startMs, {
    message: 'endMs must be >= startMs',
    path: ['endMs'],
  });
export type PendingRange = z.infer<typeof PendingRangeSchema>;

// ── Completeness ──

export const CompletenessSchema = z
  .object({
    audioComplete: z.boolean(),
    transcriptComplete: z.boolean(),
    diarizationComplete: z.boolean().optional(),
    translationComplete: z.boolean().optional(),
    gaps: z.array(GapEntrySchema),
    pendingRanges: z.array(PendingRangeSchema),
  })
  .strict();
export type Completeness = z.infer<typeof CompletenessSchema>;
