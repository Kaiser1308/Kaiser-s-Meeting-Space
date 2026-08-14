import { z } from 'zod';
import { MeetingIdSchema } from '@kms/domain';

export const GenerateMinutesBodySchema = z
  .object({
    meetingId: MeetingIdSchema,
    transcript: z
      .array(
        z.object({
          id: z.string().min(1),
          sequence: z.number().int().nonnegative(),
          speakerId: z.string().min(1),
          text: z.string(),
          startMs: z.number().int().nonnegative(),
          endMs: z.number().int().positive(),
        }),
      )
      .min(1),
    template: z.string().min(1),
    outputLanguage: z.enum(['vi', 'en']),
    detailLevel: z.enum(['detailed', 'near_verbatim']).optional(),
  })
  .strict();

export const MinutesDispatchResponseSchema = z.object({
  jobId: z.string().min(1),
  meetingId: MeetingIdSchema,
});
