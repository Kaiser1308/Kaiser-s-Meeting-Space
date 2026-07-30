import { z } from 'zod';
import { MeetingIdSchema } from '../meeting/schemas.js';
import { SpeechProviderNameSchema } from './capability.js';

// ── Event kind / session state / safe-error category ──

export const SpeechEventKindSchema = z.enum([
  'interim',
  'final_segment',
  'speaker_update',
  'usage',
  'session_state',
  'safe_error',
]);
export type SpeechEventKind = z.infer<typeof SpeechEventKindSchema>;

export const SpeechSessionStateSchema = z.enum([
  'started',
  'active',
  'delayed',
  'backfill_required',
  'expired',
  'closed',
]);
export type SpeechSessionState = z.infer<typeof SpeechSessionStateSchema>;

export const SpeechSafeErrorCategorySchema = z.enum([
  'protocol',
  'validation',
  'runtime',
  'storage',
  'timeout',
  'cancelled',
  'provider',
  'quota',
  'internal',
]);
export type SpeechSafeErrorCategory = z.infer<typeof SpeechSafeErrorCategorySchema>;

// ── Content-free safe error (NO key/body/content/path/audio/text) ──

export const SpeechSafeErrorSchema = z
  .object({
    code: z.string().max(64),
    message: z.string().max(512),
    category: SpeechSafeErrorCategorySchema,
    retryable: z.boolean().default(false),
  })
  .strict();
export type SpeechSafeError = z.infer<typeof SpeechSafeErrorSchema>;

// ── Payloads (provider-agnostic; raw SDK payload never appears here) ──

export const InterimSegmentEventSchema = z
  .object({
    text: z.string().max(1000),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
  })
  .strict()
  .refine((d) => d.endMs > d.startMs, {
    message: 'endMs must be greater than startMs',
    path: ['endMs'],
  });
export type InterimSegmentEvent = z.infer<typeof InterimSegmentEventSchema>;

export const FinalSegmentEventSchema = z
  .object({
    speakerId: z.string().min(1),
    text: z.string(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1).optional(),
    sequenceInPart: z.number().int().nonnegative(),
  })
  .strict()
  .refine((d) => d.endMs > d.startMs, {
    message: 'endMs must be greater than startMs',
    path: ['endMs'],
  });
export type FinalSegmentEvent = z.infer<typeof FinalSegmentEventSchema>;

export const SpeakerUpdateEventSchema = z
  .object({
    speakerId: z.string().min(1),
    label: z.string().min(1),
  })
  .strict();
export type SpeakerUpdateEvent = z.infer<typeof SpeakerUpdateEventSchema>;

export const UsageEventSchema = z
  .object({
    units: z.number().int().nonnegative(),
    provider: SpeechProviderNameSchema,
    modelId: z.string().min(1),
    costUnits: z.number().int().nonnegative().optional(),
  })
  .strict();
export type UsageEvent = z.infer<typeof UsageEventSchema>;

export const SessionStateEventSchema = z
  .object({
    state: SpeechSessionStateSchema,
    details: z.string().max(256).optional(),
  })
  .strict();
export type SessionStateEvent = z.infer<typeof SessionStateEventSchema>;

// ── Envelope (discriminated by `kind`; payload must match kind) ──

const eventEnvelopeBase = z.object({
  eventId: z.string().min(1),
  meetingId: MeetingIdSchema,
  ownerId: z.string().min(1),
  runId: z.string().min(1),
  provider: SpeechProviderNameSchema,
  providerEventId: z.string().min(1).optional(),
  occurredAt: z.string().datetime(),
});

export const SpeechEventSchema = z.discriminatedUnion('kind', [
  eventEnvelopeBase
    .extend({
      kind: z.literal('interim'),
      partId: z.string().min(1).optional(),
      sequenceInPart: z.number().int().nonnegative().optional(),
      payload: InterimSegmentEventSchema,
    })
    .strict(),
  eventEnvelopeBase
    .extend({
      kind: z.literal('final_segment'),
      partId: z.string().min(1).optional(),
      sequenceInPart: z.number().int().nonnegative().optional(),
      payload: FinalSegmentEventSchema,
    })
    .strict(),
  eventEnvelopeBase
    .extend({
      kind: z.literal('speaker_update'),
      partId: z.string().min(1).optional(),
      sequenceInPart: z.number().int().nonnegative().optional(),
      payload: SpeakerUpdateEventSchema,
    })
    .strict(),
  eventEnvelopeBase
    .extend({
      kind: z.literal('usage'),
      partId: z.string().min(1).optional(),
      sequenceInPart: z.number().int().nonnegative().optional(),
      payload: UsageEventSchema,
    })
    .strict(),
  eventEnvelopeBase
    .extend({
      kind: z.literal('session_state'),
      partId: z.string().min(1).optional(),
      sequenceInPart: z.number().int().nonnegative().optional(),
      payload: SessionStateEventSchema,
    })
    .strict(),
  eventEnvelopeBase
    .extend({
      kind: z.literal('safe_error'),
      partId: z.string().min(1).optional(),
      sequenceInPart: z.number().int().nonnegative().optional(),
      payload: SpeechSafeErrorSchema,
    })
    .strict(),
]);
export type SpeechEvent = z.infer<typeof SpeechEventSchema>;
