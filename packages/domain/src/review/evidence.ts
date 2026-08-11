import { z } from 'zod';
import { MeetingIdSchema } from '../meeting/schemas.js';

export const EvidenceTrackSchema = z
  .object({
    ownerId: z.string().min(1),
    meetingId: MeetingIdSchema,
    segmentId: z.string().min(1),
    trackId: z.string().min(1),
    source: z.enum(['local', 'cloud']),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    status: z.enum(['available', 'missing', 'gap', 'corrupt']),
    contentHash: z
      .string()
      .length(64)
      .regex(/^[0-9a-fA-F]{64}$/)
      .nullable(),
  })
  .strict()
  .refine((value) => value.endMs > value.startMs, 'track range must be positive');
export type EvidenceTrack = z.infer<typeof EvidenceTrackSchema>;

export const EvidenceSeekRequestSchema = z
  .object({
    ownerId: z.string().min(1),
    meetingId: MeetingIdSchema,
    segmentId: z.string().min(1),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    preferredSource: z.enum(['local', 'cloud']).optional(),
    tracks: z.array(EvidenceTrackSchema),
  })
  .strict()
  .refine((value) => value.endMs > value.startMs, 'seek range must be positive');
export type EvidenceSeekRequest = z.infer<typeof EvidenceSeekRequestSchema>;

export type EvidenceAvailability =
  | {
      status: 'available';
      trackId: string;
      source: 'local' | 'cloud';
      startMs: number;
      endMs: number;
      contentHash: string | null;
    }
  | { status: 'missing' | 'gap' | 'corrupt' };

export function resolveEvidenceTarget(input: EvidenceSeekRequest): EvidenceAvailability {
  const request = EvidenceSeekRequestSchema.parse(input);
  const candidates = request.tracks
    .filter(
      (track) =>
        track.ownerId === request.ownerId &&
        track.meetingId === request.meetingId &&
        track.segmentId === request.segmentId,
    )
    .filter((track) => track.startMs <= request.startMs && track.endMs >= request.endMs)
    .sort(
      (left, right) =>
        (left.source === request.preferredSource ? -1 : 0) -
          (right.source === request.preferredSource ? -1 : 0) ||
        left.trackId.localeCompare(right.trackId),
    );
  const selected = candidates[0];
  if (!selected || selected.status === 'missing') return { status: 'missing' };
  if (selected.status === 'gap') return { status: 'gap' };
  if (selected.status === 'corrupt') return { status: 'corrupt' };
  return {
    status: 'available',
    trackId: selected.trackId,
    source: selected.source,
    startMs: request.startMs,
    endMs: request.endMs,
    contentHash: selected.contentHash,
  };
}
