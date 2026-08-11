import { describe, expect, it } from 'vitest';
import { serializeMinutesDocument, validateMinutesDocument } from './schema.js';
const doc = {
  version: 1 as const,
  id: 'd',
  ownerId: 'o',
  meetingId: 'm',
  nodes: [
    { type: 'heading' as const, id: 'h', level: 1 as const, text: 'Synthetic' },
    { type: 'citation' as const, id: 'c', segmentId: 's', startMs: 0, endMs: 10 },
  ],
};
describe('safe minutes document schema', () => {
  it('round-trips supported nodes with stable IDs', () => {
    expect(JSON.parse(serializeMinutesDocument(doc))).toEqual(doc);
  });
  it('rejects executable content, duplicate IDs, and invalid ranges', () => {
    expect(
      validateMinutesDocument({
        ...doc,
        nodes: [{ type: 'paragraph', id: 'p', text: '<script>x</script>' }],
      }).ok,
    ).toBe(false);
    expect(validateMinutesDocument({ ...doc, nodes: [...doc.nodes, { ...doc.nodes[0] }] }).ok).toBe(
      false,
    );
    expect(
      validateMinutesDocument({
        ...doc,
        nodes: [{ type: 'citation', id: 'c', segmentId: 's', startMs: 10, endMs: 1 }],
      }).ok,
    ).toBe(false);
  });
});
