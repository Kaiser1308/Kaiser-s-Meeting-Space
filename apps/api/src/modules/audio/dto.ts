import { z } from 'zod';
import { ChunkIdSchema, MillisecondsSchema, Sha256Schema } from '@kms/domain';

export const MAX_CHUNK_BYTES = 50 * 1024 * 1024;

export const RegisterChunkRequestSchema = z
  .object({
    source: z.enum(['mic', 'system']),
    chunkIndex: z.number().int().nonnegative(),
    sha256: Sha256Schema,
    byteLength: z.number().int().positive().max(MAX_CHUNK_BYTES),
    startedAt: z.string().datetime(),
    durationMs: MillisecondsSchema,
    wallClockStart: z.string().datetime(),
    wallClockEnd: z.string().datetime(),
    monotonicStart: z.number().positive(),
    monotonicEnd: z.number().positive(),
    codec: z.literal('opus'),
    container: z.literal('webm'),
    sampleRate: z.literal(48000),
    channels: z.literal(1),
  })
  .strict()
  .refine((value) => new Date(value.wallClockEnd) >= new Date(value.wallClockStart), {
    path: ['wallClockEnd'],
    message: 'wallClockEnd must be >= wallClockStart',
  })
  .refine((value) => value.monotonicEnd >= value.monotonicStart, {
    path: ['monotonicEnd'],
    message: 'monotonicEnd must be >= monotonicStart',
  });

export type RegisterChunkRequest = z.infer<typeof RegisterChunkRequestSchema>;

export const RegisterChunkResponseSchema = z
  .object({
    chunkId: ChunkIdSchema,
    created: z.boolean(),
    upload: z
      .object({
        method: z.literal('PUT'),
        url: z.string().url(),
        expiresAt: z.string().datetime(),
        requiredHeaders: z.object({ 'Content-Type': z.literal('audio/webm') }).strict(),
      })
      .strict(),
  })
  .strict();

export type RegisterChunkResponse = z.infer<typeof RegisterChunkResponseSchema>;

export const CompleteChunkRequestSchema = z.object({ sha256: Sha256Schema }).strict();
export type CompleteChunkRequest = z.infer<typeof CompleteChunkRequestSchema>;

export const CompleteChunkResponseSchema = z
  .object({
    chunkId: ChunkIdSchema,
    completed: z.literal(true),
    finalizedAt: z.string().datetime(),
  })
  .strict();
export type CompleteChunkResponse = z.infer<typeof CompleteChunkResponseSchema>;

export const ManifestResponseSchema = z
  .object({
    meetingId: z.string().uuid(),
    reconciliationVersion: z.number().int().positive(),
    updatedAt: z.string().datetime(),
    sources: z.array(
      z
        .object({
          source: z.enum(['mic', 'system']),
          expected: z
            .object({
              count: z.number().int().nonnegative(),
              firstIndex: z.number().int().nonnegative().nullable(),
              lastIndex: z.number().int().nonnegative().nullable(),
            })
            .strict(),
          registered: z
            .object({
              count: z.number().int().nonnegative(),
            })
            .strict(),
          uploaded: z
            .object({
              count: z.number().int().nonnegative(),
            })
            .strict(),
          finalized: z
            .object({
              count: z.number().int().nonnegative(),
              totalBytes: z.number().int().nonnegative(),
              totalDurationMs: z.number().int().nonnegative(),
            })
            .strict(),
          missing: z.array(
            z
              .object({
                fromIndex: z.number().int().nonnegative(),
                toIndex: z.number().int().nonnegative(),
              })
              .strict(),
          ),
          outOfOrder: z.array(
            z
              .object({
                chunkIndex: z.number().int().nonnegative(),
                registeredAt: z.string().datetime(),
              })
              .strict(),
          ),
          conflicts: z.array(
            z
              .object({
                chunkIndex: z.number().int().nonnegative(),
                expectedSha256: z.string().length(64),
                reason: z.literal('checksum_mismatch'),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    timeline: z
      .object({
        pauses: z.array(
          z
            .object({
              startMs: z.number().int().nonnegative(),
              durationMs: z.number().int().nonnegative(),
            })
            .strict(),
        ),
        gaps: z.array(
          z
            .object({
              description: z.enum(['source_disconnect', 'buffer_overflow', 'crash_recovery']),
              startMs: z.number().int().nonnegative(),
              endMs: z.number().int().nonnegative(),
              durationMs: z.number().int().nonnegative(),
            })
            .strict(),
        ),
      })
      .strict(),
    orphans: z.array(
      z
        .object({
          source: z.enum(['mic', 'system']),
          chunkIndex: z.number().int().nonnegative(),
          status: z.enum([
            'pending_object',
            'size_mismatch',
            'corrupt_object',
            'missing_completion',
            'reconciled',
            'abandoned',
          ]),
          detectedAt: z.string().datetime(),
          reconciledAt: z.string().datetime().nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export type ManifestResponse = z.infer<typeof ManifestResponseSchema>;
