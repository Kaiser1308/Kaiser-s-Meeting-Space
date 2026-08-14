import { BoundedEditorJournal, type JournalEntry } from './journal.js';

export interface JournalStorage {
  load(documentId: string): Promise<string | null>;
  save(documentId: string, serialized: string): Promise<void>;
  remove(documentId: string): Promise<void>;
}

export interface PersistedJournalStore {
  readonly journal: BoundedEditorJournal;
  persist(entry: JournalEntry): Promise<void>;
  clear(documentId: string): Promise<void>;
}

/**
 * Binds the in-memory bounded journal to a storage seam. The journal is
 * removed only after the server acknowledges the matching content hash.
 */
export function createPersistedJournalStore(
  storage: JournalStorage,
  maxEntries = 20,
  maxBytes = 2_000_000,
): PersistedJournalStore {
  const journal = new BoundedEditorJournal(maxEntries, maxBytes);
  return {
    journal,
    async persist(entry: JournalEntry) {
      journal.append(entry);
      await storage.save(entry.documentId, entry.serialized);
    },
    async clear(documentId: string) {
      await storage.remove(documentId);
    },
  };
}
