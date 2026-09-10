import type { TranscriptSegment } from './transcription-workflow.js';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function resolveStorage(customStorage?: StorageLike): StorageLike | undefined {
  if (customStorage) return customStorage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return undefined;
}

const STORAGE_PREFIX = 'kms_transcript_';

export function saveTranscript(
  meetingId: string,
  segments: TranscriptSegment[],
  customStorage?: StorageLike,
): void {
  const storage = resolveStorage(customStorage);
  if (!storage || !meetingId || !Array.isArray(segments)) return;
  try {
    const key = `${STORAGE_PREFIX}${meetingId}`;
    storage.setItem(key, JSON.stringify(segments));
  } catch {
    // Gracefully handle storage quota or privacy mode errors
  }
}

export function getTranscript(
  meetingId: string,
  customStorage?: StorageLike,
): TranscriptSegment[] | null {
  const storage = resolveStorage(customStorage);
  if (!storage || !meetingId) return null;
  try {
    const key = `${STORAGE_PREFIX}${meetingId}`;
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as TranscriptSegment[];
  } catch {
    return null;
  }
}

export function clearTranscript(meetingId: string, customStorage?: StorageLike): void {
  const storage = resolveStorage(customStorage);
  if (!storage || !meetingId) return;
  try {
    storage.removeItem(`${STORAGE_PREFIX}${meetingId}`);
  } catch {
    // Ignore
  }
}
