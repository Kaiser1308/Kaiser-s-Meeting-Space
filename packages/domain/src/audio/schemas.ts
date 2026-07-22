import { z } from 'zod';
import {
  MeetingIdSchema,
  Sha256Schema,
  MillisecondsSchema,
  AudioSourceSchema,
  ChunkIdSchema,
} from '../meeting/schemas.js';

// ── Upload status ──

export const UploadStatusSchema = z.enum(['pending', 'uploading', 'completed', 'failed']);
export type UploadStatus = z.infer<typeof UploadStatusSchema>;

// ── Audio chunk ──

export const AudioChunkSchema = z
  .object({
    id: ChunkIdSchema,
    meetingId: MeetingIdSchema,
    source: AudioSourceSchema,
    chunkIndex: z.number().int().nonnegative(),
    storageKey: z.string().min(1),
    startedAt: z.string().datetime(),
    durationMs: MillisecondsSchema,
    byteLength: z.number().int().positive(),
    codec: z.literal('opus'),
    container: z.literal('webm'),
    sampleRate: z.literal(48000),
    channels: z.literal(1),
    sha256: Sha256Schema,
    uploadStatus: UploadStatusSchema,
    finalizedAt: z.string().datetime().optional(),
    wallClockStart: z.string().datetime(),
    wallClockEnd: z.string().datetime(),
    monotonicStart: z.number().positive(),
    monotonicEnd: z.number().positive(),
  })
  .strict()
  .refine((data) => new Date(data.wallClockEnd) >= new Date(data.wallClockStart), {
    message: 'wallClockEnd must be >= wallClockStart',
    path: ['wallClockEnd'],
  })
  .refine((data) => data.monotonicEnd >= data.monotonicStart, {
    message: 'monotonicEnd must be >= monotonicStart',
    path: ['monotonicEnd'],
  });
export type AudioChunk = z.infer<typeof AudioChunkSchema>;

// ── Pause interval ──

export const PauseIntervalSchema = z
  .object({
    type: z.literal('pause'),
    startMs: z.number().nonnegative(),
    durationMs: MillisecondsSchema,
  })
  .strict();
export type PauseInterval = z.infer<typeof PauseIntervalSchema>;

// ── Gap marker ──

export const GapMarkerSchema = z
  .object({
    type: z.literal('gap'),
    description: z.enum(['source_disconnect', 'buffer_overflow', 'crash_recovery']),
    startMs: z.number().nonnegative(),
    endMs: z.number().nonnegative(),
    durationMs: MillisecondsSchema,
  })
  .strict()
  .refine((data) => data.endMs >= data.startMs, {
    message: 'endMs must be >= startMs',
    path: ['endMs'],
  });
export type GapMarker = z.infer<typeof GapMarkerSchema>;

// ── Timeline event (discriminated union via union of refined objects) ──

export const TimelineEventSchema = z.union([PauseIntervalSchema, GapMarkerSchema]);
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

export function isPauseInterval(event: TimelineEvent): event is PauseInterval {
  return event.type === 'pause';
}

export function isGapMarker(event: TimelineEvent): event is GapMarker {
  return event.type === 'gap';
}

// ── Manifest entry (JSON Lines) ──

export const ManifestEntrySchema = z
  .object({
    meetingId: MeetingIdSchema,
    source: AudioSourceSchema,
    chunkIndex: z.number().int().nonnegative(),
    filePath: z.string().min(1),
    sha256: Sha256Schema,
    byteLength: z.number().int().positive(),
    wallClockStart: z.string().datetime(),
    wallClockEnd: z.string().datetime(),
    monotonicStart: z.number().positive(),
    monotonicEnd: z.number().positive(),
    sampleRate: z.literal(48000),
    channels: z.literal(1),
    codec: z.literal('opus'),
    container: z.literal('webm'),
    durationMs: MillisecondsSchema,
  })
  .strict();
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;

// ── Derived mix metadata ──

export const DerivedMixMetadataSchema = z
  .object({
    source: z.literal('derived_mix'),
    meetingId: MeetingIdSchema,
    label: z.string().min(1),
    isDerived: z.literal(true),
    derivedFrom: z.array(z.enum(['mic', 'system'])).min(1),
    mixVersion: z.number().int().positive(),
  })
  .strict();
export type DerivedMixMetadata = z.infer<typeof DerivedMixMetadataSchema>;
