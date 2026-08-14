import { z } from 'zod';
import { Sha256Schema } from '@kms/domain';

export const TranslateBodySchema = z
  .object({
    sourceSegmentId: z.string().min(1),
    projectionVersion: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    sourceTextHash: Sha256Schema,
    sourceLanguage: z.enum(['vi', 'en']),
  })
  .strict();

export const TranslationVersionResponseSchema = z.object({
  id: z.string().min(1),
  meetingId: z.string().uuid(),
  sourceSegmentId: z.string().min(1),
  sourceRevision: z.number().int().nonnegative(),
  targetLanguage: z.enum(['vi', 'en']),
  translatedText: z.string(),
  provider: z.string(),
  model: z.string(),
  status: z.string(),
  createdAt: z.string().datetime(),
});
