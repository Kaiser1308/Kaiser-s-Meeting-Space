import { EvidenceRefSchema } from '@kms/domain';
export interface CitationProjection {
  readonly ownerId: string;
  readonly meetingId: string;
  readonly projectionVersion: number;
  readonly segments: readonly { id: string; startMs: number; endMs: number }[];
}
export function validateEvidenceRefs(
  refs: unknown,
  projection: CitationProjection,
): { ok: true } | { ok: false; reason: string } {
  const parsed = Array.isArray(refs) ? refs.map((ref) => EvidenceRefSchema.safeParse(ref)) : [];
  if (!Array.isArray(refs) || parsed.some((result) => !result.success))
    return { ok: false, reason: 'invalid citation shape' };
  for (const result of parsed) {
    if (!result.success) continue;
    const segment = projection.segments.find((candidate) => candidate.id === result.data.segmentId);
    if (!segment || result.data.startMs < segment.startMs || result.data.endMs > segment.endMs)
      return { ok: false, reason: 'citation range is not within the projection segment' };
  }
  return { ok: true };
}
