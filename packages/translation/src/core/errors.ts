import { z } from 'zod';

/** Content-free error detail that never carries source text or diagnostics. */
export const TranslationSafeErrorSchema = z
  .object({
    code: z.string().min(1),
    retryable: z.boolean(),
  })
  .strict();
export type TranslationSafeError = z.infer<typeof TranslationSafeErrorSchema>;

export function translationSafeError(code: string, retryable: boolean): TranslationSafeError {
  return TranslationSafeErrorSchema.parse({ code, retryable });
}
