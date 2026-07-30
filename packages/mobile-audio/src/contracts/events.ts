import { z } from 'zod';
import { CorrelationIdSchema } from './commands';

// ── Chunk event ──

const ChunkEventBaseSchema = z
  .object({
    type: z.literal('chunk'),
    correlationId: CorrelationIdSchema.optional(),
    meetingId: z.string().uuid(),
    chunkIndex: z.number().int().nonnegative(),
    filePath: z.string().min(1),
    sha256: z.string().length(64),
    byteLength: z.number().int().positive(),
    wallClockStart: z.string().datetime(),
    wallClockEnd: z.string().datetime(),
    monotonicStart: z.number().positive(),
    monotonicEnd: z.number().positive(),
    durationMs: z.number().int().positive(),
    sampleRate: z.literal(48000),
    channels: z.literal(1),
    codec: z.enum(['opus', 'pcm']),
    container: z.enum(['webm', 'raw']),
  })
  .strict();

export const ChunkEventSchema = ChunkEventBaseSchema.refine(
  (d) => new Date(d.wallClockEnd) >= new Date(d.wallClockStart),
  {
    message: 'wallClockEnd must be >= wallClockStart',
    path: ['wallClockEnd'],
  },
).refine((d) => d.monotonicEnd >= d.monotonicStart, {
  message: 'monotonicEnd must be >= monotonicStart',
  path: ['monotonicEnd'],
});
export type ChunkEvent = z.infer<typeof ChunkEventSchema>;

// ── Device event ──

export const DeviceEventSchema = z
  .object({
    type: z.literal('device'),
    correlationId: CorrelationIdSchema.optional(),
    changeType: z.enum([
      'focus_gain',
      'focus_loss',
      'route_change',
      'device_disconnect',
      'device_connect',
    ]),
    detail: z.string().optional(),
  })
  .strict();
export type DeviceEvent = z.infer<typeof DeviceEventSchema>;

// ── Interrupt event ──

export const InterruptEventSchema = z
  .object({
    type: z.literal('interrupt'),
    correlationId: CorrelationIdSchema.optional(),
    cause: z.enum(['phone_call', 'siri', 'alarm', 'media_reset', 'engine_reset']),
    action: z.enum(['pause', 'stop']),
  })
  .strict();
export type InterruptEvent = z.infer<typeof InterruptEventSchema>;

// ── Storage event ──

const StorageEventBaseSchema = z
  .object({
    type: z.literal('storage'),
    correlationId: CorrelationIdSchema.optional(),
    level: z.enum(['warning', 'critical']),
    availableBytes: z.number().int().nonnegative(),
    totalBytes: z.number().int().nonnegative(),
  })
  .strict();

export const StorageEventSchema = StorageEventBaseSchema.refine(
  (d) => d.availableBytes <= d.totalBytes,
  {
    message: 'availableBytes must be <= totalBytes',
    path: ['availableBytes'],
  },
);
export type StorageEvent = z.infer<typeof StorageEventSchema>;

// ── Gap event ──

const GapEventBaseSchema = z
  .object({
    type: z.literal('gap'),
    correlationId: CorrelationIdSchema.optional(),
    reason: z.enum(['buffer_overflow', 'source_disconnect', 'crash_recovery', 'route_change']),
    startMs: z.number().nonnegative(),
    endMs: z.number().nonnegative(),
    durationMs: z.number().int().positive(),
  })
  .strict();

export const GapEventSchema = GapEventBaseSchema.refine((d) => d.endMs >= d.startMs, {
  message: 'endMs must be >= startMs',
  path: ['endMs'],
}).refine((d) => d.durationMs === d.endMs - d.startMs, {
  message: 'durationMs must equal endMs - startMs',
  path: ['durationMs'],
});
export type GapEvent = z.infer<typeof GapEventSchema>;

// ── Error event ──

export const ErrorEventSchema = z
  .object({
    type: z.literal('error'),
    correlationId: CorrelationIdSchema.optional(),
    code: z.enum([
      'permission',
      'read_error',
      'overrun',
      'format_change',
      'disk_full',
      'io_error',
      'timeout',
      'unknown',
    ]),
    detail: z.string().optional(),
    fatal: z.boolean(),
  })
  .strict();
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;

// ── Status response ──

export const StatusResponseSchema = z
  .object({
    type: z.literal('status'),
    correlationId: CorrelationIdSchema,
    state: z.enum([
      'unconfigured',
      'configured',
      'recording',
      'paused',
      'stopping',
      'finalizing',
      'error',
    ]),
    currentChunkIndex: z.number().int().nonnegative(),
    bytesWritten: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
    storageAvailable: z.number().int().nonnegative(),
  })
  .strict();
export type StatusResponse = z.infer<typeof StatusResponseSchema>;

// ── Event union (uses base schemas without refinements for Zod union compatibility) ──

export const NativeEventSchema = z.union([
  ChunkEventBaseSchema,
  DeviceEventSchema,
  InterruptEventSchema,
  StorageEventBaseSchema,
  GapEventBaseSchema,
  ErrorEventSchema,
  StatusResponseSchema,
]);
export type NativeEvent = z.infer<typeof NativeEventSchema>;

// ── Versioned envelope ──

export const EnvelopeSchema = z
  .object({
    version: z.literal(1),
    payload: NativeEventSchema,
  })
  .strict();
export type Envelope = z.infer<typeof EnvelopeSchema>;

// ── Rejection ──

export class MalformedEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MalformedEventError';
  }
}

export function validateEnvelope(data: unknown): Envelope {
  const result = EnvelopeSchema.safeParse(data);
  if (!result.success) {
    throw new MalformedEventError(`Invalid event envelope: ${result.error.message}`);
  }
  if (result.data.version !== 1) {
    throw new MalformedEventError(`Unknown protocol version: ${result.data.version}`);
  }
  return result.data;
}
