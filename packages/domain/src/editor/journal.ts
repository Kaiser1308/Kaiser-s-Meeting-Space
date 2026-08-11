export interface JournalEntry {
  readonly documentId: string;
  readonly baseVersion: number;
  readonly contentHash: string;
  readonly serialized: string;
  readonly createdAt: string;
}
export class BoundedEditorJournal {
  private entries: JournalEntry[] = [];
  constructor(
    private readonly maxEntries = 20,
    private readonly maxBytes = 2_000_000,
  ) {}
  append(entry: JournalEntry) {
    if (entry.serialized.length > this.maxBytes) throw new Error('journal entry too large');
    this.entries = [
      ...this.entries.filter((existing) => existing.documentId !== entry.documentId),
      entry,
    ].slice(-this.maxEntries);
  }
  list() {
    return [...this.entries];
  }
  acknowledge(documentId: string, contentHash: string) {
    const match = this.entries.find(
      (entry) => entry.documentId === documentId && entry.contentHash === contentHash,
    );
    if (!match) throw new Error('acknowledgement mismatch');
    this.entries = this.entries.filter((entry) => entry !== match);
  }
}
