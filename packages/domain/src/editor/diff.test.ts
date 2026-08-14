import { describe, it, expect } from 'vitest';
import { diffMinutesDocuments, hasNoStructuralChange } from './diff.js';
import type { MinutesDocumentV1 } from './schema.js';

function doc(nodes: MinutesDocumentV1['nodes']): MinutesDocumentV1 {
  return { version: 1, id: 'doc-1', ownerId: 'o', meetingId: 'm', nodes };
}

describe('diffMinutesDocuments', () => {
  it('detects added, removed, and changed nodes', () => {
    const before = doc([
      { type: 'heading', id: 'h1', level: 1, text: 'Title' },
      { type: 'paragraph', id: 'p1', text: 'old' },
    ]);
    const after = doc([
      { type: 'heading', id: 'h1', level: 1, text: 'Title' },
      { type: 'paragraph', id: 'p1', text: 'new' },
      { type: 'paragraph', id: 'p2', text: 'added' },
    ]);
    const diff = diffMinutesDocuments(before, after);
    expect(diff.added.map((n) => n.id)).toEqual(['p2']);
    expect(diff.removed).toEqual([]);
    expect(diff.changed.map((c) => c.after.id)).toEqual(['p1']);
  });

  it('detects removed nodes', () => {
    const before = doc([{ type: 'paragraph', id: 'p1', text: 'x' }]);
    const after = doc([]);
    const diff = diffMinutesDocuments(before, after);
    expect(diff.removed.map((n) => n.id)).toEqual(['p1']);
    expect(hasNoStructuralChange(diff)).toBe(false);
  });

  it('reports no structural change for identical docs', () => {
    const d = doc([{ type: 'paragraph', id: 'p1', text: 'x' }]);
    expect(hasNoStructuralChange(diffMinutesDocuments(d, d))).toBe(true);
  });
});
