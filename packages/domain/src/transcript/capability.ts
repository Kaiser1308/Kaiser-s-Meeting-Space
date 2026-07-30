import { z } from 'zod';
import { MeetingIdSchema, MeetingLanguageSchema } from '../meeting/schemas.js';

// ── Provider allowlist (single source of truth for the speech provider name) ──

export const SpeechProviderNameSchema = z.enum(['deepgram', 'local-whisper']);
export type SpeechProviderName = z.infer<typeof SpeechProviderNameSchema>;

// ── Capability surface ──

export const SpeechCapabilitiesSchema = z
  .object({
    languages: z.array(MeetingLanguageSchema).min(1),
    diarization: z.boolean(),
    supportsLive: z.boolean(),
    supportsFile: z.boolean(),
    translationTarget: MeetingLanguageSchema.optional(),
    maxStreamDurationMs: z.number().int().positive().optional(),
  })
  .strict();
export type SpeechCapabilities = z.infer<typeof SpeechCapabilitiesSchema>;

export const ReadinessSchema = z
  .object({
    ready: z.boolean(),
    degraded: z.array(z.string().max(256)).optional(),
    missingModelId: z.string().min(1).optional(),
  })
  .strict();
export type Readiness = z.infer<typeof ReadinessSchema>;

// ── Session / file / usage contracts ──

export const SessionRequestSchema = z
  .object({
    meetingId: MeetingIdSchema,
    ownerId: z.string().min(1),
    language: MeetingLanguageSchema,
    sourceId: z.string().min(1),
    diarization: z.boolean(),
    capabilityVersion: z.number().int().positive(),
    expiryMs: z.number().int().positive(),
    budgetMs: z.number().int().positive(),
    allowedProvider: SpeechProviderNameSchema,
  })
  .strict()
  .refine((d) => d.expiryMs <= 60_000, {
    message: 'expiryMs must be <= 60000 (short-lived session cap)',
    path: ['expiryMs'],
  });
export type SessionRequest = z.infer<typeof SessionRequestSchema>;

export const FileRequestSchema = z
  .object({
    runId: z.string().min(1),
    partId: z.string().min(1),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    language: MeetingLanguageSchema,
    modelId: z.string().min(1),
    provider: SpeechProviderNameSchema,
  })
  .strict()
  .refine((d) => d.endMs > d.startMs, {
    message: 'endMs must be greater than startMs',
    path: ['endMs'],
  });
export type FileRequest = z.infer<typeof FileRequestSchema>;

export const UsageReportSchema = z
  .object({
    provider: SpeechProviderNameSchema,
    modelId: z.string().min(1),
    units: z.number().int().nonnegative(),
    costUnits: z.number().int().nonnegative().optional(),
  })
  .strict();
export type UsageReport = z.infer<typeof UsageReportSchema>;

export const HealthReportSchema = z
  .object({
    provider: SpeechProviderNameSchema,
    ready: z.boolean(),
    degraded: z.array(z.string().max(256)).optional(),
  })
  .strict();
export type HealthReport = z.infer<typeof HealthReportSchema>;

export const CancelSchema = z
  .object({
    runId: z.string().min(1),
    reason: z.string().max(256).optional(),
  })
  .strict();
export type Cancel = z.infer<typeof CancelSchema>;
