import { z } from 'zod';
import { TranslationLanguageSchema } from './contracts.js';

export const TranslationPolicyV1Schema = z
  .object({
    version: z.literal(1),
    disclosure: z.string().min(1),
    budgetMicrounits: z.number().int().nonnegative(),
    allowedProviders: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type TranslationPolicyV1 = z.infer<typeof TranslationPolicyV1Schema>;

/** Reject same/unknown language; target is exactly the opposite of source. */
export function resolveTargetLanguage(source: 'vi' | 'en'): 'vi' | 'en' {
  return source === 'vi' ? 'en' : 'vi';
}

export function isValidTranslationDirection(source: unknown, target: unknown): boolean {
  const s = TranslationLanguageSchema.safeParse(source);
  const t = TranslationLanguageSchema.safeParse(target);
  if (!s.success || !t.success) return false;
  return s.data !== t.data;
}

/** Only translation mode may create translation work. */
export function isTranslationMode(mode: string): boolean {
  return mode === 'meeting_translate';
}

export function isWithinBudget(estimatedMicrounits: number, policy: TranslationPolicyV1): boolean {
  return estimatedMicrounits <= policy.budgetMicrounits;
}
