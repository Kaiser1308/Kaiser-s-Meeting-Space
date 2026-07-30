import { z } from 'zod';

// ── Protocol version ──

export const PROTOCOL_VERSION = 1 as const;

export const CorrelationIdSchema = z.string().uuid();
export type CorrelationId = z.infer<typeof CorrelationIdSchema>;

// ── Capture profile ──

export const CaptureProfileSchema = z
  .object({
    sampleRate: z.literal(48000),
    channels: z.literal(1),
    codec: z.literal('opus'),
    container: z.literal('webm'),
    bitrate: z.number().int().positive(),
    opusFrameDurationMs: z.literal(20),
    complexity: z.literal(5),
  })
  .strict();
export type CaptureProfile = z.infer<typeof CaptureProfileSchema>;

export const DEFAULT_CAPTURE_PROFILE: CaptureProfile = {
  sampleRate: 48000,
  channels: 1,
  codec: 'opus',
  container: 'webm',
  bitrate: 96000,
  opusFrameDurationMs: 20,
  complexity: 5,
};

// ── Command types ──

export const ConfigureCommandSchema = z
  .object({
    type: z.literal('configure'),
    correlationId: CorrelationIdSchema,
    profile: CaptureProfileSchema,
    storageDirectory: z.string().min(1),
    meetingId: z.string().uuid(),
  })
  .strict();
export type ConfigureCommand = z.infer<typeof ConfigureCommandSchema>;

export const StartCommandSchema = z
  .object({
    type: z.literal('start'),
    correlationId: CorrelationIdSchema,
  })
  .strict();
export type StartCommand = z.infer<typeof StartCommandSchema>;

export const PauseCommandSchema = z
  .object({
    type: z.literal('pause'),
    correlationId: CorrelationIdSchema,
  })
  .strict();
export type PauseCommand = z.infer<typeof PauseCommandSchema>;

export const ResumeCommandSchema = z
  .object({
    type: z.literal('resume'),
    correlationId: CorrelationIdSchema,
  })
  .strict();
export type ResumeCommand = z.infer<typeof ResumeCommandSchema>;

export const StopCommandSchema = z
  .object({
    type: z.literal('stop'),
    correlationId: CorrelationIdSchema,
  })
  .strict();
export type StopCommand = z.infer<typeof StopCommandSchema>;

export const StatusCommandSchema = z
  .object({
    type: z.literal('status'),
    correlationId: CorrelationIdSchema,
  })
  .strict();
export type StatusCommand = z.infer<typeof StatusCommandSchema>;

export const CancelCommandSchema = z
  .object({
    type: z.literal('cancel'),
    correlationId: CorrelationIdSchema,
  })
  .strict();
export type CancelCommand = z.infer<typeof CancelCommandSchema>;

// ── Command union ──

export const NativeCommandSchema = z.discriminatedUnion('type', [
  ConfigureCommandSchema,
  StartCommandSchema,
  PauseCommandSchema,
  ResumeCommandSchema,
  StopCommandSchema,
  StatusCommandSchema,
  CancelCommandSchema,
]);
export type NativeCommand = z.infer<typeof NativeCommandSchema>;

// ── Stale command rejection ──

export class StaleCommandError extends Error {
  constructor(
    public readonly correlationId: string,
    public readonly existingType: string,
  ) {
    super(`Command ${correlationId} conflicts with in-flight ${existingType}`);
    this.name = 'StaleCommandError';
  }
}
