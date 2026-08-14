import { MinutesVersionSchema, type MinutesVersion, type GenerateMinutesInput } from '@kms/domain';
import { validateEvidenceRefs, type CitationProjection, type AiProvider } from '@kms/ai';

export interface MinutesJobRequest {
  readonly ownerId: string;
  readonly meetingId: string;
  readonly projection: CitationProjection;
  readonly input: GenerateMinutesInput;
  readonly idempotencyKey: string;
}

export interface MinutesCommitCallback {
  commit(minutes: MinutesVersion): Promise<void>;
}

export function validateMinutesJob(request: MinutesJobRequest): void {
  if (!request.ownerId || !request.meetingId || !request.idempotencyKey) {
    throw new Error('owner, meeting, and idempotency are required');
  }
  if (!request.projection || request.projection.segments.length === 0) {
    throw new Error('projection segments are required');
  }
}

function collectEvidence(minutes: MinutesVersion): unknown[] {
  return [
    ...minutes.sections.map((s) => s.evidence),
    ...minutes.decisions.map((s) => s.evidence),
    ...minutes.openQuestions.map((s) => s.evidence),
    ...minutes.actionItems.map((a) => a.evidence),
  ].flat();
}

/**
 * Concrete minutes generation (P17): validates the MinutesVersion schema and
 * every citation against the pinned projection before the guarded commit.
 */
export async function runMinutesJob(
  request: MinutesJobRequest,
  provider: AiProvider,
  commit: MinutesCommitCallback,
  signal?: AbortSignal,
): Promise<MinutesVersion> {
  validateMinutesJob(request);
  if (signal?.aborted) throw new Error('cancelled');
  const raw = await provider.generateDetailedMinutes(request.input);
  const minutes = MinutesVersionSchema.parse(raw);
  const citation = validateEvidenceRefs(collectEvidence(minutes), request.projection);
  if (!citation.ok) throw new Error('citation validation failed: ' + citation.reason);
  await commit.commit(minutes);
  return minutes;
}
