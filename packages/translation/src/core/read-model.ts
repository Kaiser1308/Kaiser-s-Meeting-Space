import { z } from 'zod';
import { TranslationStatusSchema, TranslationLanguageSchema } from './contracts.js';

export const ProvisionalTranslationSchema = z
  .object({
    kind: z.literal('provisional'),
    sourceSegmentId: z.string().min(1),
    targetLanguage: TranslationLanguageSchema,
    text: z.string(),
    replacedBy: z.string().optional(),
  })
  .strict();
export type ProvisionalTranslation = z.infer<typeof ProvisionalTranslationSchema>;

export const FinalTranslationSchema = z
  .object({
    kind: z.literal('final'),
    versionId: z.string().min(1),
    sourceSegmentId: z.string().min(1),
    targetLanguage: TranslationLanguageSchema,
    text: z.string(),
    status: TranslationStatusSchema,
  })
  .strict();
export type FinalTranslation = z.infer<typeof FinalTranslationSchema>;

export type TranslationProjection = ProvisionalTranslation | FinalTranslation;
