import { z } from 'zod';

// ── Branded primitives ──

export const MeetingIdSchema = z.string().uuid().brand('MeetingId');
export type MeetingId = z.infer<typeof MeetingIdSchema>;

export const Sha256Schema = z
  .string()
  .length(64)
  .regex(/^[0-9a-fA-F]{64}$/, 'Must be a 64-character hex string')
  .brand('Sha256');
export type Sha256 = z.infer<typeof Sha256Schema>;

export const MillisecondsSchema = z.number().int().positive().brand('Milliseconds');
export type Milliseconds = z.infer<typeof MillisecondsSchema>;

// ── Enums ──

export const MeetingLanguageSchema = z.enum(['vi', 'en']);
export type MeetingLanguage = z.infer<typeof MeetingLanguageSchema>;

export const MeetingModeSchema = z.enum(['meeting_only', 'meeting_translate']);
export type MeetingMode = z.infer<typeof MeetingModeSchema>;

export const AudioSourceSchema = z.enum(['mic', 'system', 'derived_mix']);
export type AudioSource = z.infer<typeof AudioSourceSchema>;

export const SpeechModeSchema = z.enum(['api', 'local']).default('api');
export type SpeechMode = z.infer<typeof SpeechModeSchema>;

// ── Derived utility ──

export function deriveTranslationTarget(language: MeetingLanguage): MeetingLanguage {
  return language === 'vi' ? 'en' : 'vi';
}

// ── Chunk ID ──

export const ChunkIdSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F-]{36}\/(mic|system|derived_mix)\/\d+$/,
    'Chunk ID must match {meetingId}/{source}/{chunkIndex}',
  )
  .brand('ChunkId');
export type ChunkId = z.infer<typeof ChunkIdSchema>;

export function formatChunkId(meetingId: string, source: AudioSource, chunkIndex: number): ChunkId {
  return `${meetingId}/${source}/${chunkIndex}` as ChunkId;
}

export function parseChunkId(chunkId: string): {
  meetingId: string;
  source: AudioSource;
  chunkIndex: number;
} {
  const match = chunkId.match(/^([0-9a-fA-F-]{36})\/(mic|system|derived_mix)\/(\d+)$/);
  if (!match) {
    throw new Error(`Invalid chunk ID format: ${chunkId}`);
  }
  const meetingId = match[1]!;
  const source = match[2]!;
  const chunkIndex = parseInt(match[3]!, 10);
  return { meetingId, source: source as AudioSource, chunkIndex };
}

// ── Capture profile ──

export const CaptureProfileSchema = z
  .object({
    container: z.literal('webm'),
    codec: z.literal('opus'),
    sampleRate: z.literal(48000),
    bitDepth: z.literal(16),
    channels: z.literal(1),
    bitrate: z.literal(96000),
    opusFrameDurationMs: z.literal(20),
    complexity: z.literal(5),
  })
  .strict();
export type CaptureProfile = z.infer<typeof CaptureProfileSchema>;

export const DEFAULT_CAPTURE_PROFILE: CaptureProfile = {
  container: 'webm',
  codec: 'opus',
  sampleRate: 48000,
  bitDepth: 16,
  channels: 1,
  bitrate: 96000,
  opusFrameDurationMs: 20,
  complexity: 5,
};

// ── Meeting settings ──

export const MeetingSettingsSchema = z
  .object({
    id: MeetingIdSchema,
    ownerId: z.string().min(1),
    title: z.string().min(1).max(500),
    language: MeetingLanguageSchema,
    mode: MeetingModeSchema,
    captureSources: z
      .array(z.enum(['mic', 'system']))
      .min(1)
      .refine((sources) => new Set(sources).size === sources.length, {
        message: 'captureSources must not contain duplicates',
      }),
    speechMode: SpeechModeSchema,
    timezone: z.string().min(1),
    version: z.number().int().positive(),
    createdAt: z.string().datetime(),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.startedAt && data.endedAt) {
        return new Date(data.endedAt) >= new Date(data.startedAt);
      }
      return true;
    },
    { message: 'endedAt must be >= startedAt', path: ['endedAt'] },
  );
export type MeetingSettings = z.infer<typeof MeetingSettingsSchema>;
