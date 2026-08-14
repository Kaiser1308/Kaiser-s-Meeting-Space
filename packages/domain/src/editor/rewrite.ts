import { validateMinutesDocument, type MinutesDocumentV1 } from './schema.js';
import { diffMinutesDocuments, type NodeDiff } from './diff.js';

export interface RewriteProposal {
  readonly documentId: string;
  readonly baseVersion: number;
  readonly proposed: MinutesDocumentV1;
}

export type RewriteValidation =
  | { ok: true; diff: NodeDiff }
  | { ok: false; reason: string };

/**
 * Validate a bounded AI rewrite proposal against the current document. The
 * proposal must be a valid document with matching provenance; the diff is
 * returned for review. Nothing is mutated here.
 */
export function validateRewriteProposal(
  proposal: RewriteProposal,
  current: MinutesDocumentV1,
): RewriteValidation {
  const result = validateMinutesDocument(proposal.proposed);
  if (!result.ok) return { ok: false, reason: result.reason };
  if (
    proposal.proposed.id !== current.id ||
    proposal.proposed.ownerId !== current.ownerId ||
    proposal.proposed.meetingId !== current.meetingId
  ) {
    return { ok: false, reason: 'proposal provenance mismatch' };
  }
  const diff = diffMinutesDocuments(current, proposal.proposed);
  return { ok: true, diff };
}
