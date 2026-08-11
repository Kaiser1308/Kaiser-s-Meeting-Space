import type { DetailedMinutesDraftV1 } from '../output/schema.js';
export interface MinutesMetrics {
  readonly claimCount: number;
  readonly citedClaimCount: number;
  readonly citationCoverage: number;
  readonly confirmationCount: number;
  readonly unsupportedClaimCount: number;
}
export function scoreMinutes(
  draft: DetailedMinutesDraftV1,
  eligibleSegmentIds: readonly string[],
): MinutesMetrics {
  const claims = [
    ...draft.discussion,
    ...draft.decisions,
    ...draft.actions,
    ...draft.risks,
    ...draft.followUps,
  ];
  const eligible = new Set(eligibleSegmentIds);
  const cited = claims.filter((claim) => claim.citations.length > 0);
  const unsupported = claims.filter((claim) =>
    claim.citations.some((citation) => !eligible.has(citation.segmentId)),
  );
  return {
    claimCount: claims.length,
    citedClaimCount: cited.length,
    citationCoverage: claims.length ? cited.length / claims.length : 1,
    confirmationCount: claims.filter((claim) => claim.needsConfirmation).length,
    unsupportedClaimCount: unsupported.length,
  };
}
