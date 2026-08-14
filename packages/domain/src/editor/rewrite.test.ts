import { describe, it, expect } from 'vitest';
import { validateRewriteProposal } from './rewrite.js';
import type { MinutesDocumentV1 } from './schema.js';

const base: MinutesDocumentV1 = {
  version: 1,
  id: 'doc-1',
  ownerId: 'o',
  meetingId: 'm',
  nodes: [{ type: 'paragraph', id: 'p1', text: 'hello' }],
};

describe('validateRewriteProposal', () => {
  it('accepts a valid proposal and returns a diff', () => {
    const proposal = {
      documentId: 'doc-1',
      baseVersion: 1,
      proposed: { ...base, nodes: [...base.nodes, { type: 'paragraph', id: 'p2', text: 'new' }] },
    };
    const result = validateRewriteProposal(proposal, base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.diff.added.map((n) => n.id)).toEqual(['p2']);
  });

  it('rejects provenance mismatch', () => {
    const result = validateRewriteProposal(
      { documentId: 'doc-1', baseVersion: 1, proposed: { ...base, id: 'other' } },
      base,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects unsafe proposed content', () => {
    const result = validateRewriteProposal(
      {
        documentId: 'doc-1',
        baseVersion: 1,
        proposed: { ...base, nodes: [{ type: 'paragraph', id: 'p1', text: '<script>alert(1)</script>' }] },
      },
      base,
    );
    expect(result.ok).toBe(false);
  });
});
