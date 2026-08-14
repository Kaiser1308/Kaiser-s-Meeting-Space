import { z } from 'zod';
import {
  AudioSourceSchema,
  ChunkIdSchema,
  MeetingIdSchema,
  Sha256Schema,
  parseChunkId,
} from '../meeting/schemas.js';

const CapturedSourceSchema = z.enum(['mic', 'system']);

export const FinalizationRangeV1Schema = z
  .object({
    source: CapturedSourceSchema,
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
  })
  .strict()
  .refine((range) => range.endMs > range.startMs, {
    message: 'endMs must be greater than startMs',
    path: ['endMs'],
  });
export type FinalizationRangeV1 = z.infer<typeof FinalizationRangeV1Schema>;

export const FinalizationWaiverV1Schema = z
  .object({
    source: CapturedSourceSchema,
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    actorId: z.string().min(1),
    reason: z.string().min(1),
    approvedAt: z.string().datetime(),
  })
  .strict()
  .refine((waiver) => waiver.endMs > waiver.startMs, {
    message: 'endMs must be greater than startMs',
    path: ['endMs'],
  });
export type FinalizationWaiverV1 = z.infer<typeof FinalizationWaiverV1Schema>;

export const ExpectedFinalizationChunkV1Schema = z
  .object({
    id: ChunkIdSchema,
    index: z.number().int().nonnegative(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    sha256: Sha256Schema,
    format: z
      .object({
        container: z.literal('webm'),
        codec: z.literal('opus'),
      })
      .strict(),
  })
  .strict()
  .refine((chunk) => chunk.endMs > chunk.startMs, {
    message: 'endMs must be greater than startMs',
    path: ['endMs'],
  });
export type ExpectedFinalizationChunkV1 = z.infer<typeof ExpectedFinalizationChunkV1Schema>;

export const FinalizationSourceV1Schema = z
  .object({
    source: CapturedSourceSchema,
    chunks: z.array(ExpectedFinalizationChunkV1Schema).min(1),
  })
  .strict();
export type FinalizationSourceV1 = z.infer<typeof FinalizationSourceV1Schema>;

function hasOrderedNonOverlappingChunks(source: FinalizationSourceV1): boolean {
  return source.chunks.every((chunk, index) => {
    if (chunk.index !== index) return false;
    const parsed = parseChunkId(chunk.id);
    if (parsed.source !== source.source || parsed.chunkIndex !== chunk.index) return false;
    return index === 0 || source.chunks[index - 1]!.endMs <= chunk.startMs;
  });
}

export const FinalizationManifestV1Schema = z
  .object({
    version: z.literal(1),
    meetingId: MeetingIdSchema,
    ownerId: z.string().min(1),
    meetingVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(1),
    sources: z.array(FinalizationSourceV1Schema).min(1),
    pauses: z.array(FinalizationRangeV1Schema),
    gaps: z.array(FinalizationRangeV1Schema),
    waivers: z.array(FinalizationWaiverV1Schema).default([]),
    clientClosedAt: z.string().datetime(),
    localManifestHash: Sha256Schema,
  })
  .strict()
  .superRefine((manifest, context) => {
    const sourceNames = new Set(manifest.sources.map((source) => source.source));
    if (sourceNames.size !== manifest.sources.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'sources must be unique', path: ['sources'] });
    }

    for (const [sourceIndex, source] of manifest.sources.entries()) {
      if (!hasOrderedNonOverlappingChunks(source)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'chunks must match the source, start at index zero, and not overlap',
          path: ['sources', sourceIndex, 'chunks'],
        });
      }
      for (const [chunkIndex, chunk] of source.chunks.entries()) {
        if (parseChunkId(chunk.id).meetingId !== manifest.meetingId) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'chunk meetingId must match manifest meetingId',
            path: ['sources', sourceIndex, 'chunks', chunkIndex, 'id'],
          });
        }
      }
    }
  });
export type FinalizationManifestV1 = z.infer<typeof FinalizationManifestV1Schema>;

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function finalizeManifestV1(input: unknown): Readonly<FinalizationManifestV1> {
  return deepFreeze(FinalizationManifestV1Schema.parse(input));
}

export const FinalizationSourceKindSchema = AudioSourceSchema;
