import type { DetailedMinutesDraftV1 } from '../output/schema.js';
export interface MinutesMetrics {
  readonly claimCount: number;
  readonly citedClaimCount: number;
  readonly citationCoverage: number;
  readonly confirmationCount: number;
  readonly unsupportedClaimCount: number;
}
export interface EvaluationExpectation {
  readonly topics?: readonly string[];
  readonly decisions?: readonly string[];
  readonly actions?: readonly string[];
  readonly temporalClaims?: readonly string[];
  readonly expectedConfirmations?: number;
}

export interface DetailedMinutesMetrics extends MinutesMetrics {
  readonly topicCoverage: number;
  readonly decisionCoverage: number;
  readonly actionCoverage: number;
  readonly temporalCoverage: number;
  readonly evidenceSpanValidity: number;
  readonly duplicateClaimCount: number;
  readonly completeness: number;
  readonly confirmationPrecision: number;
  readonly invalidCitationClaimCount: number;
}

const allClaims = (draft: DetailedMinutesDraftV1) => [
  ...draft.discussion,
  ...draft.viewpoints,
  ...draft.proposals,
  ...draft.agreements,
  ...draft.unresolvedItems,
  ...draft.decisions,
  ...draft.actions,
  ...draft.risks,
  ...draft.followUps,
];

function coverage(expected: readonly string[] | undefined, claims: readonly { text: string }[]) {
  if (!expected?.length) return 1;
  return (
    expected.filter((item) =>
      claims.some((claim) => claim.text.toLowerCase().includes(item.toLowerCase())),
    ).length / expected.length
  );
}

export function evaluateMinutes(
  draft: DetailedMinutesDraftV1,
  eligibleSegments: readonly { id: string; startMs: number; endMs: number }[],
  expected: EvaluationExpectation = {},
): DetailedMinutesMetrics {
  const claims = allClaims(draft);
  const eligible = new Map(eligibleSegments.map((segment) => [segment.id, segment]));
  const validCitation = (citation: { segmentId: string; startMs: number; endMs: number }) => {
    const segment = eligible.get(citation.segmentId);
    return (
      !!segment &&
      citation.startMs >= segment.startMs &&
      citation.endMs <= segment.endMs &&
      citation.endMs > citation.startMs
    );
  };
  const cited = claims.filter((claim) => claim.citations.length > 0);
  const validClaims = claims.filter(
    (claim) => claim.citations.length > 0 && claim.citations.every(validCitation),
  );
  const ids = claims.map((claim) => claim.id);
  const duplicateClaimCount = ids.length - new Set(ids).size;
  const confirmed = claims.filter((claim) => claim.needsConfirmation);
  const expectedConfirmations = expected.expectedConfirmations ?? confirmed.length;
  return {
    claimCount: claims.length,
    citedClaimCount: cited.length,
    citationCoverage: claims.length ? validClaims.length / claims.length : 1,
    confirmationCount: confirmed.length,
    unsupportedClaimCount: claims.filter((claim) =>
      claim.citations.some((citation) => !validCitation(citation)),
    ).length,
    topicCoverage: coverage(expected.topics, claims),
    decisionCoverage: coverage(expected.decisions, draft.decisions),
    actionCoverage: coverage(expected.actions, draft.actions),
    temporalCoverage: coverage(expected.temporalClaims, claims),
    evidenceSpanValidity: cited.length ? validClaims.length / cited.length : 1,
    duplicateClaimCount,
    completeness:
      expected.topics?.length || expected.decisions?.length || expected.actions?.length
        ? (coverage(expected.topics, claims) +
            coverage(expected.decisions, draft.decisions) +
            coverage(expected.actions, draft.actions)) /
          3
        : 1,
    confirmationPrecision:
      expected.expectedConfirmations === undefined
        ? 1
        : Math.min(1, expectedConfirmations / Math.max(1, confirmed.length)),
    invalidCitationClaimCount: claims.filter((claim) =>
      claim.citations.some((citation) => !validCitation(citation)),
    ).length,
  };
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
