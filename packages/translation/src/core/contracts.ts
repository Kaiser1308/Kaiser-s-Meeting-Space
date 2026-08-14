import { z } from 'zod';
import { MeetingIdSchema, Sha256Schema } from '@kms/domain';

export const TranslationLanguageSchema = z.enum(['vi', 'en']);
export type TranslationLanguage = z.infer<typeof TranslationLanguageSchema>;

export const TranslationStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);
export type TranslationStatus = z.infer<typeof TranslationStatusSchema>;

/** Pins the exact source segment/revision/hash, languages, and idempotency. */
export const TranslationInputV1Schema = z
  .object({
    version: z.literal(1),
    sourceSegmentId: z.string().min(1),
    projectionVersion: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    sourceTextHash: Sha256Schema,
    sourceLanguage: TranslationLanguageSchema,
    targetLanguage: TranslationLanguageSchema,
    idempotencyKey: z.string().min(1),
  })
  .strict()
  .refine((input) => input.sourceLanguage !== input.targetLanguage, {
    message: 'source and target language must differ',
    path: ['targetLanguage'],
  });
export type TranslationInputV1 = z.infer<typeof TranslationInputV1Schema>;

/** Authoritative derived translation with full provider/source provenance. */
export const TranslationVersionV1Schema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    meetingId: MeetingIdSchema,
    sourceSegmentId: z.string().min(1),
    sourceRevision: z.number().int().nonnegative(),
    sourceTextHash: Sha256Schema,
    sourceLanguage: TranslationLanguageSchema,
    targetLanguage: TranslationLanguageSchema,
    translatedText: z.string(),
    provider: z.string().min(1),
    model: z.string().min(1),
    config: z.record(z.string(), z.unknown()).default({}),
    promptId: z.string().optional(),
    status: TranslationStatusSchema,
    confidence: z.number().min(0).max(1).optional(),
    usage: z.object({ costMicrounits: z.number().int().nonnegative() }).optional(),
    createdAt: z.string().datetime(),
    completedAt: z.string().datetime().optional(),
  })
  .strict()
  .refine((v) => v.sourceLanguage !== v.targetLanguage, {
    message: 'source and target language must differ',
    path: ['targetLanguage'],
  });
export type TranslationVersionV1 = z.infer<typeof TranslationVersionV1Schema>;

/** Capability-safe translation output returned by adapters. */
export const TranslationResultV1Schema = z
  .object({
    translatedText: z.string(),
    provider: z.string().min(1),
    model: z.string().min(1),
    config: z.record(z.string(), z.unknown()).default({}),
    promptId: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
    usage: z.object({ costMicrounits: z.number().int().nonnegative() }),
  })
  .strict();
export type TranslationResultV1 = z.infer<typeof TranslationResultV1Schema>;
