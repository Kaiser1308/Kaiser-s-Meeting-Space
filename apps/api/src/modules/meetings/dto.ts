import { z } from 'zod';
import { ALL_STATES, TranscriptionPolicyV1Schema } from '@kms/domain';

export const CreateMeetingBodySchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().min(1).max(500),
    language: z.enum(['vi', 'en']),
    mode: z.enum(['meeting_only', 'meeting_translate']),
    timezone: z.string().min(1),
    captureSources: z
      .array(z.enum(['mic', 'system']))
      .min(1)
      .refine((sources) => new Set(sources).size === sources.length),
    speechMode: z.enum(['api', 'local']).default('local'),
    policy: TranscriptionPolicyV1Schema,
  })
  .strict();

export const CreateMeetingResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  language: z.enum(['vi', 'en']),
  mode: z.enum(['meeting_only', 'meeting_translate']),
  captureSources: z.array(z.enum(['mic', 'system'])),
  state: z.literal('draft'),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
});

export const StartMeetingResponseSchema = z.object({
  meetingId: z.string().uuid(),
  state: z.literal('recording'),
  startedAt: z.string().datetime(),
  policyVersion: z.literal(1),
});

// ── Library / List ──

export const MeetingListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  state: z
    .enum([...ALL_STATES] as [(typeof ALL_STATES)[number], ...(typeof ALL_STATES)[number][]])
    .optional(),
});

export const MeetingListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  language: z.enum(['vi', 'en']),
  mode: z.enum(['meeting_only', 'meeting_translate']),
  captureSources: z.array(z.enum(['mic', 'system'])),
  state: z.string(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  timezone: z.string(),
  speechMode: z.enum(['api', 'local']),
});

export const MeetingListResponseSchema = z.object({
  items: z.array(MeetingListItemSchema),
  nextCursor: z.string().nullable(),
});

// ── End meeting ──

export const EndMeetingResponseSchema = z.object({
  meetingId: z.string().uuid(),
  state: z.string(),
  finalizedAt: z.string(),
});

// ── Playback URL ──

export const PlaybackUrlRequestSchema = z.object({
  source: z.enum(['mic', 'system']),
  chunkIndex: z.number().int().nonnegative().optional(),
});

export const PlaybackUrlResponseSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string(),
  method: z.literal('GET'),
  requiredHeaders: z.record(z.string(), z.string()),
});

// ── Meeting detail ──

export const MeetingDetailResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  language: z.enum(['vi', 'en']),
  mode: z.enum(['meeting_only', 'meeting_translate']),
  captureSources: z.array(z.enum(['mic', 'system'])),
  state: z.string(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  timezone: z.string(),
  speechMode: z.enum(['api', 'local']),
  version: z.number().int().nonnegative(),
});
