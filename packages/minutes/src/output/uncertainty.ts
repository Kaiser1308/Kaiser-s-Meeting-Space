import type { MinutesClaim } from './schema.js';
export function preserveUncertainty(claim: MinutesClaim): MinutesClaim {
  return claim.owner || claim.dueDate ? claim : { ...claim, needsConfirmation: true };
}

export type ConflictField = 'owner' | 'dueDate' | 'speaker' | 'decision';
export interface UncertaintyAlternative {
  readonly value: string | null;
  readonly evidenceIds: readonly string[];
}

export function routeConflict(
  claim: MinutesClaim,
  field: ConflictField,
  alternatives: readonly UncertaintyAlternative[],
): MinutesClaim {
  if (alternatives.length < 2) return preserveUncertainty(claim);
  return {
    ...claim,
    status: 'conflicted',
    needsConfirmation: true,
    unknownFields: [...new Set([...(claim.unknownFields ?? []), field])],
    alternatives,
  } as MinutesClaim & { alternatives: readonly UncertaintyAlternative[] };
}
