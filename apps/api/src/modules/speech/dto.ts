import { z } from 'zod';
import { MeetingIdSchema, MeetingLanguageSchema } from '@kms/domain';

export const CreateSessionRequestSchema = z
  .object({
    meetingId: MeetingIdSchema,
    language: MeetingLanguageSchema,
    sourceId: z.string().min(1),
    diarization: z.boolean().default(false),
  })
  .strict();

export const SessionCredentialSchema = z
  .object({
    token: z.string().min(1),
    meetingId: MeetingIdSchema,
    provider: z.literal('deepgram'),
    expiresAt: z.string().datetime(),
    config: z
      .object({
        language: MeetingLanguageSchema,
        diarization: z.boolean(),
        model: z.string(),
      })
      .strict(),
  })
  .strict();

export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;
export type SessionCredential = z.infer<typeof SessionCredentialSchema>;
