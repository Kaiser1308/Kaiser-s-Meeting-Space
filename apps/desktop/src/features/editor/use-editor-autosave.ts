import { BoundedEditorJournal, type JournalEntry } from '@kms/domain';

/** Bounded local autosave journal; removed only after server acknowledgement. */
export function useEditorAutosave(maxEntries = 20): {
  journal: BoundedEditorJournal;
  persist(entry: JournalEntry): void;
} {
  const journal = new BoundedEditorJournal(maxEntries);
  return {
    journal,
    persist(entry: JournalEntry) {
      journal.append(entry);
    },
  };
}
