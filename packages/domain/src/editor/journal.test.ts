import { describe, expect, it } from 'vitest';
import { BoundedEditorJournal } from './journal.js';
describe('bounded editor journal', () => {
  it('retains pending edits until matching acknowledgement', () => {
    const journal = new BoundedEditorJournal(2);
    journal.append({
      documentId: 'd',
      baseVersion: 1,
      contentHash: 'a',
      serialized: 'x',
      createdAt: 'now',
    });
    expect(journal.list()).toHaveLength(1);
    expect(() => journal.acknowledge('d', 'b')).toThrow();
    journal.acknowledge('d', 'a');
    expect(journal.list()).toHaveLength(0);
  });
});
