import { describe, it, expect } from 'vitest';
import { parseMinutesDocument, roundTripMinutesDocument } from './serialization.js';
import { migrateMinutesDocument } from './migrations.js';
import type { MinutesDocumentV1 } from './schema.js';

const doc: MinutesDocumentV1 = {
  version: 1,
  id: 'doc-1',
  ownerId: 'o',
  meetingId: 'm',
  nodes: [{ type: 'paragraph', id: 'p1', text: 'hello' }],
};

describe('serialization', () => {
  it('round-trips a valid document', () => {
    expect(roundTripMinutesDocument(doc).nodes).toEqual(doc.nodes);
  });
  it('rejects invalid JSON', () => {
    expect(() => parseMinutesDocument('{')).toThrow();
  });
  it('rejects unsafe content on parse', () => {
    const unsafe = JSON.stringify({ ...doc, nodes: [{ type: 'paragraph', id: 'p1', text: '<script>x</script>' }] });
    expect(() => parseMinutesDocument(unsafe)).toThrow();
  });
});

describe('migrations', () => {
  it('accepts v1 and rejects unknown versions', () => {
    expect(migrateMinutesDocument(doc).id).toBe('doc-1');
    expect(() => migrateMinutesDocument({ ...doc, version: 2 })).toThrow(/version/);
  });
});
